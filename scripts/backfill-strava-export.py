#!/usr/bin/env python3
"""
Backfill Strava BULK EXPORT (activities.csv) → Supabase strava_activities.

WHY
  The Strava Developer API app (Client 226450) is policy-banned, so ongoing API
  sync is dead. But the account's FULL history is still retrievable API-free via
  Strava's native archive:  Settings → My Account → "Download or Delete Your
  Account" → Request Your Archive  (a GDPR export — no OAuth, no /api/v3 calls,
  so it CANNOT re-trigger the ban). This parses activities.csv from that archive
  and inserts the missing history into strava_activities. No API. No ban risk.

SAFETY (read this before --commit)
  • DRY RUN by default. It prints the column mapping it auto-detected, 8 sample
    rows, and insert/skip counts — and writes NOTHING. Eyeball a couple of
    samples against the Strava website (does "5.04 km" match?) BEFORE committing.
  • --commit actually upserts.
  • Purely additive: SKIPS any activity whose id is already in the DB (never
    clobbers the API-synced rows / their polylines + calories) and SKIPS any row
    whose (date,type,distance) already exists under a different id/source (e.g.
    an Apple Health copy) — so a workout is never double-counted.
  • Unit trap (the mi↔km / commit e1c2caa bug class): the CSV carries two
    "Distance" columns — a display one (km OR mi per profile) and an SI one
    (meters). This auto-detects meters by magnitude and PRINTS its choice.
    Override with --distance-col N (0-based) / --distance-unit m|km|mi if a
    sample looks wrong.

USAGE
  1. unzip export_*.zip -d strava_export/
  2. python3 scripts/backfill-strava-export.py strava_export/activities.csv         # dry run
  3. # verify the samples, then:
     python3 scripts/backfill-strava-export.py strava_export/activities.csv --commit

Reads SUPA_URL + SUPA_KEY (service_role) from scripts/.env. Stdlib only.
Set the Strava account language to ENGLISH before exporting — non-English
exports rename the headers and break this parser.
"""
import argparse, csv, json, os, re, sys, statistics, urllib.request, urllib.error
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))


def load_env():
    env = {}
    path = os.path.join(HERE, ".env")
    if not os.path.exists(path):
        sys.exit(f"ERROR: {path} not found (need SUPA_URL + SUPA_KEY).")
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    for k in ("SUPA_URL", "SUPA_KEY"):
        if not env.get(k):
            sys.exit(f"ERROR: {k} missing from scripts/.env")
    return env["SUPA_URL"].rstrip("/"), env["SUPA_KEY"]


UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) FirstLight-Backfill/1.0"


def rest(method, url, key, body=None, extra_headers=None):
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "User-Agent": UA,
    }
    if extra_headers:
        headers.update(extra_headers)
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read().decode()
            return r.status, (json.loads(raw) if raw.strip() else None)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:500]


# ── date parsing ────────────────────────────────────────────────────────────
_DATE_FORMATS = [
    "%b %d, %Y, %I:%M:%S %p",   # "Jul 21, 2026, 6:30:00 AM"
    "%b %d, %Y, %H:%M:%S",
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%dT%H:%M:%SZ",
    "%Y-%m-%dT%H:%M:%S",
]


def parse_date(s):
    s = (s or "").strip()
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    return None


def to_float(s):
    try:
        return float(str(s).replace(",", "").strip())
    except (ValueError, AttributeError):
        return None


def to_int(s):
    f = to_float(s)
    return int(round(f)) if f is not None else None


# ── column detection ────────────────────────────────────────────────────────
def indices_for(header, name):
    return [i for i, h in enumerate(header) if h.strip().lower() == name.lower()]


def first_index(header, *names):
    for n in names:
        idx = indices_for(header, n)
        if idx:
            return idx[0]
    return None


def detect_distance_column(header, rows, override_col, override_unit):
    """Return (col_index, unit_multiplier_to_meters, unit_label)."""
    if override_col is not None:
        mult = {"m": 1.0, "km": 1000.0, "mi": 1609.34}[override_unit or "m"]
        return override_col, mult, (override_unit or "m")
    cands = indices_for(header, "Distance")
    if not cands:
        sys.exit("ERROR: no 'Distance' column found — is the export in English?")
    # Pick the column with the largest median magnitude → that's meters.
    best, best_med = None, -1
    for c in cands:
        vals = [to_float(r[c]) for r in rows[:200] if c < len(r)]
        vals = [v for v in vals if v is not None and v > 0]
        med = statistics.median(vals) if vals else 0
        if med > best_med:
            best, best_med = c, med
    # Heuristic: a real training log's median distance is ~thousands of meters.
    if best_med >= 1000:
        return best, 1.0, "m"        # already meters
    # Otherwise it's a display column in km (or mi). Default km; --distance-unit mi to override.
    mult = 1609.34 if override_unit == "mi" else 1000.0
    return best, mult, (override_unit or "km")


def main():
    ap = argparse.ArgumentParser(description="Backfill Strava bulk export into strava_activities.")
    ap.add_argument("csv_path", help="path to activities.csv from the Strava archive")
    ap.add_argument("--commit", action="store_true", help="actually write (default: dry run)")
    ap.add_argument("--limit", type=int, default=0, help="process only the first N rows (testing)")
    ap.add_argument("--distance-col", type=int, default=None, help="force distance column index (0-based)")
    ap.add_argument("--distance-unit", choices=["m", "km", "mi"], default=None, help="unit of the distance column")
    ap.add_argument("--device-name", default="Strava Bulk Export", help="device_name tag for inserted rows")
    args = ap.parse_args()

    if not os.path.exists(args.csv_path):
        sys.exit(f"ERROR: {args.csv_path} not found.")
    supa_url, supa_key = load_env()

    with open(args.csv_path, newline="", encoding="utf-8-sig") as f:
        reader = csv.reader(f)
        header = next(reader)
        rows = list(reader)
    if args.limit:
        rows = rows[: args.limit]
    print(f"Loaded {len(rows)} rows from {args.csv_path}")

    # Resolve columns
    ci_id    = first_index(header, "Activity ID")
    ci_date  = first_index(header, "Activity Date")
    ci_name  = first_index(header, "Activity Name")
    ci_type  = first_index(header, "Activity Type")
    ci_mov   = first_index(header, "Moving Time")
    ci_elap  = indices_for(header, "Elapsed Time")
    ci_elap  = ci_elap[-1] if ci_elap else None      # last = seconds block
    ci_elev  = first_index(header, "Elevation Gain")
    ci_ahr   = first_index(header, "Average Heart Rate")
    ci_mhr   = first_index(header, "Max Heart Rate")
    ci_cal   = first_index(header, "Calories")
    if None in (ci_id, ci_date, ci_type):
        sys.exit("ERROR: missing one of required columns Activity ID / Activity Date / Activity Type.")
    ci_dist, dist_mult, dist_unit = detect_distance_column(header, rows, args.distance_col, args.distance_unit)

    print("── column mapping ──")
    print(f"  id={ci_id}  date={ci_date}  name={ci_name}  type={ci_type}")
    print(f"  distance=col{ci_dist} (unit={dist_unit} → ×{dist_mult} = meters)  moving_time={ci_mov}  elapsed={ci_elap}")
    print(f"  elevation={ci_elev}  avg_hr={ci_ahr}  max_hr={ci_mhr}  calories={ci_cal}")

    # Existing rows → dedup sets
    print("Fetching existing strava_activities for dedup ...")
    st, existing = rest("GET",
        f"{supa_url}/rest/v1/strava_activities?select=id,start_date_local,type,distance",
        supa_key)
    if st != 200 or not isinstance(existing, list):
        sys.exit(f"ERROR fetching existing rows: HTTP {st} {existing}")
    existing_ids = {int(r["id"]) for r in existing if r.get("id") is not None}

    def sig(date_str, typ, dist_m):
        return (date_str, (typ or "").lower(), round((dist_m or 0) / 50.0))

    existing_sig = set()
    for r in existing:
        d = (r.get("start_date_local") or "")[:10]
        existing_sig.add(sig(d, r.get("type"), to_float(r.get("distance"))))

    inserts, skip_have, skip_dup, skip_bad = [], 0, 0, 0
    for r in rows:
        def cell(i):
            return r[i] if (i is not None and i < len(r)) else None
        aid = to_int(cell(ci_id))
        dt = parse_date(cell(ci_date))
        if aid is None or dt is None:
            skip_bad += 1
            continue
        dist_m = None
        dv = to_float(cell(ci_dist))
        if dv is not None:
            dist_m = round(dv * dist_mult, 1)
        typ = (cell(ci_type) or "Workout").strip()
        iso = dt.strftime("%Y-%m-%dT%H:%M:%S")
        s = sig(iso[:10], typ, dist_m)

        if aid in existing_ids:
            skip_have += 1
            continue
        if s in existing_sig:
            skip_dup += 1
            continue

        row = {
            "id": aid,
            "name": (cell(ci_name) or f"{typ}").strip(),
            "type": typ,
            "sport_type": typ,
            "distance": dist_m,
            "moving_time": to_int(cell(ci_mov)),
            "elapsed_time": to_int(cell(ci_elap)),
            "total_elevation_gain": to_float(cell(ci_elev)),
            "start_date": iso,            # export date is UTC
            "start_date_local": iso,      # export gives no local offset — approx (old data)
            "average_heartrate": to_float(cell(ci_ahr)),
            "max_heartrate": to_int(cell(ci_mhr)),
            "calories": to_float(cell(ci_cal)),
            "device_name": args.device_name,
        }
        row = {k: v for k, v in row.items() if v is not None}
        inserts.append(row)
        existing_sig.add(s)   # guard against intra-file dups too

    print("── plan ──")
    print(f"  NEW inserts     : {len(inserts)}")
    print(f"  skip (already in DB by id) : {skip_have}")
    print(f"  skip (dup by date/type/dist): {skip_dup}")
    print(f"  skip (unparseable id/date) : {skip_bad}")
    print("── sample (first 8 new) ──")
    for row in inserts[:8]:
        km = (row.get("distance") or 0) / 1000.0
        mins = (row.get("moving_time") or 0) / 60.0
        print(f"  {row['start_date'][:10]}  {row['type']:<8} {km:6.2f} km  {mins:5.1f} min  id={row['id']}  {row.get('name','')[:34]}")

    if not args.commit:
        print("\nDRY RUN — nothing written. Verify the samples vs the Strava website, then re-run with --commit.")
        return
    if not inserts:
        print("\nNothing new to insert.")
        return

    print(f"\nCommitting {len(inserts)} rows in batches of 200 ...")
    ok = 0
    for i in range(0, len(inserts), 200):
        batch = inserts[i:i + 200]
        st, resp = rest("POST",
            f"{supa_url}/rest/v1/strava_activities?on_conflict=id",
            supa_key, body=batch,
            extra_headers={"Prefer": "resolution=merge-duplicates,return=minimal"})
        if st in (200, 201, 204):
            ok += len(batch)
            print(f"  batch {i//200 + 1}: HTTP {st} ✓ ({ok}/{len(inserts)})")
        else:
            print(f"  batch {i//200 + 1}: HTTP {st} ERROR → {resp}")
            print("  Stopping. Fix and re-run (idempotent — already-inserted rows will skip).")
            sys.exit(1)
    print(f"Done. Inserted/updated {ok} historical activities.")


if __name__ == "__main__":
    main()
