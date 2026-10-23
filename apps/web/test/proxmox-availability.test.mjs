import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';
const built=await build({entryPoints:[new URL('../src/proxmox-availability.ts',import.meta.url).pathname],bundle:true,format:'esm',write:false});
const {proxmoxAvailability}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
test('available totals use paired live readings and never stale offline values',()=>{
 const view=proxmoxAvailability({nodes:[{name:'live',status:'online',cpu:25,cores:8,memoryBytes:4,memoryTotal:16},{name:'down',status:'offline',cpu:99,cores:99,memoryBytes:99,memoryTotal:999}],storage:[{node:'live',used:0,capacity:100,status:'online'},{node:'down',used:99,capacity:999,status:'online'}]});
 assert.equal(view.cpuUsed,2);assert.equal(view.cores,8);assert.equal(view.usedMemory,4);assert.equal(view.totalMemory,16);assert.equal(view.usedStorage,0);assert.equal(view.totalStorage,100);assert.equal(view.partial,true);assert.match(view.coverage,/1\/2 nodes online/);
});
test('missing metrics do not erase another node or become zero; invalid values are excluded',()=>{
 const view=proxmoxAvailability({nodes:[{name:'a',status:'online',cpu:0,cores:4,memoryBytes:0,memoryTotal:16},{name:'b',status:'online',cpu:NaN,cores:8,memoryBytes:5,memoryTotal:null}],storage:[{node:'a',status:'online',used:10,capacity:100},{node:'b',status:'online',used:null,capacity:200}]});
 assert.equal(view.cpuUsed,0);assert.equal(view.cores,4);assert.equal(view.usedMemory,0);assert.equal(view.totalMemory,16);assert.equal(view.usedStorage,10);assert.equal(view.totalStorage,100);assert.equal(view.partial,true);assert.match(view.coverage,/CPU 1\/2/);
 const missing=proxmoxAvailability({nodes:[{name:'a',status:'offline'}],storage:[]});assert.equal(missing.cpuUsed,null);assert.equal(missing.usedMemory,null);assert.equal(missing.usedStorage,null);
});

test('guest summaries retain paired healthy measurements through an offline guest',async()=>{
 const {guestAvailability}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
 const result=guestAvailability([{nodeAvailable:true,status:'running',memory:4,memoryTotal:16,disk:10,diskTotal:100},{nodeAvailable:false,status:'unknown',memory:99,memoryTotal:999,disk:99,diskTotal:999},{status:'running',memory:2,memoryTotal:null,disk:null,diskTotal:200}]);
 assert.equal(result.memory,4);assert.equal(result.memoryTotal,16);assert.equal(result.disk,10);assert.equal(result.diskTotal,100);assert.match(result.coverage,/Memory 1\/3/);
});
