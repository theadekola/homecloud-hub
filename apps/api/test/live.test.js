import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.JWT_SECRET='a'.repeat(64);
process.env.JWT_REFRESH_SECRET='b'.repeat(64);
process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'homecloud-live-test-'));
const requests=[];
const upstream=http.createServer(async(req,res)=>{
 let raw='';for await(const chunk of req)raw+=chunk;
 const body=Object.fromEntries(new URLSearchParams(raw));requests.push({path:req.url,method:req.method,body});
 let data;
 if(req.url==='/api2/json/cluster/resources')data=[{type:'node',node:'pve',status:'online',cpu:0.42,mem:4,maxmem:8,maxcpu:4,uptime:1000},{type:'qemu',node:'pve',vmid:101,name:'actual-guest',status:'running',cpu:0.1,mem:2,maxmem:4},{type:'storage',id:'storage/pve/backup',node:'pve',storage:'backup',status:'available',disk:50,maxdisk:100}];
 else if(req.url==='/api2/json/cluster/backup'&&req.method==='GET')data=[{id:'job',comment:'Real job',node:'pve',vmid:'101',storage:'backup',schedule:'02:00',enabled:1}];
 else if(req.url==='/api2/json/cluster/backup/job')data=req.method==='GET'?{id:'job',node:'pve',vmid:'101',storage:'backup',mode:'snapshot',enabled:1}:null;
 else if(req.url==='/api2/json/nodes')data=[{node:'pve',status:'online'}];
 else if(req.url==='/api2/json/nodes/pve/storage?content=backup')data=[{storage:'backup',active:1}];
 else if(req.url==='/api2/json/nodes/pve/storage/backup/content?content=backup')data=[{volid:'backup:backup/vzdump-qemu-101.vma.zst',subtype:'qemu',vmid:101,size:1234,ctime:1700000000}];
 else if(req.url==='/api2/json/cluster/backup'&&req.method==='POST')data=null;
 else if(req.url.includes('/vzdump')||req.url==='/api2/json/nodes/pve/qemu'||req.url.includes('/prunebackups')||req.url.includes('/status/start'))data='UPID:real-task';
 else {res.statusCode=404;data=null;}
 res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data}));
});
await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));
process.env.PROXMOX_URL=`http://127.0.0.1:${upstream.address().port}`;
process.env.PROXMOX_TOKEN_ID='test@pve!test';process.env.PROXMOX_TOKEN_SECRET='test';
const {createApp}=await import('../src/app.js');
const {requireRole}=await import('../src/security.js');
const {createMonitor}=await import('../src/monitor.js');
const {proxmoxSnapshot}=await import('../src/connectors.js');
const {restoreArchive,retention}=await import('../src/infrastructure.js');
const audit=[];
const noData={sampledAt:new Date().toISOString(),services:[{name:'docker',provider:'docker',status:'not-configured'}],hosts:[],metrics:[],alerts:[]};
const app=createApp({authenticate:(req,res,next)=>{req.user={sub:'user',email:'owner@test',name:'Test',role:req.headers['x-test-role']||'owner'};next();},authorize:requireRole,audit:async(...args)=>audit.push(args),monitor:{sample:async()=>structuredClone(noData),invalidate:()=>{}},db:{query:async()=>({rows:[],rowCount:0})}});
const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
const url=`http://127.0.0.1:${server.address().port}`;
async function call(endpoint,method='GET',body,headers={}){const response=await fetch(`${url}/api${endpoint}`,{method,headers:{'Content-Type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()};}
try{
 await test('unconfigured dashboard does not invent VM counts, health scores or history',async()=>{
   const response=await call('/dashboard');assert.equal(response.status,200);assert.equal(response.body.stats.vms,null);assert.equal(response.body.stats.containers,null);assert.equal(response.body.stats.health,undefined);assert.deepEqual(response.body.metrics,[]);
   const missing=await call('/docker');assert.equal(missing.status,503);assert.match(missing.body.error,/not configured/);
 });
 await test('Proxmox metrics come from resource measurements',async()=>{
   const result=await proxmoxSnapshot();assert.equal(result.nodes[0].cpu,42);assert.equal(result.nodes[0].memoryPercent,50);assert.equal(result.vms[0].name,'actual-guest');assert.equal(result.storage[0].usage,50);
 });
 await test('schedule creation writes provider configuration and running a job returns a task',async()=>{
   const response=await call('/schedules','POST',{name:'Nightly',node:'pve',vmid:'101',storage:'backup',schedule:'02:00',retention:'keep-last=7'});
   assert.equal(response.status,200);const sent=requests.find(r=>r.path==='/api2/json/cluster/backup'&&r.method==='POST');assert.equal(sent.body.schedule,'02:00');assert.equal(sent.body['prune-backups'],'keep-last=7');
   const run=await call('/backups/job/run','POST',{});assert.equal(run.status,200);assert.equal(run.body.result.task,'UPID:real-task');assert.match(run.body.message,/accepted/);assert.equal(audit.at(-1)[4],'queued');
   const viewer=await call('/schedules','POST',{},{'x-test-role':'viewer'});assert.equal(viewer.status,403);
 });
 await test('restore refuses existing VM IDs and uses the real archive for a new guest',async()=>{
   const points=(await call('/backups')).body.points;
   await assert.rejects(restoreArchive(points[0].id,{vmid:101,node:'pve',storage:'local-lvm'}),/already exists/);
   const result=await restoreArchive(points[0].id,{vmid:202,node:'pve',storage:'local-lvm'});assert.equal(result.task,'UPID:real-task');
   const request=requests.findLast(r=>r.path==='/api2/json/nodes/pve/qemu');assert.equal(request.body.archive,'backup:backup/vzdump-qemu-101.vma.zst');assert.equal(request.body.force,'0');
 });
 await test('cleanup needs payload-bound confirmation and rejects retain-nothing policies',async()=>{
   assert.throws(()=>retention('keep-last=0'),/at least one/);
   const body={node:'pve',storage:'backup',rule:'keep-last=7'};const first=await call('/retention/run','POST',body);assert.equal(first.status,409);
   const changed=await call('/retention/run','POST',{...body,rule:'keep-last=1'},{'X-HomeCloud-Confirm':first.body.confirmationPhrase});assert.equal(changed.status,409);
   const approved=await call('/retention/run','POST',body,{'X-HomeCloud-Confirm':first.body.confirmationPhrase});assert.equal(approved.status,200);assert.equal(approved.body.result.task,'UPID:real-task');
   assert.ok(requests.some(r=>r.method==='DELETE'&&r.path.includes('/prunebackups?')));
 });
 await test('monitor handles unknown data, evaluates thresholds and preserves unresolved alerts during outages',async()=>{
   let failing=false,cpu=95;const state={metrics:[],alerts:[],rules:[{id:'cpu',name:'High CPU',metric:'cpu',provider:'proxmox',severity:'warning',threshold:90}]};
   const monitor=createMonitor({proxmox:{configured:()=>true,read:async()=>{if(failing)throw new Error('unreachable');return {nodes:[{id:'pve',name:'pve',status:'online',cpu,memory:55}],vms:[],storage:[]};}},docker:{configured:()=>false,read:async()=>{throw new Error('must not call');}}},{get:()=>state,mutate:fn=>fn(state)},async()=>[]);
   const measured=await monitor.sample(true);assert.equal(measured.metrics.at(-1).cpu,95);assert.equal(state.alerts[0].status,'active');
   failing=true;await monitor.sample(true);assert.equal(state.metrics.at(-1).cpu,null);assert.equal(state.alerts.find(a=>a.key.startsWith('rule:')).status,'active');
   failing=false;cpu=20;await monitor.sample(true);assert.equal(state.alerts.find(a=>a.key.startsWith('rule:')).status,'resolved');
 });
}finally{await new Promise(resolve=>server.close(resolve));await new Promise(resolve=>upstream.close(resolve));}
