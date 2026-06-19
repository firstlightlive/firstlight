"""The qualifying rule — the pure, testable core of the engine.

A day is a WIN if there is at least one activity that day where:
  - moving time  > MIN_DURATION_SECONDS (default 30 min), AND
  - if the activity is a Walk/Hike, distance >= WALK_MIN_DISTANCE_METERS (default 5 km)

Other activity types only need to clear the duration threshold.
"""
from __future__ import annotations

from dataclasses import dataclass

import config


@dataclass
class ActivityCheck:
    name: str
    type: str
    moving_seconds: int
    distance_meters: float
    qualifies: bool
    reason: str


@dataclass
class Verdict:
    is_win: bool
    qualifying: list[ActivityCheck]
    checked: list[ActivityCheck]

    @property
    def label(self) -> str:
        return "WIN" if self.is_win else "MISS"


def _check_one(act: dict) -> ActivityCheck:
    name = act.get("name", "(unnamed)")
    atype = act.get("type") or act.get("sport_type") or "Unknown"
    moving = int(act.get("moving_time", 0) or 0)
    distance = float(act.get("distance", 0) or 0)

    if moving <= config.MIN_DURATION_SECONDS:
        return ActivityCheck(
            name, atype, moving, distance, False,
            f"duration {moving // 60}m ≤ {config.MIN_DURATION_SECONDS // 60}m minimum",
        )

    if atype in config.WALK_TYPES and distance < config.WALK_MIN_DISTANCE_METERS:
        return ActivityCheck(
            name, atype, moving, distance, False,
            f"walk {distance / 1000:.2f} km < {config.WALK_MIN_DISTANCE_METERS / 1000:.0f} km minimum",
        )

    return ActivityCheck(
        name, atype, moving, distance, True,
        f"{atype} {moving // 60}m / {distance / 1000:.2f} km — qualifies",
    )


def evaluate(activities: list[dict]) -> Verdict:
    checked = [_check_one(a) for a in activities]
    qualifying = [c for c in checked if c.qualifies]
    return Verdict(is_win=bool(qualifying), qualifying=qualifying, checked=checked)
