import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
import React,{act} from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import {JSDOM} from 'jsdom';import {build} from 'esbuild';
const rootPath=fileURLToPath(new URL('../',import.meta.url));
async function component(file){
 const directory=fs.mkdtempSync(path.join(rootPath,'node_modules','audit-ui-'));
 const result=await build({entryPoints:[path.join(rootPath,'src',file)],bundle:true,format:'esm',platform:'node',packages:'external',loader:{'.css':'empty'},jsx:'automatic',write:false,plugins:[{name:'fixture-api',setup(b){b.onResolve({filter:/^@xterm\//},()=>({path:'terminal',namespace:'terminal'}));b.onLoad({filter:/.*/,namespace:'terminal'},()=>({contents:`export class Terminal {cols=100;rows=28;loadAddon(){}open(){}onData(fn){globalThis.__terminalInput=fn;return {dispose(){}}}write(){}dispose(){}focus(){}getSelection(){return 'selected'}clear(){}paste(text){globalThis.__terminalInput(text)}}export class FitAddon{fit(){}}`}));b.onResolve({filter:/\/api$/},()=>({path:'fixture-api',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export const clearTokens=()=>{};export const api=(...a)=>globalThis.__auditApi(...a);export const confirmedApi=(...a)=>globalThis.__auditConfirmed(...a);export function setDockerHost(id){localStorage.setItem('homecloud_docker_host',id);window.dispatchEvent(new Event('homecloud-connection'));}` }));}}]});
 const modulePath=path.join(directory,'component.mjs');fs.writeFileSync(modulePath,result.outputFiles[0].text);const module=await import(pathToFileURL(modulePath));return {module,cleanup:()=>fs.rmSync(directory,{recursive:true,force:true})};
}
async function mounted(file,props,api,mobile=true,strict=false,exportName='default',initialRoute='/'){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://homecloud.test'});const navigatorDescriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});const originals={};for(const k of ['window','document','localStorage','Event','CustomEvent','HTMLElement','FormData','ResizeObserver','requestAnimationFrame']){originals[k]=globalThis[k];globalThis[k]=dom.window[k];}
 dom.window.matchMedia=()=>({matches:mobile,addEventListener(){},removeEventListener(){}});globalThis.ResizeObserver=class {observe(){}disconnect(){}};globalThis.requestAnimationFrame=fn=>{fn();return 1};globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.__auditApi=api;globalThis.__auditConfirmed=api;dom.window.confirm=()=>true;
 const built=await component(file),container=dom.window.document.getElementById('root'),root=createRoot(container);const Component=built.module[exportName];
 const render=async values=>{await act(async()=>{root.render(React.createElement(strict?React.StrictMode:React.Fragment,null,React.createElement(MemoryRouter,{initialEntries:[initialRoute]},React.createElement(Component,values))));await new Promise(r=>setTimeout(r,0));});};
 await render(props);
 return {dom,container,render,click:async button=>{assert.ok(button,'Expected control is rendered');await act(async()=>{button.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,0));});},close:async()=>{await act(async()=>root.unmount());await new Promise(r=>setTimeout(r,10));dom.window.close();built.cleanup();for(const k of Object.keys(originals)){if(originals[k]===undefined)delete globalThis[k];else globalThis[k]=originals[k];}if(navigatorDescriptor)Object.defineProperty(globalThis,'navigator',navigatorDescriptor);else delete globalThis.navigator;delete globalThis.__auditApi;delete globalThis.__auditConfirmed;}};
}




const button=(page,label)=>[...page.container.querySelectorAll('button')].find(b=>b.textContent.trim()===label);
const row={containerId:'container-1',name:'web',image:'nginx:latest',imageId:'old-image',remoteDigest:'sha256:reviewed',status:'available',detail:'New digest'};
const plan={...row,configDigest:'config-binding',running:true,mounts:[{target:'/data'}],networks:['app_default'],environmentCount:2,compose:true};
test('update review pins the image and config, requires consent, preserves success before closing and refreshes afterward',async()=>{
 const calls=[];let installed=false,updated=0;const page=await mounted('components/DockerUpdates.tsx',{owner:true,onUpdated:()=>updated++},async(p,init)=>{calls.push({p,init});if(p==='/docker/updates')return {rows:installed?[]:[row],settings:{enabled:true,intervalHours:6}};if(p.endsWith('/plan'))return plan;if(p.endsWith('/install')){installed=true;return {result:{message:'Container updated and running.'}}}return {}});
 try{await page.click(button(page,'Review & Install'));assert.ok(page.container.querySelector('[role=dialog]').textContent.includes('Compose-managed'));assert.equal(button(page,'Pull & Install Update').disabled,true);await page.click(page.container.querySelector('[aria-label="Approve Docker image installation"]'));await page.click(button(page,'Pull & Install Update'));const write=calls.find(c=>c.p.endsWith('/install'));const {operationId,...reviewed}=JSON.parse(write.init.body);assert.match(operationId,/^[a-zA-Z0-9-]{16,80}$/);assert.deepEqual(reviewed,{imageId:'old-image',remoteDigest:'sha256:reviewed',configDigest:'config-binding'});assert.ok(page.container.querySelector('.connection-success'));assert.equal(updated,0);await act(async()=>new Promise(r=>setTimeout(r,2100)));assert.equal(page.container.querySelector('[role=dialog]'),null);assert.equal(updated,1);assert.ok(!button(page,'Review & Install'));}finally{await page.close()}
});
test('failed installation keeps review open without success, and viewers cannot start checks or installations',async()=>{
 const page=await mounted('components/DockerUpdates.tsx',{owner:true,onUpdated(){}},async p=>p==='/docker/updates'?{rows:[row],settings:{enabled:true,intervalHours:6}}:p.endsWith('/plan')?plan:Promise.reject(Error('Original container restored')));
 try{await page.click(button(page,'Review & Install'));await page.click(page.container.querySelector('[aria-label="Approve Docker image installation"]'));await page.click(button(page,'Pull & Install Update'));assert.ok(page.container.querySelector('[role=dialog]'));assert.equal(page.container.querySelector('.connection-success'),null);assert.ok(page.container.querySelector('.modal [role=alert]').textContent.includes('restored'))}finally{await page.close()}
 const viewer=await mounted('components/DockerUpdates.tsx',{owner:false,onUpdated(){}},async()=>({rows:[row],settings:{enabled:true,intervalHours:6}}));try{assert.equal(button(viewer,'Check for Updates'),undefined);assert.equal(button(viewer,'Review & Install'),undefined)}finally{await viewer.close()}
});

test('installation shows server stage percentages, keeps elapsed feedback during a slow pull, and completes only from the install result',async()=>{
 let finish,reads=0,percent=20,failPoll=false,installBody;const response=new Promise(resolve=>finish=resolve);
 const page=await mounted('components/DockerUpdates.tsx',{owner:true,onUpdated(){}},async(p,init)=>{
  if(p==='/docker/updates')return {rows:[row],settings:{enabled:true,intervalHours:6}};
  if(p.endsWith('/plan'))return plan;
  if(p.includes('/progress?')){reads++;assert.equal(init.headers['X-HomeCloud-Docker-Host'],'');if(failPoll)throw Error('Network lost');return {progress:{percent,stage:percent===20?'Pulling image from registry':'Starting and checking container health',status:'running',updatedAt:new Date(Date.now()-65000).toISOString()}}}
  if(p.endsWith('/install')){installBody=JSON.parse(init.body);return response}return {};
 });
 try{
  await page.click(button(page,'Review & Install'));await page.click(page.container.querySelector('[aria-label="Approve Docker image installation"]'));await page.click(button(page,'Pull & Install Update'));
  assert.equal(page.container.querySelector('progress').value,20);assert.match(page.container.querySelector('.docker-install-progress').textContent,/not reported new layer activity/);assert.match(page.container.querySelector('.docker-install-progress').textContent,/Pulling image/);assert.ok(button(page,'Installing · 20%').disabled);assert.equal(page.container.querySelector('.connection-success'),null);
  failPoll=true;await act(async()=>new Promise(r=>setTimeout(r,1600)));assert.match(page.container.querySelector('.docker-install-progress').textContent,/reconnecting/);assert.match(page.container.querySelector('.docker-install-progress').textContent,/Elapsed 0m [1-9]/);
  failPoll=false;percent=90;await act(async()=>new Promise(r=>setTimeout(r,1600)));assert.equal(page.container.querySelector('progress').value,90);assert.ok(!page.container.querySelector('.docker-install-progress').textContent.includes('reconnecting'));assert.ok(reads>=3);assert.ok(installBody.operationId);
  await act(async()=>{finish({result:{message:'Container updated and running.'}});await new Promise(r=>setTimeout(r,0))});assert.match(page.container.querySelector('.connection-success').textContent,/100%/);
  const finalReads=reads;await act(async()=>new Promise(r=>setTimeout(r,1600)));assert.equal(reads,finalReads);
 }finally{finish({result:{message:'Updated'}});await page.close()}
});
test('changing Docker host after review cannot install the reviewed image on another host',async()=>{
 let writes=0;const page=await mounted('components/DockerUpdates.tsx',{owner:true,onUpdated(){}},async(p)=>{if(p==='/docker/updates')return {rows:[row],settings:{enabled:true,intervalHours:6}};if(p.endsWith('/plan'))return plan;writes++;return {}});
 try{await page.click(button(page,'Review & Install'));await page.click(page.container.querySelector('[aria-label="Approve Docker image installation"]'));localStorage.setItem('homecloud_docker_host','other-host');await page.click(button(page,'Pull & Install Update'));assert.equal(writes,0);assert.match(page.container.querySelector('.modal').textContent,/selected Docker host changed/);assert.equal(page.container.querySelector('progress'),null)}finally{await page.close()}
});

test('cancelled approval permits retry while an unconfirmed install response cannot trigger a duplicate installation',async()=>{
 for(const message of ['Authentication cancelled','Failed to fetch']){
  const page=await mounted('components/DockerUpdates.tsx',{owner:true,onUpdated(){}},async p=>{if(p==='/docker/updates')return {rows:[row],settings:{enabled:true,intervalHours:6}};if(p.endsWith('/plan'))return plan;if(p.endsWith('/install'))throw Error(message);return {}});
  try{await page.click(button(page,'Review & Install'));await page.click(page.container.querySelector('[aria-label="Approve Docker image installation"]'));await page.click(button(page,'Pull & Install Update'));assert.equal(page.container.querySelector('.connection-success'),null);assert.ok(page.container.querySelector('progress').value<100);assert.equal(button(page,'Pull & Install Update').disabled,message==='Failed to fetch');assert.match(page.container.querySelector('.docker-install-progress').textContent,message==='Failed to fetch'?/could not be confirmed/:/cancelled before it started/)}finally{await page.close()}
 }
});
