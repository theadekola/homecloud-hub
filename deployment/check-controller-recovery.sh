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
import assert from 'node:assert/strict';import http from 'node:http';import {pool} from './src/db.js';import {totp,unseal} from './src/mfa.js';
try{const r=await pool.query("SELECT * FROM users WHERE role='owner' ORDER BY created_at LIMIT 1"),u=r.rows[0];assert.ok(u.username.startsWith('ci_'));assert.equal(u.two_factor_enabled,true);const base='http://127.0.0.1:6000/api';const request=(p,options={})=>new Promise((resolve,reject)=>{const req=http.request(base+p,options,res=>{let data='';res.setEncoding('utf8');res.on('data',chunk=>data+=chunk);res.on('end',()=>{try{resolve({status:res.statusCode,body:JSON.parse(data),cookies:res.headers['set-cookie']})}catch(e){reject(e)}})});req.on('error',reject);req.setTimeout(15000,()=>req.destroy(Error('Restored API timed out')));req.end(options.body)});let refreshCookie='';const post=async(p,b)=>{const r=await request(p,{method:'POST',headers:{'Content-Type':'application/json','X-IClusters-Browser':'1',...(refreshCookie?{Cookie:refreshCookie}:{})},body:JSON.stringify(b)});assert.equal(r.status,200);if(r.cookies){const cookie=r.cookies[0];assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);assert.match(cookie,/SameSite=Strict/);refreshCookie=cookie.split(';')[0]}return r.body};const c=await post('/auth/login',{username:u.username,password:'CI-rotated-password-67890'});assert.equal(c.mfaRequired,true);const signed=await post('/auth/mfa',{challengeToken:c.challengeToken,code:totp(unseal(u.totp_secret),Math.floor(Date.now()/30000)+1)});assert.ok(signed.accessToken);assert.equal(signed.refreshToken,undefined);assert.ok(refreshCookie.startsWith('__Host-iclusters-refresh='));const refreshed=await post('/auth/refresh',{});assert.equal(refreshed.cookieSession,true);assert.equal(refreshed.refreshToken,undefined);assert.equal((await request('/auth/me',{headers:{Authorization:'Bearer '+refreshed.accessToken}})).status,200);console.log('Encrypted controller restore, MFA key decryption and real restored-account sign-in passed.')}finally{await pool.end()}
CHECK_LOGIN
