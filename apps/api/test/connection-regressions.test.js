import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
process.env.JWT_SECRET='a'.repeat(64);process.env.JWT_REFRESH_SECRET='b'.repeat(64);
process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'homecloud-connections-'));
for(const key of ['PROXMOX_URL','TRUENAS_URL','DOCKER_API_URL'])delete process.env[key];
const {createApp}=await import('../src/app.js');
const {createMonitor}=await import('../src/monitor.js');
const {agentContext,selectedAgentHost}=await import('../src/node-agents.js');
const {pool}=await import('../src/db.js');
const {default:bcrypt}=await import('bcryptjs');
const empty={sampledAt:new Date().toISOString(),services:[],hosts:[],metrics:[],alerts:[]};
let createdArgs;
const password='  a long exact password  ',hash=await bcrypt.hash(password,4);
pool.query=async(sql,args)=>{
 if(sql.startsWith('SELECT * FROM users'))return {rowCount:1,rows:[{id:'owner',email:'owner@test',name:'Owner',role:'owner',password_hash:hash}]};
 return {rowCount:1,rows:[]};
};
const app=createApp({authenticate:(req,res,next)=>{req.user={sub:'owner',role:'owner'};next()},
 audit:async()=>{},monitor:{sample:async()=>structuredClone(empty),invalidate:async()=>{}},
 db:{query:async(sql,args)=>{if(sql.startsWith('INSERT INTO users'))createdArgs=args;return {rows:[{id:'new-user'}],rowCount:1}}}});
const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
const base=`http://127.0.0.1:${server.address().port}/api`;
async function call(endpoint,method='GET',body={},headers={}){
 const res=await fetch(base+endpoint,{method,headers:{'Content-Type':'application/json',...headers},...(method==='GET'?{}:{body:JSON.stringify(body)})});
 return {status:res.status,body:await res.json()};
}
try{
 await test('every destructive Docker endpoint binds confirmation to its selected host',async()=>{
  for(const [endpoint,method] of [['/docker/volume/data','DELETE'],['/docker/network/net','DELETE'],
   ['/docker/image/image','DELETE'],['/docker/prune/volumes','POST'],['/docker/stack/app/stop','POST'],
   ['/actions/docker/container/app/stop','POST']]){
   const a=await call(endpoint,method,{}, {'X-HomeCloud-Docker-Host':'node-a:lxc/101'});
   const b=await call(endpoint,method,{}, {'X-HomeCloud-Docker-Host':'node-b:lxc/101'});
   assert.equal(a.status,409);assert.equal(b.status,409);assert.notEqual(a.body.confirmationPhrase,b.body.confirmationPhrase);
   const replay=await call(endpoint,method,{}, {'X-HomeCloud-Docker-Host':'node-b:lxc/101','X-HomeCloud-Confirm':a.body.confirmationPhrase});
   assert.equal(replay.status,409);
  }
 });
 await test('global monitoring clears request host context without changing selected-host actions',async()=>{
  let observed;const state={rules:[],alerts:[],metrics:[]};
  const monitor=createMonitor({docker:{configured:()=>true,read:async()=>{observed=selectedAgentHost();return {host:{hostname:'direct'},containers:[]}}}},
   {get:()=>state,mutate:fn=>fn(state)},async()=>[]);
  await agentContext.run({host:'node-a:lxc/101'},async()=>{
   await monitor.sample(true);assert.equal(observed,'');assert.equal(selectedAgentHost(),'node-a:lxc/101');
  });
 });
 await test('backup page remains readable without a configured Proxmox provider',async()=>{
  const r=await call('/backups');assert.equal(r.status,200);assert.deepEqual(r.body.jobs,[]);assert.deepEqual(r.body.points,[]);
 });
 await test('backup archive failures retain successful job inventory',async()=>{
  const upstream=http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');
   if(req.url==='/api2/json/cluster/backup')res.end(JSON.stringify({data:[{id:'retained-job'}]}));
   else{res.statusCode=503;res.end(JSON.stringify({error:'archives offline'}));}});
  await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));
  process.env.PROXMOX_URL=`http://127.0.0.1:${upstream.address().port}`;
  process.env.PROXMOX_TOKEN_ID='fixture@pve!read';process.env.PROXMOX_TOKEN_SECRET='fixture';
  try{const r=await call('/backups');assert.equal(r.status,200);assert.equal(r.body.jobs[0].id,'retained-job');
   assert.deepEqual(r.body.points,[]);assert.ok(r.body.errors.some(e=>e.includes('503')));
  }finally{delete process.env.PROXMOX_URL;delete process.env.PROXMOX_TOKEN_ID;delete process.env.PROXMOX_TOKEN_SECRET;await new Promise(resolve=>upstream.close(resolve));}
 });
 await test('login compares the exact password including leading and trailing spaces',async()=>{
  const r=await call('/auth/login','POST',{email:'owner@test',password});assert.equal(r.status,200);assert.ok(r.body.accessToken);
  const wrong=await call('/auth/login','POST',{email:'owner@test',password:password.trim()});assert.equal(wrong.status,401);
 });
 await test('user creation stores normalized names and emails',async()=>{
  assert.equal((await call('/users','POST',{email:'  PERSON@Test  ',name:'  Person  ',password:'a-long-password'})).status,200);
  assert.equal(createdArgs[0],'person@test');assert.equal(createdArgs[1],'Person');
 });
}finally{await new Promise(resolve=>server.close(resolve));fs.rmSync(process.env.DATA_DIR,{recursive:true,force:true});}
