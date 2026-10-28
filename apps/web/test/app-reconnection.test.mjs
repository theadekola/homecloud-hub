import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {JSDOM} from 'jsdom';
async function fixture({initialFailure=false}={}){
 const directory=fs.mkdtempSync(path.join(fileURLToPath(new URL('../node_modules/',import.meta.url)),'reconnect-'));
 const dom=new JSDOM('<div id="root"></div>',{url:'https://controller.test'}),original={};
 for(const key of ['window','document','sessionStorage','Event','CustomEvent']){original[key]=globalThis[key];globalThis[key]=dom.window[key]}
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;let token='valid',failure=initialFailure,calls=0,cleared=0,retry;
 dom.window.setInterval=fn=>{retry=fn;return 1};dom.window.clearInterval=()=>{retry=null};
 globalThis.__reconnect={token:()=>token,clear:()=>{token='';cleared++},read:async()=>{calls++;if(failure)throw Object.assign(Error('Temporary refresh failure'),{status:failure===401?401:503});return {}}};
 const bundle=await build({entryPoints:[fileURLToPath(new URL('../src/App.tsx',import.meta.url))],bundle:true,format:'esm',platform:'node',packages:'external',jsx:'automatic',write:false,plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/^(react|react-router-dom)(?:\/.*)?$/},args=>({path:args.path,external:true}));
  b.onResolve({filter:/^\.\/session$/},()=>({path:'session',namespace:'test'}));b.onLoad({filter:/session/,namespace:'test'},()=>({contents:'export const startSessionActivity=()=>()=>{};'}));
  b.onResolve({filter:/^\.\/api$/},()=>({path:'api',namespace:'test'}));b.onLoad({filter:/api/,namespace:'test'},()=>({contents:'export const api=()=>globalThis.__reconnect.read();export const clearTokens=()=>globalThis.__reconnect.clear();export const getAccessToken=()=>globalThis.__reconnect.token();'}));
  b.onResolve({filter:/^\.\/hooks$/},()=>({path:'hooks',namespace:'test'}));b.onLoad({filter:/hooks/,namespace:'test'},()=>({contents:'export const useApi=()=>({data:null});'}));
  b.onResolve({filter:/^\.\/(?:components|pages)\//},args=>({path:args.path,namespace:'view'}));b.onLoad({filter:/.*/,namespace:'view'},args=>({contents:args.path.endsWith('/Layout')?'import React from "react";import {Outlet} from "react-router-dom";export default function Layout(){return React.createElement(Outlet)}':args.path.endsWith('/Dashboard')?'import React from "react";export default function Dashboard(){return React.createElement("input",{"aria-label":"Unsaved work",defaultValue:"draft"})}':args.path.endsWith('/Login')?'import React from "react";export default function Login(){return React.createElement("p",null,"Sign in") }':'export const SSHApproval=()=>null;export default function Empty(){return null}'}));
 }}]});
 const file=path.join(directory,'app.mjs');fs.writeFileSync(file,bundle.outputFiles[0].text);const App=(await import(pathToFileURL(file))).default,container=document.getElementById('root'),root=createRoot(container);
 const flush=async action=>{await act(async()=>{await action?.();await new Promise(r=>setTimeout(r,0))})};
 await flush(()=>root.render(React.createElement(MemoryRouter,null,React.createElement(App))));
 return {container,dom,flush,setFailure:value=>{failure=value},calls:()=>calls,cleared:()=>cleared,retry:()=>retry?.(),signal:()=>flush(()=>window.dispatchEvent(new CustomEvent('iclusters-session-unavailable',{detail:'Temporary refresh failure'}))),close:async()=>{await flush(()=>root.unmount());dom.window.close();Object.assign(globalThis,original);delete globalThis.__reconnect;fs.rmSync(directory,{recursive:true,force:true})}};
}
test('transient session refresh failure preserves the mounted page and unsaved work, then reconnects automatically',async()=>{
 const f=await fixture();try{const input=f.container.querySelector('input');assert.ok(input);input.value='my unsaved draft';f.setFailure(true);await f.signal();assert.equal(f.container.querySelector('input'),input);assert.equal(input.value,'my unsaved draft');assert.match(f.container.textContent,/Reconnecting automatically/);assert.equal(f.cleared(),0);await f.flush(()=>f.retry());assert.ok(f.container.querySelector('[role=alert]'));f.setFailure(false);await f.flush(()=>f.retry());assert.equal(f.container.querySelector('[role=alert]'),null);assert.equal(f.container.querySelector('input'),input);assert.equal(input.value,'my unsaved draft');assert.equal(f.cleared(),0)}finally{await f.close()}
});
test('initial connection failure retries on restored network and confirmed unauthorized session still signs out',async()=>{
 const f=await fixture({initialFailure:true});try{assert.match(f.container.textContent,/Reconnecting automatically/);assert.equal(f.container.querySelector('input'),null);f.setFailure(false);await f.flush(()=>window.dispatchEvent(new Event('online')));assert.ok(f.container.querySelector('input'));f.setFailure(401);await f.signal();await f.flush(()=>window.dispatchEvent(new Event('focus')));assert.match(f.container.textContent,/Sign in/);assert.equal(f.cleared(),1);assert.equal(f.container.querySelector('input'),null)}finally{await f.close()}
});


test('known software update preserves the mounted page without a top status banner',async()=>{
 const page=await fixture();try{await page.flush(()=>{sessionStorage.setItem('iclusters_update_started',String(Date.now()));window.dispatchEvent(new Event('iclusters-software-update'))});assert.equal(page.container.querySelector('.connection-notice'),null);assert.ok(page.container.querySelector('input'));await page.flush(()=>{sessionStorage.removeItem('iclusters_update_started');window.dispatchEvent(new Event('iclusters-software-update'))});assert.equal(page.container.querySelector('.connection-notice'),null);}finally{await page.close()}
});
