import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';
const compiled=buildSync({entryPoints:[new URL('../src/request-deadline.ts',import.meta.url).pathname],bundle:true,format:'esm',write:false}).outputFiles[0].text;
const {requestWithDeadline}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
test('deadlines bound stalled connections and response bodies without retrying mutations',async()=>{
 const original=globalThis.fetch;
 try{
  let calls=0,signal;
  globalThis.fetch=async(url,options)=>{calls++;signal=options.signal;return new Promise(()=>{})};
  await assert.rejects(requestWithDeadline('/action',{method:'POST'},r=>r.json(),10),/may still be running.*before retrying/);
  assert.equal(calls,1);assert.equal(signal.aborted,true);
  globalThis.fetch=async()=>new Response('{}');
  await assert.rejects(requestWithDeadline('/report',{},()=>new Promise(()=>{}),10),/Request timed out/);
 }finally{globalThis.fetch=original}
});
test('caller cancellation propagates while requests are pending and listeners detach after completion',async()=>{
 const original=globalThis.fetch;
 try{
  let signal;const caller=new AbortController();
  globalThis.fetch=async(url,options)=>{signal=options.signal;return new Promise(()=>{})};
  const work=requestWithDeadline('/report',{signal:caller.signal},r=>r.json(),1000);caller.abort();await assert.rejects(work,{name:'AbortError'});assert.equal(signal.aborted,true);
  const next=new AbortController();globalThis.fetch=async(url,options)=>{signal=options.signal;return new Response('{}')};
  await requestWithDeadline('/report',{signal:next.signal},r=>r.json(),1000);next.abort();assert.equal(signal.aborted,false);
 }finally{globalThis.fetch=original}
});
