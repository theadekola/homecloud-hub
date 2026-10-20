#!/usr/bin/env bash
# Restore to a NEW, isolated directory; never overwrite an existing controller.
set -Eeuo pipefail
[[ $EUID == 0 ]] || { echo 'Run this command as root.' >&2; exit 1; }
archive=${1:?Usage: controller-restore.sh backup.tar.age /path/to/age-identity /new/absolute/install-directory}
identity=${2:?Supply the private age identity file.}
target=${3:?Supply a new empty installation directory.}
[[ $target = /* && ! -e $target ]] || { echo 'Target must be a new absolute directory.' >&2; exit 1; }
command -v age >/dev/null
umask 077
mkdir -m 0700 -p "$target"
stage=$(mktemp -d /var/tmp/iclusters-restore.XXXXXX)
trap 'rm -rf -- "$stage"' EXIT
age --decrypt -i "$identity" -o "$stage/backup.tar" "$archive"
python3 "$(dirname "$0")/safe-extract.py" "$stage/backup.tar" "$stage/content"
(cd "$stage/content" && sha256sum --check --strict SHA256SUMS)
python3 "$(dirname "$0")/safe-extract.py" "$stage/content/source.tar" "$target"
# Restore Git history offline so normal reviewed upgrades remain available.
git -C "$target" init -b main >/dev/null
git -C "$target" fetch --no-tags "$stage/content/source.bundle" HEAD
git -C "$target" reset --mixed FETCH_HEAD >/dev/null
test "$(git -C "$target" rev-parse HEAD)" = "$(cat "$stage/content/revision")"
git -C "$target" remote add origin "$(cat "$stage/content/origin")"
cp -a "$stage/content/.env" "$stage/content/runtime" "$stage/content/docker-compose.yml" "$target/"
cp -a "$stage/content/Caddyfile" "$target/deployment/Caddyfile"
if [[ -d $stage/content/secrets ]]; then cp -a "$stage/content/secrets" "$target/"; fi
cd "$target"
# A unique Compose project prevents accidental use of production volumes.
restore_project="iclusters-restore-$(date -u +%Y%m%d%H%M%S)"
printf '\nCOMPOSE_PROJECT_NAME=%s\n' "$restore_project" >> .env
export COMPOSE_PROJECT_NAME="$restore_project"
docker compose config --quiet
source deployment/build-env.sh
docker compose build api
docker compose up -d --wait --wait-timeout 120 postgres
docker compose exec -T postgres sh -c 'pg_restore --clean --if-exists --no-owner --exit-on-error -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$stage/content/database.dump"
python3 "$target/deployment/safe-extract.py" "$stage/content/caddy-data.tar" "$stage/caddy-safe"
tar -C "$stage/caddy-safe" -cf - . | docker compose run --rm --no-deps -T --entrypoint sh caddy -c 'tar -C /data -xf -'
docker compose run --rm --no-deps -T api node scripts/verify-restored-controller.mjs --invalidate-sessions
echo "Controller restored to $target; application services remain STOPPED."
echo 'Isolate provider access, review the HTTPS domain/ports, then start services for your restore drill.'
echo 'All prior sessions and recovery codes were invalidated. Regenerate MFA recovery codes after signing in.'
