// Functional/integration tests: runs the REAL supabase/reset_module.sql in Postgres
// (PGlite/WASM) and asserts DDL, RLS, triggers, constraints, and sweep behaviour.
const { loadDb } = require('./_sqlenv.cjs');

const cases = [
  ['C0 structure: 5 tables, 5 RLS policies, 3 cron jobs', `DO $$ BEGIN
    ASSERT (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'reset\\_%')=5, 'tables='||(SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'reset\\_%');
    ASSERT (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename LIKE 'reset\\_%')=5, 'policies';
    ASSERT (SELECT bool_and(relrowsecurity) FROM pg_class WHERE relname IN ('reset_state','reset_days','reset_relapses','reset_punishments','reset_urges')), 'rls';
    ASSERT (SELECT count(*) FROM cron.job WHERE jobname LIKE 'reset\\_%')=3, 'cron='||(SELECT count(*) FROM cron.job WHERE jobname LIKE 'reset\\_%');
  END $$;`],

  ['C0b policies target authenticated only (not anon)', `DO $$ BEGIN
    ASSERT (SELECT bool_and(roles='{authenticated}') FROM pg_policies WHERE schemaname='public' AND tablename LIKE 'reset\\_%'), 'roles='||(SELECT string_agg(distinct roles::text,',') FROM pg_policies WHERE tablename LIKE 'reset\\_%');
  END $$;`],

  ['C0c reset_state singleton seeded (id=me, start_date set)', `DO $$ BEGIN
    ASSERT (SELECT count(*) FROM reset_state WHERE id='me')=1, 'no singleton';
    ASSERT (SELECT start_date IS NOT NULL FROM reset_state WHERE id='me'), 'null start';
  END $$;`],

  ['C1 after-noon sweep logs 6 days (10..15) + idempotent', `DO $$ DECLARE n int; BEGIN
    TRUNCATE reset_days, reset_relapses, reset_punishments;
    UPDATE reset_state SET start_date='2026-08-10' WHERE id='me';
    SELECT reset_noon_sweep_at(TIMESTAMP '2026-08-16 13:00') INTO n;
    ASSERT n=6, 'return='||n;
    ASSERT (SELECT count(*) FROM reset_relapses)=6, 'relapses';
    ASSERT (SELECT count(*) FROM reset_punishments)=6, 'punish';
    ASSERT (SELECT bool_and(auto) FROM reset_relapses), 'all-auto';
    ASSERT (SELECT bool_and(cycle_km=200 AND walk_km=50) FROM reset_punishments), 'km';
    ASSERT (SELECT min(deadline-relapse_on)=7 AND max(deadline-relapse_on)=7 FROM reset_punishments), 'deadline+7';
    SELECT reset_noon_sweep_at(TIMESTAMP '2026-08-16 13:00') INTO n;   -- run again
    ASSERT n=0, 'idem-return='||n;
    ASSERT (SELECT count(*) FROM reset_relapses)=6, 'idem-count';
  END $$;`],

  ['C2 before-noon cutoff leaves yesterday in grace (5 days 10..14)', `DO $$ DECLARE n int; BEGIN
    TRUNCATE reset_days, reset_relapses, reset_punishments;
    UPDATE reset_state SET start_date='2026-08-10' WHERE id='me';
    SELECT reset_noon_sweep_at(TIMESTAMP '2026-08-16 08:00') INTO n;
    ASSERT n=5, 'return='||n;
    ASSERT NOT EXISTS(SELECT 1 FROM reset_relapses WHERE occurred_on='2026-08-15'), 'yesterday should be untouched';
  END $$;`],

  ['C3 skips clean-confirmed days AND existing relapse (0 new)', `DO $$ DECLARE n int; BEGIN
    TRUNCATE reset_days, reset_relapses, reset_punishments;
    UPDATE reset_state SET start_date='2026-08-13' WHERE id='me';
    INSERT INTO reset_days(d,clean) VALUES ('2026-08-13',true),('2026-08-14',true);
    INSERT INTO reset_relapses(occurred_on,auto) VALUES ('2026-08-15',false);
    SELECT reset_noon_sweep_at(TIMESTAMP '2026-08-16 13:00') INTO n;
    ASSERT n=0, 'return='||n;
    ASSERT (SELECT count(*) FROM reset_relapses)=1, 'should keep only the 1 manual';
  END $$;`],

  ['C4 cleared trigger flips false→true when km met', `DO $$ BEGIN
    TRUNCATE reset_punishments;
    INSERT INTO reset_punishments(relapse_on,assigned_on,deadline,cycle_done,walk_done) VALUES ('2026-08-01','2026-08-01','2026-08-08',100,50);
    ASSERT (SELECT cleared FROM reset_punishments WHERE relapse_on='2026-08-01')=false, 'partial should be uncleared';
    UPDATE reset_punishments SET cycle_done=200 WHERE relapse_on='2026-08-01';
    ASSERT (SELECT cleared FROM reset_punishments WHERE relapse_on='2026-08-01')=true, 'met should be cleared';
  END $$;`],

  ['C5 unique(occurred_on) blocks duplicate relapse per day', `DO $$ DECLARE ok bool:=false; BEGIN
    TRUNCATE reset_relapses;
    INSERT INTO reset_relapses(occurred_on,auto) VALUES ('2026-08-02',false);
    BEGIN INSERT INTO reset_relapses(occurred_on,auto) VALUES ('2026-08-02',true);
    EXCEPTION WHEN unique_violation THEN ok:=true; END;
    ASSERT ok, 'duplicate occurred_on should have been rejected';
  END $$;`],

  ['C6 REAL reset_noon_sweep() runs + is idempotent', `DO $$ DECLARE n1 int; n2 int; c1 bigint; c2 bigint; BEGIN
    TRUNCATE reset_days, reset_relapses, reset_punishments;
    UPDATE reset_state SET start_date=(CURRENT_DATE - 5) WHERE id='me';
    SELECT public.reset_noon_sweep() INTO n1;
    SELECT count(*) FROM reset_relapses INTO c1;
    SELECT public.reset_noon_sweep() INTO n2;
    SELECT count(*) FROM reset_relapses INTO c2;
    ASSERT n2=0, 'second run should add 0, got '||n2;
    ASSERT c1=c2, 'count changed on re-run';
    ASSERT c1 >= 3, 'expected several relapses, got '||c1;
  END $$;`],
];

(async () => {
  let db; const results = [];
  try {
    db = await loadDb();   // applies the real file under test
  } catch (e) {
    console.error('❌ SETUP/LOAD FAILED (reset_module.sql did not apply cleanly):\n', e.message);
    process.exit(3);
  }
  for (const [name, sql] of cases) {
    try { await db.exec(sql); results.push({ name, pass: true }); }
    catch (e) { results.push({ name, pass: false, detail: (e.message || '').split('\n')[0] }); }
  }
  console.log('\n===== reset_module.sql — real Postgres (PGlite) tests =====');
  results.forEach(r => console.log((r.pass ? '  ✅ ' : '  ❌ ') + r.name + (r.pass ? '' : '   → ' + r.detail)));
  const pass = results.filter(r => r.pass).length, fail = results.length - pass;
  console.log(`\n  ${pass}/${results.length} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
