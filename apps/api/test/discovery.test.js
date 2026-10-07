import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
fs.mkdirSync('runtime',{recursive:true});
process.env.DATA_DIR=fs.mkdtempSync(path.resolve('runtime/hub-discovery-'));
process.env.JWT_SECRET='test-discovery-secret'.repeat(4);
process.env.JWT_REFRESH_SECRET='test-refresh-secret'.repeat(4);
const {discoveryKey,authorizeDiscovery,recordReport,discovered}=await import('../src/discovery.js');
const {mutate}=await import('../src/store.js');
test('discovery accepts enrolled reports, records software and marks old reports stale',()=>{
 assert.equal(authorizeDiscovery('Bearer wrong'),false);assert.equal(authorizeDiscovery(`Bearer ${discoveryKey()}`),true);
 assert.throws(()=>recordReport({}),{status:400});
 recordReport({id:'actual-node',hostname:'vm01',os:'Ubuntu',services:[{name:'nginx.service',status:'running'}],packages:[{name:'nginx',version:'1.24'}],containers:[{id:'actual',name:'nextcloud',image:'nextcloud:apache',status:'running'}]});
 let result=discovered({proxmox:{vms:[{id:'101',name:'actual-vm',node:'pve',type:'qemu',status:'running'}],lxc:[]}});
 assert.equal(result.resources.length,3);assert.equal(result.resources[1].name,'nginx.service');assert.equal(result.reports[0].packages[0].name,'nginx');
 mutate(s=>s.discovery['actual-node'].receivedAt='2000-01-01T00:00:00Z');result=discovered({});assert.equal(result.resources[0].status,'stale');assert.equal(result.reports[0].status,'stale');
});
test('discovery enrollment is owner-only and reports do not accept session tokens',async()=>{
 const {createApp}=await import('../src/app.js');const {requireRole}=await import('../src/security.js');
 const server=createApp({authenticate:(req,res,next)=>{req.user={role:req.headers['x-role']||'viewer'};next();},authorize:requireRole,audit:async()=>{},monitor:{invalidate:async()=>{}},db:{}}).listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}/api`;
 try{assert.equal((await fetch(base+'/discovery/enrollment')).status,403);assert.equal((await fetch(base+'/discovery/enrollment',{headers:{'x-role':'owner'}})).status,200);assert.equal((await fetch(base+'/discovery/report',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);}finally{await new Promise(resolve=>server.close(resolve));}
});
