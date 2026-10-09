#!/bin/sh
set -eu
. /etc/os-release
case "$ID" in debian|ubuntu) ;; *) echo 'Only Debian and Ubuntu guests are supported' >&2; exit 1 ;; esac
export DEBIAN_FRONTEND=noninteractive
command -v systemctl >/dev/null || { echo 'Guest systemd is required' >&2; exit 1; }
if command -v podman >/dev/null && ! command -v dockerd >/dev/null; then
  echo 'Podman detected; Docker setup requires manual review' >&2
  exit 1
fi
apt-get update
apt-get install -y curl ca-certificates coreutils
if ! command -v dockerd >/dev/null; then
  apt-get install -y docker.io
fi
systemctl enable --now docker
if [ -e /dev/virtio-ports/org.qemu.guest_agent.0 ]; then
  apt-get install -y qemu-guest-agent
  systemctl start qemu-guest-agent
fi
test -S /var/run/docker.sock
curl --fail --silent --show-error --max-time 15 --unix-socket /var/run/docker.sock http://localhost/info >/dev/null
printf 'Docker setup verified\n'
