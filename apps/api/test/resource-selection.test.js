import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.JWT_SECRET='a'.repeat(64);process.env.JWT_REFRESH_SECRET='b'.repeat(64);
process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'homecloud-resource-selection-'));
for(const key of ['PROXMOX_URL','TRUENAS_URL','DOCKER_API_URL'])delete process.env[key];
const {createApp}=await import('../src/app.js');
const agents=await import('../src/node-agents.js');
const paired=agents.pairNode(agents.createPairing().code,'fixture-node'),identity=agents.authenticateAgent(paired.token);
const hosts=[{id:'lxc/101',name:'selected',online:true,status:'connected'}];
const answers={'/containers/json?all=1':[],'/images/json':[],'/info':{Name:'selected-engine',ID:'selected'},'/networks':[{Id:'selected-net',Name:'selected-network',IPAM:{Config:[]}}],'/volumes':{Volumes:[{Name:'selected-volume'}]}};
agents.pollAgent(identity,{hosts,results:[]});
const timer=setInterval(()=>{const pending=agents.pollAgent(identity,{hosts,results:[]}).jobs;
 if(pending.length)agents.pollAgent(identity,{hosts,results:pending.map(j=>({id:j.id,status:200,body:Buffer.from(JSON.stringify(answers[j.path]||{})).toString('base64')}))});},5);
const sample={sampledAt:new Date().toISOString(),services:[],alerts:[],docker:{host:{hostname:'direct'},volumes:[{name:'direct-volume'}],networks:[{name:'direct-network'}]}};
const app=createApp({authenticate:(req,res,next)=>{req.user={role:req.headers['x-role']||'owner'};next()},audit:async()=>{},
 monitor:{sample:async()=>sample,invalidate:async()=>{}},db:{query:async()=>({rows:[]})}});
const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
async function call(endpoint,host='',role='owner',method='GET'){
 const res=await fetch(`http://127.0.0.1:${server.address().port}/api${endpoint}`,{method,headers:{'X-HomeCloud-Docker-Host':host,'X-Role':role,'Content-Type':'application/json'},...(method==='GET'?{}:{body:'{"channel":"discord"}'})});return {status:res.status,body:await res.json()};
}
try{
 await test('Storage and Network select agent resources rather than the cached direct Engine',async()=>{
  const host=paired.id+':lxc/101';const storage=await call('/storage',host),network=await call('/network',host);
  assert.equal(storage.body.volumes[0].name,'selected-volume');assert.equal(network.body.networks[0].name,'selected-network');
  assert.equal(storage.body.dockerHost.id,host);assert.equal(network.body.dockerHost.name,'selected-engine');
  assert.equal((await call('/storage')).body.volumes[0].name,'direct-volume');
 });
 await test('offline selections return explicit errors and never substitute the direct Engine',async()=>{
  const r=await call('/storage','missing:host');assert.equal(r.status,200);assert.deepEqual(r.body.volumes,[]);assert.ok(r.body.errors.some(e=>e.includes('no other host')));
 });
 await test('provider diagnostics and notification tests are owner-only',async()=>{
  assert.equal((await call('/diagnostics','','admin')).status,403);
  assert.equal((await call('/notifications','','viewer')).status,403);
  assert.equal((await call('/notifications/test','','admin','POST')).status,403);
 });
}finally{clearInterval(timer);agents.revokeAgent(paired.id);await new Promise(resolve=>server.close(resolve));fs.rmSync(process.env.DATA_DIR,{recursive:true,force:true});}
