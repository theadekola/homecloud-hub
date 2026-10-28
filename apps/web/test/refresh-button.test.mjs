import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
import React,{act} from 'react';import {createRoot} from 'react-dom/client';import {JSDOM} from 'jsdom';import {build} from 'esbuild';
const rootPath=fileURLToPath(new URL('../',import.meta.url)),tick=ms=>new Promise(r=>setTimeout(r,ms));
async function fixture(props){
 const dir=fs.mkdtempSync(path.join(rootPath,'node_modules','refresh-control-')),file=path.join(dir,'component.mjs');
 const result=await build({entryPoints:[path.join(rootPath,'src/components/RefreshButton.tsx')],bundle:true,format:'esm',platform:'node',packages:'external',jsx:'automatic',write:false});fs.writeFileSync(file,result.outputFiles[0].text);
 const {default:Button}=await import(pathToFileURL(file)),dom=new JSDOM('<div id="root"></div>'),original={};for(const k of ['window','document','HTMLElement','Event']){original[k]=globalThis[k];globalThis[k]=dom.window[k]};globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const root=createRoot(document.getElementById('root')),render=async p=>act(async()=>root.render(React.createElement(Button,{indicator:true,...p},'Refresh')));await render(props);
 return {button:()=>document.querySelector('button'),render,click:()=>act(async()=>{document.querySelector('button').click();await tick(0)}),settle:()=>act(async()=>tick(380)),close:async()=>{await act(async()=>root.unmount());dom.window.close();Object.assign(globalThis,original);fs.rmSync(dir,{recursive:true,force:true})}};
}
test('refresh locks immediately, shares rapid clicks and remains busy until the request finishes',async()=>{
 let calls=0,finish;const pending=new Promise(r=>finish=r),f=await fixture({onClick:()=>{calls++;return pending}});
 try{await f.click();assert.equal(f.button().getAttribute('aria-busy'),'true');assert.equal(f.button().disabled,true);assert.ok(f.button().querySelector('.lucide-refresh-cw'));await f.click();assert.equal(calls,1);await f.settle();assert.equal(f.button().disabled,true);await act(async()=>{finish();await tick(0)});assert.equal(f.button().disabled,false);assert.equal(f.button().getAttribute('aria-busy'),'false')}finally{finish();await f.close()}
});
test('failed refresh shows its error, unlocks, and allows a successful retry without keeping the old error',async()=>{
 let fail=true;const f=await fixture({onClick:async()=>{if(fail)throw Error('Provider unavailable')}});
 try{await f.click();await f.settle();assert.match(document.querySelector('[role=alert]').textContent,/Provider unavailable/);assert.equal(f.button().disabled,false);fail=false;await f.click();await f.settle();assert.equal(document.querySelector('[role=alert]'),null);assert.equal(f.button().disabled,false)}finally{await f.close()}
});
test('external provider scan state keeps refresh disabled even after its callback has returned',async()=>{
 const f=await fixture({'aria-busy':true,onClick(){assert.fail('Busy scan must not start again')}});
 try{assert.equal(f.button().disabled,true);await f.render({'aria-busy':false});assert.equal(f.button().disabled,false)}finally{await f.close()}
});
