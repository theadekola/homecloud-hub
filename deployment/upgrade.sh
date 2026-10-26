#!/usr/bin/env bash
# Standard Compose upgrade with a consistent local recovery point and automatic
# rollback to the original images/database if the new deployment fails health.
set -Eeuo pipefail
[[ $EUID == 0 ]] || { echo 'Run the updater as root.' >&2; exit 1; }
project=${ICLUSTERS_INSTALL_DIR:-${HOMECLOUD_INSTALL_DIR:-/opt/i-clusters}}
cd "$project"
[[ -z $(git status --porcelain --untracked-files=no) ]] || { echo 'Tracked files have local changes; commit or revert them before updating.' >&2; exit 1; }
git symbolic-ref --quiet HEAD >/dev/null || { echo 'This checkout is pinned. Select a reviewed release branch before updating.' >&2; exit 1; }
exec 9>"${ICLUSTERS_MAINTENANCE_LOCK:-/run/lock/iclusters-maintenance.lock}"
flock -n 9 || { echo 'Controller maintenance is already running.' >&2; exit 1; }
[[ ! -e runtime/maintenance.json ]] || { echo 'Inspect the existing maintenance operation before retrying.' >&2; exit 1; }
umask 077
stamp=$(date -u +%Y%m%dT%H%M%SZ)
recovery="${ICLUSTERS_UPGRADE_RECOVERY_ROOT:-/var/backups/iclusters}/upgrade-$stamp"
mkdir -m 0700 -p "$recovery"
previous=$(git rev-parse HEAD)
printf '%s\n' "$previous" > "$recovery/revision"
cp -a .env docker-compose.yml deployment/Caddyfile "$recovery/"
for service in api web caddy postgres; do
 image=$(docker compose images -q "$service" | head -1)
 [[ -n $image ]] || { echo "The existing $service image is required for rollback." >&2; exit 1; }
 docker tag "$image" "iclusters-rollback-$service:$stamp"
done
python3 - "$stamp" "$recovery/images.json" <<'IMAGES'
import json,sys
stamp,target=sys.argv[1:]
with open(target,'w') as output: json.dump({'services':{service:{'image':f'iclusters-rollback-{service}:{stamp}'} for service in ['api','web','caddy','postgres']}},output)
IMAGES
printf '{"operation":"software-upgrade"}\n' > runtime/maintenance.json
paused=0
snapshot=0
rollback(){
 local result=$?
 trap - ERR
 echo 'Upgrade failed; restoring the previous controller deployment.' >&2
 set +e
 if ((paused)) && ! docker compose stop api; then
   echo 'Rollback stopped: the API could not be paused safely. Maintenance remains enabled; inspect the recovery point.' >&2
   exit "$result"
 fi
 if ((snapshot)); then
   restore_result=0
   git reset --hard "$previous" || restore_result=1
   cp -a "$recovery/.env" .env || restore_result=1
   cp -a "$recovery/docker-compose.yml" docker-compose.yml || restore_result=1
   cp -a "$recovery/Caddyfile" deployment/Caddyfile || restore_result=1
   mv runtime "runtime.failed-$stamp" || restore_result=1
   mkdir -m 0700 runtime || restore_result=1
   cp -a "$recovery/runtime/." runtime/ || restore_result=1
   db_result=1
   service_result=1
   if ((restore_result==0)); then
     docker compose -f docker-compose.yml -f "$recovery/images.json" up -d --no-build --wait --wait-timeout 120 postgres || restore_result=1
   fi
   if ((restore_result==0)); then
     docker compose exec -T postgres sh -c 'pg_restore --clean --if-exists --no-owner --exit-on-error -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$recovery/database.dump"
     db_result=$?
   fi
   if ((restore_result==0 && db_result==0)); then
     docker compose -f docker-compose.yml -f "$recovery/images.json" up -d --no-build --wait --wait-timeout 180
     service_result=$?
   fi
   if ((restore_result==0 && db_result==0 && service_result==0)); then rm -f runtime/maintenance.json; echo 'Previous controller restored. The failed upgrade remains available for inspection.' >&2; else
     mkdir -p runtime
     printf '{"operation":"software-upgrade","recoveryRequired":true}\n' > runtime/maintenance.json
     echo 'Automatic rollback could not be verified. Maintenance remains enabled; use the recovery point.' >&2
   fi
 elif ((paused)); then
   if docker compose up -d --no-deps --wait --wait-timeout 120 api; then
     rm -f runtime/maintenance.json
   else
     printf '{"operation":"software-upgrade","recoveryRequired":true}\n' > runtime/maintenance.json
     echo 'The original API could not be restarted. Maintenance remains enabled; inspect the deployment.' >&2
   fi
 else rm -f runtime/maintenance.json
 fi
 echo "Local recovery point: $recovery" >&2
 exit "$result"
}
trap rollback ERR
# First upgrade from an older release may not yet contain the maintenance check.
docker compose exec -T api node -e "if(require('fs').existsSync('scripts/check-maintenance.mjs'))import('./scripts/check-maintenance.mjs')"
paused=1
docker compose stop api
docker compose exec -T postgres sh -c 'pg_dump --format=custom --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$recovery/database.dump"
cp -a runtime "$recovery/"
snapshot=1
git pull --ff-only
grep -q '^WEB_PORT=' .env || echo 'WEB_PORT=80' >> .env
grep -q '^HTTPS_PORT=' .env || echo 'HTTPS_PORT=443' >> .env
if ! grep -q '^SETUP_TOKEN=' .env; then printf '\nSETUP_TOKEN=%s\n' "$(openssl rand -hex 16)" >> .env; fi
python3 deployment/configure-https.py
docker compose config --quiet
source deployment/build-env.sh
docker compose build --pull
docker compose up -d --wait --wait-timeout 180
install -m 0755 deployment/iclusters /usr/local/bin/iclusters
install -m 0644 deployment/i-clusters.service /etc/systemd/system/i-clusters.service
bash deployment/setup-updater.sh
systemctl daemon-reload
rm -f runtime/maintenance.json
trap - ERR
echo "Upgrade completed and health checks passed. Local recovery point: $recovery"
