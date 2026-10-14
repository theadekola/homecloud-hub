import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
import React,{act} from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import {JSDOM} from 'jsdom';import {build} from 'esbuild';
const rootPath=fileURLToPath(new URL('../',import.meta.url));
async function component(file){
 const directory=fs.mkdtempSync(path.join(rootPath,'node_modules','audit-ui-'));
 const result=await build({entryPoints:[path.join(rootPath,'src',file)],bundle:true,format:'esm',platform:'node',packages:'external',loader:{'.css':'empty'},jsx:'automatic',write:false,plugins:[{name:'fixture-api',setup(b){b.onResolve({filter:/^@xterm\//},()=>({path:'terminal',namespace:'terminal'}));b.onLoad({filter:/.*/,namespace:'terminal'},()=>({contents:`export class Terminal {cols=100;rows=28;loadAddon(){}open(){}onData(fn){globalThis.__terminalInput=fn;return {dispose(){}}}write(){}dispose(){}focus(){}getSelection(){return 'selected'}clear(){}paste(text){globalThis.__terminalInput(text)}}export class FitAddon{fit(){}}`}));b.onResolve({filter:/\/api$/},()=>({path:'fixture-api',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export const clearTokens=()=>{};export const api=(...a)=>globalThis.__auditApi(...a);export const confirmedApi=(...a)=>globalThis.__auditConfirmed(...a);export function setDockerHost(id){localStorage.setItem('homecloud_docker_host',id);window.dispatchEvent(new Event('homecloud-connection'));}` }));}}]});
 const modulePath=path.join(directory,'component.mjs');fs.writeFileSync(modulePath,result.outputFiles[0].text);const module=await import(pathToFileURL(modulePath));return {module,cleanup:()=>fs.rmSync(directory,{recursive:true,force:true})};
}
async function mounted(file,props,api,mobile=true,strict=false,initialEntries=['/']){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://homecloud.test'});const navigatorDescriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});const originals={};for(const k of ['window','document','localStorage','Event','CustomEvent','HTMLElement','FormData','ResizeObserver','requestAnimationFrame']){originals[k]=globalThis[k];globalThis[k]=dom.window[k];}
 dom.window.matchMedia=()=>({matches:mobile,addEventListener(){},removeEventListener(){}});globalThis.ResizeObserver=class {observe(){}disconnect(){}};globalThis.requestAnimationFrame=fn=>{fn();return 1};globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.__auditApi=api;globalThis.__auditConfirmed=api;dom.window.confirm=()=>true;
 const built=await component(file),container=dom.window.document.getElementById('root'),root=createRoot(container);const Component=built.module.default;
 const render=async values=>{await act(async()=>{root.render(React.createElement(strict?React.StrictMode:React.Fragment,null,React.createElement(MemoryRouter,{initialEntries},React.createElement(Component,values))));await new Promise(r=>setTimeout(r,0));});};
 await render(props);
 return {dom,container,render,click:async button=>{assert.ok(button,'Expected control is rendered');await act(async()=>{button.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,0));});},close:async()=>{await act(async()=>root.unmount());await new Promise(r=>setTimeout(r,10));dom.window.close();built.cleanup();for(const k of Object.keys(originals)){if(originals[k]===undefined)delete globalThis[k];else globalThis[k]=originals[k];}if(navigatorDescriptor)Object.defineProperty(globalThis,'navigator',navigatorDescriptor);else delete globalThis.navigator;delete globalThis.__auditApi;delete globalThis.__auditConfirmed;}};
}

const tick=()=>new Promise(r=>setTimeout(r,10));
test('StrictMode replay retains SFTP session and real unmount releases it exactly once',async()=>{
 const calls=[];const page=await mounted('components/SFTPBrowser.tsx',{sessionId:'fixture',name:'Fixture',active:true,onDisconnect(){}},async(p,init)=>{calls.push({p,init});return {path:'/',entries:[]}},true,true);
 await tick();assert.equal(calls.filter(c=>c.init?.method==='DELETE').length,0);await page.close();await tick();assert.equal(calls.filter(c=>c.init?.method==='DELETE').length,1);
});
test('SFTP permission errors appear inside the operation dialog and retry remains available',async()=>{
 const page=await mounted('components/SFTPBrowser.tsx',{sessionId:'fixture',name:'Fixture',active:true,onDisconnect(){}},async(p,init)=>{if(init?.method==='DELETE')return {};const b=JSON.parse(init.body);if(b.action==='list')return {path:'/',entries:[{name:'protected',directory:false,size:0,mode:0o100644,modified:1}]};throw Error('Permission denied');});
 try{await page.click(page.container.querySelector('button[aria-label="Delete protected"]'));await act(async()=>{page.container.querySelector('.modal form').dispatchEvent(new page.dom.window.Event('submit',{bubbles:true,cancelable:true}));await tick();});assert.equal(page.container.querySelector('.modal [role=alert]').textContent,'Permission denied');assert.equal(page.container.querySelector('.modal button.btn').disabled,false);}finally{await page.close();await tick();}
});
test('terminal preserves long paste order, reports unsupported controls and survives StrictMode',async()=>{
 const calls=[];const page=await mounted('components/SSHAccess.tsx',{target:'node:fixture',sessionId:'fixture',name:'Fixture'},async(p,init)=>{calls.push({p,init});return {output:'',closed:false}},true,true);
 try{
  await tick();assert.equal(calls.filter(c=>c.init?.method==='DELETE').length,0);
  const text='a'.repeat(8191)+'😀'+'b'.repeat(9000);
  await act(async()=>{globalThis.__terminalInput(text);globalThis.__terminalInput('last');await tick();});
  const chunks=calls.filter(c=>c.init?.body).map(c=>JSON.parse(c.init.body).input).filter(x=>x!==undefined);assert.equal(chunks.join(''),text+'last');assert.ok(chunks.every(x=>x.length<=8192));
  const buttons=[...page.container.querySelectorAll('button')];await page.click(buttons.find(b=>b.textContent.trim()==='Copy'));assert.ok(page.container.textContent.includes('Copy is unavailable'));await page.click(page.container.querySelector('[aria-label="Fullscreen terminal"]'));assert.ok(page.container.textContent.includes('Fullscreen is unavailable'));
 }finally{await page.close();await tick();delete globalThis.__terminalInput;}
 assert.equal(calls.filter(c=>c.init?.method==='DELETE').length,1);
});
test('SFTP retry UI excludes completed uploads and keeps destination after folder navigation',async()=>{
 const writes=[];const page=await mounted('components/SFTPBrowser.tsx',{sessionId:'fixture',name:'Fixture',active:true,onDisconnect(){}},async(p,init)=>{if(init?.method==='DELETE')return {};const b=JSON.parse(init.body);if(b.action==='list')return {path:b.path,entries:[{name:'other',directory:true,size:0,mode:0o040755,modified:1}]};if(b.action==='write'){writes.push(b);if(b.path==='/conflict.txt'&&!b.replace)throw Error('Already exists');}return {}});
 try{
  const files=['success.txt','conflict.txt'].map(name=>({name,size:1,slice:()=>({arrayBuffer:async()=>new Uint8Array([65]).buffer})}));const input=page.container.querySelector('input[type=file]');Object.defineProperty(input,'files',{value:files});
  await act(async()=>{input.dispatchEvent(new page.dom.window.Event('change',{bubbles:true}));await tick();});
  await page.click([...page.container.querySelectorAll('.sftp-entry')].find(b=>b.textContent==='other'));
  await page.click([...page.container.querySelectorAll('button')].find(b=>b.textContent.includes('Retry and replace')));
  assert.ok(!page.container.querySelector('.modal').textContent.includes('success.txt'));
  await act(async()=>{page.container.querySelector('.modal form').dispatchEvent(new page.dom.window.Event('submit',{bubbles:true,cancelable:true}));await tick();});
  assert.equal(writes.filter(b=>b.path==='/success.txt').length,1);assert.ok(writes.some(b=>b.path==='/conflict.txt'&&b.replace));assert.ok(!writes.some(b=>b.path.startsWith('/other/')));
 }finally{await page.close();}
});

test('Shell target links open the exact saved node VM or CT session once',async()=>{
 for(const target of ['node:pve','vm:pve:100','lxc:pve:130']){const calls=[];const page=await mounted('pages/Shell.tsx',{},async(p,init)=>{calls.push({p,init});if(p==='/proxmox')return {nodes:[{name:'pve',ip:'192.0.2.10'}],vms:[{id:'100',name:'vm-fixture',node:'pve'}],lxc:[{id:'130',name:'ct-fixture',node:'pve'}]};if(p==='/ssh/connect')return {id:'session-'+target};if(p.startsWith('/ssh/session/'))return {output:'',closed:false};return {}},true,false,['/tools/shell?target='+encodeURIComponent(target)]);try{await act(async()=>{await tick()});const connections=calls.filter(c=>c.p==='/ssh/connect');assert.equal(connections.length,1);assert.equal(JSON.parse(connections[0].init.body).target,target);assert.ok(page.container.querySelector('.ssh-terminal'));}finally{await page.close();}}
});
