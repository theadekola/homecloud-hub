import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'docker-setup-routes-'));process.env.JWT_SECRET='a'.repeat(64);process.env.JWT_REFRESH_SECRET='b'.repeat(64);delete process.env.DOCKER_API_URL;
const {createApp}=await import('../src/app.js');const {requireRole}=await import('../src/security.js');
test('Direct Engine verification is owner-only, read-only and separate from paired-host selection',async()=>{
 let engineFails=false;const requests=[],engine=http.createServer((req,res)=>{requests.push({method:req.method,path:req.url});if(engineFails)res.statusCode=503;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({Name:'fixture-engine',ServerVersion:'test'}));});await new Promise(r=>engine.listen(0,'127.0.0.1',r));
 const audits=[];const app=createApp({authenticate:(req,res,next)=>{req.user={sub:'fixture',role:req.headers['x-role']||'owner'};next()},authorize:requireRole,audit:async(...args)=>audits.push(args),monitor:{invalidate:async()=>{},sample:async()=>({services:[]})},db:{query:async()=>({rows:[]})}});const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const url=`http://127.0.0.1:${server.address().port}/api`;
 const call=async(p,role='owner',init={})=>{const r=await fetch(url+p,{...init,headers:{'x-role':role,'content-type':'application/json','x-homecloud-docker-host':'unrelated-agent',...init.headers}});return {status:r.status,body:await r.json()}};
 try{
  assert.equal((await call('/connections/docker/verify','viewer')).status,403);
  assert.equal((await call('/connections/proxmox/verify','viewer')).status,403);
  assert.equal((await call('/connections/proxmox/verify')).body.status,'not-configured');
  assert.equal((await call('/node-agents/pairing','admin',{method:'POST',body:'{}'})).status,403);
  assert.equal((await call('/node-agents/pairing/status','viewer',{method:'POST',body:'{}'})).status,403);
  const pairing=await call('/node-agents/pairing','owner',{method:'POST',body:JSON.stringify({kind:'docker',name:'Media Server'})});assert.equal(pairing.body.kind,'docker');
  const pending=await call('/node-agents/pairing/status','owner',{method:'POST',body:JSON.stringify({code:pairing.body.code})});assert.equal(pending.body.paired,false);
  assert.ok(!JSON.stringify(audits.map(args=>args.slice(1))).includes(pairing.body.code));audits.length=0;
  assert.equal((await call('/node-agents/pairing/status','owner',{method:'POST',body:'{"code":"unknown"}'})).status,401);
  for(const path of ['/docker-agent/install','/node-agent/download']){const response=await fetch(url+path);assert.equal(response.status,200);assert.ok((await response.text()).includes(path.endsWith('install')?'No Docker TCP port':'--pair-stdin'));}

  const absent=await call('/connections/docker/verify');assert.equal(absent.body.status,'not-configured');assert.equal(requests.length,0);
  process.env.DOCKER_API_URL=`http://127.0.0.1:${engine.address().port}`;const found=await call('/connections/docker/verify');assert.equal(found.body.status,'reachable');assert.equal(found.body.host.hostname,'fixture-engine');assert.deepEqual(requests,[{method:'GET',path:'/info'}]);assert.equal(audits.length,0);assert.equal(fs.existsSync(path.join(process.env.DATA_DIR,'docker-connection.json')),false);
  const unknown=await call('/docker/hosts/missing/verify');assert.equal(unknown.status,503);assert.equal(requests.length,1);engineFails=true;const failed=await call('/connections/docker/verify');assert.equal(failed.body.status,'error');assert.equal(failed.body.configured,true);assert.ok(requests.every(r=>r.method==='GET'));
  assert.equal((await call('/node-agents/guest/bootstrap','admin',{method:'POST',body:'{}'})).status,403);
  const challenge=await call('/node-agents/guest/bootstrap','owner',{method:'POST',body:JSON.stringify({node:'n1',vmid:'101',password:'fixture-secret'})});assert.equal(challenge.status,409);assert.ok(challenge.body.confirmationPhrase);assert.ok(!JSON.stringify(challenge.body).includes('fixture-secret'));assert.equal(audits.length,0);
 }finally{delete process.env.DOCKER_API_URL;await new Promise(r=>server.close(r));await new Promise(r=>engine.close(r));fs.rmSync(process.env.DATA_DIR,{recursive:true,force:true});}
});
