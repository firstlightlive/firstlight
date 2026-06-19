"""Configuration for the FirstLight Accountability Engine.

Loads settings from a local .env file (simple KEY=VALUE lines) with environment
variables taking precedence. No third-party dependency required.
"""
from __future__ import annotations

import os
from pathlib import Path

HERE = Path(__file__).resolve().parent
ENV_PATH = HERE / ".env"


def _load_env_file(path: Path) -> dict[str, str]:
    data: dict[str, str] = {}
    if not path.exists():
        return data
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        data[key.strip()] = value.strip().strip('"').strip("'")
    return data


_FILE_ENV = _load_env_file(ENV_PATH)


def get(key: str, default: str | None = None) -> str | None:
    """Env var wins over .env file, which wins over the provided default."""
    return os.environ.get(key, _FILE_ENV.get(key, default))


# --- Timezone --------------------------------------------------------------
TIMEZONE = get("TIMEZONE", "Asia/Kolkata")

# --- Strava credentials ----------------------------------------------------
STRAVA_CLIENT_ID = get("STRAVA_CLIENT_ID")
STRAVA_CLIENT_SECRET = get("STRAVA_CLIENT_SECRET")
STRAVA_REFRESH_TOKEN = get("STRAVA_REFRESH_TOKEN")
STRAVA_REDIRECT_URI = get("STRAVA_REDIRECT_URI", "http://localhost:8721/callback")

# --- Qualifying rule (tunable) --------------------------------------------
MIN_DURATION_SECONDS = int(get("MIN_DURATION_SECONDS", "1800"))      # 30 min
WALK_MIN_DISTANCE_METERS = int(get("WALK_MIN_DISTANCE_METERS", "5000"))  # 5 km
# Activity types Strava labels as walking; the distance floor applies to these.
WALK_TYPES = {t.strip() for t in get("WALK_TYPES", "Walk,Hike").split(",") if t.strip()}

# --- Oath / streak ---------------------------------------------------------
GO_LIVE_DATE = get("GO_LIVE_DATE", "2026-06-20")  # oath begins; counter starts at 0
STATE_PATH = Path(get("STATE_PATH", str(HERE / "state.json")))


def require(*keys: str) -> None:
    """Raise a clear error if any required setting is missing."""
    missing = [k for k in keys if not globals().get(k)]
    if missing:
        raise SystemExit(
            "Missing required config: "
            + ", ".join(missing)
            + f"\nSet them in {ENV_PATH} (see .env.example) or as environment variables."
        )
