import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
const directory=fs.mkdtempSync(fileURLToPath(new URL('../node_modules/confirmation-ui-',import.meta.url)));
const built=await build({entryPoints:[fileURLToPath(new URL('../src/components/ActionConfirmation.tsx',import.meta.url))],bundle:true,format:'esm',platform:'node',packages:'external',jsx:'automatic',write:false});
const output=path.join(directory,'component.mjs');fs.writeFileSync(output,built.outputFiles[0].text);const {default:Confirmation}=await import(pathToFileURL(output));
async function mount(){
 const dom=new JSDOM('<button id="trigger">Install Monitoring Tools</button><div id="root"></div>',{url:'https://controller.test'}),originals={};
 for(const key of ['window','document','HTMLElement','Event','CustomEvent','IS_REACT_ACT_ENVIRONMENT']){originals[key]=globalThis[key];globalThis[key]=key==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[key]}
 const root=createRoot(document.querySelector('#root'));await act(async()=>root.render(React.createElement(Confirmation)));
 return {close:async()=>{await act(async()=>root.unmount());dom.window.close();for(const [key,value] of Object.entries(originals))globalThis[key]=value}};
}
const request=(phrase,resolve,reject)=>window.dispatchEvent(new CustomEvent('iclusters-action-confirmation',{detail:{phrase,path:'/operations/host-one/tools',resolve,reject}}));
const click=async button=>act(async()=>button.click());
const enter=async value=>act(async()=>{const input=document.querySelector('input');Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new window.Event('input',{bubbles:true}));input.dispatchEvent(new window.Event('change',{bubbles:true}))});
try{
 await test('monitoring tools opens the shared dialog and only the exact phrase enables submission',async()=>{
  const page=await mount();let result;try{
   document.querySelector('#trigger').focus();await act(async()=>request('CONFIRM host-one',v=>result=v,()=>{}));
   assert.equal(document.querySelector('[role="dialog"] h3').textContent,'Install Monitoring Tools');assert.match(document.body.textContent,/changes host packages/);
   const submit=()=>document.querySelector('button[type="submit"]');assert.equal(submit().disabled,true);
   await enter('CONFIRM wrong-host');assert.equal(submit().disabled,true);await act(async()=>document.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));assert.equal(result,undefined);
   await enter('CONFIRM host-one');assert.equal(submit().disabled,false);await click(submit());assert.equal(result,'CONFIRM host-one');assert.equal(document.querySelector('[role="dialog"]'),null);assert.equal(document.activeElement.id,'trigger');
  }finally{await page.close()}
 });
 await test('cancel, Escape and unmount reject pending actions without approval; queued actions stay distinct',async()=>{
  const page=await mount(),results=[];
  const enqueue=phrase=>request(phrase,v=>results.push(v),e=>results.push(e.message));
  try{
   await act(async()=>{enqueue('first');enqueue('second')});assert.match(document.querySelector('code').textContent,/first/);
   await click([...document.querySelectorAll('button')].find(b=>b.textContent==='Cancel'));assert.deepEqual(results,['Confirmation cancelled']);assert.equal(document.querySelector('code').textContent,'second');assert.equal(document.querySelector('input').value,'');
   await act(async()=>document.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));assert.deepEqual(results,['Confirmation cancelled','Confirmation cancelled']);
   await act(async()=>{enqueue('third');enqueue('fourth')});
  }finally{await page.close()}
  assert.deepEqual(results,Array(4).fill('Confirmation cancelled'));
 });
 await test('direct container action uses the shared popup style and requires explicit consent',async()=>{
  const page=await mount();let result;try{
   await act(async()=>window.dispatchEvent(new CustomEvent('iclusters-action-confirmation',{detail:{phrase:'CONFIRM remove',title:'Remove container app',description:'Remove app on engine-a',path:'/actions/docker/container/c/remove',resolve:v=>result=v,reject(){}}})));
   assert.match(document.querySelector('[role="dialog"] h3').textContent,/Remove container app/);assert.ok(document.querySelector('form.form-grid.connector-update-dialog'));assert.equal(document.querySelector('button[type="submit"]').disabled,true);assert.doesNotMatch(document.body.textContent,/Type the following/);
   await click(document.querySelector('input[type="checkbox"]'));await click(document.querySelector('button[type="submit"]'));assert.equal(result,'CONFIRM remove');
  }finally{await page.close()}
 });
}finally{fs.rmSync(directory,{recursive:true,force:true})}
