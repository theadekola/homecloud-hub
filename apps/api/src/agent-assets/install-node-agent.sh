#!/usr/bin/env bash
set -Eeuo pipefail
[[ $EUID == 0 ]] || { echo 'Run this installer as root on the Proxmox node.'; exit 1; }
[[ ! -e /etc/homecloud-node-agent.json ]] || { echo 'Connector already configured. Revoke and remove the old connector before pairing again.'; exit 1; }
command -v qm >/dev/null
command -v pct >/dev/null
command -v python3 >/dev/null
read -rp 'HomeCloud HTTPS URL: ' hub
python3 -c 'import sys,urllib.parse; u=urllib.parse.urlsplit(sys.argv[1]); assert u.scheme=="https" and u.hostname and not u.username and not u.password and u.path in ("","/") and not u.query and not u.fragment, "Enter a HomeCloud HTTPS origin without credentials or a path"' "$hub"
read -rsp 'One-time pairing code from HomeCloud: ' pairing
printf '\n'
umask 077
curl --fail --silent --show-error "${hub%/}/api/node-agent/download" -o /usr/local/sbin/homecloud-node-agent.py
printf '%s\n' "$pairing" | python3 /usr/local/sbin/homecloud-node-agent.py --url "$hub" --pair-stdin
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
