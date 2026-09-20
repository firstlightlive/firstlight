# CLOUD GUARD — zero-hardware detection (works today, ₹0)

The cloud cannot see your home WiFi. But your devices can REPORT to the
cloud the moment they join it. iOS Shortcuts, Android MacroDroid, macOS
launchd and Windows Task Scheduler all have triggers for exactly this:
"when this device joins WiFi network X".

## What it detects
- iPhone joins home WiFi   -> witness alerted in seconds -> per-hour debt opens (50 km cycle/h day · 100/h night)
- Android joins home WiFi  -> same
- Mac joins home WiFi      -> same (mac-snitch.sh, launchd every 60s)
- Windows laptop joins     -> same (windows-snitch.ps1, Task Scheduler every 60s)
- Heartbeat silence        -> the snitch was silenced -> Level 4 (400 km + 30 days no exceptions)

## Setup — iPhone (15 minutes)

1. Create the witness channel (one time):
   - Topic name: openssl rand -hex 16  (e.g. firstlight-cloud-ab12cd34...)
   - Give the topic to the witness. They install the ntfy app (free) or
     bookmark https://ntfy.sh/<TOPIC>.

2. Shortcuts app -> Automation -> "+" -> "Wi-Fi" -> "Network <HomeSSID> Joined"
   -> Run Immediately (turn OFF "Ask before running").
   Add action: "Get Contents of URL"
   - Method: POST
   - URL: https://ntfy.sh/<TOPIC>
   - Headers: Title: GUARD: IPHONE IN HOUSE
   - Body: DEVICE IN HOUSE — <time>. PER-HOUR DEBT OPENS: 50 KM CYCLE/H DAY · 100/H NIGHT.

3. Heartbeat automations (3x/day): Shortcuts -> Automation -> "Time of Day"
   (08:00, 14:00, 21:30) -> Run Immediately -> POST to the same topic:
   Title: guard-heartbeat · Body: alive — current network: <Wi-Fi Name>
   (Use the "Get Network Details" action to read the current SSID.)

## Setup — Android (MacroDroid or Tasker)

Same logic: Trigger = "WiFi connected to <HomeSSID>" -> Action = HTTP POST
to https://ntfy.sh/<TOPIC> with Title "GUARD: ANDROID IN HOUSE".
Heartbeat = time-based macro 3x/day posting "alive — current SSID".

## Setup — Mac (mac-snitch.sh + launchd)

1. Edit guard/cloud/mac-snitch.sh:
   - HOMESSID = your home WiFi name (exact)
   - TOPIC = the witness topic from above
2. Install the watcher:
       chmod +x guard/cloud/mac-snitch.sh
       cp guard/cloud/com.firstlight.snitch.plist ~/Library/LaunchAgents/
       launchctl load ~/Library/LaunchAgents/com.firstlight.snitch.plist
3. It now runs every 60 seconds, forever, even after reboots:
   - Mac joins home WiFi  -> "GUARD: MACBOOK IN HOUSE" instantly
   - Still home           -> reminder every 30 min
   - Any other network    -> heartbeat every 6 hours
4. Test: toggle WiFi off/on at home -> the witness should get the alert.

## Setup — Windows (windows-snitch.ps1 + Task Scheduler)

EASIEST — the double-click way:
1. Copy BOTH files onto a USB stick: install-windows.bat + windows-snitch.ps1
2. On the Windows laptop: double-click install-windows.bat
3. It asks 2 questions (home WiFi name, witness topic), installs the
   snitch into C:\firstlight, and registers the task. Done.

MANUAL way (if you prefer):
1. Copy guard/cloud/windows-snitch.ps1 to C:\firstlight\windows-snitch.ps1
2. Edit the top: HOMESSID and TOPIC (Notepad).
3. Register the scheduled task (PowerShell as admin):
       schtasks /create /tn "FirstLightSnitch" /tr "powershell -WindowStyle Hidden -ExecutionPolicy Bypass -File C:\firstlight\windows-snitch.ps1" /sc minute /mo 1 /f
4. It now runs every minute: join home WiFi -> instant alert, reminders,
   heartbeat every 6 hours on other networks.

## The witness's job
- Install ntfy, subscribe to the topic.
- "GUARD: ... IN HOUSE" alert = per-hour debt opens (50 km cycle/h day · 100/h night, rounded up, min 1h). Demand proof
  within 48h; no proof = doubles.
- Heartbeats stop for >6 hours = the snitch was silenced. Call. If the
  automation was deliberately removed/disabled: Level 4 (400 km + no
  exceptions 30 days).

## Honest limits
- Each snitch runs on the device it watches. Silencing it is possible —
  but that kills the heartbeat, and heartbeat silence is priced at Level 4.
- Devices NOT carrying a snitch (tablet) need the router page check or
  the ESP32/Pi guard.
- The Raspberry Pi (Day 90) remains the gold standard: always-on, all
  devices, DNS layer, cannot be silenced by the device it watches.
- Upgrade path: ESP32 (~Rs 400) runs the same MAC sweep as the Pi in
  miniature. Pi at Day 90 takes over fully.
