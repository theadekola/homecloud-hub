import test from 'node:test';import assert from 'node:assert/strict';
import {verifyProxmoxManagement} from '../src/proxmox-management-access.js';
const privileges=['Sys.Audit','VM.Audit','VM.Allocate','VM.PowerMgmt','VM.Config.CPU','VM.Config.Memory','VM.Config.Disk','VM.Config.Network','VM.Config.Options','Datastore.Audit','Datastore.AllocateSpace'];
const allowed=Object.fromEntries(privileges.map(p=>[p,1]));
const resources=[{type:'node',node:'pve'},{type:'qemu',vmid:100},{type:'lxc',vmid:200},{type:'storage',id:'local'}];
const pathOf=url=>new URL(url,'https://fixture.test').searchParams.get('path');
test('PVEAdmin-equivalent access verifies nodes, VMs and CTs using only the candidate token',async()=>{
 const candidate={tokenId:'app@pve!hub',tokenSecret:'secret'},paths=[];
 const result=await verifyProxmoxManagement(candidate,resources,async(url,options,config)=>{assert.equal(config,candidate);assert.deepEqual(options,{});const path=pathOf(url);paths.push(path);return {[path]:allowed}});
 assert.deepEqual(result,{verified:true,power:true,configuration:true,nodeCount:1,guestCount:2});assert.deepEqual(paths.sort(),['/','/nodes/pve','/vms/100','/vms/200']);
});
test('read-only or non-propagating root roles fail with the two PVEAdmin assignments explained',async()=>{
 for(const root of [{'Sys.Audit':1,'VM.Audit':1},{...allowed,'VM.PowerMgmt':0}])await assert.rejects(()=>verifyProxmoxManagement({},resources,async()=>({'/':root})),error=>error.status===403&&/PVEAdmin.*Propagate.*both the user/.test(error.message));
});
test('more-specific guest and node denials block save even when root permissions look complete',async()=>{
 for(const denied of ['/nodes/pve','/vms/100','/vms/200'])await assert.rejects(()=>verifyProxmoxManagement({},resources,async url=>{const path=pathOf(url);return {[path]:path===denied?{}:allowed}}),error=>error.status===403&&error.message.includes(denied));
});
test('non-propagating guest grants remain valid while malformed and unavailable permission reports fail',async()=>{
 assert.equal((await verifyProxmoxManagement({},resources,async url=>{const path=pathOf(url);return {[path]:path==='/'?allowed:Object.fromEntries(privileges.map(p=>[p,0]))}})).verified,true);
 for(const result of [null,{}, {'/':[]},{'/':{...allowed,'VM.PowerMgmt':'yes'}}])await assert.rejects(()=>verifyProxmoxManagement({},resources,async()=>result));
 await assert.rejects(()=>verifyProxmoxManagement({},resources,async()=>{throw Error('secret upstream error')}),error=>error.status===502&&!error.message.includes('secret upstream'));
});
test('an empty cluster still verifies inherited management for future guests',async()=>{
 const result=await verifyProxmoxManagement({},[{type:'node',node:'pve'}],async url=>({[pathOf(url)]:allowed}));assert.equal(result.guestCount,0);assert.equal(result.power,true);
});
