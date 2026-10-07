#!/usr/bin/env bash
set -Eeuo pipefail
install -d /usr/local/lib /var/lib/homecloud-updater
install -m 0755 deployment/homecloud-updater /usr/local/lib/homecloud-updater
for unit in service timer path; do
  install -m 0644 "deployment/homecloud-updater.$unit" "/etc/systemd/system/homecloud-updater.$unit"
done
systemctl daemon-reload
systemctl enable --now homecloud-updater.timer homecloud-updater.path
