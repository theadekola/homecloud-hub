#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
fail() { echo "Error: $*" >&2; exit 1; }
usage() {
  echo 'Usage: sudo bash install.sh --repo https://github.com/OWNER/REPO.git [--ref BRANCH_OR_TAG] --url http://SERVER-IP [--email admin@example.com]'
}
repo='' ref='' url='' email='admin@homecloud.local'
while (($#)); do
  case "$1" in
    --repo|--ref|--url|--email)
      (($# >= 2)) || fail "Missing value for $1"
      case "$1" in --repo) repo=$2;; --ref) ref=$2;; --url) url=$2;; --email) email=$2;; esac
      shift 2;;
    -h|--help) usage; exit 0;;
    *) usage; fail "Unknown option: $1";;
  esac
done
[[ $repo =~ ^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(\.git)?$ ]] || fail 'Supply a public GitHub HTTPS repository with --repo.'
[[ $url =~ ^https?://[A-Za-z0-9.-]+$ ]] || fail '--url must be http://SERVER-IP or https://hostname without a port or path.'
[[ $email =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+$ ]] || fail 'Invalid administrator email.'
[[ -z $ref || $ref != -* ]] || fail 'Invalid Git ref.'
[[ $EUID == 0 ]] || fail 'Run with sudo bash install.sh ...'
source /etc/os-release
[[ $ID == ubuntu ]] || fail 'This installer supports Ubuntu.'
command -v systemctl >/dev/null || fail 'Ubuntu with systemd is required.'
[[ ! -e /opt/homecloud-hub ]] || fail '/opt/homecloud-hub already exists. Use sudo homecloud update for an existing installation.'
[[ ! -e /usr/local/bin/homecloud && ! -e /etc/systemd/system/homecloud-hub.service ]] || fail 'HomeCloud command or service already exists.'
apt-get update
apt-get install -y ca-certificates curl git openssl nano
if ! command -v docker >/dev/null; then
  for pkg in docker.io docker-compose docker-compose-v2 docker-doc docker-buildx podman-docker containerd runc; do
    if dpkg-query -W -f='${Status}' "$pkg" 2>/dev/null | grep -q 'install ok installed'; then
      fail "Existing package $pkg conflicts with Docker Engine. Configure Docker and Compose first using Docker's Ubuntu documentation."
    fi
  done
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  cat > /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: ${UBUNTU_CODENAME:-$VERSION_CODENAME}
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
docker compose version >/dev/null || fail 'Install the Docker Compose plugin before continuing.'
[[ -x /usr/bin/docker ]] || fail 'The systemd service requires Docker at /usr/bin/docker.'
systemctl start docker
docker info >/dev/null || fail 'Docker Engine is unavailable.'
install -d -m 0755 /opt
stage=$(mktemp -d /opt/homecloud-install.XXXXXXXX)
trap 'rm -rf -- "$stage"' EXIT
git clone -- "$repo" "$stage/source"
if [[ -n $ref ]]; then git -C "$stage/source" checkout --detach "$ref"; fi
cd "$stage/source"
[[ -f docker-compose.yml && -f deployment/homecloud && -f deployment/homecloud-hub.service && -f .env.example ]] || fail 'Repository does not contain the HomeCloud Hub installation files.'
sh deployment/generate-secrets.sh
domain=':80'
if [[ $url == https://* ]]; then domain=${url#https://}; fi
sed -i "s|^DOMAIN=.*|DOMAIN=$domain|;s|^WEB_ORIGIN=.*|WEB_ORIGIN=$url|;s|^ADMIN_EMAIL=.*|ADMIN_EMAIL=$email|" .env
docker compose config --quiet
mv "$stage/source" /opt/homecloud-hub
cd /opt/homecloud-hub
install -m 0755 deployment/homecloud /usr/local/bin/homecloud
install -m 0644 deployment/homecloud-hub.service /etc/systemd/system/homecloud-hub.service
docker compose build --pull
systemctl daemon-reload
systemctl enable --now homecloud-hub.service
echo "HomeCloud Hub installed at $url"
echo "Administrator: $email (password shown above and stored in /opt/homecloud-hub/.env)"
echo 'Configure integrations with sudo homecloud config, then sudo homecloud restart.'
