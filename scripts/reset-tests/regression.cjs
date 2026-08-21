// REGRESSION + CROSS-IMPLEMENTATION CONSISTENCY.
//
// The noon-sweep rule is implemented TWICE — client JS (reset.html noonSweep) and
// server SQL (reset_noon_sweep). If they ever disagree you get double-logged or
// missed relapses. Here an INDEPENDENT third implementation ("oracle") is the spec:
//   • oracle == SQL          → asserted directly below (matrix)
//   • oracle == JS (real)    → asserted by page.cjs (functional + boundary scenarios)
//   ⇒ transitively JS == SQL.
// Plus: locked-bug regressions (the ambiguous-`d` crash), exact-noon boundary,
// idempotency property.
const { loadDb } = require('./_sqlenv.cjs');
const A = require('./_assert.cjs');

const TODAY = '2026-08-16';
const ad = (ds, n) => { const p = ds.split('-'); const d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2], 12)); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dd = (a, b) => { const pa = a.split('-'), pb = b.split('-'); return Math.round((Date.UTC(+pa[0], +pa[1] - 1, +pa[2]) - Date.UTC(+pb[0], +pb[1] - 1, +pb[2])) / 864e5); };

// independent spec: which days get auto-logged, given inputs
function oracle(start, today, clockMins, cleanArr, relArr) {
  const cutoff = clockMins >= 720 ? ad(today, -1) : ad(today, -2);
  const clean = new Set(cleanArr), rel = new Set(relArr);
  const out = []; let x = start, guard = 0;
  while (dd(cutoff, x) >= 0 && guard < 5000) { if (!clean.has(x) && !rel.has(x)) out.push(x); x = ad(x, 1); guard++; }
  return out;
}

async function sqlSweep(db, start, clock, clean, rel) {
  await db.exec('TRUNCATE reset_days, reset_relapses, reset_punishments;');
  await db.exec(`UPDATE reset_state SET start_date='${start}' WHERE id='me';`);
  if (clean.length) await db.exec(`INSERT INTO reset_days(d,clean) VALUES ${clean.map(d => `('${d}',true)`).join(',')};`);
  if (rel.length) await db.exec(`INSERT INTO reset_relapses(occurred_on,auto) VALUES ${rel.map(d => `('${d}',false)`).join(',')};`);
  await db.query(`SELECT reset_noon_sweep_at(TIMESTAMP '${TODAY} ${clock}')`);
  const r = await db.query(`SELECT COALESCE(array_agg(occurred_on::text ORDER BY occurred_on), ARRAY[]::text[]) AS a FROM reset_relapses WHERE auto;`);
  return r.rows[0].a;
}

// [name, start, clock 'HH:MM:SS', clockMins, cleanDays[], manualRelapseDays[]]
const MATRIX = [
  ['before-noon (cutoff = day-before-yesterday)', ad(TODAY, -3), '08:00:00', 480, [], []],
  ['after-noon (cutoff = yesterday)', ad(TODAY, -3), '13:00:00', 780, [], []],
  ['exact noon 12:00:00 → treated as after', ad(TODAY, -3), '12:00:00', 720, [], []],
  ['11:59:59 → treated as before', ad(TODAY, -3), '11:59:59', 719, [], []],
  ['skips clean + manual relapse', ad(TODAY, -5), '13:00:00', 780, [ad(TODAY, -4)], [ad(TODAY, -2)]],
  ['start today → nothing due', TODAY, '13:00:00', 780, [], []],
  ['yesterday in grace (before noon)', ad(TODAY, -1), '08:00:00', 480, [], []],
  ['yesterday due (after noon)', ad(TODAY, -1), '13:00:00', 780, [], []],
  ['15-day gap', ad(TODAY, -15), '13:00:00', 780, [], []],
  ['23:59 still same cutoff as after-noon', ad(TODAY, -3), '23:59:00', 1439, [], []],
  ['30-day gap w/ scattered clean days', ad(TODAY, -30), '13:00:00', 780, [ad(TODAY, -20), ad(TODAY, -5)], [ad(TODAY, -10)]],
];

(async () => {
  let db;
  try { db = await loadDb(); }
  catch (e) { console.error('❌ SETUP/LOAD FAILED:', e.message); process.exit(3); }

  A.section('cross-impl consistency — SQL sweep == independent oracle');
  for (const [name, start, clock, mins, clean, rel] of MATRIX) {
    const got = await sqlSweep(db, start, clock, clean, rel);
    const want = oracle(start, TODAY, mins, clean, rel);
    A.eq('SQL==oracle: ' + name, got, want);
  }

  A.section('locked-bug regressions');
  // REG-1: the ambiguous-`d` crash — real function must run, not throw
  await db.exec('TRUNCATE reset_days, reset_relapses, reset_punishments;');
  await db.exec(`UPDATE reset_state SET start_date=(CURRENT_DATE - 3) WHERE id='me';`);
  let threw = false, n = null;
  try { const r = await db.query('SELECT public.reset_noon_sweep() AS n'); n = r.rows[0].n; } catch (_e) { threw = true; }
  A.ok('REG-1 real reset_noon_sweep() does not throw (ambiguous-d fixed)', !threw && n !== null, threw ? 'threw' : 'n=' + n);

  // REG-2: exact-noon boundary — 12:00:00 sweeps yesterday, 11:59:59 does not
  const at1200 = await sqlSweep(db, ad(TODAY, -1), '12:00:00', [], []);
  const at1159 = await sqlSweep(db, ad(TODAY, -1), '11:59:59', [], []);
  A.eq('REG-2a 12:00:00 sweeps yesterday', at1200, [ad(TODAY, -1)]);
  A.eq('REG-2b 11:59:59 leaves yesterday in grace', at1159, []);

  // REG-3: idempotency property — re-running adds nothing
  const first = await sqlSweep(db, ad(TODAY, -3), '13:00:00', [], []);
  const r2 = await db.query(`SELECT reset_noon_sweep_at(TIMESTAMP '${TODAY} 13:00:00') AS n`);
  const r3 = await db.query(`SELECT reset_noon_sweep_at(TIMESTAMP '${TODAY} 13:00:00') AS n`);
  const after = (await db.query(`SELECT COALESCE(array_agg(occurred_on::text ORDER BY occurred_on), ARRAY[]::text[]) AS a FROM reset_relapses WHERE auto;`)).rows[0].a;
  A.eq('REG-3a 2nd sweep returns 0', r2.rows[0].n, 0);
  A.eq('REG-3b 3rd sweep returns 0', r3.rows[0].n, 0);
  A.eq('REG-3c auto-set stable across re-runs', after, first);

  // REG-4: one relapse per day even under repeated pressure (unique + ON CONFLICT)
  await db.exec('TRUNCATE reset_relapses, reset_punishments;');
  await db.exec(`UPDATE reset_state SET start_date='${ad(TODAY, -2)}' WHERE id='me';`);
  await db.query(`SELECT reset_noon_sweep_at(TIMESTAMP '${TODAY} 13:00:00')`);
  await db.query(`SELECT reset_noon_sweep_at(TIMESTAMP '${TODAY} 13:00:00')`);
  const dupct = (await db.query(`SELECT count(*)::int AS c FROM (SELECT occurred_on FROM reset_relapses GROUP BY occurred_on HAVING count(*)>1) t;`)).rows[0].c;
  A.eq('REG-4 no duplicate relapse rows per day', dupct, 0);

  A.done('regression + cross-impl consistency');
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
