import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
import React,{act} from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import {JSDOM} from 'jsdom';import {build} from 'esbuild';
const rootPath=fileURLToPath(new URL('../',import.meta.url));
async function component(file){
 const directory=fs.mkdtempSync(path.join(rootPath,'node_modules','audit-ui-'));
 const result=await build({entryPoints:[path.join(rootPath,'src',file)],bundle:true,format:'esm',platform:'node',packages:'external',loader:{'.css':'empty'},jsx:'automatic',write:false,plugins:[{name:'fixture-api',setup(b){b.onResolve({filter:/^@xterm\//},()=>({path:'terminal',namespace:'terminal'}));b.onLoad({filter:/.*/,namespace:'terminal'},()=>({contents:`export class Terminal {cols=100;rows=28;loadAddon(){}open(){}onData(fn){globalThis.__terminalInput=fn;return {dispose(){}}}write(){}dispose(){}focus(){}getSelection(){return 'selected'}clear(){}paste(text){globalThis.__terminalInput(text)}}export class FitAddon{fit(){}}`}));b.onResolve({filter:/\/api$/},()=>({path:'fixture-api',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export const clearTokens=()=>{};export const api=(...a)=>globalThis.__auditApi(...a);export const confirmedApi=(...a)=>globalThis.__auditConfirmed(...a);export function setDockerHost(id){localStorage.setItem('homecloud_docker_host',id);window.dispatchEvent(new Event('homecloud-connection'));}` }));}}]});
 const modulePath=path.join(directory,'component.mjs');fs.writeFileSync(modulePath,result.outputFiles[0].text);const module=await import(pathToFileURL(modulePath));return {module,cleanup:()=>fs.rmSync(directory,{recursive:true,force:true})};
}
async function mounted(file,props,api,mobile=true,strict=false){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://homecloud.test'});const navigatorDescriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});const originals={};for(const k of ['window','document','localStorage','Event','CustomEvent','HTMLElement','FormData','ResizeObserver','requestAnimationFrame']){originals[k]=globalThis[k];globalThis[k]=dom.window[k];}
 dom.window.matchMedia=()=>({matches:mobile,addEventListener(){},removeEventListener(){}});globalThis.ResizeObserver=class {observe(){}disconnect(){}};globalThis.requestAnimationFrame=fn=>{fn();return 1};globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.__auditApi=api;globalThis.__auditConfirmed=api;dom.window.confirm=()=>true;
 const built=await component(file),container=dom.window.document.getElementById('root'),root=createRoot(container);const Component=built.module.default;
 const render=async values=>{await act(async()=>{root.render(React.createElement(strict?React.StrictMode:React.Fragment,null,React.createElement(MemoryRouter,null,React.createElement(Component,values))));await new Promise(r=>setTimeout(r,0));});};
 await render(props);
 return {dom,container,render,click:async button=>{assert.ok(button,'Expected control is rendered');await act(async()=>{button.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,0));});},close:async()=>{await act(async()=>root.unmount());await new Promise(r=>setTimeout(r,10));dom.window.close();built.cleanup();for(const k of Object.keys(originals)){if(originals[k]===undefined)delete globalThis[k];else globalThis[k]=originals[k];}if(navigatorDescriptor)Object.defineProperty(globalThis,'navigator',navigatorDescriptor);else delete globalThis.navigator;delete globalThis.__auditApi;delete globalThis.__auditConfirmed;}};
}


const sample=()=>({sampledAt:new Date().toISOString(),nodes:[{name:'n1',status:'online',cpu:10,memoryPercent:20},{name:'n2',status:'offline',cpu:90,memoryPercent:80}],guests:[],storage:[],resources:[{id:'a',name:'alpha',node:'n1',kind:'Docker container',status:'running'},{id:'b',name:'beta',node:'n2',kind:'Docker container',status:'running'}],metrics:[],alerts:[],services:[{name:'proxmox',status:'reachable'},{name:'docker',status:'reachable'}]});
const stat=(page,label)=>[...page.container.querySelectorAll('.overview-stat')].find(e=>e.querySelector('span')?.textContent===label);
test('overview service search keeps summary stable and Refresh reloads backup inventory',async()=>{
 const calls=[];let backupReads=0;const page=await mounted('pages/Overview.tsx',{},async p=>{calls.push(p);if(p==='/auth/me')return {user:{role:'owner'}};if(p==='/backups')return {points:++backupReads===1?[]:[{node:'n1'}],jobs:[]};return sample();});
 try{const input=page.container.querySelector('[aria-label="Search services"]');const props=input[Object.keys(input).find(k=>k.startsWith('__reactProps'))];await act(async()=>props.onChange({target:{value:'alpha'}}));assert.equal(stat(page,'Containers').querySelector('strong').textContent,'2');await page.click(page.container.querySelector('[aria-label="Refresh live measurements"]'));assert.ok(calls.includes('/dashboard?refresh=1'));assert.equal(backupReads,2);assert.equal(stat(page,'Backups').querySelector('strong').textContent,'1');}finally{await page.close();}
});
test('overview node filter includes storage alerts, scopes backups and uses online averages',async()=>{
 const data={...sample(),storage:[{id:'disk-n1',node:'n1',usage:10,status:'online'}],alerts:[{id:'alert',resourceId:'disk-n1',source:'local-lvm',status:'active',severity:'critical',title:'Full disk'}]};
 const page=await mounted('pages/Overview.tsx',{},async p=>p==='/auth/me'?{user:{role:'viewer'}}:p==='/backups'?{points:[{node:'n1'},{node:'n2'}],jobs:[{node:'n1',enabled:1},{node:'n2',enabled:1}]}:data);
 try{const tile=[...page.container.querySelectorAll('.resource-tile')].find(e=>e.textContent.includes('CPU Usage'));assert.equal(tile.querySelector('strong').textContent,'10%');const select=page.container.querySelector('[aria-label="Select node"]');await act(async()=>{select.value='n1';select.dispatchEvent(new page.dom.window.Event('change',{bubbles:true}));});assert.equal(stat(page,'Alerts').querySelector('strong').textContent,'1');assert.equal(stat(page,'Backups').querySelector('strong').textContent,'1');assert.ok(page.container.textContent.includes('1 configured jobs'));}finally{await page.close();}
});
test('overview shows failed inventories as Unknown and makes backup errors visible',async()=>{
 const page=await mounted('pages/Overview.tsx',{},async p=>p==='/auth/me'?{user:{role:'viewer'}}:p==='/backups'?{points:[],jobs:[],errors:['Backup permission denied']}:{...sample(),nodes:[],guests:[],resources:[],services:[{name:'proxmox',status:'error',error:'Forbidden'}]});
 try{for(const label of ['Total Servers','Virtual Machines','Containers','Backups'])assert.equal(stat(page,label).querySelector('strong').textContent,'Unknown');assert.ok([...page.container.querySelectorAll('[role=alert]')].some(e=>e.textContent.includes('Backup permission denied')));}finally{await page.close();}
});
test('overview retries an initial dashboard failure and shows successfully measured zero counts',async()=>{
 let reads=0;const page=await mounted('pages/Overview.tsx',{},async p=>{if(p==='/auth/me')return {user:{role:'viewer'}};if(p==='/backups')return {points:[],jobs:[]};if(++reads===1)throw Error('Dashboard unavailable');return {...sample(),nodes:[],resources:[]};});
 try{assert.ok(page.container.querySelector('[role=alert]').textContent.includes('Dashboard unavailable'));await page.click([...page.container.querySelectorAll('button')].find(b=>b.textContent==='Retry overview'));assert.equal(stat(page,'Total Servers').querySelector('strong').textContent,'0');assert.equal(stat(page,'Containers').querySelector('strong').textContent,'0');}finally{await page.close();}
});
test('backup refresh still runs when a forced dashboard sample fails',async()=>{
 let backupReads=0;const page=await mounted('pages/Overview.tsx',{},async p=>{if(p==='/auth/me')return {user:{role:'viewer'}};if(p==='/backups'){backupReads++;return {points:[],jobs:[]}}if(p==='/dashboard?refresh=1')throw Error('Forced sample failed');return sample();});
 try{await page.click(page.container.querySelector('[aria-label="Refresh live measurements"]'));assert.equal(backupReads,2);assert.ok(page.container.querySelector('[role=alert]').textContent.includes('Forced sample failed'));}finally{await page.close();}
});

test('overview does not report zero backups from an unconfigured or incomplete archive inventory',async()=>{
 for(const configured of [false,true]){
  const page=await mounted('pages/Overview.tsx',{},async p=>p==='/auth/me'?{user:{role:'viewer'}}:p==='/backups'?{points:[],jobs:[],errors:[],archiveInventory:{configured,complete:false}}:sample());
  try{assert.equal(stat(page,'Backups').querySelector('strong').textContent,'Unknown');assert.match(stat(page,'Backups').textContent,configured?/incomplete/:/Connect Proxmox/)}finally{await page.close()}
 }
});

test('overview retains discovered backups when another storage or node is unavailable',async()=>{
 const page=await mounted('pages/Overview.tsx',{},async p=>p==='/auth/me'?{user:{role:'viewer'}}:p==='/backups'?{points:[{node:'n1'}],jobs:[],errors:['n2: node is offline; archives were not checked.'],archiveInventory:{configured:true,complete:false}}:sample());
 try{assert.equal(stat(page,'Backups').querySelector('strong').textContent,'1');assert.match(stat(page,'Backups').textContent,/incomplete/);assert.ok([...page.container.querySelectorAll('[role=alert]')].some(e=>e.textContent.includes('n2: node is offline')))}finally{await page.close()}
});


test('LXC information does not display VM permission repair after successful discovery',async()=>{
 const note='LXC lifecycle and resource measurements are available through Proxmox. For application inventory, use a paired Proxmox node under Docker. QEMU Guest Agent permissions apply only to VMs.';
 let limitations=[];
 const page=await mounted('pages/Overview.tsx',{},async p=>p==='/auth/me'?{user:{role:'owner'}}:p==='/backups'?{points:[],jobs:[]}:({...sample(),discoveryNotes:[note],discoveryLimitations:limitations}));
 try{
  const info=page.container.querySelector('.discovery-notes');assert.ok(info.textContent.includes(note));assert.equal(info.querySelector('a').getAttribute('href'),'/docker');
  assert.ok(!page.container.textContent.includes('Restore guest discovery'));assert.ok(!page.container.textContent.includes('Fix Guest Discovery Access'));assert.ok(!page.container.textContent.includes('Guest discovery access ('));
  limitations=['VM 101: Proxmox HTTP 403'];await page.click(page.container.querySelector('[aria-label="Refresh live measurements"]'));
  assert.ok(page.container.textContent.includes('VM 101: Proxmox HTTP 403'));assert.ok(page.container.textContent.includes('Fix Guest Discovery Access'));assert.ok(page.container.querySelector('.discovery-notes'));
 }finally{await page.close()}
});
