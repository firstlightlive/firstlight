# RESET / Clarity Protocol — test suite

Offline software-testing-grade coverage for the porn-recovery tracker across three layers:
**unit**, **functional**, and **regression**. No Supabase token, no network, no deploy —
every component runs against a real engine locally.

```bash
npm run test:reset          # or: bash scripts/test-reset.sh
```

Current: **161 individual checks, all green.**

## Layers

### Unit — pure functions in isolation
- **`unit.cjs`** (45) — `reset.html`'s date/streak/penance helpers (`diffDays`, `addDays`,
  `istParts`, `cleanStreak`, `bestStreak`, `kmOwed`, `isCleared`, …), **extracted verbatim
  from the HTML source** (brace-balanced) and run in a `vm` sandbox with a controllable clock
  and injectable `state`. Boundary matrices: month/year/leap rollovers, UTC↔IST conversion,
  noon boundary, relapse-today, over-completion. Extract-from-source ⇒ zero drift.
- `edge.ts` also carries unit checks (`_istDateStr` / `_istHour` boundaries, `U1–U7`).

### Functional — end-to-end in real engines
- **`page.cjs`** (53) — `reset.html` in **headless Chromium** (puppeteer): faked IST clock,
  in-memory Supabase REST mock recording every call, seeded session. Covers streak, daily
  check-in, the noon sweep, grace window, relapse logging, penance burn-down, night-start,
  urge modal, manifesto, and the exact-noon boundary (`J`/`K`).
- **`sql.cjs`** (9) — the REAL `reset_module.sql` in **Postgres via PGlite** (WASM, no Docker):
  DDL, RLS-to-authenticated, `cleared` trigger, unique constraints, `reset_noon_sweep()`
  cutoff + idempotency.
- **`edge.ts`** (30) — the VERBATIM `emailResetReminder` logic in **Deno** vs mocked
  Supabase/Resend + faked clock: at-risk detection, stage (early/final), imminent day,
  no-send-when-safe, and the 11:00 stage boundary.

### Regression — locked bugs + cross-implementation consistency
- **`regression.cjs`** (18) — the noon-sweep rule exists TWICE (client JS + server SQL). An
  **independent oracle** is the spec: `oracle == SQL` is asserted across an 11-scenario matrix
  here; `oracle == JS` is asserted by `page.cjs` (`J`/`K`) ⇒ transitively **JS == SQL**. Also
  locks: the ambiguous-`d` crash (REG-1), exact-noon boundary (REG-2), idempotency property
  (REG-3), one-relapse-per-day (REG-4).
- **anti-drift** (6, in `test-reset.sh`) — greps `index.ts` to prove the Deno edge test still
  mirrors deployed code.

## Shared helpers
- `_assert.cjs` — tiny assert/eq/report used by the Node files.
- `_sqlenv.cjs` — PGlite loader: cron stub + real `reset_module.sql` + injectable-clock clone
  of the sweep (used by `sql.cjs` and `regression.cjs`).

## Notes
- **Deps:** `puppeteer` + `@electric-sql/pglite` are devDependencies (`npm install`). The edge
  test needs [`deno`](https://deno.com); if absent the runner skips it but still runs anti-drift.
- **When to run:** after editing `reset.html`, `reset_module.sql`, or `emailResetReminder` —
  before deploying. Pure-logic only; never touches live Supabase or sends real email.

> History: `sql.cjs` caught a real bug on first run — `reset_noon_sweep()` used a loop var `d`
> that collided with `reset_days.d` (`column reference "d" is ambiguous`), which would have thrown
> on every noon cron. Fixed (`d`→`dd`); now guarded by `sql.cjs` C6 and `regression.cjs` REG-1.
