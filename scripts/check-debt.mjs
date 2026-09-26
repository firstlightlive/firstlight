#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// PENANCE OWED — every server-side ledger, in one place.
//
// The debt is spread across four independent records and no screen adds them up:
//   discipline_log kind='day'      penance each day owes (cycle/run/walk km)
//   discipline_log kind='cleared'  cumulative km already paid
//   config RULES_DEBT_<date>       screens/food/night breaks (km, cleared flag)
//   slips                          engine-declared misses (penalty_km)
//
// Read-only. Reports what the SERVER knows — anything still sitting unsynced in
// a browser's localStorage cannot be seen from here and is called out as such.
//
//   npm run check:debt
// ═══════════════════════════════════════════════════════════════

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = {};
for (const line of fs.readFileSync(path.join(ROOT, 'scripts/.env'), 'utf8').split('\n')) {
  const s = line.trim();
  if (!s || s.startsWith('#') || !s.includes('=')) continue;
  const i = s.indexOf('=');
  env[s.slice(0, i).trim()] = s.slice(i + 1).trim().replace(/^["']|["']$/g, '');
}
const SUPA = env.SUPA_URL, ANON = env.SUPA_KEY;
const appJs = fs.readFileSync(path.join(ROOT, 'website/app.js'), 'utf8');
const ak = /var _ak = \[([^\]]+)\]\.join\(''\)/.exec(appJs);
const ADMIN_KEY = ak ? ak[1].split(',').map(s => s.trim().replace(/^'|'$/g, '')).join('') : '';
const EPOCH = (/STREAK_START:\s*'(\d{4}-\d{2}-\d{2})'/.exec(appJs) || [])[1];
const FN = SUPA + '/functions/v1/firstlight-sync';

async function adminRead(table, select = '*', limit = 500, order = null) {
  const body = { table, select, limit }; if (order) body.order = order;
  const r = await fetch(FN + '?action=admin-read', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: 'Bearer ' + ANON, 'x-admin-key': ADMIN_KEY },
    body: JSON.stringify(body),
  });
  const txt = await r.text();
  if (!r.ok) return { error: `HTTP ${r.status}: ${txt.slice(0, 160)}` };
  try { const j = JSON.parse(txt); return j.error ? { error: String(j.error) } : { rows: j.data || [] }; }
  catch { return { error: 'bad JSON' }; }
}
const n = v => { const x = Number(v); return isFinite(x) ? x : 0; };
const C = { r:'\x1b[31m', g:'\x1b[32m', y:'\x1b[33m', c:'\x1b[36m', d:'\x1b[2m', b:'\x1b[1m', x:'\x1b[0m' };

console.log(`\n${C.b}PENANCE OWED${C.x}  ${C.d}· current run from ${EPOCH} · server-side records only${C.x}\n`);

let grandCycle = 0, grandRun = 0, grandWalk = 0, unknown = [];

// ── 1. discipline_log: the 5 rituals + Punishment Cycle ──
console.log(`${C.c}1 · RITUALS / PUNISHMENT CYCLE (discipline_log)${C.x}`);
const dl = await adminRead('discipline_log', 'date,kind,data', 800, 'date:desc');
if (dl.error) {
  console.log(`  ${/does not exist/i.test(dl.error) ? C.y + 'table not created' : C.r + dl.error}${C.x}`);
  unknown.push('discipline_log unreadable');
} else {
  const days = dl.rows.filter(r => r.kind === 'day' && r.date >= EPOCH);
  const cleared = dl.rows.filter(r => r.kind === 'cleared');
  let oc = 0, or_ = 0, ow = 0;
  days.forEach(r => { const p = (r.data || {}).penance || {}; oc += n(p.cycle); or_ += n(p.run); ow += n(p.walk); });
  let pc = 0, pr = 0, pw = 0;
  cleared.forEach(r => { const d = r.data || {}; pc = Math.max(pc, n(d.cycle)); pr = Math.max(pr, n(d.run)); pw = Math.max(pw, n(d.walk)); });
  console.log(`  days recorded: ${days.length}   owed  cycle ${oc} km · run ${or_} km · walk ${ow} km`);
  console.log(`  paid so far:              cycle ${pc} km · run ${pr} km · walk ${pw} km`);
  const rc = Math.max(0, oc - pc), rr = Math.max(0, or_ - pr), rw = Math.max(0, ow - pw);
  grandCycle += rc; grandRun += rr; grandWalk += rw;
  const col = (rc + rr + rw) ? C.y : C.g;
  console.log(`  ${col}remaining:                cycle ${rc} km · run ${rr} km · walk ${rw} km${C.x}`);
  if (!dl.rows.length) console.log(`  ${C.d}(empty — nothing has synced from the device yet)${C.x}`);
}

// ── 2. RULES_DEBT_<date> in config (screens / food / night) ──
console.log(`\n${C.c}2 · RULE BREAKS (config RULES_DEBT_*)${C.x}`);
try {
  const r = await fetch(`${SUPA}/rest/v1/config?select=key,value&key=like.RULES_DEBT_*`,
    { headers: { apikey: ANON, Authorization: 'Bearer ' + ANON } });
  const rows = r.ok ? await r.json() : [];
  let openKm = 0, clearedKm = 0; const detail = [];
  for (const row of rows) {
    let v = {}; try { v = JSON.parse(row.value); } catch { continue; }
    const date = row.key.replace('RULES_DEBT_', '');
    const km = n(v.km);
    if (v.cleared) { clearedKm += km; continue; }
    if (km > 0) { openKm += km; detail.push(`${date}: ${km} km (${(v.rules || []).join(', ') || 'unspecified'})`); }
  }
  if (!rows.length) console.log(`  ${C.g}no RULES_DEBT rows at all — no rule break has ever posted${C.x}`);
  else {
    detail.forEach(d => console.log(`  ${C.y}· ${d}${C.x}`));
    console.log(`  open ${openKm} km · already cleared ${clearedKm} km`);
  }
  grandCycle += openKm;   // rule debt is denominated in cycle km
} catch (e) { console.log(`  ${C.r}read failed: ${e.message}${C.x}`); unknown.push('RULES_DEBT unreadable'); }

// ── 3. slips: engine-declared misses ──
console.log(`\n${C.c}3 · DECLARED MISSES (slips)${C.x}`);
const sl = await adminRead('slips', '*', 200, 'date:desc');
if (sl.error) { console.log(`  ${C.r}${sl.error}${C.x}`); unknown.push('slips unreadable'); }
else {
  const inRun = sl.rows.filter(r => (r.date || '') >= EPOCH);
  if (!inRun.length) console.log(`  ${C.g}no slips in the current run (${sl.rows.length} historical rows)${C.x}`);
  inRun.forEach(r => {
    const km = n(r.penalty_km);
    const paid = /paid|cleared|void/i.test(String(r.status || ''));
    console.log(`  ${paid ? C.g : C.y}· ${r.date} ${r.status || '?'} ${km ? km + ' km' : ''} ${r.reason || ''}${C.x}`);
    if (!paid) grandCycle += km;
  });
}

// ── total ──
console.log('\n' + '─'.repeat(62));
const total = grandCycle + grandRun + grandWalk;
if (!total) {
  console.log(`${C.g}${C.b}NOTHING OWED on the server.${C.x}`);
} else {
  console.log(`${C.y}${C.b}TOTAL OUTSTANDING (server): cycle ${grandCycle} km · run ${grandRun} km · walk ${grandWalk} km${C.x}`);
  // Conversions per the penal code: cycle 1km=1, walk/run 1km=2, swim 1km=10, gym 1h=10
  const asCycle = grandCycle + grandRun * 2 + grandWalk * 2;
  console.log(`${C.d}  equivalently ~${asCycle} cycle-km, or ~${Math.ceil(asCycle / 2)} km run/walk (run & walk count double),`);
  console.log(`  or ~${Math.ceil(asCycle / 10)} km swim, or ~${Math.ceil(asCycle / 10)} h gym/boxing.${C.x}`);
}
console.log(`\n${C.d}NOT VISIBLE FROM HERE: the electronics DEBT LEDGER in the Lifetime System`);
console.log(`panel lives in localStorage (fl_recovery_v1) on the device, and any`);
console.log(`discipline entry not yet synced is also local-only. Open the page on the`);
console.log(`device to see those.${C.x}`);
if (unknown.length) console.log(`\n${C.y}Could not read: ${unknown.join(', ')}${C.x}`);
console.log();
