#!/usr/bin/env bash
# Mock external commands: exercise error handling without touching Docker or Git.
set -Eeuo pipefail
script=$(realpath "$(dirname "$0")/upgrade.sh")
stage=$(mktemp -d)
trap 'rm -rf -- "$stage"' EXIT
mkdir -p "$stage/bin"
cat > "$stage/bin/git" <<'MOCK'
#!/usr/bin/env bash
case "$1" in status) :;; symbolic-ref) echo refs/heads/main;; rev-parse) echo original;; pull) exit 19;; reset) echo git-reset >> "$LOG";; *) exit 90;; esac
MOCK
cat > "$stage/bin/docker" <<'MOCK'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$LOG"
case "$*" in
 *'images -q'*) echo image;;
 *'check-maintenance.mjs'*) if [[ $CASE == before-pause ]]; then exit 18; fi;;
 *pg_dump*) echo database;;
 *pg_restore*) if [[ $CASE == rollback-db ]]; then exit 20; fi;test "$(cat)" = database;;
esac
MOCK
cat > "$stage/bin/cp" <<'MOCK'
#!/usr/bin/env bash
if [[ $CASE == rollback-config && "$*" == *recovery/upgrade-*/.env* ]]; then exit 21; fi
exec /bin/cp "$@"
MOCK
chmod +x "$stage/bin/"*
for scenario in before-pause after-snapshot rollback-db rollback-config; do
 project="$stage/$scenario";mkdir -p "$project/runtime" "$project/deployment"
 printf 'original-state\n' > "$project/runtime/state.json"
 touch "$project/.env" "$project/docker-compose.yml" "$project/deployment/Caddyfile"
 export LOG="$project/commands" CASE="$scenario"
 set +e
 PATH="$stage/bin:$PATH" HOMECLOUD_INSTALL_DIR="$project" ICLUSTERS_MAINTENANCE_LOCK="$project/lock" ICLUSTERS_UPGRADE_RECOVERY_ROOT="$project/recovery" bash "$script" > "$project/output" 2>&1
 result=$?
 set -e
 test "$result" -ne 0
 if [[ $scenario == rollback-* ]]; then
   test -e "$project/runtime/maintenance.json"
   grep -q 'recoveryRequired' "$project/runtime/maintenance.json"
   grep -q 'Automatic rollback could not be verified' "$project/output"
   if grep -q 'Previous controller restored' "$project/output"; then echo 'Failed rollback claimed success';exit 1;fi
 else
   test ! -e "$project/runtime/maintenance.json"
 fi
 test "$(cat "$project/runtime/state.json")" = original-state
 if [[ $scenario == before-pause ]]; then
   if grep -q 'stop api' "$LOG"; then echo 'Preflight failure stopped a healthy API';exit 1;fi
 else
   if [[ $scenario == rollback-config ]]; then
     if grep -q 'pg_restore' "$LOG"; then echo 'Configuration failure attempted a database restore';exit 1;fi
   else
     grep -q 'pg_restore' "$LOG"
   fi
   grep -q 'git-reset' "$LOG"
   if [[ $scenario != rollback-config ]]; then grep -q -- '--no-build --wait' "$LOG"; fi
   if [[ $scenario == rollback-* ]] && grep -q -- '--wait-timeout 180' "$LOG"; then echo 'Failed rollback restarted API';exit 1;fi
 fi
done
echo 'Upgrade preflight and rollback fixture checks passed.'
