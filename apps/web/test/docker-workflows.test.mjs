import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
import React,{act} from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter,useLocation,useNavigate} from 'react-router-dom';import {JSDOM} from 'jsdom';import {build} from 'esbuild';
function Location(){const location=useLocation(),navigate=useNavigate();return React.createElement(React.Fragment,null,React.createElement('output',{'data-location':location.pathname+location.search,hidden:true}),React.createElement('button',{onClick:()=>navigate(-1)},'Back'),React.createElement('button',{onClick:()=>navigate(1)},'Forward'))}
const rootPath=fileURLToPath(new URL('../',import.meta.url));
async function component(file){
 const directory=fs.mkdtempSync(path.join(rootPath,'node_modules','audit-ui-'));
 const result=await build({entryPoints:[path.join(rootPath,'src',file)],bundle:true,format:'esm',platform:'node',packages:'external',jsx:'automatic',loader:{'.css':'empty'},write:false,plugins:[{name:'fixture-api',setup(b){b.onResolve({filter:/\/api$/},()=>({path:'fixture-api',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export const clearTokens=()=>{};export const api=(...a)=>globalThis.__auditApi(...a);export const confirmedApi=(...a)=>globalThis.__auditConfirmed(...a);export function setDockerHost(id){localStorage.setItem('homecloud_docker_host',id);window.dispatchEvent(new Event('homecloud-connection'));}` }));}}]});
 const modulePath=path.join(directory,'component.mjs');fs.writeFileSync(modulePath,result.outputFiles[0].text);const module=await import(pathToFileURL(modulePath));return {module,cleanup:()=>fs.rmSync(directory,{recursive:true,force:true})};
}
async function mounted(file,props,api,mobile=true,initialEntries=['/docker?filter=keep']){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://homecloud.test'});const originals={};for(const k of ['window','document','localStorage','Event','CustomEvent','HTMLElement','ResizeObserver','FormData']){originals[k]=globalThis[k];globalThis[k]=dom.window[k];}
 globalThis.ResizeObserver=class {observe(){}disconnect(){}};dom.window.matchMedia=()=>({matches:mobile,addEventListener(){},removeEventListener(){}});globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.__auditApi=api;globalThis.__auditConfirmed=api;dom.window.confirm=()=>true;
 const built=await component(file),container=dom.window.document.getElementById('root'),root=createRoot(container);const Component=built.module.default;
 const render=async values=>{await act(async()=>{root.render(React.createElement(MemoryRouter,{initialEntries},React.createElement(Location),React.createElement(Component,values)));await new Promise(r=>setTimeout(r,0));});};
 await render(props);
 return {dom,container,render,click:async button=>{assert.ok(button,'Expected control is rendered');await act(async()=>{button.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,0));});},close:async()=>{await act(async()=>root.unmount());dom.window.close();built.cleanup();for(const k of Object.keys(originals)){if(originals[k]===undefined)delete globalThis[k];else globalThis[k]=originals[k];}delete globalThis.__auditApi;delete globalThis.__auditConfirmed;}};
}
const button=(container,label)=>[...container.querySelectorAll('button')].find(b=>b.textContent.trim()===label);

const inventory=(hostname='host-a',containers=[{id:'old-container',name:'old-app',image:'old:latest',status:'running'}])=>({host:{hostname},containers,images:[],volumes:[],networks:[],stacks:[]});
const dockerFixture=async p=>p==='/auth/me'?{user:{role:'owner'}}:p==='/docker'?inventory():p==='/docker/hosts'?{hosts:[],directEnabled:true}:{nodes:[]};
test('container actions allow unpause only for paused containers',async()=>{
 const page=await mounted('pages/Docker.tsx',{},dockerFixture);try{
 await page.click(page.container.querySelector('[aria-label="Actions for old-app"]'));
 assert.equal(button(page.container,'unpause').disabled,true);assert.equal(button(page.container,'pause').disabled,false);assert.equal(button(page.container,'start').disabled,true);
 }finally{await page.close()}
});
test('switching Docker hosts closes old container actions and selects only current host resources',async()=>{
 const calls=[];const page=await mounted('pages/Docker.tsx',{},async(p,init)=>{calls.push({p,host:localStorage.getItem('homecloud_docker_host')||'',init});return p==='/docker'?inventory(localStorage.getItem('homecloud_docker_host')?'host-b':'host-a',localStorage.getItem('homecloud_docker_host')?[{id:'new-container',name:'new-app',status:'running'}]:undefined):dockerFixture(p)});
 try{await page.click(page.container.querySelector('[aria-label="Actions for old-app"]'));await act(async()=>{localStorage.setItem('homecloud_docker_host','host-b');window.dispatchEvent(new Event('homecloud-connection'));await new Promise(r=>setTimeout(r,0))});
 assert.ok(page.container.querySelector('h1').textContent.includes('host-b'));assert.equal(page.container.querySelector('.modal'),null);await page.click(page.container.querySelector('[aria-label="Actions for new-app"]'));await page.click(button(page.container,'restart'));assert.ok(calls.some(c=>c.host==='host-b'&&c.p==='/actions/docker/container/new-container/restart'));assert.ok(!calls.some(c=>c.p.startsWith('/actions/docker/container/old-container/')));
 }finally{await page.close()}
});
test('Docker tab navigation preserves query parameters and follows browser history',async()=>{
 const page=await mounted('pages/Docker.tsx',{},dockerFixture);try{await page.click([...page.container.querySelectorAll('[role=tab]')].find(b=>b.textContent==='Images'));assert.ok(page.container.querySelector('.docker-images'));assert.equal(page.container.querySelector('[data-location]').getAttribute('data-location'),'/docker?filter=keep&tab=Images');await page.click(button(page.container,'Back'));assert.equal(page.container.querySelector('[aria-selected=true]').textContent,'Containers');await page.click(button(page.container,'Forward'));assert.equal(page.container.querySelector('[aria-selected=true]').textContent,'Images')}finally{await page.close()}
});
test('late container log responses cannot overwrite another container logs',async()=>{
 let finishA;const data=inventory('host-a',[{id:'a',name:'A',status:'running'},{id:'b',name:'B',status:'running'}]);const page=await mounted('pages/Docker.tsx',{},async p=>p==='/docker'?data:p.includes('/a/logs')?new Promise(r=>finishA=r):p.includes('/b/logs')?{logs:'B logs'}:dockerFixture(p));
 try{await page.click(page.container.querySelector('[aria-label="Actions for A"]'));await page.click(button(page.container,'Logs'));await page.click(page.container.querySelector('[aria-label="Actions for B"]'));await page.click(button(page.container,'Logs'));assert.equal(page.container.querySelector('.task-log').textContent,'B logs');await act(async()=>finishA({logs:'A logs'}));assert.ok(page.container.querySelector('.modal').textContent.includes('Logs: B'));assert.equal(page.container.querySelector('.task-log').textContent,'B logs')}finally{await page.close()}
});
test('image usage respects actual image IDs when tags have changed',async()=>{
 const page=await mounted('pages/DockerImages.tsx',{data:{host:{hostname:'fixture'},images:[{id:'sha256:new',name:'app:latest',tags:['app:latest'],size:1024}],containers:[{id:'c',name:'old-app',image:'app:latest',imageId:'sha256:old'}]},enabled:true,admin:true,refresh:async()=>{}},async()=>({}));try{assert.ok(page.container.querySelector('tbody').textContent.includes('0 containers'));assert.ok(page.container.querySelector('tbody').textContent.includes('Unused'))}finally{await page.close()}
});
test('disappearing inspected volumes close the modal without selecting another removal target',async()=>{
 const writes=[],data={host:{hostname:'fixture'},volumes:[{id:'a',name:'volume-a'},{id:'b',name:'volume-b'}],containers:[]};const props={data,enabled:true,admin:true,refresh:async()=>{}};const page=await mounted('pages/DockerVolumes.tsx',props,async(p,init)=>{writes.push({p,init});return p==='/docker/volumes/usage'?{volumes:[{name:'volume-a',references:0},{name:'volume-b',references:0}]}:{}});
 try{await page.click(page.container.querySelector('[aria-label="Inspect volume-b"]'));assert.ok(page.container.querySelector('.modal').textContent.includes('volume-b'));await page.render({...props,data:{...data,volumes:[data.volumes[0]]}});assert.equal(page.container.querySelector('.modal'),null);assert.ok(page.container.textContent.includes('selected volume is no longer reported'));assert.ok(!writes.some(c=>c.init?.method==='DELETE'))}finally{await page.close()}
});

test('paused container actions follow current inventory state',async()=>{
 let state='paused';const page=await mounted('pages/Docker.tsx',{},async p=>p==='/docker'?inventory('fixture',[{id:'c',name:'app',status:state}]):dockerFixture(p));try{await page.click(page.container.querySelector('[aria-label="Actions for app"]'));assert.equal(button(page.container,'unpause').disabled,false);assert.equal(button(page.container,'pause').disabled,true);assert.equal(button(page.container,'start').disabled,true);assert.equal(button(page.container,'stop').disabled,false);state='exited';await act(async()=>{const detail={prefixes:['/docker'],requests:[]};window.dispatchEvent(new CustomEvent('homecloud-resource-refresh',{detail}));await Promise.all(detail.requests)});assert.equal(button(page.container,'start').disabled,false);assert.equal(button(page.container,'unpause').disabled,true);assert.equal(button(page.container,'stop').disabled,true)}finally{await page.close()}
});

test('image creation uses the inspected image ID and disappearing images close their forms',async()=>{
 const writes=[],data={host:{hostname:'fixture'},images:[{id:'sha256:a',name:'app:latest',tags:['app:latest']},{id:'sha256:b',name:'local:latest',tags:['local:latest']}],containers:[]};const props={data,enabled:true,admin:true,refresh:async()=>{}};const page=await mounted('pages/DockerImages.tsx',props,async(p,init)=>{writes.push({p,init});return {}});try{await page.click(page.container.querySelector('[aria-label="Inspect local:latest"]'));await page.click(button(page.container,'Run Container'));const form=page.container.querySelector('.modal form');form.querySelector('input[name=name]').value='new-container';await act(async()=>{form.dispatchEvent(new page.dom.window.Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,0))});assert.equal(JSON.parse(writes.find(w=>w.p==='/docker/container').init.body).image,'sha256:b');await page.click(page.container.querySelector('[aria-label="Inspect local:latest"]'));await page.click(button(page.container,'Tag'));await page.render({...props,data:{...data,images:[data.images[0]]}});assert.equal(page.container.querySelector('.modal'),null);assert.ok(page.container.textContent.includes('selected image is no longer reported'));assert.ok(!writes.some(w=>w.p.includes('/tag')))}finally{await page.close()}
});

test('closing or switching hosts invalidates pending container logs',async()=>{
 let complete,signal;const page=await mounted('pages/Docker.tsx',{},async(p,init)=>p.includes('/old-container/logs')?new Promise(r=>{complete=r;signal=init.signal}):dockerFixture(p));try{await page.click(page.container.querySelector('[aria-label="Actions for old-app"]'));await page.click(button(page.container,'Logs'));await act(async()=>{localStorage.setItem('homecloud_docker_host','host-b');window.dispatchEvent(new Event('homecloud-connection'));await new Promise(r=>setTimeout(r,0))});assert.equal(signal.aborted,true);assert.equal(page.container.querySelector('.modal'),null);await act(async()=>complete({logs:'old host secrets'}));assert.ok(!page.container.textContent.includes('old host secrets'))}finally{await page.close()}
});

test('Docker deep links select supported tabs and invalid tabs fall back to Containers',async()=>{
 for(const [tab,expected] of [['Volumes','Volumes'],['removed-tab','Containers']]){const page=await mounted('pages/Docker.tsx',{},async p=>p==='/docker/volumes/usage'?{volumes:[]}:dockerFixture(p),true,['/docker?tab='+tab]);try{assert.equal(page.container.querySelector('[aria-selected=true]').textContent,expected)}finally{await page.close()}}
});


test('every Docker resource tab places its own heading before host selection, its own metrics and navigation',async()=>{
 const cases=[['Containers','Docker Host: host-a',5],['Images','Docker Images',3],['Volumes','Docker Volumes',4],['Networks','Docker Networks',4],['Compose Stacks','Compose Stacks',4],['Events','Events',5]];
 for(const [tab,title,count] of cases){
  const page=await mounted('pages/Docker.tsx',{},dockerFixture,true,['/docker?tab='+encodeURIComponent(tab)]);
  try{
   const heading=page.container.querySelector('h1,h2'),picker=page.container.querySelector('.docker-host-picker'),metrics=page.container.querySelectorAll('.metric-grid'),nav=page.container.querySelector('[aria-label="Docker resources"]');
   assert.ok(heading.textContent.startsWith(title),tab+' heading');assert.equal(metrics.length,1,tab+' has only its own metrics');assert.equal(metrics[0].children.length,count,tab+' metrics');
   assert.ok(heading.compareDocumentPosition(picker)&4,tab+' heading precedes host selection');
   assert.ok(picker.compareDocumentPosition(metrics[0])&4,tab+' host selection precedes metrics');
   assert.ok(metrics[0].compareDocumentPosition(nav)&4,tab+' metrics precede tabs');
   assert.equal(page.container.querySelectorAll('.docker-host-picker').length,1,tab+' has one host selector');
  }finally{await page.close()}
 }
});
test('update notification deep links verify the exact host before opening its update inventory',async()=>{
 const calls=[];const page=await mounted('pages/Docker.tsx',{},async(p,init)=>{calls.push(p);if(p==='/docker/hosts/host-b/verify')return {host:{version:'29'}};if(p==='/docker/updates')return {rows:[],settings:{enabled:true,intervalHours:6}};return dockerFixture(p,init)},true,['/docker?tab=Updates&host=host-b']);
 try{await act(async()=>new Promise(r=>setTimeout(r,10)));assert.ok(calls.includes('/docker/hosts/host-b/verify'));assert.equal(localStorage.getItem('homecloud_docker_host'),'host-b');assert.ok(page.container.querySelector('.docker-updates'));assert.equal(page.container.querySelector('[data-location]').getAttribute('data-location'),'/docker?tab=Updates')}finally{await page.close()}
});
test('network table shows endpoint IPs and View opens a closable side panel without permanent cards',async()=>{
 const data={host:{hostname:'Fixture'},networks:[{id:'net-a',name:'app-network',driver:'bridge',scope:'local',subnets:'172.20.0.0/16',gateways:'172.20.0.1'},{id:'host',name:'host',driver:'host'}],containers:[{id:'c1',name:'app',status:'running',networks:{'app-network':{IPAddress:'172.20.0.2',GlobalIPv6Address:'fd00::2'}}},{id:'c2',name:'host-app',status:'running',networks:{host:{IPAddress:''}}}]},reads=[];
 const page=await mounted('pages/DockerNetworks.tsx',{data,enabled:true,admin:true,refresh:async()=>{}},async(p)=>{reads.push(p);return {Id:'net-a',Name:'app-network'}});
 try{assert.equal(page.container.querySelector('.docker-network-details'),null);assert.ok(!reads.length);const table=page.container.querySelector('table');assert.match(table.textContent,/Container IPs/);assert.match(table.textContent,/172.20.0.2/);assert.match(table.textContent,/fd00::2/);assert.match(table.textContent,/no separate container IP/);assert.doesNotMatch(table.textContent,/172.20.0.0\/16|172.20.0.1/);assert.equal(page.container.querySelector('.docker-side'),null);const view=[...page.container.querySelectorAll('button')].find(b=>b.textContent==='View');await page.click(view);assert.match(page.container.querySelector('.docker-network-details').textContent,/172.20.0.0\/16/);assert.match(page.container.querySelector('.docker-network-details').textContent,/172.20.0.1/);await page.click(page.container.querySelector('[aria-label="Close network details"]'));assert.equal(page.container.querySelector('.docker-network-details'),null);assert.equal(page.dom.window.document.activeElement,view);}finally{await page.close()}
});
