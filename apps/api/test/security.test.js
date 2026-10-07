import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
process.env.JWT_SECRET='a'.repeat(64);process.env.JWT_REFRESH_SECRET='b'.repeat(64);
const {pool}=await import('../src/db.js');
const {issueTokens,rotateRefreshToken,auth}=await import('../src/security.js');
const {default:jwt}=await import('jsonwebtoken');
const tokens=new Map();
const user={id:'actual-user-id',user_id:'actual-user-id',email:'owner@test',name:'Owner',role:'owner',status:'active'};
pool.query=async(sql,args)=>{
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
