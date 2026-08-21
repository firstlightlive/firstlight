// UNIT TESTS — reset.html pure helpers, isolated.
// Functions are EXTRACTED VERBATIM from website/reset.html (brace-balanced) and
// evaluated in a vm sandbox with a controllable clock + injectable `state`.
// Extract-from-source = zero drift: we test the exact production code.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const A = require('./_assert.cjs');

const REPO = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.resolve(REPO, 'website/reset.html'), 'utf8');
const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const src = scripts.find(s => s.includes('function istParts'));
if (!src) { console.error('unit.cjs: inline script not found in reset.html'); process.exit(2); }

function extractFn(name) {
  const sig = 'function ' + name + '(';
  const start = src.indexOf(sig);
  if (start < 0) throw new Error('function not found in reset.html: ' + name);
  let depth = 0, i = src.indexOf('{', start);
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') { if (--depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error('unbalanced braces extracting: ' + name);
}
const NAMES = ['istParts', 'addDays', 'diffDays', 'pretty', 'esc', 'relapseOn', 'lastRelapseDate', 'cleanStreak', 'bestStreak', 'kmOwed', 'isCleared'];
const bundle = NAMES.map(extractFn).join('\n\n') + '\n;globalThis.__api = { ' + NAMES.join(', ') + ' };';

// ── controllable clock (no-arg Date + Date.now → NOW; arg-forms real) ──
const RealDate = Date; let NOW = 0;
function FD(...a) { return a.length === 0 ? new RealDate(NOW) : new RealDate(...a); }
FD.now = () => NOW; FD.UTC = RealDate.UTC; FD.parse = RealDate.parse; FD.prototype = RealDate.prototype;
const istEpoch = (y, m, d, H = 0, M = 0, S = 0) => RealDate.UTC(y, m - 1, d, H, M, S) - 5.5 * 3600000;
const setIST = (y, m, d, H, M, S) => { NOW = istEpoch(y, m, d, H, M, S); };

const ctx = { Date: FD, Math, String, Set, JSON, console, state: {} };
vm.createContext(ctx);
try { vm.runInContext(bundle, ctx, { filename: 'reset-extracted.js' }); }
catch (e) { console.error('unit.cjs: failed to eval extracted functions:', e.message); process.exit(2); }
const F = ctx.__api;
const setState = (s) => { ctx.state = s; };

// ═══════════════ diffDays(a,b) = a − b in whole days ═══════════════
A.section('diffDays — boundaries');
A.eq('same day', F.diffDays('2026-08-16', '2026-08-16'), 0);
A.eq('+1 day', F.diffDays('2026-08-16', '2026-08-15'), 1);
A.eq('−1 day (order)', F.diffDays('2026-08-15', '2026-08-16'), -1);
A.eq('month boundary', F.diffDays('2026-09-01', '2026-08-31'), 1);
A.eq('year boundary', F.diffDays('2027-01-01', '2026-12-31'), 1);
A.eq('leap Feb 2028 (29 days)', F.diffDays('2028-03-01', '2028-02-28'), 2);
A.eq('non-leap Feb 2027', F.diffDays('2027-03-01', '2027-02-28'), 1);
A.eq('long span', F.diffDays('2026-08-16', '2026-01-01'), 227);
A.eq('DST-immune (UTC math)', F.diffDays('2026-03-30', '2026-03-28'), 2);

// ═══════════════ addDays(ds,n) ═══════════════
A.section('addDays — rollovers + properties');
A.eq('+1', F.addDays('2026-08-16', 1), '2026-08-17');
A.eq('month roll', F.addDays('2026-08-31', 1), '2026-09-01');
A.eq('year roll', F.addDays('2026-12-31', 1), '2027-01-01');
A.eq('−1', F.addDays('2026-08-16', -1), '2026-08-15');
A.eq('into leap day', F.addDays('2028-02-28', 1), '2028-02-29');
A.eq('non-leap skips to Mar', F.addDays('2027-02-28', 1), '2027-03-01');
A.eq('round-trip +7/−7', F.addDays(F.addDays('2026-08-16', 7), -7), '2026-08-16');
let prop = true; for (const n of [0, 1, 5, 30, 366, -1, -400]) if (F.diffDays(F.addDays('2026-08-16', n), '2026-08-16') !== n) prop = false;
A.ok('property diffDays(addDays(x,n),x)===n', prop);

// ═══════════════ istParts() — IST clock + timezone conversion ═══════════════
A.section('istParts — IST + UTC↔IST');
setIST(2026, 8, 16, 8, 30); A.eq('date @08:30 IST', F.istParts().date, '2026-08-16'); A.eq('mins @08:30', F.istParts().mins, 510);
setIST(2026, 8, 16, 0, 0); A.eq('IST midnight date', F.istParts().date, '2026-08-16'); A.eq('IST midnight mins', F.istParts().mins, 0);
setIST(2026, 8, 16, 23, 59); A.eq('just before IST midnight', F.istParts().mins, 1439);
setIST(2026, 8, 16, 12, 0); A.eq('noon → mins 720 (sweep boundary)', F.istParts().mins, 720);
setIST(2026, 8, 16, 11, 59); A.eq('11:59 → mins 719', F.istParts().mins, 719);
NOW = RealDate.UTC(2026, 7, 16, 20, 0); // UTC Aug-16 20:00 == IST Aug-17 01:30 — proves tz handling
A.eq('UTC→IST date rollover', F.istParts().date, '2026-08-17');
A.eq('UTC→IST mins', F.istParts().mins, 90);

// ═══════════════ relapseOn / lastRelapseDate ═══════════════
A.section('relapse lookups');
setState({ start: '2026-08-10', relapses: [{ occurred_on: '2026-08-12' }, { occurred_on: '2026-08-14' }], punishments: [] });
A.eq('relapseOn hit', !!F.relapseOn('2026-08-12'), true);
A.eq('relapseOn miss → null', F.relapseOn('2026-08-13'), null);
A.eq('lastRelapseDate = max', F.lastRelapseDate(), '2026-08-14');
setState({ start: '2026-08-10', relapses: [], punishments: [] });
A.eq('lastRelapseDate none → null', F.lastRelapseDate(), null);

// ═══════════════ cleanStreak(today) ═══════════════
A.section('cleanStreak');
setState({ start: '2026-08-10', relapses: [], punishments: [] });
A.eq('no relapse → days since start', F.cleanStreak('2026-08-16'), 6);
setState({ start: '2026-08-10', relapses: [{ occurred_on: '2026-08-14' }], punishments: [] });
A.eq('since last relapse', F.cleanStreak('2026-08-16'), 2);
setState({ start: '2026-08-10', relapses: [{ occurred_on: '2026-08-16' }], punishments: [] });
A.eq('relapse today → 0', F.cleanStreak('2026-08-16'), 0);
setState({ start: '2026-08-16', relapses: [], punishments: [] });
A.eq('start today → 0', F.cleanStreak('2026-08-16'), 0);

// ═══════════════ bestStreak(today) ═══════════════
A.section('bestStreak');
setState({ start: '2026-08-10', relapses: [], punishments: [] });
A.eq('no relapse → equals current', F.bestStreak('2026-08-16'), 6);
setState({ start: '2026-08-10', relapses: [{ occurred_on: '2026-08-12' }, { occurred_on: '2026-08-15' }], punishments: [] });
A.eq('max gap (12→15 = 3)', F.bestStreak('2026-08-16'), 3);
setState({ start: '2026-08-01', relapses: [{ occurred_on: '2026-08-16' }], punishments: [] });
A.eq('long clean run before relapse today', F.bestStreak('2026-08-16'), 15);

// ═══════════════ isCleared / kmOwed ═══════════════
A.section('penance math');
A.eq('isCleared met', F.isCleared({ cycle_done: 200, walk_done: 50, cycle_km: 200, walk_km: 50 }), true);
A.eq('isCleared under', F.isCleared({ cycle_done: 199, walk_done: 50, cycle_km: 200, walk_km: 50 }), false);
A.eq('isCleared over-complete', F.isCleared({ cycle_done: 250, walk_done: 60, cycle_km: 200, walk_km: 50 }), true);
setState({ start: '2026-08-10', relapses: [], punishments: [
  { cycle_km: 200, walk_km: 50, cycle_done: 0, walk_done: 0 },
  { cycle_km: 200, walk_km: 50, cycle_done: 100, walk_done: 50 },
] });
A.eq('kmOwed sums remaining (250+100)', F.kmOwed(), 350);
setState({ start: '2026-08-10', relapses: [], punishments: [
  { cycle_km: 200, walk_km: 50, cycle_done: 200, walk_done: 50 },       // cleared → excluded
  { cycle_km: 200, walk_km: 50, cycle_done: 250, walk_done: 60 },       // over → excluded, no negative
] });
A.eq('kmOwed excludes cleared, no negatives', F.kmOwed(), 0);

// ═══════════════ esc / pretty ═══════════════
A.section('formatting');
A.eq('esc escapes &<>', F.esc('<b>&"x"'), '&lt;b&gt;&amp;"x"');
A.eq('pretty', F.pretty('2026-08-16'), 'Aug 16, 2026');
A.eq('pretty single-digit day', F.pretty('2026-01-05'), 'Jan 5, 2026');

A.done('unit — reset.html pure helpers');
