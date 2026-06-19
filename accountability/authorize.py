"""One-time Strava authorization.

Run this once. It prints the authorize URL, spins up a tiny local web server to
catch the redirect, exchanges the code for tokens, and saves the refresh token
into .env. After this, the engine refreshes access tokens on its own forever.

Usage:
    python3 authorize.py
"""
from __future__ import annotations

import urllib.parse
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import config
import strava

_captured = {}


class _Handler(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path != urllib.parse.urlparse(config.STRAVA_REDIRECT_URI).path:
            self.send_response(404)
            self.end_headers()
            return
        params = urllib.parse.parse_qs(parsed.query)
        _captured["code"] = params.get("code", [None])[0]
        _captured["error"] = params.get("error", [None])[0]
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.end_headers()
        msg = "Authorization failed: " + _captured["error"] if _captured.get("error") \
            else "Strava authorized! You can close this tab and return to the terminal."
        self.wfile.write(f"<html><body><h2>{msg}</h2></body></html>".encode())

    def log_message(self, *args):  # silence the default logging
        pass


def _persist_refresh_token(token: str) -> None:
    env_path: Path = config.ENV_PATH
    lines = env_path.read_text().splitlines() if env_path.exists() else []
    out, found = [], False
    for line in lines:
        if line.strip().startswith("STRAVA_REFRESH_TOKEN="):
            out.append(f"STRAVA_REFRESH_TOKEN={token}")
            found = True
        else:
            out.append(line)
    if not found:
        out.append(f"STRAVA_REFRESH_TOKEN={token}")
    env_path.write_text("\n".join(out) + "\n")


def main() -> None:
    config.require("STRAVA_CLIENT_ID", "STRAVA_CLIENT_SECRET")
    redirect = urllib.parse.urlparse(config.STRAVA_REDIRECT_URI)
    host, port = redirect.hostname, redirect.port or 80

    url = strava.build_authorize_url()
    print("\nOpen this URL in your browser and click 'Authorize':\n")
    print("  " + url + "\n")
    try:
        webbrowser.open(url)
    except Exception:
        pass

    print(f"Waiting for the redirect on {host}:{port} ...")
    server = HTTPServer((host, port), _Handler)
    while "code" not in _captured and "error" not in _captured:
        server.handle_request()

    if _captured.get("error"):
        raise SystemExit("Authorization failed: " + _captured["error"])

    tokens = strava.exchange_code(_captured["code"])
    refresh = tokens["refresh_token"]
    _persist_refresh_token(refresh)
    print("\n✅ Success. Refresh token saved to .env")
    print(f"   scopes granted: {tokens.get('scope', '(unknown)')}")
    print("   You can now run:  python3 check.py")


if __name__ == "__main__":
    main()
