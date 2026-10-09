#!/usr/bin/env bash
set -Eeuo pipefail
[[ $EUID == 0 ]] || { echo 'Run this installer as root on the Proxmox node.'; exit 1; }
command -v qm >/dev/null
command -v pct >/dev/null
command -v python3 >/dev/null
read -rp 'HomeCloud HTTPS URL: ' hub
[[ "$hub" == https://* ]] || { echo 'HTTPS is required.'; exit 1; }
read -rsp 'One-time pairing code from HomeCloud: ' pairing
printf '\n'
umask 077
curl --fail --silent --show-error "${hub%/}/api/node-agent/download" -o /usr/local/sbin/homecloud-node-agent.py
python3 /usr/local/sbin/homecloud-node-agent.py --url "$hub" --pair "$pairing"
unset pairing
cat > /etc/systemd/system/homecloud-node-agent.service <<'UNIT'
[Unit]
Description=HomeCloud Proxmox Docker bridge
After=network-online.target
Wants=network-online.target
[Service]
ExecStart=/usr/bin/python3 /usr/local/sbin/homecloud-node-agent.py
Restart=always
RestartSec=10
UMask=0077
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now homecloud-node-agent.service
echo 'Paired. Docker hosts will appear automatically in HomeCloud.'
