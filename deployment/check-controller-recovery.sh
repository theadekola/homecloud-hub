#!/usr/bin/env bash
# Isolated CI only: never run this drill against an installation with real data.
set -Eeuo pipefail
[[ ${ICLUSTERS_CI_DRILL:-} == 1 ]] || { echo 'This test requires the isolated CI drill environment.' >&2; exit 1; }
project=$PWD
stage=$(mktemp -d /var/tmp/iclusters-ci-dr.XXXXXX)
cleanup(){ local result=$?; trap - EXIT; if [[ -f $stage/restored/.env ]]; then (cd "$stage/restored" && docker compose down --volumes) || true; fi; rm -rf -- "$stage"; exit "$result"; }
trap cleanup EXIT
age-keygen -o "$stage/identity" >/dev/null 2>&1
recipient=$(age-keygen -y "$stage/identity")
HOMECLOUD_INSTALL_DIR="$project" bash deployment/controller-backup.sh "$stage/backups" "$recipient"
archive=$(find "$stage/backups" -name '*.tar.age' -type f -print -quit)
bash deployment/controller-restore.sh "$archive" "$stage/identity" "$stage/restored"
cd "$stage/restored"
docker compose up -d --wait --wait-timeout 120 api
docker compose exec -T api node --input-type=module - <<'CHECK_LOGIN'
import assert from 'node:assert/strict';import {pool} from './src/db.js';import {totp,unseal} from './src/mfa.js';
try{const r=await pool.query("SELECT * FROM users WHERE role='owner' ORDER BY created_at LIMIT 1"),u=r.rows[0];assert.ok(u.username.startsWith('ci_'));assert.equal(u.two_factor_enabled,true);const base='http://127.0.0.1:6000/api';const post=async(p,b)=>{const r=await fetch(base+p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});assert.equal(r.status,200);return r.json()};const c=await post('/auth/login',{username:u.username,password:'CI-rotated-password-67890'});assert.equal(c.mfaRequired,true);const signed=await post('/auth/mfa',{challengeToken:c.challengeToken,code:totp(unseal(u.totp_secret),Math.floor(Date.now()/30000)+1)});assert.ok(signed.accessToken);assert.equal((await fetch(base+'/auth/me',{headers:{Authorization:'Bearer '+signed.accessToken}})).status,200);console.log('Encrypted controller restore, MFA key decryption and real restored-account sign-in passed.')}finally{await pool.end()}
CHECK_LOGIN
