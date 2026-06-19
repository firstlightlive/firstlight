"""Unit tests for the qualifying rule and streak logic. Stdlib only.

Run:  python3 test_rule.py
"""
import config
import rule
import state as state_mod


def _act(name, type_, minutes, km):
    return {"name": name, "type": type_, "moving_time": minutes * 60, "distance": km * 1000}


def run():
    cases = []

    # Ride > 30 min qualifies.
    v = rule.evaluate([_act("Ride", "Ride", 45, 20)])
    cases.append(("ride 45m qualifies", v.is_win is True))

    # Ride <= 30 min does not.
    v = rule.evaluate([_act("Short", "Ride", 20, 8)])
    cases.append(("ride 20m fails", v.is_win is False))

    # Walk > 30 min but < 5 km fails (walk distance floor).
    v = rule.evaluate([_act("Stroll", "Walk", 40, 3)])
    cases.append(("walk 40m/3km fails", v.is_win is False))

    # Walk > 30 min and >= 5 km qualifies.
    v = rule.evaluate([_act("Long walk", "Walk", 40, 5)])
    cases.append(("walk 40m/5km qualifies", v.is_win is True))

    # Walk exactly 30 min fails (must be strictly greater).
    v = rule.evaluate([_act("Edge", "Walk", 30, 6)])
    cases.append(("walk exactly 30m fails", v.is_win is False))

    # Mixed day: failing walk + qualifying ride => WIN.
    v = rule.evaluate([_act("Stroll", "Walk", 40, 3), _act("Ride", "Ride", 60, 25)])
    cases.append(("mixed day qualifies on ride", v.is_win is True))

    # Empty day => MISS.
    v = rule.evaluate([])
    cases.append(("empty day is miss", v.is_win is False))

    # Streak: WIN increments, MISS resets, idempotent per date.
    st = state_mod.State()
    st = state_mod.record(st, "2026-06-20", True)
    cases.append(("first win -> streak 1", st.streak == 1))
    st = state_mod.record(st, "2026-06-20", True)  # same date again
    cases.append(("same date idempotent", st.streak == 1))
    st = state_mod.record(st, "2026-06-21", True)
    cases.append(("second win -> streak 2", st.streak == 2))
    st = state_mod.record(st, "2026-06-22", False)
    cases.append(("miss resets to 0", st.streak == 0))
    cases.append(("best streak preserved", st.best_streak == 2))

    failed = [name for name, ok in cases if not ok]
    for name, ok in cases:
        print(f"  {'PASS' if ok else 'FAIL'}  {name}")
    if failed:
        raise SystemExit(f"\n{len(failed)} test(s) FAILED")
    print(f"\nAll {len(cases)} tests passed.")


if __name__ == "__main__":
    run()
