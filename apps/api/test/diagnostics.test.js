import test from 'node:test';
import assert from 'node:assert/strict';
import {providerDiagnostics} from '../src/diagnostics.js';
const names=['proxmox','docker','truenas','opnsense','tailscale'];
const sources=Object.fromEntries(names.map(n=>[n,{configured:()=>true}]));
test('diagnostics only call read endpoints and retain provider failures independently',async()=>{
 const calls=[];
 const r=await providerDiagnostics({sources,hosts:()=>[],query:async p=>{calls.push(p);return p==='/version'?{version:'9'}:[]},
  tn:async m=>{calls.push(m);if(m==='sharing.nfs.query')throw Error('secret-bearing upstream error');return m==='system.info'?{version:'25'}:m==='filesystem.stat'?{type:'DIRECTORY'}:[]},
  engine:async(p,init)=>{assert.equal(init.method,undefined);calls.push(p);return p==='/version'?{Version:'29'}:p==='/volumes'?{Volumes:[]}:[]},
  firewall:async p=>{calls.push(p);return p.endsWith('search')?{rows:[]}:{}},vpn:async p=>{calls.push(p);return {devices:[]}}});
 assert.equal(r.writesVerified,false);assert.equal(r.checks.filter(c=>c.status==='failed').length,1);assert.equal(r.versions.proxmox,'9');
 assert.ok(!JSON.stringify(r).includes('secret-bearing'));assert.ok(!calls.some(c=>/create|update|delete|rollback|setperm/.test(c)));
});
test('unconfigured providers are not contacted and incompatible response shapes fail',async()=>{
 const empty=Object.fromEntries(names.map(n=>[n,{configured:()=>false}]));
 const r=await providerDiagnostics({sources:empty,hosts:()=>[],query:async()=>{throw Error('must not call')}});assert.deepEqual(r.checks,[]);
 const bad=await providerDiagnostics({sources:{...empty,proxmox:{configured:()=>true}},hosts:()=>[],query:async()=>null});assert.ok(bad.checks.every(c=>c.status==='failed'));
});
