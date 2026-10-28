import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {updateBridge} from '../src/updates.js';
test('updates reject absent or stale host workers and queue only one request',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hub-updates-'));
 try{const bridge=updateBridge(dir);assert.equal(bridge.status().enabled,false);assert.throws(()=>bridge.request(),{status:503});
 const write=(extra={})=>fs.writeFileSync(path.join(dir,'update-status.json'),JSON.stringify({checkedAt:new Date().toISOString(),available:true,state:'ready',...extra}));
 write({checkedAt:'2000-01-01T00:00:00Z'});assert.throws(()=>bridge.request(),{status:503});
 write({available:false});assert.throws(()=>bridge.request(),{status:409});
 write();const check=bridge.check();assert.equal(check.state,'checking');assert.ok(check.checkId);assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'update-check.json'))).checkId,check.checkId);assert.equal(bridge.status().checking,true);assert.ok(fs.existsSync(path.join(dir,'update-check.json')));assert.equal(bridge.request().state,'queued');assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'update-request.json'))),{});assert.throws(()=>bridge.request(),{status:409});
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('stale updater status is diagnosed while a check can wake its configured worker',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'iclusters-stale-worker-'));try{fs.writeFileSync(path.join(dir,'update-status.json'),JSON.stringify({checkedAt:'2000-01-01T00:00:00Z',available:true,state:'ready',message:'A new update is available.'}));const bridge=updateBridge(dir),status=bridge.status();assert.equal(status.configured,true);assert.equal(status.enabled,false);assert.equal(status.available,true);assert.equal(status.state,'unavailable');assert.match(status.message,/has not reported/);assert.throws(()=>bridge.request(),{status:503});assert.equal(bridge.check().state,'checking');assert.ok(fs.existsSync(path.join(dir,'update-check.json')));}finally{fs.rmSync(dir,{recursive:true,force:true})}
});
