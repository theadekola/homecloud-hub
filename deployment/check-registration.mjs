// Exercises real PostgreSQL transactions through the Compose API in isolated CI.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const base='https://localhost:6002/api';
const setupToken=fs.readFileSync('.env','utf8').match(/^SETUP_TOKEN=(.+)$/m)[1];
const request=async(path,body)=>{const response=await fetch(base+path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});return {status:response.status,body:await response.json()};};
assert.equal((await request('/auth/setup')).body.registrationOpen,true);
const account={name:'CI Owner',username:'ci_owner',email:'owner@example.test',password:'CI-only-password-12345',setupToken};
assert.equal((await request('/auth/register',{...account,setupToken:'wrong'})).status,403);
assert.equal((await request('/auth/register',{...account,password:'short'})).status,400);
const competing=await Promise.all([request('/auth/register',account),request('/auth/register',{...account,username:'ci_second',email:'second@example.test'})]);
assert.deepEqual(competing.map(r=>r.status).sort(),[201,409]);
const owner=competing.find(r=>r.status===201).body.user;
assert.equal(owner.role,'owner');assert.equal((await request('/auth/setup')).body.registrationOpen,false);
assert.equal((await request('/auth/register',{...account,username:'ci_third',email:'third@example.test'})).status,409);
const login=await request('/auth/login',{username:owner.username,password:account.password,remember:true});
assert.equal(login.status,200);assert.ok(login.body.accessToken);
assert.equal(owner.username.startsWith('ci_'),true);
assert.ok(Math.abs(login.body.rememberUntil-Date.now()-10*24*60*60*1000)<10000);
const refreshed=await request('/auth/refresh',{refreshToken:login.body.refreshToken});
assert.equal(refreshed.status,200);assert.equal(refreshed.body.rememberUntil,login.body.rememberUntil);
assert.equal((await request('/auth/refresh',{refreshToken:login.body.refreshToken})).status,401);
assert.equal((await request('/auth/login',{email:owner.email,password:account.password})).status,200);
console.log('First-use registration, concurrent owner protection and sign-in passed through HTTPS web port 6002 and internal API port 6000.');
// Optional MFA, recovery login, server revocation and password rotation against
// the real database. Never print setup keys, passwords, tokens or recovery codes.
const {totp}=await import('../apps/api/src/mfa.js');
const authRequest=async(path,token,body)=>{const response=await fetch(base+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()}};
const setup=await authRequest('/account/mfa/setup',refreshed.body.accessToken,{password:account.password});assert.equal(setup.status,200);
const enabled=await authRequest('/account/mfa/enable',refreshed.body.accessToken,{password:account.password,code:totp(setup.body.secret,Math.floor(Date.now()/30000))});assert.equal(enabled.status,200);assert.equal(enabled.body.recoveryCodes.length,10);
assert.equal((await authRequest('/auth/me',refreshed.body.accessToken)).status,401);
const challenge=await request('/auth/login',{username:owner.username,password:account.password,remember:true});assert.equal(challenge.body.mfaRequired,true);assert.equal(challenge.body.accessToken,undefined);
assert.equal((await request('/auth/mfa',{challengeToken:challenge.body.challengeToken,code:'wrong'})).status,401);
const verified=await request('/auth/mfa',{challengeToken:challenge.body.challengeToken,code:enabled.body.recoveryCodes[0]});assert.equal(verified.status,200);
assert.equal((await authRequest('/account/security',verified.body.accessToken)).body.recoveryCodesRemaining,9);
const sessions=await authRequest('/account/sessions',verified.body.accessToken);assert.ok(sessions.body.sessions.some(s=>s.current));
const revoked=await authRequest('/account/sessions/revoke',verified.body.accessToken,{all:true,password:account.password,code:enabled.body.recoveryCodes[1]});assert.equal(revoked.status,200);
assert.equal((await request('/auth/refresh',{refreshToken:verified.body.refreshToken})).status,401);
const again=await request('/auth/login',{username:owner.username,password:account.password});const signed=await request('/auth/mfa',{challengeToken:again.body.challengeToken,code:enabled.body.recoveryCodes[2]});assert.equal(signed.status,200);
// Empty-provider controller probe: bounded concurrency, never a fleet-capacity claim.
const pages=['/dashboard','/proxmox','/docker','/storage','/network','/backups','/monitoring','/alerts','/settings','/account/security'],latencies=[],responses={};
await Promise.all(Array.from({length:8},async()=>{for(const route of pages){const start=performance.now();const result=await authRequest(route,signed.body.accessToken);if(['/proxmox','/docker'].includes(route)){assert.equal(result.status,503,route);assert.match(result.body.error,/not configured/i)}else assert.equal(result.status,200,route);const key=route+':'+result.status;responses[key]=(responses[key]||0)+1;latencies.push(performance.now()-start)}}));
latencies.sort((a,b)=>a-b);const probe={scope:'isolated empty-provider controller; Proxmox/Docker explicitly unavailable',responses,requests:latencies.length,concurrency:8,p50Ms:latencies[Math.floor(latencies.length*.5)],p95Ms:latencies[Math.floor(latencies.length*.95)],maximumMs:latencies.at(-1)};
assert.ok(probe.p95Ms<5000,'Empty-provider page p95 exceeded five seconds');fs.mkdirSync('artifacts/evidence',{recursive:true});fs.writeFileSync('artifacts/evidence/page-read-probe.json',JSON.stringify(probe,null,2));console.log('Bounded controller read probe:',JSON.stringify(probe));
const changed=await authRequest('/account/password',signed.body.accessToken,{password:account.password,code:enabled.body.recoveryCodes[3],newPassword:'CI-rotated-password-67890'});assert.equal(changed.status,200);assert.equal((await authRequest('/auth/me',signed.body.accessToken)).status,401);
console.log('Optional MFA enrollment, single-use recovery login, device session revocation and password rotation passed through HTTPS/PostgreSQL.');
