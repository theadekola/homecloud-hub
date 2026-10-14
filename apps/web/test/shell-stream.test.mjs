import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';
const result=await build({entryPoints:[new URL('../src/shell-stream.ts',import.meta.url).pathname],bundle:true,format:'esm',platform:'node',write:false});
const {readShellOutput,shellInputQueue}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
const tick=()=>new Promise(r=>setTimeout(r,0));
test('rapid input batches behind one request while preserving paste and Unicode order',async()=>{
 const writes=[],waiters=[];const q=shellInputQueue(chunk=>{writes.push(chunk);return new Promise(resolve=>waiters.push(resolve))},()=>assert.fail('unexpected error'));
 q.push('a');for(let i=0;i<100;i++)q.push('b');q.push('😀'+'x'.repeat(17000));assert.deepEqual(writes,['a']);waiters.shift()();await tick();while(waiters.length){waiters.shift()();await tick()}assert.equal(writes.join(''),'a'+'b'.repeat(100)+'😀'+'x'.repeat(17000));assert.ok(writes.every(s=>s.length<=8192));assert.ok(writes.length<10);q.stop();
});
test('uncertain input failures stop queued commands without replay; stopping discards late input',async()=>{
 const writes=[],errors=[];let reject;const q=shellInputQueue(chunk=>{writes.push(chunk);return new Promise((_,r)=>reject=r)},error=>errors.push(error.message));q.push('command');q.push('must not send');reject(Error('Lost connection'));await tick();q.push('still stopped');assert.deepEqual(writes,['command']);assert.deepEqual(errors,['Lost connection']);q.stop();
 let release;const second=shellInputQueue(chunk=>new Promise(r=>release=r),()=>assert.fail());second.push('first');second.push('discard');second.stop();release();await tick();
});
test('stream parser displays complete output before stream ends and preserves fragmented UTF-8',async()=>{
 let controller;const frames=[],body=new ReadableStream({start(c){controller=c}}),reading=readShellOutput(new Response(body),frame=>frames.push(frame));
 const bytes=new TextEncoder().encode(JSON.stringify({output:'😀 first',closed:false})+'\n');for(const byte of bytes)controller.enqueue(Uint8Array.of(byte));await tick();assert.deepEqual(frames,[{output:'😀 first',closed:false}]);controller.enqueue(new TextEncoder().encode('{"output":"done","closed":true}\n'));controller.close();await reading;assert.equal(frames[1].closed,true);
});
test('stream parser rejects interrupted, malformed and oversized output frames',async()=>{
 for(const input of ['{"output":"partial"','{"output":42,"closed":false}\n','x'.repeat(1048577)])await assert.rejects(readShellOutput(new Response(input),()=>{}));
});
