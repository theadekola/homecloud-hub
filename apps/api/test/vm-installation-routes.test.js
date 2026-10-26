import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.JWT_SECRET='a'.repeat(64);process.env.JWT_REFRESH_SECRET='b'.repeat(64);
process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'iclusters-vm-install-'));
const {createApp}=await import('../src/app.js');
const calls=[];
const upstream=http.createServer((req,res)=>{
 calls.push({url:req.url,method:req.method,authorization:req.headers.authorization});res.setHeader('Content-Type','application/json');
 const responses={
  '/api2/json/nodes/pve1/storage':[{storage:'local',active:1,enabled:1,content:'images,iso',avail:100*1024**3}],
  '/api2/json/nodes/pve1/storage/local/content?content=iso':[{content:'iso',volid:'local:iso/linux.iso'}],
  '/api2/json/cluster/nextid':321,
  '/api2/json/nodes/pve1/qemu':'UPID:fixture'
 };res.end(JSON.stringify({data:responses[req.url]}));
});
await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));
process.env.PROXMOX_URL=`http://127.0.0.1:${upstream.address().port}`;
process.env.PROXMOX_TOKEN_ID='fixture@pve!test';process.env.PROXMOX_TOKEN_SECRET='fixture-secret';
const audits=[];let invalidations=0;
const app=createApp({authenticate:(req,res,next)=>{if(!req.headers['x-test-role'])return res.status(401).json({error:'Authentication required'});req.user={sub:'fixture-user',role:req.headers['x-test-role']};next();},audit:async(...args)=>audits.push(args),monitor:{invalidate:()=>invalidations++}});
const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
const base=`http://127.0.0.1:${server.address().port}/api`;
try{
 await test('installation media and creation retain authentication and operator permissions',async()=>{
  for(const endpoint of ['/proxmox/installation-media/pve1','/proxmox/vm'])for(const role of ['', 'viewer','auditor']){
   const method=endpoint.endsWith('/vm')?'POST':'GET';const r=await fetch(base+endpoint,{method,headers:{'Content-Type':'application/json',...(role?{'x-test-role':role}:{})},...(method==='POST'?{body:'{}'}:{})});assert.equal(r.status,role?403:401);
  }
  assert.equal(calls.length,0);
 });
 await test('operator discovery is read-only and uses existing configured API-token authentication',async()=>{
  const r=await fetch(base+'/proxmox/installation-media/pve1',{headers:{'x-test-role':'operator'}});assert.equal(r.status,200);const data=await r.json();assert.equal(data.isos[0].volid,'local:iso/linux.iso');assert.equal(calls.length,2);assert.ok(calls.every(c=>c.method==='GET'&&c.authorization==='PVEAPIToken=fixture@pve!test=fixture-secret'));assert.equal(invalidations,0);assert.equal(audits.length,0);
 });
 await test('creation preserves queued task envelope, auditing and monitor invalidation',async()=>{
  const r=await fetch(base+'/proxmox/vm',{method:'POST',headers:{'Content-Type':'application/json','x-test-role':'operator'},body:JSON.stringify({name:'fixture',node:'pve1',storage:'local',iso:'local:iso/linux.iso'})});assert.equal(r.status,200);const data=await r.json();assert.equal(data.ok,true);assert.equal(data.result.vmid,'321');assert.equal(data.result.node,'pve1');assert.equal(data.result.installationReady,true);assert.equal(data.result.task,'UPID:fixture');assert.equal(invalidations,1);assert.equal(audits[0][1],'proxmox.vm.create');assert.equal(audits[0][4],'queued');assert.deepEqual(calls.filter(c=>c.method!=='GET').map(c=>c.url),['/api2/json/nodes/pve1/qemu']);
 });
}finally{await Promise.all([new Promise(resolve=>server.close(resolve)),new Promise(resolve=>upstream.close(resolve))]);fs.rmSync(process.env.DATA_DIR,{recursive:true,force:true});}
