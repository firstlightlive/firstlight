"""Strava API client — standard library only (urllib).

Handles the OAuth code exchange, access-token refresh, and fetching a day's
activities bounded to the configured timezone.
"""
from __future__ import annotations

import json
import urllib.parse
import urllib.request
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

import config

TOKEN_URL = "https://www.strava.com/oauth/token"
ACTIVITIES_URL = "https://www.strava.com/api/v3/athlete/activities"
SCOPE = "read,activity:read_all"


def _post_form(url: str, fields: dict) -> dict:
    data = urllib.parse.urlencode(fields).encode()
    req = urllib.request.Request(url, data=data, method="POST")
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode())


def _get_json(url: str, token: str) -> list | dict:
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode())


def build_authorize_url() -> str:
    config.require("STRAVA_CLIENT_ID")
    params = {
        "client_id": config.STRAVA_CLIENT_ID,
        "redirect_uri": config.STRAVA_REDIRECT_URI,
        "response_type": "code",
        "approval_prompt": "auto",
        "scope": SCOPE,
    }
    return "https://www.strava.com/oauth/authorize?" + urllib.parse.urlencode(params)


def exchange_code(code: str) -> dict:
    """Exchange a one-time auth code for access + refresh tokens."""
    config.require("STRAVA_CLIENT_ID", "STRAVA_CLIENT_SECRET")
    return _post_form(TOKEN_URL, {
        "client_id": config.STRAVA_CLIENT_ID,
        "client_secret": config.STRAVA_CLIENT_SECRET,
        "code": code,
        "grant_type": "authorization_code",
    })


def refresh_access_token() -> str:
    """Use the stored refresh token to get a fresh short-lived access token."""
    config.require("STRAVA_CLIENT_ID", "STRAVA_CLIENT_SECRET", "STRAVA_REFRESH_TOKEN")
    tokens = _post_form(TOKEN_URL, {
        "client_id": config.STRAVA_CLIENT_ID,
        "client_secret": config.STRAVA_CLIENT_SECRET,
        "refresh_token": config.STRAVA_REFRESH_TOKEN,
        "grant_type": "refresh_token",
    })
    return tokens["access_token"]


def day_bounds(day: datetime) -> tuple[int, int]:
    """Epoch seconds for [00:00, 24:00) of `day` in the configured timezone."""
    tz = ZoneInfo(config.TIMEZONE)
    start = datetime.combine(day.date(), time.min, tzinfo=tz)
    end = start + timedelta(days=1)
    return int(start.timestamp()), int(end.timestamp())


def get_activities_for_day(day: datetime, token: str | None = None) -> list[dict]:
    token = token or refresh_access_token()
    after, before = day_bounds(day)
    url = ACTIVITIES_URL + "?" + urllib.parse.urlencode(
        {"after": after, "before": before, "per_page": 100}
    )
    result = _get_json(url, token)
    return result if isinstance(result, list) else []
