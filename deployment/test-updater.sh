#!/usr/bin/env bash
set -Eeuo pipefail
project=$PWD
temporary=$(mktemp -d)
trap 'rm -rf -- "$temporary"' EXIT
mkdir -p "$temporary/repo/runtime" "$temporary/status" "$temporary/bin"
sed -e "s|/opt/i-clusters|$temporary/repo|g" -e "s|/var/lib/iclusters-updater|$temporary/status|g" -e "s|/run/iclusters-updater.lock|$temporary/lock|g" -e "s|/usr/local/bin/iclusters|$temporary/bin/iclusters|g" "$project/deployment/iclusters-updater" > "$temporary/worker"
cat > "$temporary/bin/git" <<'EOF'
#!/usr/bin/env bash
case "$1" in
  symbolic-ref) exit 0;;
  fetch) grep -q '"state":"checking"' "$FIXTURE/status/update-status.json"; exit $?;;
  rev-parse) if [[ $2 == HEAD ]]; then cat "$FIXTURE/current"; else echo bbbbbbb; fi;;
esac
EOF
cat > "$temporary/bin/iclusters" <<'EOF'
#!/usr/bin/env bash
[[ $1 == update ]] || exit 1
[[ ! -e "$FIXTURE/repo/runtime/update-request.json" ]] || exit 1
grep -q '"state":"updating"' "$FIXTURE/status/update-status.json"
if [[ -e "$FIXTURE/fail" ]]; then exit 1; fi
echo bbbbbbb > "$FIXTURE/current"
EOF
chmod +x "$temporary/bin/"*
export FIXTURE=$temporary PATH="$temporary/bin:$PATH"
echo aaaaaaa > "$temporary/current"
bash "$temporary/worker"
grep -q '"available":true' "$temporary/status/update-status.json"
echo '{}' > "$temporary/repo/runtime/update-request.json"
bash "$temporary/worker"
grep -q '"state":"completed"' "$temporary/status/update-status.json"
grep -q '"available":false' "$temporary/status/update-status.json"
echo '{"checkId":"fixture-check"}' > "$temporary/repo/runtime/update-check.json"
bash "$temporary/worker"
grep -q '"checkId":"fixture-check"' "$temporary/status/update-status.json"
grep -q '"message":"Up to date."' "$temporary/status/update-status.json"
test ! -e "$temporary/repo/runtime/update-check.json"
echo aaaaaaa > "$temporary/current"
touch "$temporary/fail" "$temporary/repo/runtime/update-request.json"
if bash "$temporary/worker"; then exit 1; fi
grep -q '"state":"failed"' "$temporary/status/update-status.json"
test ! -e "$temporary/repo/runtime/update-request.json"
echo 'Updater availability, installation and failure handling passed.'
