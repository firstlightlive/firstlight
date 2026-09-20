#!/usr/bin/env python3
"""
GUARD DNS WATCH — blocked-content monitor (optional layer 2).

Requires Pi-hole running on the same Pi. Any domain blocked by
Pi-hole's gravity lists (porn/blocklists) that is requested from the
home network is a BLOCKED ACCESS event.

Pricing: DNS cannot measure watch-time (a site loads once, then
streams — no query per minute). Each BURST of blocked queries within a
15-minute window counts as one session = 5 km cycling debt.

Run modes:
    python3 dns_watch.py            # continuous loop (checks every 60 s)
    python3 dns_watch.py --once     # single pass (use with cron every minute)
    python3 dns_watch.py --test     # send one test notification
"""

import json
import os
import re
import sys
import time
import urllib.request
from datetime import datetime, timedelta

HOME = os.path.expanduser("~")
CFG = os.path.join(HOME, "guard", "config.json")
STATE = os.path.join(HOME, "guard", "state_dns.json")
PIHOLE_LOG = "/var/log/pihole/pihole.log"

SESSION_MINUTES = 15
KM_CYCLE_PER_SESSION = 5

BLOCKED_RE = re.compile(r"gravity blocked (\S+)")


def log(msg):
    print("[%s] %s" % (datetime.now().strftime("%Y-%m-%d %H:%M:%S"), msg), flush=True)


def load_json(path, default):
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return default


def save_json(path, data):
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(data, f, indent=2)
    os.replace(tmp, path)


def notify(topic, title, message):
    url = "https://ntfy.sh/" + topic
    req = urllib.request.Request(url, data=message.encode("utf-8"), method="POST")
    req.add_header("Title", title[:120])
    req.add_header("Priority", "high")
    req.add_header("Tags", "warning")
    try:
        urllib.request.urlopen(req, timeout=15)
        log("notified witness: " + title)
    except Exception as e:
        log("NOTIFY FAILED: %s" % e)


def recent_blocked(minutes=2):
    """Return list of (timestamp, domain) blocked in the last N minutes."""
    if not os.path.exists(PIHOLE_LOG):
        return []
    out = []
    cutoff = datetime.now() - timedelta(minutes=minutes)
    try:
        with open(PIHOLE_LOG, "r", errors="ignore") as f:
            for line in f:
                m = BLOCKED_RE.search(line)
                if not m:
                    continue
                # Pi-hole logs the month/day in syslog format; approximate
                # the time from the line's first tokens, fallback to now.
                try:
                    ts = datetime.strptime(line[:15], "%b %d %H:%M:%S")
                    ts = ts.replace(year=datetime.now().year)
                except Exception:
                    ts = datetime.now()
                if ts >= cutoff:
                    out.append((ts, m.group(1)))
    except Exception as e:
        log("log read error: %s" % e)
    return out


def process(cfg):
    topic = cfg["ntfy_topic"]
    st = load_json(STATE, {"sessions": [], "last_session_start": None})
    blocked = recent_blocked(minutes=3)
    if not blocked:
        return

    last_start = st.get("last_session_start")
    in_session = False
    if last_start:
        try:
            start_dt = datetime.fromisoformat(last_start)
            in_session = (datetime.now() - start_dt).total_seconds() < SESSION_MINUTES * 60
        except Exception:
            in_session = False

    domains = sorted(set(d for _, d in blocked))
    if not in_session:
        now = datetime.now()
        st["last_session_start"] = now.isoformat()
        st["sessions"].append({
            "time": now.isoformat(),
            "domains": domains,
            "debt_cycle_km": KM_CYCLE_PER_SESSION,
        })
        save_json(STATE, st)
        notify(topic, "GUARD DNS: BLOCKED ACCESS SESSION",
               "Blocked domains requested from the home network:\n%s\n"
               "DEBT: %d km cycling (15-minute session).\n"
               "Proof to the witness. Repeat sessions stack.\n\n"
               "IG DEBT NOTE (post as-is, never the reason):\n"
               "\"BLOCKED ACCESS LOGGED — %d KM CYCLE DEBT.\""
               % (", ".join(domains[:8]), KM_CYCLE_PER_SESSION, KM_CYCLE_PER_SESSION))
    else:
        log("blocked queries inside active session: %s" % domains)


def main():
    cfg = load_json(CFG, {})
    if "--test" in sys.argv:
        notify(cfg.get("ntfy_topic", "test"), "GUARD DNS TEST",
               "DNS watch channel is live.")
        log("test notification sent")
        return

    if not cfg:
        log("no config.json — copy config.example.json first")
        sys.exit(1)

    log("dns watch online — scanning %s" % PIHOLE_LOG)
    if "--once" in sys.argv:
        process(cfg)
        return

    while True:
        process(cfg)
        time.sleep(60)


if __name__ == "__main__":
    main()
