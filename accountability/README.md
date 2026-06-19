# FirstLight Accountability Engine — Phase 1

Strava pull → qualifying rule → WIN/MISS verdict + streak counter.
**Stdlib only** (Python 3.11+, uses `zoneinfo`). No `pip install` needed.

Nothing here posts to Instagram or moves money — that's later phases.
See `../ACCOUNTABILITY_PLAN.md` for the full roadmap.

## Files
| File | Purpose |
|---|---|
| `config.py` | Loads `.env` + defaults (rule thresholds, timezone, go-live) |
| `rule.py` | Pure qualifying rule (the testable core) |
| `strava.py` | OAuth + token refresh + fetch a day's activities |
| `state.py` | Streak counter (WIN +1, MISS → 0) + per-day history |
| `authorize.py` | One-time Strava OAuth (run once) |
| `check.py` | Phase 1 runner: prints the verdict |
| `test_rule.py` | Unit tests for the rule + streak logic |

## Quick check (no Strava needed)
```bash
python3 test_rule.py        # 12 tests
python3 check.py --sample   # verdict against bundled sample data
```

---

## Strava setup (do this once)

### 1. Create a Strava API application
1. Go to **https://www.strava.com/settings/api** (log in with your Strava account).
2. Fill the form:
   - **Application Name:** `FirstLight Accountability` (anything)
   - **Category:** `Training` (or anything)
   - **Website:** `http://localhost` (anything valid)
   - **Authorization Callback Domain:** `localhost`  ← **important, must be exactly `localhost`**
3. Click **Create**. Upload any image if it asks.
4. You now see **Client ID** and **Client Secret**. Copy both.

### 2. Add credentials
```bash
cd firstlight/accountability
cp .env.example .env
```
Open `.env` and paste:
```
STRAVA_CLIENT_ID=<your client id>
STRAVA_CLIENT_SECRET=<your client secret>
```

### 3. Authorize (one-time)
```bash
python3 authorize.py
```
- A browser opens to Strava → click **Authorize**.
- The script catches the redirect on `localhost:8721`, exchanges the code, and
  saves your **refresh token** into `.env` automatically.
- If the browser doesn't open, copy the printed URL into it manually.

> Scope requested: `read,activity:read_all` — read-only access to your activities
> (including private ones). It cannot modify anything on Strava.

### 4. Run the real check
```bash
python3 check.py                 # today (IST), preview only
python3 check.py --date 2026-06-20
python3 check.py --json          # machine-readable
python3 check.py --apply         # record the verdict into state.json
```

## The rule (tunable in `.env`)
A day is a **WIN** if any activity has **moving time > 30 min**, and **walks/hikes
additionally need ≥ 5 km**. Otherwise **MISS** (streak → 0, ₹1,000 forfeit logged in
a later phase).

## Fail-safe
If Strava is unreachable, `check.py` exits with `DEFERRED` and **never** declares a
miss — infra failures never cost you money.
