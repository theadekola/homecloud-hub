#!/usr/bin/env bash
# Called only after the upgraded deployment has passed health checks.
set -Eeuo pipefail
if [[ $PWD == /opt/homecloud-hub && ! -L /opt/homecloud-hub ]]; then
 [[ ! -e /opt/i-clusters ]] || { echo 'Both installation folders exist. Resolve this before completing migration.' >&2; exit 1; }
 mv /opt/homecloud-hub /opt/i-clusters
 ln -s /opt/i-clusters /opt/homecloud-hub
 cd /opt/i-clusters
fi
# Keep old update commands usable for clients upgrading from the previous release.
install -m 0755 deployment/iclusters /usr/local/bin/iclusters
if [[ -e /usr/local/bin/homecloud ]]; then ln -sfn /usr/local/bin/iclusters /usr/local/bin/homecloud; fi
install -m 0644 deployment/i-clusters.service /etc/systemd/system/i-clusters.service
systemctl disable homecloud-hub.service 2>/dev/null || true
systemctl disable --now homecloud-updater.timer homecloud-updater.path 2>/dev/null || true
# A running old updater may still write its final result after this migration.
if [[ -d /var/lib/homecloud-updater && ! -L /var/lib/homecloud-updater ]]; then
 install -d /var/lib/iclusters-updater
 cp -an /var/lib/homecloud-updater/. /var/lib/iclusters-updater/
fi
systemctl daemon-reload
systemctl enable i-clusters.service

if systemctl is-active --quiet homecloud-hub.service; then systemctl start i-clusters.service; fi
origin=$(git remote get-url origin)
case "$origin" in
 https://github.com/theadekola/homecloud-hub.git|https://github.com/theadekola/homecloud-hub) git remote set-url origin https://github.com/theadekola/i-clusters.git;;
 git@github.com:theadekola/homecloud-hub.git) git remote set-url origin git@github.com:theadekola/i-clusters.git;;
esac
