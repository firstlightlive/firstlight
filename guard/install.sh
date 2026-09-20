#!/bin/sh
# GUARD install script — run ON the Raspberry Pi (as the default user, with sudo access).
# Usage: sh install.sh
set -e

echo "== GUARD INSTALL =="

# 1. Dependencies: nmap (network sweep) + curl (heartbeat)
sudo apt-get update -y
sudo apt-get install -y nmap curl

# 2. Copy files into ~/guard
mkdir -p "$HOME/guard"
cp guard.py config.json "$HOME/guard/"

# 3. systemd service so the guard runs forever and restarts on reboot
SERVICE="$HOME/guard/guard.service"
cat > "$SERVICE" <<EOF
[Unit]
Description=Guard — home network watcher
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/bin/python3 $HOME/guard/guard.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
sudo cp "$SERVICE" /etc/systemd/system/guard.service
sudo systemctl daemon-reload
sudo systemctl enable guard
sudo systemctl restart guard

# 4. Heartbeat to the witness every 5 minutes (tamper-evidence).
#    Grab the topic from config.json.
TOPIC=$(python3 -c "import json,os;print(json.load(open(os.path.expanduser('~/guard/config.json')))['ntfy_topic'])")
HB_LINE="*/5 * * * * curl -s -H 'Title: guard-heartbeat' -d 'beat' https://ntfy.sh/$TOPIC >/dev/null 2>&1"
( crontab -l 2>/dev/null | grep -v "guard-heartbeat"; echo "$HB_LINE" ) | crontab -

echo "== DONE =="
echo "Guard installed. Check status with: sudo systemctl status guard"
echo "Send a test alert with:     python3 $HOME/guard/guard.py --test"
