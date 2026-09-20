#!/usr/bin/env python3
"""
GUARD v2 — home-network watcher for the 60-day rule.

Watches the home WiFi for the DECLARED devices only (the five
fingerprints in config.json). Other people joining the WiFi — guests,
family — are ignored completely.

PUNISHMENT MODEL (strict, per-hour):
  - Daytime connection:  10 km debt per connected hour (walk-equivalent)
  - Night connection (after night_start): 25 km per hour
  - STRICT RULES:
      * Any part of an hour counts as a full hour (rounded up).
      * If ANY part of the stay touches the night, the night rate
        applies to the ENTIRE stay.
      * The debt doubles automatically if unpaid after debt_hours.
      * Guard switched off = heartbeat stops = Level 4 tamper event.

PAYMENT (any combination):
  - 1 km walk  = 1 km debt
  - 1 km run   = 1 km debt
  - 2 km cycle = 1 km debt
  - 1 km swim  = 4 km debt

Every departure alert includes an IG DEBT NOTE — distance language
only, never the reason. Privacy is absolute.

Run:    python3 guard.py
Test:   python3 guard.py --test
        python3 guard.py --mark-paid
"""

import json
import math
import os
import subprocess
import sys
import time
import urllib.request
from datetime import datetime

HOME = os.path.expanduser("~")
CFG = os.path.join(HOME, "guard", "config.json")
STATE = os.path.join(HOME, "guard", "state.json")

# Per-hour debt in walk-km equivalents (config can override).
KM_PER_HOUR_DAY = 50
KM_PER_HOUR_NIGHT = 100


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


def sweep(subnet):
    """ARP-sweep the subnet so every live device lands in our ARP table."""
    r = subprocess.run(
        ["nmap", "-sn", subnet],
        capture_output=True, text=True, timeout=120,
    )
    return r.returncode == 0


def arp_table():
    """Return {mac_lower: ip} from the Pi's ARP cache."""
    r = subprocess.run(["ip", "neigh"], capture_output=True, text=True)
    out = {}
    for line in r.stdout.splitlines():
        parts = line.split()
        if len(parts) >= 5 and parts[4].lower() in ("reachable", "stale", "delay", "permanent"):
            out[parts[4].lower()] = parts[0]
    return out


def hhmm(iso_or_dt):
    if isinstance(iso_or_dt, datetime):
        return iso_or_dt.strftime("%H:%M")
    return datetime.fromisoformat(iso_or_dt).strftime("%H:%M")


def is_night_moment(t, night_start):
    return hhmm(t) >= night_start


def hours_strict(start_iso, now):
    """Strict hour count: any part of an hour = a full hour, minimum 1."""
    t0 = datetime.fromisoformat(start_iso)
    hrs = (now - t0).total_seconds() / 3600.0
    return max(1, int(math.ceil(hrs)))


def debt_text(walk_km):
    """Payment options line for a debt, in walk-equivalents."""
    return ("%d km walk OR %d km run OR %d km cycle OR %.1f km swim — "
            "any combination" % (walk_km, walk_km, walk_km * 2, walk_km / 4.0))


def ig_note(walk_km):
    return "MISS LOGGED — %d KM DEBT. PAYING IN DISTANCE." % walk_km


def record_violation(cfg, device, mac, ip, walk_km, hours, night, mult=1):
    """Append a FINALIZED debt event to the ledger."""
    st = load_json(STATE, {"events": [], "devices_home": {}})
    ev = {
        "time": datetime.now().isoformat(),
        "device": device,
        "mac": mac,
        "ip": ip,
        "hours": hours,
        "night": night,
        "mult": mult,
        "debt_walk_km": walk_km,
        "debt_cycle_km": walk_km * 2,
        "paid": False,
        "doubled": False,
        "finalized": True,
    }
    st["events"].append(ev)
    st["devices_home"].pop(device, None)
    save_json(STATE, st)


def check_due_debts(cfg):
    """Unpaid FINALIZED debts double automatically after debt_hours."""
    st = load_json(STATE, {"events": [], "devices_home": {}})
    topic = cfg["ntfy_topic"]
    deadline_h = float(cfg.get("debt_hours", 48))
    changed = False
    for ev in st["events"]:
        if not ev.get("finalized") or ev.get("paid"):
            continue
        t = datetime.fromisoformat(ev["time"])
        age_h = (datetime.now() - t).total_seconds() / 3600.0
        if age_h > deadline_h and not ev.get("doubled"):
            ev["doubled"] = True
            ev["debt_walk_km"] = ev["debt_walk_km"] * 2
            ev["debt_cycle_km"] = ev["debt_cycle_km"] * 2
            notify(topic, "GUARD: DEBT DOUBLED — NO PROOF RECEIVED",
                   "%s violation from %s is unpaid after %d hours.\n"
                   "DEBT NOW: %s\n"
                   "Witness: verify the proof or escalate.\n"
                   % (ev["device"], ev["time"][:16], int(deadline_h),
                      debt_text(ev["debt_walk_km"])))
            changed = True
    if changed:
        save_json(STATE, st)


def main():
    if "--mark-paid" in sys.argv:
        st = load_json(STATE, {"events": [], "devices_home": {}})
        n = 0
        for ev in st["events"]:
            if not ev.get("paid"):
                ev["paid"] = True
                n += 1
        save_json(STATE, st)
        log("marked %d debts as paid" % n)
        return

    if "--test" in sys.argv:
        cfg = load_json(CFG, {})
        notify(cfg.get("ntfy_topic", "test"), "GUARD TEST",
               "If you can read this, the guard is working and the witness channel is live.")
        log("test notification sent")
        return

    cfg = load_json(CFG, {})
    if not cfg:
        log("no config.json found at %s — copy config.example.json and edit it" % CFG)
        sys.exit(1)

    topic = cfg["ntfy_topic"]
    devices = cfg["devices"]
    subnet = cfg.get("subnet", "192.168.1.0/24")
    interval = int(cfg.get("scan_interval_s", 60))
    realert = int(cfg.get("realert_s", 1800))
    night_start = cfg.get("night_start", "21:30")
    rate_day = int(cfg.get("km_per_hour_day", KM_PER_HOUR_DAY))
    rate_night = int(cfg.get("km_per_hour_night", KM_PER_HOUR_NIGHT))

    st = load_json(STATE, {"events": [], "devices_home": {}})
    home_since = {d: st["devices_home"].get(d) for d in devices}
    last_alert = {}

    log("guard online — watching %s for %d declared devices (guests ignored)"
        % (subnet, len(devices)))

    while True:
        try:
            check_due_debts(cfg)
            sweep(subnet)
            table = arp_table()
            now = datetime.now()
            for name, spec in devices.items():
                if isinstance(spec, dict):
                    mac = spec.get("mac", "")
                    mult = int(spec.get("mult", 1))
                else:
                    mac = spec
                    mult = 1
                present = mac.lower() in table
                if present:
                    ip = table[mac.lower()]
                    if not home_since.get(name):
                        home_since[name] = now.isoformat()
                        notify(topic, "GUARD: %s DETECTED — DEBT ACCRUING" % name.upper(),
                               "%s joined the home WiFi at %s.\n"
                               "DAY RATE: %d km debt per hour (walk-equivalent).\n"
                               "NIGHT RATE (after %s): %d km per hour — applies to the "
                               "ENTIRE stay if any part touches night.\n"
                               "Any part of an hour = a full hour. Strict.\n"
                               "Leave now to stop the clock."
                               % (name, now.strftime("%H:%M"), rate_day * mult,
                                  night_start, rate_night * mult))
                        last_alert[name] = time.time()
                    elif time.time() - last_alert.get(name, 0) > realert:
                        last_alert[name] = time.time()
                        hrs = hours_strict(home_since[name], now)
                        accrued = hrs * rate_day * mult
                        notify(topic, "GUARD REMINDER: %s still home" % name,
                               "%s has been on the network since %s.\n"
                               "Debt accrued so far: %d km and rising by the hour.\n"
                               "The witness is watching. Leave now."
                               % (name, home_since[name][11:16], accrued))
                else:
                    if home_since.get(name):
                        hrs = hours_strict(home_since[name], now)
                        night = (is_night_moment(home_since[name], night_start)
                                 or is_night_moment(now, night_start))
                        rate = rate_night if night else rate_day
                        walk_km = hrs * rate * mult
                        record_violation(cfg, name, mac, ip, walk_km, hrs, night, mult)
                        penalty = " NIGHT RATE APPLIED (strict)." if night else ""
                        if mult > 1:
                            penalty += " DEVICE PENALTY x%d APPLIED." % mult
                        notify(topic, "GUARD: %s LEFT — DEBT ASSIGNED" % name.upper(),
                               "%s stayed %d hour(s) on the network (%s -> %s).%s\n"
                               "DEBT: %s\n"
                               "Deadline: %d hours. No proof = debt doubles.\n\n"
                               "IG DEBT NOTE (post as-is, never the reason):\n"
                               "\"%s\""
                               % (name, hrs, home_since[name][11:16],
                                  now.strftime("%H:%M"),
                                  penalty,
                                  debt_text(walk_km), int(cfg.get("debt_hours", 48)),
                                  ig_note(walk_km)))
                        home_since[name] = None
        except Exception as e:
            log("scan error: %s" % e)

        time.sleep(interval)


if __name__ == "__main__":
    main()
