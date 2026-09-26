#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// PHONE / DEVICE DATA HEALTH CHECK
//
// Answers one question: is each data channel still delivering, or has one
// gone quiet? A silent channel is the dangerous failure here — the 23:30
// verdict refuses to declare a MISS without a confirmed data channel, so a
// dead HAE webhook looks like "nothing happened" rather than an alarm.
// Precedent: HAE stopped landing Jul 3 2026 and was not noticed until Jul 19
// (see supabase/fix_hae_ingest_2026_07_19.sql).
//
// Reads credentials from scripts/.env. The admin key is the one already
// shipped in website/app.js, used here only to read the owner's own tables
// through the edge function's admin-read proxy (health_daily et al are RLS
// locked to `authenticated`, so the anon key alone cannot see them).
//
// USAGE:  npm run check:phone            (last 14 days)
//         npm run check:phone -- 30      (last 30 days)
//
// Read-only. Makes no writes of any kind.
// ═══════════════════════════════════════════════════════════════

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DAYS = Math.max(1, Math.min(120, parseInt(process.argv[2], 10) || 14));

// ── env ──
const envPath = path.join(ROOT, 'scripts/.env');
if (!fs.existsSync(envPath)) {
  console.error('✘ scripts/.env not found — cannot reach Supabase.');
  process.exit(1);
}
const env = {};
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const s = line.trim();
  if (!s || s.startsWith('#') || !s.includes('=')) continue;
  const i = s.indexOf('=');
  env[s.slice(0, i).trim()] = s.slice(i + 1).trim().replace(/^["']|["']$/g, '');
}
const SUPA = env.SUPA_URL, ANON = env.SUPA_KEY;
if (!SUPA || !ANON) { console.error('✘ SUPA_URL / SUPA_KEY missing from scripts/.env'); process.exit(1); }

// The admin key is already public in the browser bundle (see the project note);
// this reads it from there rather than adding a second copy.
const appJs = fs.readFileSync(path.join(ROOT, 'website/app.js'), 'utf8');
const akMatch = /var _ak = \[([^\]]+)\]\.join\(''\)/.exec(appJs);
const ADMIN_KEY = akMatch
  ? akMatch[1].split(',').map(s => s.trim().replace(/^'|'$/g, '')).join('')
  : (env.ADMIN_API_KEY || '');
if (!ADMIN_KEY) { console.error('✘ could not resolve the admin key'); process.exit(1); }

const FN = SUPA + '/functions/v1/firstlight-sync';

async function adminRead(table, select = '*', limit = 60, order = null) {
  const body = { table, select, limit };
  if (order) body.order = order;
  const r = await fetch(FN + '?action=admin-read', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': ANON, 'Authorization': 'Bearer ' + ANON,
      'x-admin-key': ADMIN_KEY,
    },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) return { error: `HTTP ${r.status}: ${text.slice(0, 200)}` };
  try {
    const j = JSON.parse(text);
    if (j.error) return { error: String(j.error).slice(0, 200) };
    return { rows: j.data || [] };
  } catch { return { error: 'bad JSON: ' + text.slice(0, 160) }; }
}

// ── date helpers (IST is the system's calendar) ──
const istToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const addDays = (ds, n) => { const d = new Date(ds + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const hoursSince = iso => iso ? (Date.now() - new Date(iso).getTime()) / 3600000 : Infinity;
const fmtAge = h => !isFinite(h) ? 'never' : h < 1 ? Math.round(h * 60) + 'm ago' : h < 48 ? h.toFixed(1) + 'h ago' : Math.floor(h / 24) + 'd ago';

const C = { r:'\x1b[31m', g:'\x1b[32m', y:'\x1b[33m', c:'\x1b[36m', d:'\x1b[2m', b:'\x1b[1m', x:'\x1b[0m' };
let problems = [];

function verdict(label, ok, warn, msg) {
  const mark = ok ? `${C.g}✓ LIVE   ${C.x}` : warn ? `${C.y}▲ STALE  ${C.x}` : `${C.r}✘ SILENT ${C.x}`;
  console.log(`  ${mark} ${label.padEnd(20)} ${msg}`);
  if (!ok) problems.push(`${warn ? 'STALE' : 'SILENT'} — ${label}: ${msg}`);
}

console.log(`\n${C.b}PHONE / DEVICE DATA HEALTH${C.x}  ${C.d}· IST today ${istToday()} · window ${DAYS}d${C.x}\n`);

// ── 1. Apple Health (Health Auto Export → health_daily) ──
console.log(`${C.c}APPLE HEALTH — Health Auto Export → health_daily${C.x}`);
// Column list verified against the healthIngest upsert in the edge function.
// health_daily has NO updated_at, so row freshness is the newest date present —
// which is the right signal anyway: HAE exports a day, so a row for today or
// yesterday means the phone is delivering.
const HD_COLS = 'date,steps,workout_count,workout_total_min,active_calories,sleep_hours,resting_hr';
const hd = await adminRead('health_daily', HD_COLS, 120, 'date:desc');
if (hd.error) {
  console.log(`  ${C.r}query failed:${C.x} ${hd.error}`);
  problems.push('health_daily query failed: ' + hd.error);
} else {
  const rows = hd.rows;
  const byDate = new Map(rows.map(r => [r.date, r]));
  const newest = rows[0];
  const today = istToday();
  const daysBehind = newest ? Math.round((new Date(today + 'T00:00:00Z') - new Date(newest.date + 'T00:00:00Z')) / 86400000) : Infinity;
  verdict('HAE ingest', daysBehind <= 1, daysBehind <= 3,
    newest ? `newest row ${newest.date} — ${daysBehind === 0 ? 'today' : daysBehind + 'd behind'}` : 'no rows at all');

  // Coverage + gaps across the window
  let missing = [], zero = [];
  for (let i = 0; i < DAYS; i++) {
    const ds = addDays(istToday(), -i);
    const row = byDate.get(ds);
    if (!row) missing.push(ds);
    else if (!row.steps && !row.workout_count) zero.push(ds);
  }
  const covered = DAYS - missing.length;
  verdict('coverage', missing.length === 0, missing.length <= 2,
    `${covered}/${DAYS} days present${missing.length ? ' · missing ' + missing.slice(0, 8).join(', ') + (missing.length > 8 ? ` +${missing.length - 8}` : '') : ''}`);
  if (zero.length) console.log(`  ${C.d}   ${zero.length} day(s) present but empty (0 steps, 0 workouts): ${zero.slice(0, 6).join(', ')}${C.x}`);

  console.log(`\n  ${C.d}${'DATE'.padEnd(12)}${'STEPS'.padStart(8)}${'WORKOUTS'.padStart(10)}${'KCAL'.padStart(8)}   SLEEP${C.x}`);
  for (let i = 0; i < Math.min(DAYS, 14); i++) {
    const ds = addDays(istToday(), -i);
    const r = byDate.get(ds);
    if (!r) { console.log(`  ${C.r}${ds.padEnd(12)}${'—'.padStart(8)}${'—'.padStart(10)}${'—'.padStart(8)}   NO ROW${C.x}`); continue; }
    const q = (r.steps || r.workout_count) ? '' : C.y;
    console.log(`  ${q}${ds.padEnd(12)}${String(r.steps ?? '—').padStart(8)}${String(r.workout_count ?? '—').padStart(10)}${String(Math.round(r.active_calories ?? 0) || '—').padStart(8)}   ${String(r.sleep_hours ?? '—').padStart(5)}h${C.x}`);
  }
}

// ── 2. Strava (the cross-check channel) ──
console.log(`\n${C.c}STRAVA — activity sync${C.x}`);
const sa = await adminRead('strava_activities', 'start_date_local,type,distance,name', 20, 'start_date_local:desc');
if (sa.error) {
  console.log(`  ${C.r}query failed:${C.x} ${sa.error}`);
  problems.push('strava_activities query failed: ' + sa.error);
} else if (!sa.rows.length) {
  verdict('Strava sync', false, false, 'no activities at all');
} else {
  const n = sa.rows[0];
  const age = hoursSince(n.start_date_local);
  // IMPORTANT: Strava can only show an activity if one happened. A quiet week of
  // training is NOT a broken channel, and flagging it as one trains you to
  // ignore this report. The channel is only suspect when it has been silent
  // long enough that a total training stop is the less likely explanation.
  const inWindow = sa.rows.filter(r => hoursSince(r.start_date_local) <= DAYS * 24).length;
  verdict('Strava channel', inWindow > 0, true,
    `${inWindow} activities in ${DAYS}d · newest ${String(n.start_date_local).slice(0, 16)} (${fmtAge(age)})`);
  if (age > 48) {
    console.log(`  ${C.y}   NOTE: no activity for ${fmtAge(age)}. If you did train, the sync is broken;`);
    console.log(`         if you did not, this is a training gap and the channel is fine.${C.x}`);
  }
  sa.rows.slice(0, 5).forEach(r =>
    console.log(`  ${C.d}   ${String(r.start_date_local).slice(0, 16)}  ${String(r.type).padEnd(12)} ${(r.distance / 1000).toFixed(2).padStart(7)} km  ${String(r.name || '').slice(0, 30)}${C.x}`));
}

// ── 3. Watch ritual sync ──
//
// "rituals_log is stale" has three very different causes and they need telling
// apart, because only one of them is a bug:
//   a) the watch is calling and failing        → WATCH_SYNC_HEALTH has errors
//   b) the watch is not calling at all         → no errors, no recent last_ok
//   c) nothing writes rituals_log any more     → tracking moved elsewhere
// Case (c) is what happened here: daily ritual tracking moved to
// discipline.html (localStorage only) when Chapter 04 opened on 2026-07-27.
console.log(`\n${C.c}WATCH — ritual sync${C.x}`);
const rl = await adminRead('rituals_log', 'date,period,completed_ids,updated_at', 20, 'date:desc');
const wl = await adminRead('weekend_log', 'date,completed_ids,updated_at', 5, 'date:desc');
const sec = await adminRead('secrets', 'key,value,updated_at', 50);

let health = null, keyState = 'unknown';
if (!sec.error) {
  const rows = sec.rows || [];
  const hRow = rows.find(r => r.key === 'WATCH_SYNC_HEALTH');
  if (hRow) { try { health = JSON.parse(hRow.value); } catch {} }
  const kRow = rows.find(r => r.key === 'watch_api_key');
  const kv = (kRow?.value || '').trim();
  keyState = !kRow ? 'ABSENT'
    : (!kv || /^<.*>$/.test(kv) || kv.length < 16) ? 'PLACEHOLDER/TOO SHORT'
    : `configured (${kv.length} chars)`;
}

verdict('watch_api_key', keyState.startsWith('configured'), false,
  keyState === 'unknown' ? 'could not read the secrets table' : keyState);

if (rl.error) {
  console.log(`  ${C.d}   rituals_log unavailable: ${rl.error}${C.x}`);
} else if (!rl.rows.length) {
  verdict('rituals_log', false, false, 'no ritual rows at all');
} else {
  const n = rl.rows[0];
  const behind = Math.round((new Date(istToday() + 'T00:00:00Z') - new Date(n.date + 'T00:00:00Z')) / 86400000);
  verdict('rituals_log', behind <= 1, behind <= 3,
    `newest ${n.date} (${behind}d behind) · ${(n.completed_ids || []).length} marked`);
}
if (!wl.error && wl.rows.length) {
  const w = wl.rows[0];
  console.log(`  ${C.d}   weekend_log newest: ${w.date} (${fmtAge(hoursSince(w.updated_at))})${C.x}`);
}

if (health) {
  const okAge = hoursSince(health.last_ok);
  console.log(`  ${C.d}   WATCH_SYNC_HEALTH: last_ok ${health.last_ok ? fmtAge(okAge) : 'never recorded'}`
            + ` · errors today ${health.errors ?? 0}`
            + (health.last_error ? ` · last error: ${String(health.last_error).slice(0, 90)}` : '') + C.x);
  if ((health.errors || 0) > 0) {
    console.log(`  ${C.r}   → the watch IS calling and FAILING. Fix the error above.${C.x}`);
    problems.push('watch sync erroring: ' + String(health.last_error || '').slice(0, 120));
  }
} else {
  console.log(`  ${C.y}   WATCH_SYNC_HEALTH: not present — no watch call has ever succeeded OR failed`);
  console.log(`     since this telemetry shipped. The watch is most likely not calling at all.${C.x}`);
}
console.log(`  ${C.d}   NOTE: daily rituals are currently logged in discipline.html, which is`);
console.log(`     localStorage-ONLY — so rituals_log going quiet is expected, not a watch`);
console.log(`     fault. The real exposure is that those rituals + the penance ledger`);
console.log(`     exist on one device with no backup. See CLAUDE.md.${C.x}`);

// ── 4. Food log (the new lifetime record) ──
console.log(`\n${C.c}FOOD — lifetime log${C.x}`);
const fl = await adminRead('food_log', 'date,meal_time,source,verdict,calories,logged_at', 400, 'date:desc');
if (fl.error) {
  if (/does not exist|relation|schema/i.test(fl.error)) {
    console.log(`  ${C.y}▲ table not created yet${C.x} — apply supabase/food_log.sql, then re-run.`);
    problems.push('food_log table not created — apply supabase/food_log.sql');
  } else {
    console.log(`  ${C.r}query failed:${C.x} ${fl.error}`);
    problems.push('food_log query failed: ' + fl.error);
  }
} else {
  const rows = fl.rows;
  const days = new Set(rows.map(r => r.date));
  const newest = rows[0];
  const age = hoursSince(newest?.logged_at);
  verdict('food logging', age < 36, age < 96,
    newest ? `${rows.length} meals across ${days.size} days · newest ${newest.date} ${newest.meal_time || ''} (${fmtAge(age)})` : 'no meals logged yet');
  let untracked = [];
  for (let i = 0; i < DAYS; i++) { const ds = addDays(istToday(), -i); if (!days.has(ds)) untracked.push(ds); }
  if (untracked.length) console.log(`  ${C.y}   ${untracked.length}/${DAYS} days with NO meal logged: ${untracked.slice(0, 8).join(', ')}${untracked.length > 8 ? ` +${untracked.length - 8}` : ''}${C.x}`);
}

// ── 5. Rules check-in marks (config is where the owner's verdict lives) ──
console.log(`\n${C.c}RULES CHECK-IN — owner marks${C.x}`);
// The check-in only opens at the day-counter epoch; days before it were never
// markable, so counting them as unmarked manufactures misses that do not exist.
const epochMatch = /STREAK_START:\s*'(\d{4}-\d{2}-\d{2})'/.exec(appJs);
const EPOCH = epochMatch ? epochMatch[1] : '1970-01-01';
const allKeys = Array.from({ length: DAYS }, (_, i) => addDays(istToday(), -i));
const inScope = allKeys.filter(d => d >= EPOCH);
const keys = inScope.map(d => 'RULES_CHECKIN_' + d);
if (!inScope.length) {
  console.log(`  ${C.d}   check-in opens ${EPOCH} — nothing to mark yet in this window.${C.x}`);
}
try {
  if (!keys.length) throw { skip: true };
  const r = await fetch(`${SUPA}/rest/v1/config?select=key,value&key=in.(${keys.join(',')})`,
    { headers: { apikey: ANON, Authorization: 'Bearer ' + ANON } });
  const rows = r.ok ? await r.json() : [];
  const marked = new Map();
  for (const row of rows) { try { marked.set(row.key.replace('RULES_CHECKIN_', ''), JSON.parse(row.value)); } catch {} }
  let clean = 0, broken = 0, partial = 0, none = 0;
  const brokenDays = [];
  for (const ds of inScope) {
    const c = marked.get(ds);
    if (!c) { none++; continue; }
    const vals = ['screens', 'food', 'night'].map(f => c[f]);
    if (vals.includes('broken')) { broken++; brokenDays.push(ds + ' (' + ['screens','food','night'].filter(f => c[f] === 'broken').join('+') + ')'); }
    else if (vals.every(v => v === 'clean')) clean++;
    else partial++;
  }
  verdict('check-in habit', none === 0, none <= 2,
    `${clean} all-clean · ${broken} with a break · ${partial} partly marked · ${none} unmarked (of ${inScope.length} markable day${inScope.length === 1 ? '' : 's'} since ${EPOCH})`);
  if (brokenDays.length) console.log(`  ${C.r}   breaks: ${brokenDays.slice(0, 8).join(', ')}${C.x}`);
} catch (e) {
  if (!e || !e.skip) console.log(`  ${C.d}   config read failed: ${e.message || e}${C.x}`);
}

// ── summary ──
console.log('\n' + '─'.repeat(66));
if (!problems.length) {
  console.log(`${C.g}${C.b}ALL CHANNELS LIVE.${C.x} Every source delivered inside its expected window.\n`);
  process.exit(0);
}
console.log(`${C.y}${C.b}${problems.length} THING(S) TO LOOK AT:${C.x}`);
problems.forEach(p => console.log('  • ' + p));
console.log(`\n${C.d}HAE silent → open Health Auto Export on the phone, check the automation is`);
console.log(`enabled and the REST endpoint + x-webhook-secret header are still set.`);
console.log(`Strava silent → the token refresh may have failed; check the secrets table.${C.x}\n`);
process.exit(2);
