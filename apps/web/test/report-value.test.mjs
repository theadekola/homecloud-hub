import test from 'node:test';import assert from 'node:assert/strict';import {buildSync} from 'esbuild';
const source=buildSync({entryPoints:[new URL('../src/report-value.ts',import.meta.url).pathname],bundle:true,format:'esm',write:false}).outputFiles[0].text;
const {reportValue}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
test('loading wording distinguishes pending, failed, completed unknown and measured zero',()=>{
 assert.equal(reportValue('Unknown',{loading:true}),'Loading…');
 assert.equal(reportValue('Unknown',{data:{refreshing:true}}),'Loading…');
 assert.equal(reportValue('Unknown',{loading:false,data:{}}),'Unknown');
 assert.equal(reportValue('Unknown',{loading:true,error:'Offline'}),'Unknown');
 assert.equal(reportValue(0,{loading:true}),0);
 assert.equal(reportValue(22,{data:{refreshing:true}}),22);
});
