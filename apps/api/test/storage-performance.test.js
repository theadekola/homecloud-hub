import test from 'node:test';
import assert from 'node:assert/strict';
import {performancePoint,storagePerformance} from '../src/storage-performance.js';
test('performance units distinguish ratios, byte rates, gaps and guest memory',()=>{
 const p=performancePoint({time:100,cpu:.2,mem:50,maxmem:100,diskread:0,netin:null});assert.equal(p.time,100000);assert.equal(p.cpu,20);assert.equal(p.memoryPercent,50);assert.equal(p.diskRead,0);assert.equal(p.netIn,null);assert.equal(p.iowait,null);assert.equal(performancePoint({memused:10,memtotal:0}).memoryPercent,null);
});
test('performance source selects detected guests and keeps partial history failures',async()=>{
 const paths=[];const r=await storagePerformance({enabled:true,source:'lxc:two:201',timeframe:'week',query:async path=>{paths.push(path);if(path==='/cluster/resources')return [{type:'node',node:'one',status:'online'},{type:'lxc',node:'two',vmid:201,name:'app'}];if(path.includes('/rrddata'))throw Error('denied');return {uptime:60,status:'running'}},inventory:async()=>({resources:[{node:'one',id:1},{node:'two',id:2}],errors:[]})});
 assert.equal(r.selected.name,'app');assert.equal(r.pools.length,1);assert.equal(r.errors.length,1);assert.equal(r.current.uptime,60);assert.ok(paths.includes('/nodes/two/lxc/201/rrddata?timeframe=week&cf=AVERAGE'));
});
test('invalid ranges and invented sources never request arbitrary RRD paths',async()=>{
 await assert.rejects(storagePerformance({timeframe:'bad'}),/time range/);await assert.rejects(storagePerformance({enabled:true,source:'node:missing',query:async()=>[]}),/not found/);assert.deepEqual((await storagePerformance()).series,[]);
});
test('node missing RRD throughput uses scoped connector readings and explains provenance',async()=>{
 const result=await storagePerformance({enabled:true,query:async path=>path==='/cluster/resources'?[{type:'node',node:'one',status:'online'}]:path.includes('/rrddata')?[{time:1,cpu:.1}]:{},inventory:async()=>({resources:[],errors:[]}),diskReports:()=>[]});
 assert.equal(result.diskIO.source,'connector');assert.match(result.diskIO.message,/node history does not include/);assert.deepEqual(result.diskIO.series,[]);
});
test('guest RRD disk history retains its own source without host telemetry',async()=>{
 const result=await storagePerformance({enabled:true,source:'qemu:one:10',query:async path=>path==='/cluster/resources'?[{type:'qemu',node:'one',vmid:10}]:path.includes('/rrddata')?[{time:1,diskread:42,diskwrite:0}]:{},inventory:async()=>({resources:[],errors:[]}),diskReports:()=>{throw Error('must not read host counters')}});
 assert.equal(result.diskIO.source,'proxmox');assert.equal(result.diskIO.series[0].diskRead,42);
});
