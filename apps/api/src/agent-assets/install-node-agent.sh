#!/usr/bin/env bash
set -Eeuo pipefail
[[ $EUID == 0 ]] || { echo 'Run this installer as root on the Proxmox node.'; exit 1; }
config=/etc/iclusters-node-agent.json
agent=/usr/local/sbin/iclusters-node-agent.py
unit=iclusters-node-agent.service
if [[ ! -e $config && -e /etc/homecloud-node-agent.json ]]; then
 config=/etc/homecloud-node-agent.json;agent=/usr/local/sbin/homecloud-node-agent.py;unit=homecloud-node-agent.service
fi
if [[ ${1:-} == --update ]]; then
  [[ $# == 1 && -f $config ]] || { echo 'An existing connector configuration is required.'; exit 1; }
  command -v python3 >/dev/null
  command -v curl >/dev/null
  hub=$(python3 -c 'import json,sys,urllib.parse; c=json.load(open(sys.argv[1])); u=urllib.parse.urlsplit(c["url"]); assert u.scheme=="https" and u.hostname and not u.username and not u.password and u.path in ("","/") and not u.query and not u.fragment; print(c["url"].rstrip("/"))' "$config")
  umask 077
  next=$(mktemp /usr/local/sbin/.iclusters-node-agent.XXXXXX)
  backup=$(mktemp /usr/local/sbin/.iclusters-node-agent-backup.XXXXXX)
  trap 'rm -f "$next" "$backup"' EXIT
  curl --fail --silent --show-error --max-time 30 "$hub/api/node-agent/download" -o "$next"
  python3 -c 'import ast,pathlib,sys; text=pathlib.Path(sys.argv[1]).read_text(); tree=ast.parse(text); compile(tree,sys.argv[1],"exec"); assert any(isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=="VERSION" for t in n.targets) and isinstance(n.value,ast.Constant) and n.value.value==9 for n in tree.body), "Update i-Clusters before updating the connector"' "$next"
  cp -p "$agent" "$backup"
  mv -f "$next" "$agent"
  if ! systemctl restart "$unit"; then
    mv -f "$backup" "$agent"
    systemctl restart "$unit" || true
    echo 'Connector restart failed. Previous script restored.'; exit 1
  fi
  echo 'Connector updated. Existing pairing and credentials preserved.'
  exit 0
fi
[[ $# == 0 ]] || { echo 'Usage: install-node-agent.sh [--update]'; exit 1; }
[[ ! -e $config ]] || { echo 'Connector already configured. Revoke and remove the old connector before pairing again.'; exit 1; }
command -v qm >/dev/null
command -v pct >/dev/null
command -v python3 >/dev/null
read -rp 'i-Clusters HTTPS URL: ' hub
python3 -c 'import sys,urllib.parse; u=urllib.parse.urlsplit(sys.argv[1]); assert u.scheme=="https" and u.hostname and not u.username and not u.password and u.path in ("","/") and not u.query and not u.fragment, "Enter an i-Clusters HTTPS origin without credentials or a path"' "$hub"
read -rsp 'One-time pairing code from i-Clusters: ' pairing
printf '\n'
umask 077
curl --fail --silent --show-error "${hub%/}/api/node-agent/download" -o /usr/local/sbin/iclusters-node-agent.py
printf '%s\n' "$pairing" | python3 /usr/local/sbin/iclusters-node-agent.py --url "$hub" --pair-stdin
unset pairing
cat > /etc/systemd/system/iclusters-node-agent.service <<'UNIT'
[Unit]
Description=i-Clusters Proxmox Docker bridge
After=network-online.target
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
echo 'Paired. Docker hosts will appear automatically in i-Clusters.'
