"""Persistent oath state — the streak counter and per-day history.

Streak semantics (decided): a WIN increments the streak; a MISS resets it to 0.
Counter starts at 0 at go-live. State is a small JSON file; idempotent per date.
"""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field

import config


@dataclass
class State:
    streak: int = 0
    best_streak: int = 0
    last_processed_date: str | None = None
    history: dict = field(default_factory=dict)  # {"YYYY-MM-DD": "WIN"|"MISS"}

    @property
    def is_launch(self) -> bool:
        """True when the next WIN is a 0->1 launch/restart milestone."""
        return self.streak == 0


def load() -> State:
    if config.STATE_PATH.exists():
        raw = json.loads(config.STATE_PATH.read_text())
        return State(**raw)
    return State()


def save(state: State) -> None:
    config.STATE_PATH.write_text(json.dumps(asdict(state), indent=2))


def record(state: State, date_str: str, is_win: bool) -> State:
    """Apply a day's verdict to the streak. Idempotent for an already-recorded date."""
    if state.history.get(date_str) is not None:
        return state  # already processed; do not double-count
    if is_win:
        state.streak += 1
        state.best_streak = max(state.best_streak, state.streak)
    else:
        state.streak = 0
    state.history[date_str] = "WIN" if is_win else "MISS"
    state.last_processed_date = date_str
    return state
