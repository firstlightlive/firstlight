// Shared PGlite (WASM Postgres) environment for the SQL tests.
// Loads the REAL supabase/reset_module.sql plus a cron stub + an injectable-clock
// clone of reset_noon_sweep (body identical to production, istnow as a param).
const { PGlite } = require('@electric-sql/pglite');
const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '../..');
const MODULE_SQL = fs.readFileSync(path.resolve(REPO, 'supabase/reset_module.sql'), 'utf8');

const PRE = `
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA IF NOT EXISTS cron;
CREATE TABLE cron.job (jobid bigserial PRIMARY KEY, jobname text, schedule text, command text);
CREATE OR REPLACE FUNCTION cron.schedule(jobname text, schedule text, command text) RETURNS bigint
  LANGUAGE plpgsql AS $f$ DECLARE i bigint; BEGIN INSERT INTO cron.job(jobname,schedule,command) VALUES(jobname,schedule,command) RETURNING jobid INTO i; RETURN i; END $f$;
CREATE OR REPLACE FUNCTION cron.unschedule(jobname text) RETURNS boolean
  LANGUAGE plpgsql AS $f$ BEGIN DELETE FROM cron.job j WHERE j.jobname = $1; RETURN true; END $f$;
`;

// injectable-clock clone of reset_noon_sweep (body identical except istnow is a param)
const CLONE = `
CREATE OR REPLACE FUNCTION public.reset_noon_sweep_at(istnow timestamp) RETURNS INTEGER
LANGUAGE plpgsql AS $f$
DECLARE s DATE; dd DATE; cutoff DATE; n INTEGER := 0;
BEGIN
  SELECT start_date INTO s FROM public.reset_state WHERE id='me';
  IF s IS NULL THEN RETURN 0; END IF;
  IF istnow::time >= TIME '12:00' THEN cutoff := istnow::date - 1; ELSE cutoff := istnow::date - 2; END IF;
  dd := s;
  WHILE dd <= cutoff LOOP
    IF NOT EXISTS (SELECT 1 FROM public.reset_days rd WHERE rd.d=dd AND rd.clean)
       AND NOT EXISTS (SELECT 1 FROM public.reset_relapses rr WHERE rr.occurred_on=dd) THEN
      INSERT INTO public.reset_relapses(occurred_on,triggers,story,auto) VALUES(dd,ARRAY['missed-checkin'],'auto',TRUE) ON CONFLICT (occurred_on) DO NOTHING;
      INSERT INTO public.reset_punishments(relapse_on,assigned_on,deadline) VALUES(dd,dd,dd+7) ON CONFLICT (relapse_on) DO NOTHING;
      n := n+1;
    END IF;
    dd := dd+1;
  END LOOP;
  RETURN n;
END $f$;
`;

// Returns a fresh in-memory DB with the module + clone applied. Throws on load failure.
async function loadDb() {
  const db = new PGlite();
  await db.exec(PRE);
  await db.exec(MODULE_SQL);   // the real file under test
  await db.exec(CLONE);
  return db;
}

module.exports = { PRE, CLONE, MODULE_SQL, REPO, loadDb };
