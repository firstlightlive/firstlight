"""Phase 1 orchestrator: pull Strava -> apply rule -> print the verdict.

This does NOT post anything and does NOT move money. By default it also does not
write state (read-only preview). Pass --apply to record the verdict to the streak.

Usage:
    python3 check.py                 # today (IST), preview only
    python3 check.py --date 2026-06-20
    python3 check.py --apply         # record verdict into state.json
    python3 check.py --json          # machine-readable output
    python3 check.py --sample        # run against bundled sample data (no Strava call)
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

import config
import rule
import state as state_mod
import strava

SAMPLE = [
    {"name": "Morning Ride to Kolar", "type": "Ride", "moving_time": 7200, "distance": 45000},
    {"name": "Evening stroll", "type": "Walk", "moving_time": 2400, "distance": 3200},
]


def _now(date_str: str | None) -> datetime:
    tz = ZoneInfo(config.TIMEZONE)
    if date_str:
        return datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=tz)
    return datetime.now(tz)


def _fmt(c: rule.ActivityCheck) -> str:
    mark = "✅" if c.qualifies else "  "
    return f"  {mark} {c.name[:34]:34}  {c.reason}"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--date")
    ap.add_argument("--apply", action="store_true", help="record verdict to state.json")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--sample", action="store_true", help="use bundled sample data")
    args = ap.parse_args()

    day = _now(args.date)
    date_str = day.strftime("%Y-%m-%d")

    if args.sample:
        activities = SAMPLE
    else:
        try:
            activities = strava.get_activities_for_day(day)
        except Exception as e:  # fail-safe: never declare a miss on infra failure
            err = {"date": date_str, "error": str(e), "verdict": "DEFERRED"}
            print(json.dumps(err, indent=2) if args.json else
                  f"⚠️  Strava unreachable ({e}). Verdict DEFERRED — no miss declared.")
            return 2

    verdict = rule.evaluate(activities)
    st = state_mod.load()

    if args.apply:
        st = state_mod.record(st, date_str, verdict.is_win)
        state_mod.save(st)

    if args.json:
        print(json.dumps({
            "date": date_str,
            "verdict": verdict.label,
            "streak": st.streak,
            "is_launch_next": st.is_launch,
            "activities": [vars(c) for c in verdict.checked],
        }, indent=2, default=str))
        return 0

    print(f"\n📅 {date_str}  ({config.TIMEZONE})")
    print(f"   Activities found: {len(verdict.checked)}")
    for c in verdict.checked:
        print(_fmt(c))
    print(f"\n   VERDICT: {'🏆 WIN' if verdict.is_win else '❌ MISS'}")
    if verdict.is_win:
        nxt = st.streak + 1 if not args.apply else st.streak
        kind = "LAUNCH (Day 1 — the oath begins!)" if (nxt == 1) else f"Day {nxt}"
        print(f"   Streak post: {kind}")
    else:
        print("   Streak resets to 0 → ₹1,000 forfeit would be logged.")
    print(f"   Current stored streak: {st.streak} (best: {st.best_streak})"
          + ("  [recorded]" if args.apply else "  [preview — use --apply to record]"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
