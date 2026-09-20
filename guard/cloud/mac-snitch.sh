#!/bin/sh
# FIRST LIGHT — Mac snitch: reports when this Mac joins the HOME WiFi.
# Runs every 60s via launchd (com.firstlight.snitch.plist).
# On home WiFi: instant alert + reminder every 30 min while connected.
# On any other network: heartbeat every 6 hours (silence = tamper = Level 4).

HOMESSID="REPLACE-WITH-HOME-SSID"
TOPIC="firstlight-cloud-REPLACE-WITH-RANDOM"
STATE="$HOME/.fl-snitch-state"
HB="$HOME/.fl-snitch-hb"

# Override with your real values in ~/.fl-snitch.conf:
#   HOMESSID="YourHomeWifiName"
#   TOPIC="firstlight-cloud-xxxx-your-random-topic"
CONF="$HOME/.fl-snitch.conf"
[ -f "$CONF" ] && . "$CONF"

# Stay silent until configured (no false alarms, no noise).
[ -z "$HOMESSID" ] && exit 0
[ -z "$TOPIC" ] && exit 0

SSID=$(ipconfig getsummary en0 2>/dev/null | awk -F ' SSID : ' '/ SSID : / {print $2}' | tr -d '[:space:]')
[ -z "$SSID" ] && exit 0

NOW=$(TZ=Asia/Kolkata date '+%H:%M')
post() {
  curl -s -H "Title: $1" -d "$2" "https://ntfy.sh/$TOPIC" >/dev/null 2>&1
}

if [ "$SSID" = "$HOMESSID" ]; then
  M=""; P=0
  if [ -f "$STATE" ]; then read M P < "$STATE"; fi
  [ -z "$P" ] && P=0
  EPOCH=$(date +%s)
  if [ "$M" != "home" ]; then
    echo "home $EPOCH" > "$STATE"
    post "GUARD: MACBOOK IN HOUSE" "MACBOOK joined home WiFi at $NOW. PER-HOUR DEBT OPENS: 50 km cycle/h (day) · 100/h (night), rounded up, min 1h. Declared sessions only — witness decides."
  elif [ $((EPOCH - P)) -ge 1800 ]; then
    echo "home $EPOCH" > "$STATE"
    post "GUARD REMINDER: MACBOOK still home" "MACBOOK still on home WiFi since $NOW. Debt stands unless the session was pre-declared."
  fi
else
  if [ -f "$STATE" ]; then rm -f "$STATE"; fi
  EPOCH=$(date +%s)
  OLD=0
  [ -f "$HB" ] && OLD=$(cat "$HB")
  [ -z "$OLD" ] && OLD=0
  if [ $((EPOCH - OLD)) -ge 21600 ]; then
    echo "$EPOCH" > "$HB"
    post "guard-heartbeat (mac)" "alive — current network: $SSID"
  fi
fi
