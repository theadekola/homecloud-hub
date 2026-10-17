import test from 'node:test';import assert from 'node:assert/strict';import {taskInventory} from '../src/tasks.js';
test('task inventory includes all nodes, sorts recent tasks first and retains partial failures',async()=>{const result=await taskInventory(24,async path=>path==='/nodes'?[{node:'a'},{node:'b'},{node:'c'}]:path.includes('/a/')?[{upid:'old',starttime:1}]:path.includes('/b/')?[{upid:'new',starttime:2}]:{bad:true});assert.deepEqual(result.tasks.map(t=>t.upid),['new','old']);assert.equal(result.tasks[0].node,'b');assert.equal(result.errors.length,1);assert.match(result.errors[0],/Unexpected task/)});
test('task inventory rejects malformed node inventory instead of representing zero tasks',async()=>{await assert.rejects(()=>taskInventory(24,async()=>({bad:true})),e=>e.status===502)});

test('task history cannot claim a complete zero without visible nodes and identifies truncated reads',async()=>{
 const empty=await taskInventory(24,async()=>[]);assert.equal(empty.coverage.complete,false);assert.ok(empty.errors.length);
 for(const nodes of [[{}],[null],[{node:''}]])await assert.rejects(()=>taskInventory(24,async()=>nodes),{status:502});
 const truncated=await taskInventory(24,async p=>p==='/nodes'?[{node:'n1'}]:Array.from({length:500},(_,i)=>({upid:String(i),starttime:i})));
 assert.deepEqual(truncated.truncated,['n1']);assert.equal(truncated.coverage.complete,false);
 const complete=await taskInventory(24,async p=>p==='/nodes'?[{node:'n1'}]:[]);assert.equal(complete.coverage.complete,true);
});
