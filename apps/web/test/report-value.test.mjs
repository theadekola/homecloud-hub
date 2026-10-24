import test from 'node:test';import assert from 'node:assert/strict';import {buildSync} from 'esbuild';
const source=buildSync({entryPoints:[new URL('../src/report-value.ts',import.meta.url).pathname],bundle:true,format:'esm',write:false}).outputFiles[0].text;
const {reportValue,summaryValue}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
test('loading wording distinguishes pending, failed, completed unknown and measured zero',()=>{
 assert.equal(reportValue('Unknown',{loading:true}),'Loading…');
 assert.equal(reportValue('Unknown',{data:{refreshing:true}}),'Loading…');
 assert.equal(reportValue('Unknown',{loading:false,data:{}}),'Unknown');
 assert.equal(reportValue('Unknown',{loading:true,error:'Offline'}),'Unknown');
 assert.equal(reportValue(0,{loading:true}),0);
 assert.equal(reportValue(22,{data:{refreshing:true}}),22);
});

test('headline values distinguish fresh zero, failed cache, incomplete counts and missing data',()=>{
 assert.equal(summaryValue(0,{data:{errors:[]}}),0);
 assert.equal(summaryValue(12,{data:{},error:'Offline'}),'Unknown');
 assert.equal(summaryValue(0,{data:{errors:['Denied']}}),'Unknown');
 assert.equal(summaryValue(3,{data:{errors:['Denied']}}),'3 reported');
 assert.equal(summaryValue(0,{loading:true}),'Loading…');
 assert.equal(summaryValue(0,{}),'Unknown');
 assert.equal(summaryValue(NaN,{data:{}}),'Unknown');
 assert.equal(summaryValue(0,{data:{coverage:{complete:false}}}),'Unknown');
});

test('headline cards disclose expired samples while accepting a current measured zero',()=>{assert.equal(summaryValue(80,{data:{sampledAt:new Date(Date.now()-180001).toISOString()}}),'Stale');assert.equal(summaryValue(0,{data:{sampledAt:new Date().toISOString()}}),0);});
