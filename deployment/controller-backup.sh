#!/usr/bin/env bash
# Encrypted, consistent backup of the standard single-controller Compose stack.
set -Eeuo pipefail
[[ $EUID == 0 ]] || { echo 'Run this command as root.' >&2; exit 1; }
project=${HOMECLOUD_INSTALL_DIR:-/opt/homecloud-hub}
destination=${1:?Usage: controller-backup.sh /absolute/backup-directory age1recipient}
recipient=${2:?Supply your age public encryption recipient, not a private key.}
[[ $destination = /* && $recipient = age1* ]] || { echo 'Use an absolute destination and an age public recipient.' >&2; exit 1; }
command -v age >/dev/null || { echo 'Install age from your OS package repository first.' >&2; exit 1; }
cd "$project"
case "$(realpath -m "$destination")/" in "$(realpath "$project")/"*) echo 'Backup destination must be outside the installation.' >&2; exit 1;; esac
umask 077
mkdir -p "$destination" runtime
exec 9>/run/lock/iclusters-maintenance.lock
flock -n 9 || { echo 'Controller maintenance is already running.' >&2; exit 1; }
[[ ! -e runtime/maintenance.json ]] || { echo 'A maintenance marker already exists. Inspect the previous operation before retrying.' >&2; exit 1; }
for service in api postgres caddy; do docker compose ps --status running --services | grep -qx "$service" || { echo "$service must be running before backup." >&2; exit 1; }; done
stage=$(mktemp -d /var/tmp/iclusters-backup.XXXXXX)
paused=0
cleanup(){ local result=$?; trap - EXIT; if ((paused)); then docker compose up -d --no-deps api caddy || result=1; fi; rm -f runtime/maintenance.json; rm -rf -- "$stage"; exit "$result"; }
trap cleanup EXIT
printf '{"operation":"controller-backup"}\n' > runtime/maintenance.json
docker compose exec -T api node scripts/check-maintenance.mjs
paused=1
docker compose stop api caddy
docker compose exec -T postgres sh -c 'pg_dump --format=custom --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$stage/database.dump"
git archive --format=tar HEAD > "$stage/source.tar"
git bundle create "$stage/source.bundle" HEAD
git remote get-url origin > "$stage/origin"
printf '%s\n' "$(git rev-parse HEAD)" > "$stage/revision"
cp -a .env runtime docker-compose.yml "$stage/"
cp -a deployment/Caddyfile "$stage/Caddyfile"
rm -f "$stage/runtime/maintenance.json"
if [[ -d secrets ]]; then cp -a secrets "$stage/"; fi
docker compose run --rm --no-deps -T --entrypoint sh caddy -c 'tar -C /data -cf - .' > "$stage/caddy-data.tar"
(cd "$stage" && find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS)
archive="$destination/iclusters-controller-$(date -u +%Y%m%dT%H%M%SZ).tar.age"
tar -C "$stage" -cf - . | age -r "$recipient" -o "$archive"
chmod 0600 "$archive"
echo "Encrypted controller backup completed: $archive"
