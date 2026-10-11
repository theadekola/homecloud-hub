#!/usr/bin/env bash
set -Eeuo pipefail
install -d /usr/local/lib /var/lib/homecloud-updater
install -m 0755 deployment/homecloud-updater /usr/local/lib/homecloud-updater
for unit in service timer path; do
  install -m 0644 "deployment/homecloud-updater.$unit" "/etc/systemd/system/homecloud-updater.$unit"
done
systemctl daemon-reload
systemctl enable --now homecloud-updater.timer homecloud-updater.path

# Also runs from older installed update commands after pulling this release.
python3 deployment/configure-https.py
if docker compose ps --status running --services | grep -qx caddy; then
  docker compose run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
  docker compose up -d --wait --wait-timeout 180 caddy api
fi
