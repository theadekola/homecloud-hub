import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {fileURLToPath} from 'node:url';
const result=await build({entryPoints:[fileURLToPath(new URL('../src/destination-presentation.ts',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false});
const {destinationReading,destinationEndpoint,destinationHistory}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
test('destination readings retain measured empty storage and reject unavailable or impossible readings',()=>{
 assert.deepEqual(destinationReading({capacity:100,used:0,available:100}),{capacity:100,used:0,available:100,percent:0});
 for(const capacity of [0,-1,null,'100',NaN,Infinity])assert.deepEqual(destinationReading({capacity,used:0,available:0}),{capacity:null,used:null,available:null,percent:null});
 assert.deepEqual(destinationReading({capacity:100,used:120,available:-1}),{capacity:100,used:null,available:null,percent:null});
});
test('destination endpoints identify network exports and local directories',()=>{
 assert.equal(destinationEndpoint({path:'/mnt/backup'}),'/mnt/backup');
 assert.equal(destinationEndpoint({server:'nas.local',export:'/backups'}),'nas.local:/backups');
 assert.equal(destinationEndpoint({}),'Not reported');
});
test('storage history keeps gaps, sorts timestamps and does not invent transfer volumes',()=>{
 const GiB=1024**3,result=destinationHistory([{time:200,used:2*GiB,total:4*GiB},{time:100,used:null,total:null},{time:0,used:GiB},{time:300,used:8*GiB,total:4*GiB},{time:400,used:0,total:4*GiB}]);
 assert.deepEqual(result.map(p=>p.time),[100000,200000,300000,400000]);assert.equal(result[0].used,null);assert.equal(result[1].used,2);assert.equal(result[2].used,null);assert.equal(result[3].used,0);
 assert.equal(destinationHistory([{time:100,used:0,total:0}])[0].used,null);
});
