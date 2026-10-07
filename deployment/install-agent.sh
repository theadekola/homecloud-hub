#!/usr/bin/env bash
set -Eeuo pipefail
[[ $EUID == 0 ]] || { echo 'Run sudo bash /tmp/homecloud-agent-install.sh'; exit 1; }
command -v python3 >/dev/null || { echo 'Install python3 first.'; exit 1; }
read -r -p 'HomeCloud Hub URL (including port): ' hub
read -r -s -p 'Discovery key from HomeCloud Hub: ' key
echo
[[ $hub =~ ^https?://[^[:space:]]+$ && $key =~ ^[a-f0-9]{64}$ ]] || { echo 'Invalid URL or discovery key.'; exit 1; }
install -d /usr/local/lib/homecloud
curl -fsSL https://raw.githubusercontent.com/theadekola/homecloud-hub/main/deployment/node-agent.py -o /usr/local/lib/homecloud/node-agent.py
umask 077
printf '%s\n%s\n' "$hub" "$key" | python3 -c 'import sys,json; print(json.dumps(dict(zip(["hub","key"],sys.stdin.read().splitlines()))))' > /etc/homecloud-agent.json
python3 -m json.tool /etc/homecloud-agent.json >/dev/null
cat > /etc/systemd/system/homecloud-agent.service <<'EOF'
[Unit]
Description=HomeCloud read-only node discovery
After=network-online.target
Wants=network-online.target
[Service]
ExecStart=/usr/bin/python3 /usr/local/lib/homecloud/node-agent.py
Restart=always
RestartSec=10
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now homecloud-agent
echo 'Discovery enabled. Services and installed packages appear automatically within 30 seconds.'
