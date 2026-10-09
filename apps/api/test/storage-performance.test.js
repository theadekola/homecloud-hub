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
