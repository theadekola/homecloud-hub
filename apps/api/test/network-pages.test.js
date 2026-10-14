import test from 'node:test';import assert from 'node:assert/strict';
import {networkDnsWrite} from '../src/network.js';
const baseline={search:'example.test',dns1:'192.0.2.1',dns2:'2001:db8::1',dns3:''};
test('DNS partial updates preserve omitted resolvers while explicitly empty fields remove them',async()=>{
 const writes=[],query=async p=>{assert.equal(p,'/nodes/a/dns');return baseline},write=async(p,method,body)=>writes.push({p,method,body});
 await networkDnsWrite('a',{search:'new.test'},query,write);
 assert.deepEqual(writes[0],{p:'/nodes/a/dns',method:'PUT',body:{search:'new.test',dns1:'192.0.2.1',dns2:'2001:db8::1'}});
 await networkDnsWrite('a',{...baseline,dns2:'',expectedConfig:baseline},query,write);
 assert.deepEqual(writes[1].body,{search:'example.test',dns1:'192.0.2.1'});
 await networkDnsWrite('a',{...baseline,dns1:'',dns2:''},query,write);assert.deepEqual(writes[2].body,{search:'example.test'});
});
test('stale, unavailable and malformed DNS edits never perform writes',async()=>{
 let writes=0;const write=async()=>{writes++};
 await assert.rejects(networkDnsWrite('a',{...baseline,expectedConfig:baseline},async()=>({...baseline,dns1:'192.0.2.2'}),write),{status:409});
 for(const input of [{dns1:'bad'}, {search:'bad\nexample'}, {search:''},{expectedConfig:{}},{dns1:42},{expectedConfig:{...baseline,dns1:null}}])await assert.rejects(networkDnsWrite('a',input,async()=>baseline,write),{status:400});
 await assert.rejects(networkDnsWrite('a',baseline,async()=>null,write),{status:502});
 await assert.rejects(networkDnsWrite('a',baseline,async()=>{throw Error('Node offline')},write),/offline/);assert.equal(writes,0);
});
test('Firewall section failures remain null with diagnostics while genuine empty results stay empty',async()=>{
 const {networkFirewall}=await import('../src/network.js'),calls=[];
 const result=await networkFirewall('a',async p=>{calls.push(p);if(p.endsWith('/options'))return {enable:1};if(p.endsWith('/rules'))throw Error('Permission denied');return null});
 assert.equal(result.rules,null);assert.equal(result.logs,null);assert.deepEqual(result.options,{enable:1});assert.equal(result.errors.length,2);assert.ok(calls.every(p=>p.startsWith('/nodes/a/firewall/')));
 const empty=await networkFirewall('a',async p=>p.endsWith('/options')?{enable:0}:[]);assert.deepEqual(empty.rules,[]);assert.deepEqual(empty.logs,[]);assert.deepEqual(empty.errors,[]);
});
