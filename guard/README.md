# GUARD v2 — the home network watcher

A small computer inside your house watches the WiFi. If any of YOUR five
declared devices (Mac, Windows laptop, iPhone, second phone, tablet)
connects to the home network, the guard opens a per-hour km debt and
tells your witness instantly. If the guard itself is switched off, its
heartbeat stops — and silence is the heaviest violation.

Other people joining your WiFi — guests, family — are ignored completely.
Only the five declared fingerprints can trigger anything.

## The punishment model (strict, per-hour)

- Daytime connection:   10 km debt per connected hour (walk-equivalent)
- Night (after 21:30):  25 km per hour

Strict rules:
- Any part of an hour counts as a full hour (rounded up, minimum 1).
- If ANY part of the stay touches the night, the night rate applies to
  the ENTIRE stay.
- Unpaid debt DOUBLES automatically after 48 hours.
- Guard switched off = heartbeat stops = tamper event (Level 4:
  75 km equivalent + no exceptions for 30 days).
- STRICT DEVICES: the phones and tablet carry mult 2 — DOUBLE rates
  (20 km/hour day, 50 km/hour night). They are never allowed at home.
  A device is caught even if it joins through the laptop's hotspot —
  its fingerprint appears on the network no matter how it connects.

Example: phone connects at 21:40 and leaves at 22:05.
That is 25 km (night rate, 1 hour, strict rounding).

## Payment — any combination

- 1 km walk   = 1 km debt
- 1 km run    = 1 km debt
- 2 km cycle  = 1 km debt
- 1 km swim   = 4 km debt

A 30 km debt could be paid as: 10 km walk + 10 km run + 20 km cycle
+ 1 km swim (= 10 + 10 + 10 + 4 = 34, more than enough). Proof is
photo/Strava sent to the witness. The witness marks the debt paid.

## The Instagram debt note (privacy is absolute)

Every debt alert ends with a ready-to-post note:

    MISS LOGGED — 30 KM DEBT. PAYING IN DISTANCE.

Rules:
- Post it on the FirstLight page from the office laptop, using the
  existing publish flow. Never from the phone, never at home.
- The note NEVER says why. No reason, no context, no hints.
- No links, no charity, no money language — distance only. This is
  the brand-safe language the page already uses for a miss.
- A miss is paid in distance, not death — and not in public shame.

## What it detects

- Any of the 5 declared device MACs on the home network
  -> detection alert + per-hour debt accrual
  -> departure alert with the final debt + IG note
- Guard turned off / unplugged -> heartbeat stops -> tamper event

## What it CANNOT detect (honest list)

- A device at home using mobile data (4G) instead of WiFi. In this flat
  4G barely reaches — so this hole is almost closed: any working device
  at home must join the WiFi, and the guard will see it.
- MAC address spoofing (deliberately changing the device fingerprint).
- A device switched fully off.

Evasion now requires active deception — and deception is what the
heaviest price is for.

## What you need to buy

1. A Raspberry Pi (Zero 2 W, 3, or 4 — any will do; roughly Rs 2,000–5,000).
   Used is fine. It needs: an SD card (8 GB+), a power cable, and an
   Ethernet cable to the router.
2. Nothing else. It has no screen, no keyboard, no browser. It is
   infrastructure — add it to the allowed list:
   "GUARD Pi — no screen, no browser, Ethernet to router."

## Setup — one evening, or Rs 500 to any local computer person

1. Flash Raspberry Pi OS Lite onto the SD card (Raspberry Pi Imager).
2. Boot the Pi with Ethernet connected. Find its IP from the router's
   admin page (or hostname raspberrypi.local).
3. Copy this guard/ folder to the Pi:
       scp -r guard/ pi@<PI-IP>:~
4. SSH in:  ssh pi@<PI-IP>
5. Edit config (below), then run:  sh guard/install.sh
6. Test:  python3 guard/guard.py --test
7. Hide the Pi next to the router — in a locked box or taped under a
   shelf. Unplugging it is a visible decision, and its silence is the
   tamper event.

## Config (config.json)

    {
      "subnet": "192.168.0.0/24",
      "devices": {
        "mac_laptop": {"mac": "AA:BB:CC:DD:EE:01", "mult": 1},
        "iphone":     {"mac": "AA:BB:CC:DD:EE:03", "mult": 2},
        "phone2":     {"mac": "AA:BB:CC:DD:EE:04", "mult": 2},
        "tablet":     {"mac": "AA:BB:CC:DD:EE:05", "mult": 2}
      },
      "exempt_devices": {
        "VNTPW0K5TGJ": "C0:A8:10:4C:ED:6B"
      },
      "ntfy_topic": "firstlight-guard-xxxx-RANDOM",
      "night_start": "21:30",
      "scan_interval_s": 60,
      "realert_s": 1800,
      "debt_hours": 48,
      "km_per_hour_day": 10,
      "km_per_hour_night": 25
    }

Generate the topic name:  openssl rand -hex 16
The topic name is the password — only you and the witness know it.

## Finding the MAC addresses (and stopping randomization)

Modern devices randomize their MAC per network. Disable randomization
for your home network on ALL five devices FIRST, then record the MACs:

- Windows: Settings > Network & Internet > Wi-Fi > your network >
  Random hardware addresses > OFF
- macOS:   System Settings > Wi-Fi > Details > Private Wi-Fi Address > OFF
- iPhone:  Settings > Wi-Fi > (i) next to home network > Private Wi-Fi Address > OFF
- Android: Settings > Wi-Fi > gear next to home network > Privacy > Use device MAC
- Tablet:  same as iPhone (iPad) or Android, whichever OS it runs

Then find the real MACs:

- Windows (fastest): Win+R > cmd > ipconfig /all > find the Wi-Fi
  adapter > "Physical Address" > replace dashes with colons
  (3C-95-09-AB-12-CD -> 3C:95:09:AB:12:CD)
- macOS: System Settings > Wi-Fi > Details > "Wi-Fi address"
  (or Terminal: ifconfig en0 | grep ether)
- iPhone: Settings > Wi-Fi > (i) next to home network > Wi-Fi Address
  (or Settings > General > About > Wi-Fi Address)
- Android: Settings > Wi-Fi > gear next to home network > MAC address
  (or Settings > About phone > Status > Device Wi-Fi MAC address)

HOW TO SPOT A RANDOMIZED MAC: a private/random MAC shows as
"Unknown" in the router list and its SECOND character is 2, 6, A or E
(e.g. 6A:, 1A:, D2:, 72:). A real hardware MAC starts with a vendor
code (second character 0, 1, 4, 5, 8, 9, C or D) and usually shows a
device name. If you see Unknown + 6A:/D2:/72: prefixes, randomization
is still ON — turn it off on that device, then forget and rejoin the
WiFi, and its real MAC appears.

SHORTCUT — the router page is easier than all five devices combined:
1. Connect each device to the home WiFi once (randomization OFF).
2. Open the router admin page — common India addresses:
   JioFiber 192.168.29.1 (admin/Jiocentrum) · Airtel 192.168.1.1
   (admin/password) · TP-Link 192.168.0.1 or 192.168.1.1 (admin/admin)
   — all printed on the router sticker with the login.
3. Find the device list: TP-Link "DHCP Clients List" · JioFiber
   "Status > User Devices" · Netgear "Attached Devices" · ASUS
   "Network Map > Clients" · D-Link "Status > Wireless".
4. Every connected device shows its name, IP, and MAC — copy all five
   at once. One device at a time is cleanest: connect it, watch for the
   new entry, that's its MAC. Windows shows as DESKTOP-XXXXXX,
   iPhone as "<name>'s iPhone", Android as its model name.

## The witness's job (give them this)

1. Install the ntfy app (free) or bookmark https://ntfy.sh/<TOPIC>.
2. You will see a "guard-heartbeat" every 5 minutes. Normal.
3. "GUARD: DEVICE DETECTED — DEBT ACCRUING" -> the clock has started.
   "GUARD: DEVICE LEFT — DEBT ASSIGNED" -> note the km and the 48h
   deadline. Demand photo/Strava proof. No proof = the guard doubles
   the debt automatically and re-alerts you.
4. Heartbeats stop for 30+ minutes -> call. Power out = fine. Power on
   but guard silent = tamper event.
5. After accepting the proof, run on the Pi:
       python3 ~/guard/guard.py --mark-paid

   Mercy rule: if a debt came from a pre-announced, forced exception
   (illness, emergency — witness told FIRST), the witness may cancel it
   after checking the exception log. Unannounced connections always pay.

## Power cuts

When the light goes off, the ROUTER dies too — the WiFi is down and no
device can connect anyway. The guard's silence during a blackout is
honest. Witness protocol: silent 30+ min -> call -> "power's out" =
fine. Power on but silent guard = tamper.

To survive short cuts: power the Pi from a power bank with
"pass-through charging", or a small UPS (~Rs 2,000) for router + Pi.

## The two doors — the rule cannot break

Every scenario routes through one of two pre-built doors:

DOOR 1 — THE VNT (exempt, content-locked): rain, urgent office work,
festivals, weekends — it comes home freely. No permission, no debt.
This door handles 90% of every "but what if".

DOOR 2 — THE WITNESS PROTOCOL: something genuinely requires a
dangerous device at home (illness, emergency). Text the witness
FIRST: "Exception: [reason], device [in-time]-[out-time], table use
only." Daylight only, at the table, never after 9:30, logged. The
guard prices the connection; the witness may cancel a pre-announced,
forced exception after checking the log. Unannounced always pays.

THE URGENCY TEST: "Will this still be urgent at 9 am?" If yes, use a
door. If no, it waits. There is no third door — a device brought home
without a door is not a scenario, it is a choice, and it pays double
the strict rules.

## Where the devices live — the car vault

The car (basement parking) may hold the devices, but it is a LAUNCHPAD,
never a PANTRY:

- A device may live in the car. You may take it out when you are going
  somewhere with it — Starbucks, the office, a drive. Outbound only.
- It may NEVER travel car -> flat. The pickup is tied to an outbound
  trip, never to the home.
- Dangerous devices (iPhone, Mac, phones, tablet) inside the car sit in
  a TIMED LOCKBOX (or timed-padlocked bag) in the trunk, timer set to
  8:55 am. At midnight the box says "not until 8:55" — the craving dies
  before the timer does.
- The VNT rides free: content-locked, no box needed.
- The guard still watches the home WiFi as the final wall; the lockbox
  is the guard for the car.

## DEAD-ZONE MODE — turn the home WiFi OFF

WIFI CLAUSE v3 (Sep 2026, FINAL): 90 DAYS FULL — WiFi OFF, no device
crosses the door, no loopholes. The Mac and WiFi return on Day 90,
together with the guard: the Pi watches the re-enabled WiFi and
auto-opens debts the second a declared device joins. Dead-zone mode
below is the permanent fallback.

The flat does not need WiFi. The dumb phone is cellular, the watch is
LTE/Bluetooth, and the only devices that ever wanted home WiFi are the
five in the vault. WiFi at home is a door only the enemy uses. Turn it
off and the flat becomes a true dead zone: no WiFi + barely-there 4G =
a smuggled phone is a brick.

Configuration:
1. Router admin -> Wireless -> disable BOTH radios (2.4GHz and 5GHz).
   If the router UI cannot disable them, hide the SSID and set a random
   password stored with the witness.
2. Ethernet stays ON — for the guard Pi only (heartbeats + alerts).
3. VNT emergency work at home: Ethernet cable at the table. Wired,
   visible, deliberate. Work happens where the cable is.
4. The guard needs NO changes: Ethernet and WiFi share the same LAN, so
   a device that joins after WiFi is re-enabled appears in the Pi's ARP
   sweep within 60 seconds.

WiFi re-enabled = tamper flag. Device on the network = caught. Guard
silent = witness calls. There is no move that does not light something
up.

## DNS watch (optional layer 2) — blocked-site penalties

Requires Pi-hole on the same Pi:  curl -sSL https://install.pi-hole.net | bash
During setup add a porn blocklist (e.g. StevenBlack hosts — porn
category) so gravity blocks those domains.

dns_watch.py tails the Pi-hole log: any blocked domain requested from
the home network is a BLOCKED ACCESS event. Each 15-minute burst of
blocked queries = one session = 5 km cycling debt. Sessions stack.

Run it every minute with cron:
    * * * * * python3 ~/guard/dns_watch.py --once >/dev/null 2>&1
Test:  python3 ~/guard/dns_watch.py --test

HONEST LIMIT: DNS sees requests, not watch-time — a site loads in one
lookup and then streams. The 15-minute pricing is an approximation of
a session, not a stopwatch. True per-minute screen measurement is
device-side software (Covenant Eyes / Ever Accountable), which a Pi
physically cannot do. Also: in dead-zone mode this layer rarely fires —
it is depth for exception days, not the main wall.

## The device doctrine — final configuration

1. VNT (Windows): WATCHED x1 — DEMOTED. It had YouTube and Netflix
   on it: soft content is fuel, the same loop in a different coat.
   It is vaulted like the Mac. Home use = witness protocol only.
   Netflix stays cancelled forever. YouTube blocked on the VNT:
   edit C:\Windows\System32\drivers\etc\hosts (as admin) and add:
     0.0.0.0 youtube.com www.youtube.com m.youtube.com
     0.0.0.0 netflix.com www.netflix.com
   or install BlockSite/LeechBlock with a witness-held password.
   Work videos: watch in public view at the office, logged out,
   close the tab when done. Never alone, never at home.
2. Mac (ultra-secure): KEEP — WATCHED x1. Office vault or car lockbox.
   Personal work at the office only. Format-to-bypass = heaviest
   violation (tamper).
3. iPhone: KEEP — WATCHED x2. Duty 9:00 am–3:30 pm, then vault.
   Trading, OTPs, market hours.
4. Second phone: SELL. No unique job.
5. Tablet: KEEP — WATCHED x2. Its job is real: 10 years of notes,
   interview questions, papers. But it stays in the vault — its
   content comes home as paper (print it) or as PDFs on the VNT,
   or it is read at the office/cafe. Back the notes up to the cloud
   TODAY — a decade on one tablet is a data disaster waiting.

VNT AT HOME — the only screen that ever enters, forced days only:
- Normal days: none. The flat holds books, paper, food, and you.
- Forced days (rain, illness, urgent, festival): the VNT comes in.
- The night law applies to the VNT too: 9:30 pm -> in the bag.
- Online work at home = Ethernet cable at the table (WiFi is off).
  Wired, visible, deliberate. Work happens where the cable is.

Three dangerous devices (Mac, iPhone, tablet), all watched, all
vaulted, all useless at home anyway (WiFi off + weak 4G). The daily
trio: dumb phone, VNT, watch.

## The soft-content leak (why no device is exempt)

The chain is: bored -> arousing content -> masturbate -> crave more.
The content does not have to be porn — YouTube "sex videos" and shows
like Dark Desire on Netflix are the same match. Any device that can
show them is fuel. Rules:
- Netflix: cancelled, stays cancelled.
- YouTube: blocked on every personal/office browser (hosts file or
  BlockSite, witness-held password). Work videos only in public view.
- No device is exempt. The VNT is watched x1. Only the dumb phone,
  alarm clock, speaker and watch live in the flat.
- Boredom is the trigger, not the device. The timetable (gym before
  home, books on the table, witness every night) starves the chain.

## The watch rule — ally, not enemy

The watch cannot serve the loop: no browser, no video, no content.
Its only two risks are cues and the tether, and both are closed:
1. STRIP NOTIFICATIONS: only calls, SMS from family/witness, alarms,
   timers, fitness. Nothing from Instagram, YouTube, or any app that
   ever fed the loop.
2. NEVER A TETHER: a GPS-only watch works at home as a watch and
   nothing else — the phone never comes near "for the watch."
3. OFF THE WRIST at 9:30 pm, charged in the kitchen.

The watch is the enforcement device: it records the km debts (Strava/
Workout proof to the witness). It pays the penance. It is an ally.

"exempt_devices" in config is informational — the guard watches ONLY
the fingerprints listed under "devices" and ignores everything else,
including exempt devices. An exempt device is allowed at home only
because its content lock is NOT removable by you (office IT / password
held by someone else). If you can disable the block yourself, the
device is not exempt — it belongs under "devices".

## What the guard needs from you

1. The five MAC addresses (fill config.json during setup — steps above).
2. The witness's ntfy topic (shared with them, kept secret from everyone else).
3. A Raspberry Pi (or a computer person to set it up).
4. Confirmation of the rates: 10 km/hour day, 25 km/hour night,
   48-hour doubling, tamper = heaviest level.

## IMPORTANT

Day 1 does NOT wait for this to be built. Start the plan with the SMS
check-in. Build the guard during week 1. The guard makes the system
stronger — it is not the system.
