import test from 'node:test';
import assert from 'node:assert/strict';
import {providerDiagnostics} from '../src/diagnostics.js';
const names=['proxmox','docker','truenas'];
const sources=Object.fromEntries(names.map(n=>[n,{configured:()=>true}]));
test('diagnostics only call read endpoints and retain provider failures independently',async()=>{
 const calls=[];
 const r=await providerDiagnostics({sources,hosts:()=>[],query:async p=>{calls.push(p);return p==='/version'?{version:'9'}:[]},
  tn:async m=>{calls.push(m);if(m==='sharing.nfs.query')throw Error('secret-bearing upstream error');return m==='system.info'?{version:'25'}:m==='filesystem.stat'?{type:'DIRECTORY'}:[]},
  engine:async(p,init)=>{assert.equal(init.method,undefined);calls.push(p);return p==='/version'?{Version:'29'}:p==='/volumes'?{Volumes:[]}:[]}});
 assert.equal(r.writesVerified,false);assert.equal(r.checks.filter(c=>c.status==='failed').length,1);assert.equal(r.versions.proxmox,'9');
 assert.ok(!JSON.stringify(r).includes('secret-bearing'));assert.ok(!calls.some(c=>/create|update|delete|rollback|setperm/.test(c)));
});
test('unconfigured providers are not contacted and incompatible response shapes fail',async()=>{
 const empty=Object.fromEntries(names.map(n=>[n,{configured:()=>false}]));
 const r=await providerDiagnostics({sources:empty,hosts:()=>[],query:async()=>{throw Error('must not call')}});assert.deepEqual(r.checks,[]);
 const bad=await providerDiagnostics({sources:{...empty,proxmox:{configured:()=>true}},hosts:()=>[],query:async()=>null});assert.ok(bad.checks.every(c=>c.status==='failed'));
});

test('diagnostics finish within their overall budget and retain unattempted checks honestly',async()=>{
 const started=Date.now(),disabled=Object.fromEntries(names.map(n=>[n,{configured:()=>false}]));
 const result=await providerDiagnostics({sources:disabled,hosts:()=>Array.from({length:8},(_,i)=>({id:'node:qemu/'+i,agent:'node',online:true})),engine:async()=>new Promise(()=>{}),budgetMs:35,checkTimeoutMs:10});
 assert.ok(Date.now()-started<1000);assert.equal(result.complete,false);assert.equal(result.checks.length,32);assert.ok(result.checks.some(c=>c.status==='failed'&&c.message.includes('timed out')));assert.ok(result.checks.some(c=>c.status==='not-checked'));assert.ok(result.checks.every(c=>c.status!=='passed'));
});
test('diagnostics bound concurrent reads globally and per paired node',async()=>{
 const {selectedAgentHost}=await import('../src/node-agents.js');let active=0,maximum=0;const perNode=new Map(),maxByNode=new Map();const disabled=Object.fromEntries(names.map(n=>[n,{configured:()=>false}]));
 const result=await providerDiagnostics({sources:disabled,hosts:()=>Array.from({length:6},(_,i)=>({id:(i<3?'a':'b')+':qemu/'+i,agent:i<3?'a':'b',online:true})),engine:async route=>{const node=selectedAgentHost().split(':')[0];active++;maximum=Math.max(maximum,active);perNode.set(node,(perNode.get(node)||0)+1);maxByNode.set(node,Math.max(maxByNode.get(node)||0,perNode.get(node)));await new Promise(r=>setTimeout(r,1));active--;perNode.set(node,perNode.get(node)-1);return route==='/version'?{Version:'29'}:route==='/volumes'?{Volumes:[]}:[]}});
 assert.ok(maximum<=4);assert.ok([...maxByNode.values()].every(n=>n<=2));assert.equal(result.checks.length,24);assert.ok(result.checks.every(c=>c.status==='passed'));
});
test('a focused Docker diagnostic reads only the selected known Engine and rejects unknown targets',async()=>{
 const {selectedAgentHost}=await import('../src/node-agents.js'),calls=[];const options={sources,hosts:()=>[{id:'a:qemu/1',online:true},{id:'b:qemu/2',online:true}],query:async()=>{throw Error('must not read Proxmox')},tn:async()=>{throw Error('must not read TrueNAS')},engine:async route=>{calls.push(selectedAgentHost());return route==='/version'?{Version:'29'}:route==='/volumes'?{Volumes:[]}:[]}};
 const result=await providerDiagnostics({...options,hostId:'b:qemu/2'});assert.equal(result.checks.length,4);assert.deepEqual([...new Set(calls)],['b:qemu/2']);assert.equal(result.scope,'selected-docker-host');await assert.rejects(()=>providerDiagnostics({...options,hostId:'unknown'}),e=>e.status===400);assert.equal(calls.length,4);
});
