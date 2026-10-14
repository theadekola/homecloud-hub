import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const result=await build({entryPoints:[new URL('../src/ssh-transfer.ts',import.meta.url).pathname],bundle:true,format:'esm',platform:'node',write:false});
const {uploadSFTPFiles,collectSFTPDownload,SFTP_DOWNLOAD_LIMIT,sendShellInput}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
const file=name=>({name,size:1,slice:()=>({arrayBuffer:async()=>new Uint8Array([65]).buffer})});
test('upload retry preserves successful files and sends pending files to original destination',async()=>{
 const files=['success','conflict','pending'].map(file),writes=[];let remaining;
 await assert.rejects(()=>uploadSFTPFiles(files,'/original',false,async b=>{writes.push(b);if(b.path==='/original/conflict')throw Error('Exists');}),e=>{remaining=e.remainingFiles;return e.message==='Exists'});
 assert.deepEqual(remaining.map(f=>f.name),['conflict','pending']);await uploadSFTPFiles(remaining,'/original',true,async b=>writes.push(b));assert.equal(writes.filter(b=>b.path==='/original/success').length,1);assert.ok(writes.filter(b=>b.replace).every(b=>b.path.startsWith('/original/')));
});
test('bounded browser download checks metadata before reading and preserves binary data',async()=>{
 let reads=0;await assert.rejects(()=>collectSFTPDownload(async b=>{if(b.action==='stat')return {file:true,size:SFTP_DOWNLOAD_LIMIT+1};reads++;},'/large'),/32 MiB/);assert.equal(reads,0);
 const bytes=Buffer.from([0,255,1,128]);const blob=await collectSFTPDownload(async b=>b.action==='stat'?{file:true,size:4}:b.offset?{data:'',done:true}:{data:bytes.toString('base64'),done:false},'/binary');assert.deepEqual(Buffer.from(await blob.arrayBuffer()),bytes);
 await assert.rejects(()=>collectSFTPDownload(async()=>({file:false,link:true,size:1}),'/link'),/regular files/);
});
test('browser download enforces its cap if a file grows after stat and stops stalled reads',async()=>{
 let reads=0;const chunk=Buffer.alloc(262144).toString('base64');await assert.rejects(()=>collectSFTPDownload(async b=>b.action==='stat'?{file:true,size:1}:(reads++,{data:chunk,done:false}),'/growing'),/exceeded/);assert.equal(reads,129);
 await assert.rejects(()=>collectSFTPDownload(async b=>b.action==='stat'?{file:true,size:0}:{data:'',done:false},'/stalled'),/no progress/);
});
test('paste transmission stops after a rejected chunk',async()=>{let calls=0;await assert.rejects(()=>sendShellInput('x'.repeat(20000),async()=>{if(++calls===2)throw Error('Disconnected')}),/Disconnected/);assert.equal(calls,2);});
