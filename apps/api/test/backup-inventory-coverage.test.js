import test from 'node:test';
import assert from 'node:assert/strict';
import {backupArchives} from '../src/infrastructure.js';

test('backup inventory distinguishes a successfully checked empty store from an unavailable store',async()=>{
 for(const active of [1,0,undefined]){
  const paths=[],result=await backupArchives(async path=>{paths.push(path);if(path==='/nodes')return [{node:'node01',status:'online'}];if(path==='/storage')return [];if(path.endsWith('/storage?content=backup'))return [{storage:'backup',active}];return []});
  assert.deepEqual(result.points,[]);
  assert.equal(result.coverage.complete,active===1);
  assert.equal(result.coverage.checkedStorage,active===1?1:0);
  assert.equal(paths.some(p=>p.includes('/backup/content')),active===1);
  if(active!==1)assert.match(result.errors[0],/node01\/backup.*unavailable/);
 }
});
test('offline nodes and hidden node inventory cannot establish a zero backup count',async()=>{
 for(const nodes of [[],[{node:'node01',status:'offline'}],[{node:'node01'}]]){
  const result=await backupArchives(async path=>path==='/nodes'?nodes:[]);
  assert.equal(result.coverage.complete,false);assert.ok(result.errors.length);assert.equal(result.coverage.checkedNodes,0);
 }
 await assert.rejects(()=>backupArchives(async()=>({unexpected:true})),{status:502});
});
test('backup scan retains visible archives while reporting inaccessible and malformed storage results',async()=>{
 const result=await backupArchives(async path=>{
  if(path==='/nodes')return [{node:'node01',status:'online'}];if(path==='/storage')return [];
  if(path.endsWith('/storage?content=backup'))return ['good','denied','invalid'].map(storage=>({storage,active:1}));
  if(path.includes('/denied/'))throw Error('Permission denied');
  if(path.includes('/invalid/'))return {unexpected:true};
  return [{volid:'good:backup/vzdump-qemu-100.vma.zst',vmid:100}];
 });
 assert.equal(result.points.length,1);assert.equal(result.coverage.complete,false);assert.equal(result.coverage.checkedStorage,1);assert.equal(result.coverage.visibleStorage,3);
 assert.ok(result.errors.some(e=>e.includes('Permission denied')));assert.ok(result.errors.some(e=>e.includes('Unexpected backup archive inventory')));
});
test('a valid node scan with no visible backup storage reports its limited scope',async()=>{
 const result=await backupArchives(async path=>path==='/nodes'?[{node:'node01',status:'online'}]:[]);
 assert.equal(result.coverage.complete,true);assert.equal(result.coverage.checkedNodes,1);assert.equal(result.coverage.visibleStorage,0);assert.deepEqual(result.points,[]);
});
