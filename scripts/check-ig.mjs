#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// INSTAGRAM READINESS — will a post and a story actually go out?
//
// Publishing was paused indefinitely on 2026-09-19 via two server-side secrets
// (nothing in git records that state), and the account had been restricted for
// scam-pattern captions. So "is IG live?" has four separate answers:
//   1. the ig_publish_enabled gate
//   2. the PAUSED_BY_OPERATOR monthly-recap stopgap keys
//   3. a valid, unexpired IG token
//   4. captions that will not get the account restricted again
//
// Read-only: reports state, changes nothing.   npm run check:ig
// ═══════════════════════════════════════════════════════════════
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = {};
for (const l of fs.readFileSync(path.join(ROOT, 'scripts/.env'), 'utf8').split('\n')) {
  const s = l.trim(); if (!s || s.startsWith('#') || !s.includes('=')) continue;
  const i = s.indexOf('='); env[s.slice(0, i).trim()] = s.slice(i + 1).trim().replace(/^["']|["']$/g, '');
}
const SUPA = env.SUPA_URL, ANON = env.SUPA_KEY;
const appJs = fs.readFileSync(path.join(ROOT, 'website/app.js'), 'utf8');
const ak = /var _ak = \[([^\]]+)\]\.join\(''\)/.exec(appJs);
const ADMIN = ak ? ak[1].split(',').map(s => s.trim().replace(/^'|'$/g, '')).join('') : '';
const FN = SUPA + '/functions/v1/firstlight-sync';

async function adminRead(table, select = '*', limit = 500) {
  const r = await fetch(FN + '?action=admin-read', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: 'Bearer ' + ANON, 'x-admin-key': ADMIN },
    body: JSON.stringify({ table, select, limit }),
  });
  const x = await r.text();
  if (!r.ok) return { error: `HTTP ${r.status}` };
  try { const j = JSON.parse(x); return j.error ? { error: String(j.error) } : { rows: j.data || [] }; }
  catch { return { error: 'bad JSON' }; }
}
const C = { r:'\x1b[31m', g:'\x1b[32m', y:'\x1b[33m', c:'\x1b[36m', d:'\x1b[2m', b:'\x1b[1m', x:'\x1b[0m' };
let blockers = [];
function v(label, ok, msg) {
  console.log(`  ${ok ? C.g + '✓ READY ' : C.r + '✘ BLOCKED'}${C.x} ${label.padEnd(26)} ${msg}`);
  if (!ok) blockers.push(`${label}: ${msg}`);
}

console.log(`\n${C.b}INSTAGRAM READINESS${C.x}\n`);

// ── 1-3. server state ──
console.log(`${C.c}SERVER STATE (secrets)${C.x}`);
const sec = await adminRead('secrets', 'key,value,updated_at', 400);
if (sec.error) {
  console.log(`  ${C.r}cannot read secrets: ${sec.error}${C.x}`);
  blockers.push('secrets unreadable: ' + sec.error);
} else {
  const get = k => (sec.rows.find(r => r.key === k) || {});
  const gate = get('ig_publish_enabled');
  v('ig_publish_enabled', gate.value === 'true',
    gate.value === undefined ? 'NOT SET — treated as off' : `"${gate.value}"` +
    (gate.value !== 'true' ? ' — set to "true" to resume' : ''));

  const paused = sec.rows.filter(r => String(r.value).startsWith('PAUSED_BY_OPERATOR'));
  v('monthly recap stopgap', paused.length === 0,
    paused.length ? `${paused.length} month(s) still marked PAUSED — delete them or those recaps never post`
                  : 'none — recaps are free to post');
  if (paused.length) console.log(`  ${C.d}   ${paused.map(r => r.key).slice(0, 8).join(', ')}${paused.length > 8 ? ' …' : ''}${C.x}`);

  const tok = get('ig_access');
  const hasTok = !!tok.value && String(tok.value).length > 40;
  const ageD = tok.updated_at ? Math.floor((Date.now() - new Date(tok.updated_at)) / 86400000) : null;
  // A Facebook user token dies 60 days after the login that created it and cannot
  // be extended server-side — only a fresh browser login mints a new one.
  v('ig_access token', hasTok && (ageD === null || ageD < 55),
    !hasTok ? 'MISSING — publishing cannot authenticate'
            : `present, stored ${ageD}d ago` + (ageD >= 55 ? ' — at/near the 60-day expiry, re-login via /ig-connect.html' : ''));
  const pageTok = get('ig_page_token') || get('fb_page_token');
  console.log(`  ${C.d}   permanent page token present: ${pageTok.value ? 'yes' : 'no'}${C.x}`);
}

// ── 4. caption safety (static, from the deployed source) ──
console.log(`\n${C.c}CAPTION SAFETY — what would actually publish${C.x}`);
const fn = fs.readFileSync(path.join(ROOT, 'supabase/functions/firstlight-sync/index.ts'), 'utf8');
// Only the caption/recap builders matter; historical constants elsewhere are fine.
const capStart = fn.indexOf('const WIN_OPENERS');
const capEnd = fn.indexOf('async function _publishIgFeedPost');
const capRegion = fn.slice(capStart > 0 ? capStart : 0, capEnd > 0 ? capEnd : 4000);
const recapStart = fn.indexOf('agg.monthLabel');
const recapRegion = recapStart > 0 ? fn.slice(recapStart - 400, recapStart + 2500) : '';
// Strip comments FIRST. The caption builders are full of notes explaining that
// money was removed — including the words "no money, no charity" — and scanning
// raw source reported those as blockers. Only shipped strings matter.
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const MONEY = /₹|\\u20B9|Akshaya|Rs\s?[0-9]|charity/i;
v('post caption', !MONEY.test(strip(capRegion)), MONEY.test(strip(capRegion)) ? 'contains money/charity framing' : 'no money, no charity');
v('monthly recap caption', !MONEY.test(strip(recapRegion)), MONEY.test(strip(recapRegion)) ? 'contains money/charity framing' : 'no money, no charity');
const linkInCap = /firstlight\.live/.test(strip(capRegion));
v('no link in caption', !linkInCap, linkInCap ? 'caption contains firstlight.live' : 'clean (site is a login wall)');

// ── story support ──
console.log(`\n${C.c}STORY SUPPORT${C.x}`);
v('story publisher', /async function _publishIgStory/.test(fn), 'the _publishIgStory path exists');
v('verdict story frames', /_publishVerdictStoryFrames/.test(fn), 'stories are published alongside the verdict post');

// ── recent activity ──
console.log(`\n${C.c}RECENT POSTS${C.x}`);
const ig = await adminRead('instagram_posts', 'created_at,day_number,permalink', 6);
if (ig.error) console.log(`  ${C.d}   unreadable: ${ig.error}${C.x}`);
else if (!ig.rows.length) console.log(`  ${C.y}   no posts recorded${C.x}`);
else ig.rows.slice(0, 5).forEach(r =>
  console.log(`  ${C.d}   ${String(r.created_at).slice(0,16)}  day ${r.day_number ?? '?'}  ${String(r.permalink||'').slice(0,42)}${C.x}`));

console.log('\n' + '─'.repeat(64));
if (!blockers.length) console.log(`${C.g}${C.b}INSTAGRAM IS READY — a post and a story will go out.${C.x}\n`);
else {
  console.log(`${C.r}${C.b}NOT LIVE — ${blockers.length} blocker(s):${C.x}`);
  blockers.forEach(b => console.log('  • ' + b));
  console.log(`\n${C.d}Resume = set ig_publish_enabled to "true" AND delete every`);
  console.log(`PAUSED_BY_OPERATOR_* secret. Both are server-side; nothing in git`);
  console.log(`records this state. A stale token needs a browser login at /ig-connect.html.${C.x}\n`);
}
