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

test('unavailable mount-point storage includes actionable coverage without reading an unmounted path',async()=>{
 const calls=[];const result=await backupArchives(async path=>{calls.push(path);if(path==='/nodes')return [{node:'node02',status:'online'}];if(path==='/storage')return [{storage:'media-storage',type:'dir',is_mountpoint:1,path:'/mnt/pve/media-storage'}];return [{storage:'media-storage',active:0}];});
 assert.equal(result.coverage.complete,false);assert.equal(result.coverage.checkedStorage,0);assert.equal(result.coverage.issues[0].code,'storage-unavailable');assert.match(result.coverage.issues[0].help,/\/mnt\/pve\/media-storage.*mounted on node02/);assert.match(result.coverage.issues[0].help,/Do not disable/);assert.ok(!calls.some(path=>path.includes('/content')));
});

test('backup archives only treat storage as unavailable on nodes assigned to that storage',async()=>{
 const calls=[];const result=await backupArchives(async path=>{calls.push(path);if(path==='/nodes')return [{node:'node01',status:'online'},{node:'node02',status:'online'}];if(path==='/storage')return [{storage:'backup-ssd',nodes:'node01'}];if(path.endsWith('/storage?content=backup'))return [{storage:'backup-ssd',active:path.includes('/node01/')?1:0,enabled:path.includes('/node01/')?1:0}];return [{volid:'backup-ssd:backup/one.vma.zst'}];});
 assert.equal(result.coverage.complete,true);assert.equal(result.coverage.visibleStorage,1);assert.equal(result.points.length,1);assert.deepEqual(result.errors,[]);assert.ok(!calls.some(path=>path.includes('/node02/storage/backup-ssd/content')));
});

test('node and archive failures identify the affected nodes for targeted backup actions',async()=>{
 const result=await backupArchives(async path=>{
  if(path==='/nodes')return [{node:'offline',status:'offline'},{node:'denied',status:'online'},{node:'archives',status:'online'}];
  if(path==='/storage')return [];
  if(path.includes('/denied/'))throw Error('Access denied');
  if(path.endsWith('/storage?content=backup'))return [{storage:'local',active:1}];
  throw Error('Archive access denied');
 });
 assert.deepEqual(result.coverage.issues.map(i=>[i.node,i.code]).sort(),[['archives','archive-read-failed'],['denied','node-inventory-failed'],['offline','node-unavailable']]);
 for(const issue of result.coverage.issues)assert.ok(result.errors.includes(issue.message));
 assert.equal(result.coverage.issues.find(i=>i.node==='archives').storage,'local');
});
