import test from 'node:test';
import assert from 'node:assert/strict';
process.env.JWT_SECRET='a'.repeat(64);process.env.JWT_REFRESH_SECRET='b'.repeat(64);
const {renewAccountSession}=await import('../src/account-security.js');
test('MFA session renewal cannot adopt a later password reset or session revocation',async()=>{let issued=0;const db={query:async()=>({rowCount:1,rows:[{id:'owner',token_version:12}]})},issue=async user=>{issued++;return {version:user.token_version}};await assert.rejects(()=>renewAccountSession(db,'owner',11,{},issue),e=>e.status===401);assert.equal(issued,0);assert.deepEqual(await renewAccountSession(db,'owner',12,{},issue),{version:12});assert.equal(issued,1)});
