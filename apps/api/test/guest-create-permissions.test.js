import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'guest-create-permissions-'));process.env.JWT_SECRET='a'.repeat(64);process.env.JWT_REFRESH_SECRET='b'.repeat(64);
const {createApp}=await import('../src/app.js'),{requireRole}=await import('../src/security.js');
test('creation options and privileged/HA operations preserve role and confirmation gates',async()=>{
 const app=createApp({authenticate:(req,res,next)=>{req.user={sub:'fixture',role:req.headers['x-role']||'owner'};next()},authorize:requireRole,audit:async()=>{},monitor:{invalidate:async()=>{},sample:async()=>({services:[]})},db:{query:async()=>({rows:[]})}}),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}/api`;
 const call=async(p,role,body)=>{const r=await fetch(base+p,{method:body?'POST':'GET',headers:{'x-role':role,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json()}};
 try{assert.equal((await call('/proxmox/create-options/n1','viewer')).status,403);assert.equal((await call('/proxmox/creation/unknown/ha','operator',{})).status,403);
 const ct={name:'fixture',node:'n1',ostemplate:'local:vztmpl/os.tar.zst',storage:'local',password:'fixture-secret-password',unprivileged:'0'};assert.equal((await call('/proxmox/ct','operator',ct)).status,403);
 const challenge=await call('/proxmox/ct','owner',ct);assert.equal(challenge.status,409);assert.ok(challenge.body.confirmationPhrase);assert.ok(!JSON.stringify(challenge.body).includes(ct.password));
 assert.equal((await call('/proxmox/vm','operator',{name:'fixture',node:'n1',storage:'local',addHa:'1'})).status,403);const ha=await call('/proxmox/creation/unknown/ha','owner',{});assert.equal(ha.status,409);assert.ok(ha.body.confirmationPhrase);
 }finally{await new Promise(r=>server.close(r));fs.rmSync(process.env.DATA_DIR,{recursive:true,force:true});}
});
