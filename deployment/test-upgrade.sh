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
 *pg_restore*) test "$(cat)" = database;;
esac
MOCK
chmod +x "$stage/bin/"*
for scenario in before-pause after-snapshot; do
 project="$stage/$scenario";mkdir -p "$project/runtime" "$project/deployment"
 printf 'original-state\n' > "$project/runtime/state.json"
 touch "$project/.env" "$project/docker-compose.yml" "$project/deployment/Caddyfile"
 export LOG="$project/commands" CASE="$scenario"
 set +e
 PATH="$stage/bin:$PATH" HOMECLOUD_INSTALL_DIR="$project" ICLUSTERS_MAINTENANCE_LOCK="$project/lock" ICLUSTERS_UPGRADE_RECOVERY_ROOT="$project/recovery" bash "$script" > "$project/output" 2>&1
 result=$?
 set -e
 test "$result" -ne 0
 test ! -e "$project/runtime/maintenance.json"
 test "$(cat "$project/runtime/state.json")" = original-state
 if [[ $scenario == before-pause ]]; then
   if grep -q 'stop api' "$LOG"; then echo 'Preflight failure stopped a healthy API';exit 1;fi
 else
   grep -q 'pg_restore' "$LOG"
   grep -q 'git-reset' "$LOG"
   grep -q -- '--no-build --wait' "$LOG"
 fi
done
echo 'Upgrade preflight and rollback fixture checks passed.'
