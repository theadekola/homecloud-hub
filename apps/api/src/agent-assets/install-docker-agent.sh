#!/usr/bin/env bash
set -Eeuo pipefail
[[ $EUID == 0 ]] || { echo 'Run as root on the Docker host, using sudo bash if needed.'; exit 1; }
[[ ! -e /etc/iclusters-node-agent.json && ! -e /etc/homecloud-node-agent.json ]] || { echo 'Connector already configured. Revoke and remove the old connector before pairing again.'; exit 1; }
command -v python3 >/dev/null
command -v systemctl >/dev/null
command -v curl >/dev/null
read -rp 'i-Clusters HTTPS URL: ' hub
python3 -c 'import sys,urllib.parse; u=urllib.parse.urlsplit(sys.argv[1]); assert u.scheme=="https" and u.hostname and not u.username and not u.password and u.path in ("","/") and not u.query and not u.fragment, "Enter an i-Clusters HTTPS origin without credentials or a path"' "$hub"
if ! test -S /var/run/docker.sock; then
  . /etc/os-release
  case "$ID" in debian|ubuntu) ;; *) echo 'Install and start Docker manually on this OS, then retry.'; exit 1 ;; esac
  if command -v dockerd >/dev/null || command -v podman >/dev/null; then
    echo 'Existing Docker or Podman needs manual review. Start Docker and retry.'; exit 1
  fi
  read -rp 'Docker is missing. Install docker.io and start Docker? Type INSTALL to continue: ' consent
  [[ "$consent" == INSTALL ]] || { echo 'Cancelled. No Docker packages installed.'; exit 1; }
  apt-get update
  apt-get install -y docker.io
  systemctl enable --now docker
fi
curl --fail --silent --show-error --max-time 15 --unix-socket /var/run/docker.sock http://localhost/info |
  python3 -c 'import json,sys; assert json.load(sys.stdin).get("ServerVersion"), "Docker Engine verification failed"'
read -rsp 'One-time pairing code from i-Clusters: ' pairing
printf '\n'
umask 077
curl --fail --silent --show-error --proto '=https' "${hub%/}/api/node-agent/download" -o /usr/local/sbin/iclusters-node-agent.py
printf '%s\n' "$pairing" | python3 /usr/local/sbin/iclusters-node-agent.py --url "$hub" --pair-stdin --kind docker
unset pairing
cat > /etc/systemd/system/iclusters-node-agent.service <<'UNIT'
[Unit]
Description=i-Clusters outbound Docker host connector
After=network-online.target docker.service
Wants=network-online.target
[Service]
ExecStart=/usr/bin/python3 /usr/local/sbin/iclusters-node-agent.py
Restart=always
RestartSec=10
UMask=0077
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now iclusters-node-agent.service
echo 'Paired. Return to i-Clusters and click Verify & Connect. No Docker TCP port was opened.'
