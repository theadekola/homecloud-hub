import test from 'node:test';
import assert from 'node:assert/strict';
import {proxmoxSnapshot} from '../src/connectors.js';

test('offline node cannot erase healthy readings or contribute stale guest and storage measurements; recovery is fresh',async()=>{
 let recovered=false;const calls=[];
 const query=async path=>{
  calls.push(path);
  if(path==='/cluster/resources')return [
   {type:'node',node:'healthy',status:'online'},
   {type:'node',node:'returning',status:recovered?'online':'offline',cpu:0.99,mem:999,maxmem:1000},
   {type:'qemu',vmid:123,node:'returning',status:'running',cpu:0.99,mem:999,maxmem:1000},
   {type:'storage',id:'returning/local',node:'returning',storage:'local',status:'online',disk:999,maxdisk:1000}];
  if(path==='/nodes')return [{node:'healthy',status:'online'},{node:'returning',status:recovered?'online':'offline'}];
  if(path==='/cluster/status')return [{type:'cluster',quorate:recovered?1:0}];
  if(path.endsWith('/status'))return {cpu:path.includes('healthy')?0.25:0.5,cpuinfo:{cpus:8},memory:{used:40,total:100},uptime:120};
  if(path.endsWith('/storage'))return [{storage:'local',active:1,enabled:1,used:30,total:100,avail:70}];
  if(path.endsWith('/qemu')||path.endsWith('/lxc')||path.endsWith('/services'))return [];
  throw Error('Unexpected query '+path);
 };
 const partial=await proxmoxSnapshot(query);
 assert.equal(partial.resourceInventoryComplete,true);assert.equal(partial.nodes.find(n=>n.name==='healthy').cpu,25);assert.equal(partial.nodes.find(n=>n.name==='returning').cpu,null);
 assert.equal(partial.storage.find(s=>s.node==='healthy').used,30);assert.equal(partial.storage.find(s=>s.node==='returning').used,null);
 assert.equal(partial.vms[0].status,'unknown');assert.equal(partial.vms[0].reportedStatus,'running');assert.equal(partial.vms[0].memory,null);
 assert.equal(partial.nodeCoverage.find(n=>n.node==='returning').status,'offline');assert.ok(!calls.some(p=>p.startsWith('/nodes/returning/')));
 recovered=true;calls.length=0;const full=await proxmoxSnapshot(query);
 assert.equal(full.nodes.find(n=>n.name==='returning').cpu,50);assert.equal(full.storage.find(s=>s.node==='returning').used,30);assert.equal(full.nodeCoverage.find(n=>n.node==='returning').status,'available');assert.ok(calls.includes('/nodes/returning/status'));
});

test('one denied node reading preserves successful sections and exposes its diagnostic',async()=>{
 const snapshot=await proxmoxSnapshot(async path=>{
  if(path==='/cluster/resources'||path==='/nodes')return [{type:'node',node:'healthy',status:'online'}];
  if(path==='/cluster/status')return [];
  if(path.endsWith('/services'))throw Error('HTTP 403');
  if(path.endsWith('/status'))return {cpu:0.2,cpuinfo:{cpus:4},memory:{used:25,total:100}};
  return [];
 });
 assert.equal(snapshot.nodes[0].cpu,20);assert.equal(snapshot.nodes[0].memoryPercent,25);assert.equal(snapshot.nodeCoverage[0].status,'partial');assert.match(snapshot.errors[0],/services.*403/);assert.ok(snapshot.nodeCoverage[0].readings.includes('status'));
});
