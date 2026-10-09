import test from 'node:test';
import assert from 'node:assert/strict';
import {diskInventory,diskSmart,normalizeDisk} from '../src/disks.js';
test('disk inventory preserves node identity and partial failures',async()=>{
 const result=await diskInventory(async path=>{if(path==='/nodes')return [{node:'one',status:'online'},{node:'two',status:'online'},{node:'off',status:'offline'}];if(path.includes('/two/'))throw new Error('Permission denied');return [{devpath:'/dev/sda',size:100,used:'LVM',health:'PASSED'}];});
 assert.equal(result.resources[0].id,'proxmox:one:/dev/sda');assert.equal(result.resources[0].assignment,'LVM');assert.equal(result.errors.length,2);
});
test('disk normalization does not convert missing sizes or assignments into utilization',()=>{
 const d=normalizeDisk({devpath:'/dev/sda',size:null,used:'LVM'},'one');assert.equal(d.size,null);assert.equal(d.health,null);assert.equal(d.used,undefined);
});
test('SMART only queries detected devices and escapes disk query',async()=>{
 const calls=[];const query=async path=>{calls.push(path);return path.endsWith('/list')?[{devpath:'/dev/sda'}]:{health:'PASSED'};};
 assert.equal((await diskSmart('one','/dev/sda',query)).report.health,'PASSED');assert.equal(calls[1],'/nodes/one/disks/smart?disk=%2Fdev%2Fsda');
 await assert.rejects(()=>diskSmart('one','/dev/absent',query),/not in the node inventory/);
 await assert.rejects(()=>diskSmart('one','../../etc/passwd',query),/Select a detected disk/);
});
