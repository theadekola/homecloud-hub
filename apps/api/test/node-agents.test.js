import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'node-agents-'));
const a=await import('../src/node-agents.js');
test('node pairing is single use, credentials are hashed, requests stay bound to the selected agent',async()=>{
 const pairing=a.createPairing(),node=a.pairNode(pairing.code,'pve-test');assert.throws(()=>a.pairNode(pairing.code,'pve-other'));assert.throws(()=>a.authenticateAgent('wrong'));
 const identity=a.authenticateAgent(node.token);assert.equal(identity.id,node.id);assert.ok(!fs.readFileSync(path.join(process.env.DATA_DIR,'live-state.json'),'utf8').includes(node.token));
 a.pollAgent(identity,{hosts:[{id:'lxc/130',name:'docker-ct',online:true}],results:[]});
 let promise;a.agentContext.run({host:node.id+':lxc/130'},()=>{promise=a.agentRequest('/info')});
 const work=a.pollAgent(identity,{hosts:[{id:'lxc/130',online:true}],results:[]}).jobs;assert.equal(work.length,1);assert.equal(work[0].host,'lxc/130');
 a.pollAgent(identity,{hosts:[{id:'lxc/130',online:true}],results:[{id:work[0].id,status:200,body:Buffer.from('{"Name":"actual-host"}').toString('base64')}]});assert.equal((await(await promise).json()).Name,'actual-host');
 await assert.rejects(()=>a.agentContext.run({host:node.id+':lxc/130'},()=>a.agentRequest('/../../host-command')),/Unsupported/);
 a.revokeAgent(node.id);assert.throws(()=>a.authenticateAgent(node.token));assert.equal(a.agentHosts().length,0);
});
