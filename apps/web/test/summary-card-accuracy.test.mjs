import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
import React,{act} from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter,useLocation} from 'react-router-dom';import {JSDOM} from 'jsdom';import {build} from 'esbuild';
function Location(){const location=useLocation();return React.createElement('output',{'data-location':location.pathname+location.search,hidden:true})}
const rootPath=fileURLToPath(new URL('../',import.meta.url));
async function component(file){
 const directory=fs.mkdtempSync(path.join(rootPath,'node_modules','audit-ui-'));
 const result=await build({entryPoints:[path.join(rootPath,'src',file)],bundle:true,format:'esm',platform:'node',packages:'external',jsx:'automatic',loader:{'.css':'empty'},write:false,plugins:[{name:'fixture-api',setup(b){b.onResolve({filter:/^@xterm\//},()=>({path:'terminal-fixture',namespace:'terminal-fixture'}));b.onLoad({filter:/.*/,namespace:'terminal-fixture'},()=>({contents:'export class Terminal {} export class FitAddon {}'}));b.onResolve({filter:/\.css$/},()=>({path:'fixture-css',namespace:'fixture-css'}));b.onLoad({filter:/.*/,namespace:'fixture-css'},()=>({contents:''}));b.onResolve({filter:/\/api$/},()=>({path:'fixture-api',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export const clearTokens=()=>{};export const api=(...a)=>globalThis.__auditApi(...a);export const confirmedApi=(...a)=>globalThis.__auditConfirmed(...a);export function setDockerHost(id){localStorage.setItem('iclusters_docker_host',id);window.dispatchEvent(new Event('iclusters-connection'));}` }));}}]});
 const modulePath=path.join(directory,'component.mjs');fs.writeFileSync(modulePath,result.outputFiles[0].text);const module=await import(pathToFileURL(modulePath));return {module,cleanup:()=>fs.rmSync(directory,{recursive:true,force:true})};
}
async function mounted(file,props,api,mobile=true){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://iclusters.test'});const originals={};for(const k of ['window','document','localStorage','Event','CustomEvent','HTMLElement','FormData','ResizeObserver']){originals[k]=globalThis[k];globalThis[k]=dom.window[k];}
 globalThis.ResizeObserver=class {observe(){}disconnect(){}};dom.window.matchMedia=()=>({matches:mobile,addEventListener(){},removeEventListener(){}});globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.__auditApi=api;globalThis.__auditConfirmed=api;dom.window.confirm=()=>true;
 const built=await component(file),container=dom.window.document.getElementById('root'),root=createRoot(container);const Component=built.module.default;
 const render=async values=>{await act(async()=>{root.render(React.createElement(MemoryRouter,null,React.createElement(Location),React.createElement(Component,values)));await new Promise(r=>setTimeout(r,0));});};
 await render(props);
 return {dom,container,render,click:async button=>{assert.ok(button,'Expected control is rendered');await act(async()=>{button.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,0));});},close:async()=>{await act(async()=>root.unmount());dom.window.close();built.cleanup();for(const k of Object.keys(originals)){if(originals[k]===undefined)delete globalThis[k];else globalThis[k]=originals[k];}delete globalThis.__auditApi;delete globalThis.__auditConfirmed;}};
}
const button=(container,label)=>[...container.querySelectorAll('button')].find(b=>b.textContent.trim()===label);

const empty={resources:[],pools:[],snapshots:[],schedules:[],services:[],resolvers:[],interfaces:[],nodes:[],errors:[],summary:{pools:0,online:0,capacity:0,used:0,available:0,complete:true},truenas:[],policies:[],series:[],sources:[]};
for(const name of ['Storage','StorageDatasets','StorageShares','StorageSnapshots','StorageDisks','StoragePerformance','NetworkDNS','NetworkRouting'])test(name+' cards hide cached values after a failed refresh',async()=>{
 let fail=false;const page=await mounted('pages/'+name+'.tsx',{onTab:()=>{}},async p=>{if(p==='/auth/me')return {user:{role:'viewer'}};if(fail)throw Error('Fixture provider offline');return structuredClone(empty)});
 try{assert.ok(page.container.querySelector('.metric-grid'),'summary grid rendered');fail=true;await page.click([...page.container.querySelectorAll('button')].find(b=>/^(Refresh|Scan Disks)$/.test(b.textContent.trim())));const values=[...page.container.querySelectorAll('.metric-grid strong,.metric-grid .stat-value')].map(el=>el.textContent);assert.ok(values.length);assert.ok(values.every(v=>v==='Unknown'),name+': '+values.join(', '));}finally{await page.close()}
});
for(const name of ['StorageShares','StorageSnapshots','StorageDatasets','StorageDisks','NetworkDNS','NetworkRouting'])test(name+' incomplete empty inventories do not claim zero resources',async()=>{
 const page=await mounted('pages/'+name+'.tsx',{onTab:()=>{}},async p=>p==='/auth/me'?{user:{role:'viewer'}}:{...structuredClone(empty),summary:{complete:false},errors:['One provider could not be read']});
 try{for(const el of page.container.querySelectorAll('.metric-grid strong,.metric-grid .stat-value'))assert.notEqual(el.textContent,'0',name+' empty failure');}finally{await page.close()}
});
test('monitoring counts acknowledged critical alerts until they are resolved',async()=>{
 const page=await mounted('pages/Monitoring.tsx',{},async p=>p==='/auth/me'?{user:{role:'viewer'}}:{nodes:[],services:[{name:'Proxmox',status:'reachable'}],hosts:[],alerts:[{id:'a',title:'Fault',status:'acknowledged',severity:'critical'}],resources:[],metrics:[]});
 try{const card=[...page.container.querySelectorAll('.monitor-stat')].find(c=>c.textContent.includes('Active Alerts'));assert.equal(card.querySelector('strong').textContent,'1');assert.match(page.container.querySelector('.monitor-stat').textContent,/Needs attention/);}finally{await page.close()}
});
test('storage performance never replaces a missing latest sample with an old measured interval',async()=>{
 const page=await mounted('pages/StoragePerformance.tsx',{onTab:()=>{}},async()=>({...structuredClone(empty),selected:{id:'node:a',name:'a',node:'a'},sources:[{id:'node:a',name:'a',node:'a',type:'node'}],series:[{time:1000,cpu:99,memoryPercent:99,netIn:100,netOut:100},{time:2000,cpu:null,memoryPercent:null,netIn:null,netOut:null}]}));
 try{assert.doesNotMatch(page.container.querySelector('.performance-stats').textContent,/99/);assert.match(page.container.querySelector('.performance-stats').textContent,/Not reported/);}finally{await page.close()}
});
test('traffic cards describe latest intervals and preserve a missing last measurement',async()=>{
 const page=await mounted('pages/NetworkTraffic.tsx',{},async p=>p==='/proxmox/network'?{nodes:[{node:'a',status:'online'}],interfaces:[]}:{node:'a',history:[{time:1,netin:125000,netout:250000},{time:2,netin:null,netout:null}]});
 try{const cards=[...page.container.querySelectorAll('.network-stats .stat')];assert.match(cards[0].textContent,/Latest RXUnavailable/);assert.match(cards[1].textContent,/Latest TXUnavailable/);assert.match(cards[2].textContent,/1.00 Mbps/);}finally{await page.close()}
});
for(const [name,key,label] of [['VirtualMachines','vms','VMs'],['LxcContainers','lxc','Containers']])test(name+' CPU cards exclude guests on unavailable nodes',async()=>{
 const data={nodes:[],storage:[],errors:[],[key]:[{id:'100',node:'a',name:'available',status:'running',cpu:20,nodeAvailable:true},{id:'101',node:'b',name:'offline',status:'running',cpu:80,nodeAvailable:false}]};
 const page=await mounted('pages/'+name+'.tsx',{data,refresh:async()=>{},role:'viewer'},async()=>({}));try{const card=[...page.container.querySelectorAll('.vm-stats > *')].find(el=>el.textContent.includes('Average CPU'));assert.equal(card.querySelector('strong').textContent,'20%');}finally{await page.close()}
});
test('read-only Docker discovery cannot imply a measured empty image inventory',async()=>{
 const page=await mounted('pages/DockerImages.tsx',{data:{readOnly:true,images:[],containers:[]},enabled:false,admin:false,refresh:async()=>{}},async()=>({}));try{assert.ok([...page.container.querySelectorAll('.image-summary strong')].every(el=>el.textContent==='Unknown'));assert.doesNotMatch(page.container.querySelector('.image-summary').textContent,/0.0 MiB/);}finally{await page.close()}
});
test('connection summaries become unknown after a failed explicit health recheck without hiding independent notification counts',async()=>{
 let fail=false;const page=await mounted('components/ConnectionManager.tsx',{},async p=>{
  if(p==='/auth/me')return {user:{role:'owner'}};
  if(p.startsWith('/connections/health')){if(fail&&p.includes('?refresh=1'))throw Error('Fixture health unavailable');return {connections:[{id:'p',kind:'proxmox',provider:'proxmox',name:'Fixture Proxmox',status:'online',issues:[],method:'API',endpoint:'fixture',manage:'/proxmox'}],counts:{total:1},sampledAt:new Date().toISOString()};}
  if(p==='/connections/proxmox')return {cluster:null};if(p==='/connections/docker')return {connection:null};if(p==='/notifications')return {channels:[],history:[],preferences:{channels:{}}};if(p==='/configuration/ai')return {fields:[],disabled:true};return {nodes:[],hosts:[],guests:[],connections:[]};
 });
 try{const values=()=>[...page.container.querySelectorAll('.connection-overview strong')].map(el=>el.textContent);assert.deepEqual(values(),['1','0','0']);fail=true;await page.click(button(page.container,'Recheck Connections'));assert.deepEqual(values(),['Unknown','Unknown','0']);}finally{await page.close()}
});
