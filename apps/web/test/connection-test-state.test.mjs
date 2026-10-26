import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';
const result=await build({entryPoints:[new URL('../src/connection-test-state.ts',import.meta.url).pathname],bundle:true,format:'esm',platform:'node',write:false});
const {connectionTestState}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
const now=Date.parse('2026-10-26T22:00:00Z'),at=delta=>new Date(now+delta).toISOString();
test('a newer health check replaces both successful and unsuccessful manual tests',()=>{
 for(const status of ['online','unverified']){const test={status,checkedAt:at(-1000)},row={status:'offline',checkedAt:at(0),issues:['current failure']};assert.equal(connectionTestState(row,test,now),row);}
});
test('manual connection evidence expires and invalid or future test dates cannot claim success',()=>{
 const row={status:'unverified'};for(const checkedAt of [at(-180001),at(60001),'invalid'])assert.equal(connectionTestState(row,{status:'online',checkedAt},now),row);
 const test={status:'online',checkedAt:at(-1000)};assert.equal(connectionTestState(row,test,now).status,'online');assert.equal(connectionTestState(row,test,now+180000),row);
});
