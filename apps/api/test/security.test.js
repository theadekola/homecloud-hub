import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
process.env.JWT_SECRET='a'.repeat(64);process.env.JWT_REFRESH_SECRET='b'.repeat(64);
const {pool}=await import('../src/db.js');
const {issueTokens,rotateRefreshToken,auth}=await import('../src/security.js');
const {default:jwt}=await import('jsonwebtoken');
const tokens=new Map();
let sessionRevoked=false;
const user={id:'actual-user-id',user_id:'actual-user-id',email:'owner@test',name:'Owner',role:'owner',status:'active'};
pool.query=async(sql,args)=>{
 if(sql.startsWith('INSERT INTO auth_sessions'))return {rows:[],rowCount:1};
 if(sql.startsWith('SELECT id FROM auth_sessions'))return {rows:sessionRevoked?[]:[{id:args[0]}],rowCount:sessionRevoked?0:1};
 if(sql.startsWith('INSERT INTO refresh_tokens')){assert.ok(!tokens.has(args[1]));tokens.set(args[1],{id:crypto.randomUUID(),user_id:args[0],revoked:false});return {rows:[],rowCount:1};}
 if(sql.includes('FROM refresh_tokens')){const record=tokens.get(args[0]);return {rows:record&&!record.revoked?[{...user,...record}]:[],rowCount:record&&!record.revoked?1:0};}
 if(sql.startsWith('UPDATE refresh_tokens')){const record=tokens.get(args[0]);if(!record||record.revoked)return {rows:[],rowCount:0};record.revoked=true;return {rows:[record],rowCount:1};}
 if(sql.includes('FROM users'))return {rows:[user],rowCount:1};
 throw new Error('Unexpected query');
};
await test('refresh keeps the user identity, produces unique tokens and rejects replay',async()=>{
 const first=await issueTokens(user);const second=await rotateRefreshToken(first.refreshToken);
 assert.equal(jwt.verify(second.accessToken,process.env.JWT_SECRET).sub,user.id);
 assert.notEqual(first.refreshToken,second.refreshToken);
 await assert.rejects(rotateRefreshToken(first.refreshToken),/rejected/);
 const duplicateLogins=await Promise.all([issueTokens(user),issueTokens(user)]);assert.notEqual(duplicateLogins[0].refreshToken,duplicateLogins[1].refreshToken);
});
await test('deactivation and role changes apply to existing access tokens immediately',async()=>{
 const token=(await issueTokens(user)).accessToken;user.role='viewer';
 let responseStatus,nextCalled=false;const res={status(status){responseStatus=status;return this;},json(){}};const req={headers:{authorization:`Bearer ${token}`}};
 await auth(req,res,()=>{nextCalled=true;});assert.equal(nextCalled,true);assert.equal(req.user.role,'viewer');
 user.status='inactive';nextCalled=false;await auth(req,res,()=>{nextCalled=true;});assert.equal(responseStatus,401);assert.equal(nextCalled,false);
});

test('remembered credentials expire at ten days and token rotation cannot extend the original deadline',async()=>{
 user.status='active';const first=await issueTokens(user,{remember:true}),refresh=jwt.verify(first.refreshToken,process.env.JWT_REFRESH_SECRET),access=jwt.verify(first.accessToken,process.env.JWT_SECRET);
 assert.equal(refresh.sessionExp-refresh.iat,10*86400);assert.equal(refresh.exp,refresh.sessionExp);assert.equal(first.rememberUntil,refresh.exp*1000);assert.equal(access.sessionExp,refresh.sessionExp);
 const second=await rotateRefreshToken(first.refreshToken);assert.equal(jwt.decode(second.refreshToken).sessionExp,refresh.sessionExp);assert.equal(second.rememberUntil,first.rememberUntil);
 const originalNow=Date.now;Date.now=()=>refresh.sessionExp*1000;
 try{await assert.rejects(()=>rotateRefreshToken(second.refreshToken));const forgedLongAccess=jwt.sign({...user,sub:user.id,sessionExp:refresh.sessionExp},process.env.JWT_SECRET,{expiresIn:'30d'});let status,next=false;await auth({headers:{authorization:'Bearer '+forgedLongAccess}},{status(v){status=v;return this},json(){}},()=>next=true);assert.equal(status,401);assert.equal(next,false)}finally{Date.now=originalNow}
});

await test('session revocation and account version changes reject existing credentials',async()=>{user.status='active';user.token_version=0;const first=await issueTokens(user);const denied=async()=>{let status,next=false;await auth({headers:{authorization:'Bearer '+first.accessToken}},{status(v){status=v;return this},json(){}},()=>next=true);assert.equal(status,401);assert.equal(next,false)};sessionRevoked=true;await denied();await assert.rejects(()=>rotateRefreshToken(first.refreshToken));sessionRevoked=false;user.token_version=1;await denied();await assert.rejects(()=>rotateRefreshToken(first.refreshToken));});
