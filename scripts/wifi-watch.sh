#!/bin/sh
# Wind-down watcher — samples the home network every 60s until 06:00 IST.
# Logs which clients are still on WiFi. Stops itself at T-ZERO.
LOG="/Users/Anupamlive/firstlight/wind-down.log"
END_EPOCH=$(TZ=Asia/Kolkata date -j -f "%Y-%m-%d %H:%M:%S" "2026-09-22 06:00:00" "+%s" 2>/dev/null)

while true; do
  NOW_EPOCH=$(date "+%s")
  if [ -n "$END_EPOCH" ] && [ "$NOW_EPOCH" -ge "$END_EPOCH" ]; then
    echo "[$(TZ=Asia/Kolkata date '+%H:%M:%S')] WATCHER END — T-ZERO 06:00 REACHED. THE RULE IS LIVE." >> "$LOG"
    break
  fi
  TS=$(TZ=Asia/Kolkata date '+%H:%M:%S')
  LINES=$(arp -an 2>/dev/null | grep -E "192\.168\.0\." | grep -v "(incomplete)" | grep -v "192.168.0.1 " | awk '{print $2, $4}' | tr '\n' ';')
  echo "[$TS] $LINES" >> "$LOG"
  sleep 60
done
