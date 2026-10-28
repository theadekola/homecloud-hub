import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
import React,{act} from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import {JSDOM} from 'jsdom';import {build} from 'esbuild';
const rootPath=fileURLToPath(new URL('../',import.meta.url)),tick=()=>new Promise(r=>setTimeout(r,15));
async function fixture(initial){
 fs.mkdirSync(path.join(rootPath,'node_modules'),{recursive:true});const dir=fs.mkdtempSync(path.join(rootPath,'node_modules','update-notice-'));
 const result=await build({entryPoints:[path.join(rootPath,'src/components/SoftwareUpdateNotice.tsx')],bundle:true,format:'esm',platform:'node',packages:'external',jsx:'automatic',write:false,plugins:[{name:'api',setup(b){b.onResolve({filter:/\/api$/},()=>({path:'api',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const api=(...args)=>globalThis.__updateNoticeApi(...args)'}))}}]});
 const file=path.join(dir,'component.mjs');fs.writeFileSync(file,result.outputFiles[0].text);
 const dom=new JSDOM('<div id="root"></div>',{url:'https://iclusters.test'}),original={};for(const k of ['window','document','localStorage','Event','CustomEvent']){original[k]=globalThis[k];globalThis[k]=dom.window[k]};globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 let status=initial,poll,calls=0;const delays=[];dom.window.setTimeout=(fn,delay)=>{delays.push(delay);if(delay===10000)poll=fn;return 1};dom.window.clearTimeout=()=>{};
 globalThis.__updateNoticeApi=async(path,init)=>{assert.equal(path,'/updates');assert.ok(!init?.method||init.method==='GET','Notice never installs or requests an update');calls++;if(status instanceof Error)throw status;return status};
 const {default:Notice}=await import(pathToFileURL(file)),root=createRoot(document.getElementById('root'));
 await act(async()=>{root.render(React.createElement(MemoryRouter,null,React.createElement(Notice)));await tick()});
 return {container:document.getElementById('root'),calls:()=>calls,delays,status:value=>{status=value},poll:()=>act(async()=>{assert.ok(poll,'Ten-second polling is scheduled');poll();await tick()}),focus:()=>act(async()=>{window.dispatchEvent(new Event('focus'));await tick()}),close:async()=>{await act(async()=>root.unmount());dom.window.close();Object.assign(globalThis,original);delete globalThis.__updateNoticeApi;fs.rmSync(dir,{recursive:true,force:true})}};
}
const available={enabled:true,configured:true,available:true,state:'ready',latest:'new-release'};
test('available software updates have a persistent visible prompt and a review link',async()=>{
 const f=await fixture(available);try{assert.match(f.container.textContent,/Software update available/);assert.equal(f.container.querySelector('a').getAttribute('href'),'/settings?tab=About');assert.equal(f.delays.includes(5000),false);await f.poll();assert.match(f.container.textContent,/Software update available/);assert.equal(f.calls(),2)}finally{await f.close()}
});
test('checking and worker failures keep the known update visible with an explanation',async()=>{
 const f=await fixture(available);try{
  f.status({...available,state:'checking',checking:true});await f.poll();assert.match(f.container.textContent,/Software update available/);
  f.status({...available,enabled:false,state:'unavailable',message:'The worker has not reported a recent check.'});await f.poll();assert.match(f.container.querySelector('[role=alert]').textContent,/Software update available/);assert.match(f.container.textContent,/recent check/);
  f.status(Error('Connection lost'));await f.poll();assert.match(f.container.textContent,/Software update available/);assert.match(f.container.textContent,/could not be read/);
 }finally{await f.close()}
});
test('focus checks automatically, and a completed installation clears the prompt',async()=>{
 const f=await fixture({enabled:true,available:false,state:'ready'});try{assert.equal(f.container.querySelector('aside'),null);f.status(available);await f.focus();assert.match(f.container.textContent,/Software update available/);f.status({...available,pending:true});await f.poll();assert.equal(f.container.querySelector('aside'),null);f.status({enabled:true,available:false,state:'completed'});await f.poll();assert.equal(f.container.querySelector('aside'),null)}finally{await f.close()}
});
test('a missing or unreachable updater is explained instead of silently hiding updates',async()=>{
 const f=await fixture(Error('Offline'));try{assert.match(f.container.textContent,/Update status unavailable/);f.status({configured:false,enabled:false,available:false,state:'unavailable',message:'The Ubuntu updater has not reported status.'});await f.focus();assert.match(f.container.textContent,/Software updater needs attention/);assert.match(f.container.textContent,/has not reported/);f.status({enabled:true,available:false,state:'ready'});await f.poll();assert.equal(f.container.querySelector('aside'),null)}finally{await f.close()}
});
