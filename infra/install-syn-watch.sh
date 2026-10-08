#!/bin/bash
# Установка syn-watch на VPS: bash install-syn-watch.sh <ip> [<ip>...]  (адреса, за которыми следим)
set -e
D=$(dirname "$0")
command -v tcpdump >/dev/null || apt-get install -y tcpdump
install -m 755 "$D/syn-watch.py" /usr/local/bin/syn-watch.py
for ip in "$@"; do grep -qx "$ip" /etc/syn-watch.ips 2>/dev/null || echo "$ip" >> /etc/syn-watch.ips; done
touch /etc/syn-watch.ips
cat > /etc/systemd/system/syn-watch.service <<'UNIT'
[Unit]
Description=Per-minute SYN/SYN-ACK counters (network diagnostics)
After=network.target
[Service]
ExecStart=/usr/bin/python3 /usr/local/bin/syn-watch.py
Restart=always
RestartSec=5
Nice=10
[Install]
WantedBy=multi-user.target
UNIT
cat > /etc/logrotate.d/syn-watch <<'LR'
/var/log/syn-watch.csv { monthly rotate 6 compress missingok notifempty copytruncate }
LR
systemctl daemon-reload
systemctl enable --now syn-watch
sleep 2; systemctl is-active syn-watch
