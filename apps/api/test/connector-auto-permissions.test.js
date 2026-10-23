import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'connector-auto-'));process.env.JWT_SECRET='a'.repeat(64);process.env.JWT_REFRESH_SECRET='b'.repeat(64);
const a=await import('../src/node-agents.js');
test('automatic update lease drains work, keeps subsequent reads queued and never interrupts a management operation',async()=>{
 const pair=a.pairNode(a.createPairing().code,'node'),identity=a.authenticateAgent(pair.token),report={version:9,hosts:[{id:'node',name:'node',online:true}],results:[]};a.pollAgent(identity,report);
 try{const read=a.agentContext.run({host:pair.id+':node'},()=>a.agentRequest('/info'));assert.throws(()=>a.beginAutomaticConnectorUpdate(pair.id),/busy/);let job=a.pollAgent(identity,report).jobs[0];a.pollAgent(identity,{...report,results:[{id:job.id,status:200,body:Buffer.from('{}').toString('base64')}]});await read;
 a.beginAutomaticConnectorUpdate(pair.id);const queued=a.agentContext.run({host:pair.id+':node'},()=>a.agentRequest('/version'));assert.deepEqual(a.pollAgent(identity,report).jobs,[]);await assert.rejects(()=>a.agentContext.run({host:pair.id+':node'},()=>a.agentRequest('/containers/x/stop',{method:'POST'})),/update is in progress/);a.endConnectorUpdate(pair.id);job=a.pollAgent(identity,report).jobs[0];assert.ok(job);assert.equal(job.path,'/version');a.pollAgent(identity,{...report,results:[{id:job.id,status:200,body:Buffer.from('{}').toString('base64')}]});await queued;
 }finally{a.endConnectorUpdate(pair.id);a.revokeAgent(pair.id)}
});
test('only owners may opt a registered connector into automatic updates and approval is required',async()=>{
 const {createApp}=await import('../src/app.js'),{requireRole}=await import('../src/security.js');const pair=a.pairNode(a.createPairing().code,'permissions');
 const app=createApp({authenticate:(req,res,next)=>{req.user={sub:'owner',role:req.headers['x-role']||'viewer'};next()},authorize:requireRole,audit:async()=>{},monitor:{sample:async()=>({}),invalidate:()=>{}},db:{query:async()=>({rows:[]})}}),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const url=`http://127.0.0.1:${server.address().port}/api/node-agents/${pair.id}/automatic-updates`;
 try{for(const role of ['viewer','operator','admin'])for(const method of ['GET','PUT'])assert.equal((await fetch(url,{method,headers:{'x-role':role,'Content-Type':'application/json'},...(method==='PUT'?{body:'{"enabled":true,"confirm":true}'}:{})})).status,403);
 const write=body=>fetch(url,{method:'PUT',headers:{'x-role':'owner','Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal((await write({enabled:true})).status,400);assert.equal((await write({enabled:true,confirm:true})).status,200);assert.equal((await (await fetch(url,{headers:{'x-role':'owner'}})).json()).enabled,true);assert.equal((await write({enabled:false})).status,200);
 }finally{a.revokeAgent(pair.id);server.closeAllConnections();await new Promise(r=>server.close(r))}
});
