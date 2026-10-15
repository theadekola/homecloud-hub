import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {fileURLToPath} from 'node:url';
const result=await build({entryPoints:[fileURLToPath(new URL('../src/backup-reports.ts',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false});const {reportArchives,reportTaskType,distinctReportTasks,backupDuration,reportCsv}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
test('report archive sizes use explicit shared identity, positive dates, current period and measured bytes',()=>{
 const now=Date.UTC(2026,9,15,12),base={storage:'nas',volid:'nas:backup/one',shared:true,size:100,created:new Date(now-3600000).toISOString()},points=[{...base,id:'n1/a',node:'n1'},{...base,id:'n2/a',node:'n2'},{id:'unknown',node:'n1',created:'invalid',size:20},{id:'future',node:'n1',created:(now+3600000)/1000,size:1000},{id:'old',node:'n1',created:(now-50*3600000)/1000,size:500},{id:'missing',node:'n1',created:(now-1000)/1000,size:null}];
 const result=reportArchives(points,24,'all',now);assert.equal(result.bytes,100);assert.equal(result.items.length,2);assert.equal(result.unknownDate,1);assert.equal(result.unknownSize,1);assert.equal(result.activity[0].bytes,100);assert.equal(reportArchives(points,24,'n2',now).bytes,100);
});
test('task type requires exact node and single guest identity with no conflicting archive types',()=>{
 const points=[{node:'n1',vmid:101,type:'qemu'},{node:'n2',vmid:101,type:'lxc'}];assert.equal(reportTaskType({node:'n1',id:'101'},points),'VM');assert.equal(reportTaskType({node:'n2',id:101},points),'LXC');assert.equal(reportTaskType({node:'n3',id:101},points),'Unreported');assert.equal(reportTaskType({node:'n1',id:'101,102'},points),'Unreported');assert.equal(reportTaskType({node:'n1',id:101},[...points,{node:'n1',vmid:101,type:'lxc'}]),'Unreported');
});
test('report task identity includes node and invalid durations remain unknown',()=>{
 const a={node:'n1',upid:'a'};assert.equal(distinctReportTasks([a,a,{node:'n2',upid:'a'}]).length,2);assert.equal(backupDuration({starttime:-100,endtime:-50}),null);assert.equal(backupDuration({starttime:100,endtime:100}),0);
});
test('all report CSV tables neutralize formulas after leading whitespace and quote newlines',()=>{
 const csv=reportCsv([[' \t=HYPERLINK("x")','line\none','safe']]);assert.ok(csv.startsWith('"\' \t=HYPERLINK'));assert.ok(csv.includes('"line\none"'));assert.ok(csv.endsWith('"safe"'));
});
