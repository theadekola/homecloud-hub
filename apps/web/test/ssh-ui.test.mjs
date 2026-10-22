import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
import React,{act} from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import {JSDOM} from 'jsdom';import {build} from 'esbuild';
const rootPath=fileURLToPath(new URL('../',import.meta.url));
async function component(file){
 const directory=fs.mkdtempSync(path.join(rootPath,'node_modules','audit-ui-'));
 const result=await build({entryPoints:[path.join(rootPath,'src',file)],bundle:true,format:'esm',platform:'node',packages:'external',loader:{'.css':'empty'},jsx:'automatic',write:false,plugins:[{name:'fixture-api',setup(b){b.onResolve({filter:/^@xterm\//},()=>({path:'terminal',namespace:'terminal'}));b.onLoad({filter:/.*/,namespace:'terminal'},()=>({contents:`export class Terminal {options={};cols=100;rows=28;loadAddon(){}open(){}onData(fn){globalThis.__terminalInput=fn;return {dispose(){}}}write(text){globalThis.__terminalWrites?.push(text)}dispose(){}focus(){}getSelection(){return globalThis.__terminalSelection??'selected'}selectAll(){globalThis.__terminalSelection='all terminal output'}attachCustomKeyEventHandler(fn){globalThis.__terminalKey=fn}clear(){}paste(text){globalThis.__terminalInput(text)}}export class FitAddon{fit(){}}`}));b.onResolve({filter:/\/api$/},()=>({path:'fixture-api',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export const clearTokens=()=>{};export const api=(...a)=>globalThis.__auditApi(...a);export const confirmedApi=(...a)=>globalThis.__auditConfirmed(...a);export function setDockerHost(id){localStorage.setItem('homecloud_docker_host',id);window.dispatchEvent(new Event('homecloud-connection'));}` }));}}]});
 const modulePath=path.join(directory,'component.mjs');fs.writeFileSync(modulePath,result.outputFiles[0].text);const module=await import(pathToFileURL(modulePath));return {module,cleanup:()=>fs.rmSync(directory,{recursive:true,force:true})};
}
async function mounted(file,props,api,mobile=true,strict=false,initialEntries=['/'],exportName='default',setup=()=>{}){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://homecloud.test'});const navigatorDescriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});const originals={};for(const k of ['window','document','localStorage','Event','CustomEvent','HTMLElement','FormData','ResizeObserver','requestAnimationFrame']){originals[k]=globalThis[k];globalThis[k]=dom.window[k];}
 dom.window.matchMedia=()=>({matches:mobile,addEventListener(){},removeEventListener(){}});globalThis.ResizeObserver=class {observe(){}disconnect(){}};globalThis.requestAnimationFrame=fn=>{fn();return 1};globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.__auditApi=api;globalThis.__auditConfirmed=api;dom.window.confirm=()=>true;
 dom.window.scrollTo=()=>{};dom.window.HTMLElement.prototype.attachEvent=()=>{};dom.window.HTMLElement.prototype.detachEvent=()=>{};
 setup(dom.window);
 const built=await component(file),container=dom.window.document.getElementById('root'),root=createRoot(container);const Component=built.module[exportName];
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
  const buttons=[...page.container.querySelectorAll('.shell-session-toolbar button')];assert.ok(buttons.some(b=>b.textContent.trim()==='Copy'));assert.ok(buttons.some(b=>b.textContent.trim()==='Paste'));assert.ok(!buttons.some(b=>b.textContent.trim()==='Clear'));await page.click(page.container.querySelector('[aria-label="Fullscreen terminal"]'));assert.ok(page.container.textContent.includes('Fullscreen is unavailable'));
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

test('node VM and CT terminal views render streamed output immediately and abort readers on unmount',async()=>{
 for(const target of ['node:a','vm:a:100','lxc:a:101']){
  const calls=[];let controller,aborted=false;globalThis.__terminalWrites=[];
  const page=await mounted('components/SSHAccess.tsx',{target,sessionId:'fixture',name:'Fixture'},async(p,init)=>{calls.push({p,init});if(p.endsWith('/output')){const body=new ReadableStream({start(c){controller=c}});init.signal.addEventListener('abort',()=>{aborted=true;controller.error(new DOMException('Aborted','AbortError'))});return new Response(body,{headers:{'Content-Type':'application/x-ndjson'}})}return {}});
  try{await act(async()=>{controller.enqueue(new TextEncoder().encode('{"output":"immediate echo","closed":false}\n'));await tick()});assert.ok(globalThis.__terminalWrites.includes('immediate echo'));assert.ok(!calls.some(c=>c.p==='/ssh/session/fixture'&&!c.init?.method));}finally{await page.close();assert.equal(aborted,true);delete globalThis.__terminalWrites;delete globalThis.__terminalInput}
 }
});

test('shell reports suspension and visible resume separately from user activity',async()=>{
 const calls=[];
 const page=await mounted('components/SSHAccess.tsx',{target:'node:fixture',sessionId:'fixture'},async(p,init)=>{calls.push({p,init});return {}});
 const presence=()=>calls.filter(c=>c.init?.body).map(c=>({body:JSON.parse(c.init.body),keepalive:c.init.keepalive})).filter(c=>c.body.presence);
 try{
  let hidden=false;
  Object.defineProperty(page.dom.window.document,'hidden',{get:()=>hidden,configurable:true});
  calls.length=0;
  hidden=true;page.dom.window.document.dispatchEvent(new page.dom.window.Event('visibilitychange'));
  page.dom.window.dispatchEvent(new page.dom.window.Event('keydown'));
  assert.deepEqual(presence().map(c=>c.body.presence),['hidden']);
  hidden=false;page.dom.window.document.dispatchEvent(new page.dom.window.Event('visibilitychange'));
  assert.deepEqual(presence().map(c=>c.body.presence),['hidden','visible']);
  assert.ok(presence().every(c=>c.keepalive));
 }finally{await page.close();delete globalThis.__terminalInput;}
});

test('password approvals queue requests, include PUT/DELETE metadata and reset passwords between actions',async()=>{
 const calls=[],approved=[],cancelled=[];const api=async(p,init)=>{calls.push({p,init});if(p==='/ssh/connections')return {'node:pve':{host:'192.0.2.1',port:22,username:'ubuntu',hasPassword:true}};if(p==='/ssh/fingerprint')return {host:'192.0.2.1',fingerprint:'SHA256:fixture'};if(p==='/ssh/connect')return {token:'verified target grant'};return {}};
 const page=await mounted('components/SSHAccess.tsx',{},api,true,false,['/'],'SSHApproval');
 try{await act(async()=>{for(const method of ['PUT','DELETE'])window.dispatchEvent(new CustomEvent('homecloud-ssh-approval',{detail:{target:'node:pve',path:'/network/dns/pve',method,body:{dns1:'192.0.2.1'},dockerHost:'pinned-host',resolve:token=>approved.push({method,token}),reject:error=>cancelled.push(error.message)}}));await tick()});
  await act(async()=>{await new Promise(r=>setTimeout(r,300))});const form=page.container.querySelector('form');assert.ok(form);assert.equal(form.querySelector('[name=username]').value,'ubuntu');assert.equal(form.querySelector('[name=password]').type,'password');form.querySelector('[name=password]').value='actual target password';form.querySelector('[type=checkbox]').checked=true;
  await act(async()=>{form.dispatchEvent(new page.dom.window.Event('submit',{bubbles:true,cancelable:true}));await tick()});assert.match(page.container.querySelector('.connection-success').textContent,/authentication successful/);assert.deepEqual(approved,[]);await act(async()=>{await new Promise(r=>setTimeout(r,2100))});assert.deepEqual(approved,[{method:'PUT',token:'verified target grant'}]);assert.equal(page.container.querySelector('[name=password]').value,'');const submitted=JSON.parse(calls.find(c=>c.p==='/ssh/connect').init.body);assert.equal(submitted.password,'actual target password');assert.equal(submitted.method,'PUT');assert.equal(submitted.dockerHost,'pinned-host');assert.equal(submitted.useSavedPassword,false);const probe=JSON.parse(calls.find(c=>c.p==='/ssh/fingerprint').init.body);assert.equal(probe.path,'/network/dns/pve');assert.equal(probe.method,'PUT');assert.equal(probe.dockerHost,'pinned-host');
  await page.click(page.container.querySelector('.modal-head>.icon-btn'));assert.deepEqual(cancelled,['Authentication cancelled']);
 }finally{await page.close()}
});

test('late password response from a cancelled dialog cannot approve the next identical request',async()=>{
 let finish;const approved=[],cancelled=[];const api=async(p,init)=>p==='/ssh/connections'?{'node:pve':{host:'192.0.2.1',username:'root'}}:p==='/ssh/fingerprint'?{host:'192.0.2.1',fingerprint:'SHA256:fixture'}:p==='/ssh/connect'?new Promise(resolve=>finish=resolve):{};
 const page=await mounted('components/SSHAccess.tsx',{},api,true,false,['/'],'SSHApproval');
 try{await act(async()=>{for(const id of [1,2])window.dispatchEvent(new CustomEvent('homecloud-ssh-approval',{detail:{target:'node:pve',path:'/network/dns/pve',method:'PUT',body:{dns1:'192.0.2.1'},resolve:token=>approved.push({id,token}),reject:()=>cancelled.push(id)}}));await tick()});await act(async()=>{await new Promise(r=>setTimeout(r,300))});
  page.container.querySelector('[name=password]').value='fresh password';await act(async()=>{page.container.querySelector('form').dispatchEvent(new page.dom.window.Event('submit',{bubbles:true,cancelable:true}));await tick()});assert.equal(typeof finish,'function');await page.click(page.container.querySelector('.modal-head>.icon-btn'));assert.deepEqual(cancelled,[1]);assert.equal(page.container.querySelector('[name=password]').value,'');await act(async()=>{finish({token:'late grant'});await tick()});assert.deepEqual(approved,[]);assert.ok(page.container.querySelector('form'));await page.click(page.container.querySelector('.modal-head>.icon-btn'));assert.deepEqual(cancelled,[1,2]);
 }finally{await page.close()}
});

test('SSH login failures stay visible beside the submit control and allow retry',async()=>{
 const page=await mounted('components/SSHAccess.tsx',{target:'vm:pve:106',host:'192.0.2.106',onConnected(){assert.fail('Failed login cannot connect')}},async(p)=>{if(p==='/ssh/fingerprint')return {fingerprint:'SHA256:fixture'};throw Error('SSH login failed. Check the username and password for this target. The account must allow SSH password login.');},true,false,['/'],'SSHLogin');
 try{await act(async()=>{await new Promise(r=>setTimeout(r,300))});const form=page.container.querySelector('form');form.querySelector('[name=username]').value='ubuntu';form.querySelector('[name=password]').value='fixture-secret';await act(async()=>{form.dispatchEvent(new page.dom.window.Event('submit',{bubbles:true,cancelable:true}));await tick()});const error=form.querySelector('[role=alert]');assert.match(error.textContent,/Check the username and password/);assert.ok(form.querySelector('.ssh-connection-top').compareDocumentPosition(error)&page.dom.window.Node.DOCUMENT_POSITION_FOLLOWING);assert.ok(error.compareDocumentPosition(form.querySelector('.ssh-connection-fields'))&page.dom.window.Node.DOCUMENT_POSITION_FOLLOWING);assert.equal(form.querySelector('button.btn').disabled,false);assert.ok(form.textContent.includes('sudo account'));
 }finally{await page.close()}
});

test('Alerts overview counts active conditions instead of stored history and exposes scrollable tables',async()=>{
 const alerts=[{id:'active',title:'Current condition',severity:'warning',status:'active',source:'Active host',triggered:new Date().toISOString()},{id:'old',title:'Old condition',severity:'critical',status:'resolved',source:'Historical host',triggered:new Date().toISOString()}];
 const page=await mounted('pages/Alerts.tsx',{},async p=>p==='/auth/me'?{user:{role:'owner'}}:{alerts,rules:[]});
 try{await act(async()=>{await tick()});const aside=page.container.querySelector('.active-alert-side');
  assert.ok([...aside.querySelectorAll('h3')].some(h=>h.textContent==='Alerts Overview'));
  assert.equal(aside.querySelector('[aria-label="Alert overview period"]').value,'active');
  assert.equal(aside.querySelector('.active-alert-ring strong').firstChild.textContent,'1');
  const legend=[...aside.querySelectorAll('.active-alert-legend button')];
  assert.equal(legend.find(b=>b.querySelector('span').textContent==='Warning').querySelector('b').firstChild.textContent.trim(),'1');
  assert.equal(legend.find(b=>b.querySelector('span').textContent==='Critical').querySelector('b').firstChild.textContent.trim(),'0');
  const sources=aside.querySelector('.active-alert-source-bars');
  assert.equal(sources.querySelectorAll('button').length,1);
  assert.equal(sources.querySelector('span').textContent,'Active host');
  assert.equal(sources.querySelector('strong').textContent,'1');
  assert.ok(!sources.textContent.includes('Historical host'));
  assert.equal(page.container.querySelector('.table-wrap[role=region]').tabIndex,0);assert.equal(page.container.querySelectorAll('tbody tr').length,1);await page.click([...page.container.querySelectorAll('button')].find(b=>b.textContent==='Alert Rules'));assert.ok(page.container.querySelector('.alert-rules'));
 }finally{await page.close()}
});

test('SFTP failed navigation leaves current folder and history unchanged',async()=>{
 const page=await mounted('components/SFTPBrowser.tsx',{sessionId:'fixture',name:'Fixture',active:true,onDisconnect(){}},async(p,o)=>{const b=JSON.parse(o.body);if(b.action==='list'&&b.path==='/denied')throw Error('Permission denied');return {path:'/',entries:[{name:'denied',directory:true,mode:0o040000,modified:1}]}});
 try{await page.click([...page.container.querySelectorAll('.sftp-entry')].find(b=>b.textContent.includes('denied')));assert.equal(page.container.querySelector('[aria-label="Remote directory"]').value,'/');assert.equal(page.container.querySelector('[aria-label=Back]').disabled,true);assert.match(page.container.querySelector('[role=alert]').textContent,/Permission denied/);}finally{await page.close()}
});
test('Network Manage Device selects the requested Docker host before navigation',async()=>{
 const page=await mounted('pages/NetworkDevices.tsx',{},async p=>p==='/docker/hosts'?{hosts:[{id:'agent:node',name:'Host A',node:'pve',online:true}]}:{nodes:[],guests:[],services:[]});
 try{localStorage.setItem('homecloud_docker_host','other:node');const link=[...page.container.querySelectorAll('a')].find(a=>a.textContent.includes('Manage Device'));await page.click(link);assert.equal(localStorage.getItem('homecloud_docker_host'),'agent:node');}finally{await page.close()}
});
test('Network honours DNS tab deep links and tab clicks',async()=>{
 const page=await mounted('pages/Network.tsx',{},async()=>({resolvers:[],interfaces:[],networks:[],services:[],connectors:[],nodes:[]}),true,false,['/network?tab=DNS']);
 try{assert.ok(page.container.querySelector('.network-dns'));await page.click([...page.container.querySelectorAll('.tabs button')].find(b=>b.textContent==='Network Map'));assert.ok(page.container.querySelector('.network-map'));}finally{await page.close()}
});
test('shared dialogs trap keyboard focus, close with Escape and restore focus',async()=>{
 let closed=0;const page=await mounted('components/UI.tsx',{open:false,title:'Fixture',onClose(){closed++},children:React.createElement('button',null,'Last control')},async()=>({}),true,false,['/'],'Modal');
 try{const trigger=document.createElement('button');document.body.append(trigger);trigger.focus();await page.render({open:true,title:'Fixture',onClose(){closed++},children:React.createElement('button',null,'Last control')});const modal=page.container.querySelector('[role=dialog]'),first=modal.querySelector('button'),last=[...modal.querySelectorAll('button')].at(-1);assert.equal(document.activeElement,first);last.focus();await act(async()=>document.dispatchEvent(new page.dom.window.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true})));assert.equal(document.activeElement,first);await act(async()=>document.dispatchEvent(new page.dom.window.KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true})));assert.equal(document.activeElement,last);await act(async()=>document.dispatchEvent(new page.dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));assert.equal(closed,1);await page.render({open:false,title:'Fixture',onClose(){}});assert.equal(document.activeElement,trigger);trigger.remove();}finally{await page.close()}
});

test('Docker Networks and Events tabs render their actual management components',async()=>{
 const page=await mounted('pages/Docker.tsx',{},async p=>p==='/auth/me'?{user:{role:'owner'}}:p==='/docker/hosts'?{hosts:[]}:p==='/node-agents'?{nodes:[]}:p.startsWith('/docker/events')?{events:[]}:{host:{hostname:'Fixture'},containers:[],images:[],volumes:[],networks:[],stacks:[]});
 try{await page.click([...page.container.querySelectorAll('[role=tab]')].find(b=>b.textContent==='Networks'));assert.ok(page.container.textContent.includes('Create Network'));await page.click([...page.container.querySelectorAll('[role=tab]')].find(b=>b.textContent==='Events'));assert.ok(page.container.querySelector('.docker-events'));}finally{await page.close()}
});
test('Storage Snapshots tab renders snapshot management and supports returning to pools',async()=>{
 const page=await mounted('pages/Storage.tsx',{},async p=>p==='/auth/me'?{user:{role:'owner'}}:p==='/storage/snapshots'?{resources:[],targets:[],schedules:[]}:{pools:[],summary:{},tasks:[]});
 try{await page.click([...page.container.querySelectorAll('[role=tab]')].find(b=>b.textContent==='Snapshots'));assert.ok(page.container.querySelector('.storage-snapshots'));await page.click([...page.container.querySelectorAll('[role=tab]')].find(b=>b.textContent==='Storage Pools'));assert.ok(page.container.querySelector('.storage-pool-table'));}finally{await page.close()}
});
test('saved SSH authentication failures remain visible inside the login dialog',async()=>{
 const page=await mounted('pages/Shell.tsx',{},async p=>{if(p==='/proxmox')return {nodes:[{name:'pve',ip:'192.0.2.10',status:'online'}],vms:[],lxc:[]};if(p==='/ssh/connections')return {};if(p==='/ssh/connect')throw Object.assign(Error('Check username and password'),{status:422});if(p==='/ssh/fingerprint')return {fingerprint:'SHA256:fixture'};return {};});
 try{await page.click(page.container.querySelector('[aria-label="Connect to pve"]'));assert.match(page.container.querySelector('.modal [role=alert]').textContent,/Saved SSH connection failed.*username and password/);}finally{await page.close()}
});

async function change(page,input,value){await act(async()=>{const props=input[Object.keys(input).find(k=>k.startsWith('__reactProps'))];props.onChange({target:{value},currentTarget:{value}});await tick()});}
test('network details open explicitly and filtering closes the old panel without selecting another deletion target',async()=>{const networks=[{id:'a',name:'Alpha',driver:'bridge'},{id:'b',name:'Beta',driver:'macvlan'}];const page=await mounted('pages/DockerNetworks.tsx',{data:{host:{hostname:'Fixture'},networks,containers:[]},enabled:true,admin:true,refresh:async()=>{}},async()=>({}));try{assert.equal(page.container.querySelector('.docker-network-details'),null);await page.click([...page.container.querySelectorAll('.image-name')].find(b=>b.textContent==='Beta'));assert.ok(page.container.querySelector('.docker-network-details').textContent.includes('Beta'));await change(page,page.container.querySelector('[aria-label="Network driver"]'),'bridge');assert.ok(!page.container.querySelector('tbody').textContent.includes('Beta'));assert.equal(page.container.querySelector('.docker-network-details'),null);await page.click([...page.container.querySelectorAll('.image-name')].find(b=>b.textContent==='Alpha'));assert.ok(page.container.querySelector('.docker-network-details').textContent.includes('Alpha'));await page.click(page.container.querySelector('[aria-label="Close network details"]'));assert.equal(page.container.querySelector('.docker-network-details'),null);}finally{await page.close()}});
test('filtered user details and deactivation target follow visible accounts',async()=>{const users=[{id:'a',name:'Alpha',email:'alpha@test.local',role:'viewer',status:'active'},{id:'b',name:'Beta',email:'beta@test.local',role:'viewer',status:'active'}];const page=await mounted('pages/Users.tsx',{},async p=>p==='/auth/me'?{user:{sub:'owner',role:'owner'}}:{users});try{await change(page,page.container.querySelector('[aria-label="Search users"]'),'Beta');assert.ok(!page.container.querySelector('tbody').textContent.includes('Alpha'));assert.ok(page.container.querySelector('.users-details').textContent.includes('beta@test.local'));assert.equal([...page.container.querySelectorAll('.users-detail-actions button')].find(b=>b.textContent==='Deactivate User').disabled,false);}finally{await page.close()}});
test('snapshot clone forms close when refreshed inventory removes their original source',async()=>{let resources=[{id:'a',name:'Alpha',resourceId:'tank/a@one',provider:'truenas',dataset:'tank/a',type:'ZFS',created:'2026-10-15T01:00:00Z'},{id:'b',name:'Beta',resourceId:'tank/b@one',provider:'truenas',dataset:'tank/b',type:'ZFS',created:'2026-10-15T01:00:00Z'}];const writes=[];const page=await mounted('pages/StorageSnapshots.tsx',{onTab(){}},async(p,o)=>{if(o?.method==='POST'){writes.push(JSON.parse(o.body));return {}}return p==='/auth/me'?{user:{role:'owner'}}:{resources,targets:[],schedules:[]}});try{await page.click([...page.container.querySelectorAll('button')].find(b=>b.textContent==='Clone'));assert.ok(page.container.querySelector('.modal').textContent.includes('tank/a@one'));resources=resources.slice(1);await act(async()=>{window.dispatchEvent(new Event('homecloud-settings'));await tick()});assert.equal(page.container.querySelector('.modal'),null);assert.ok(page.container.querySelector('[role=alert]').textContent.includes('changed or disappeared'));assert.equal(writes.length,0);}finally{await page.close()}});
test('update status failures are visible and retry performs a fresh status read',async()=>{let fail=true,calls=0;const page=await mounted('components/UpdateButton.tsx',{},async(p,o)=>{calls++;assert.equal(p,'/updates');assert.equal(o,undefined);if(fail)throw Error('Update service unreachable');return {enabled:false,available:false,message:'Install the updater'};});try{assert.equal(page.container.querySelector('button').disabled,false);assert.match(page.container.querySelector('[role=alert]').textContent,/unreachable/);fail=false;await page.click(page.container.querySelector('button'));assert.equal(calls,2);assert.equal(page.container.querySelector('[role=alert]'),null);}finally{await page.close()}});
test('standalone pairing runs directly as root and uses sudo only for ordinary users',async()=>{const page=await mounted('components/PairConnector.tsx',{kind:'docker'},async()=>({code:'fixture',expiresAt:new Date(Date.now()+600000).toISOString()}));try{await act(async()=>{page.container.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await tick()});const command=page.container.querySelector('.node-command').textContent.split('\n').at(-1);const {spawnSync}=await import('node:child_process');for(const [uid,expected] of [['0','bash'],['1000','sudo']]){const result=spawnSync('bash',['-c',`id(){ echo ${uid}; }; bash(){ echo bash; }; sudo(){ echo sudo; }; ${command}`],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.equal(result.stdout.trim(),expected);}}finally{await page.close()}});

async function updateFixture(){
 let status={enabled:true,available:false,state:'ready',checkedAt:'same-second',checkId:'old',message:'Up to date.'},poll,expire,posts=0;
 const page=await mounted('components/UpdateButton.tsx',{},async(path,init)=>{if(init?.method==='POST'){posts++;return {state:'checking',checkedAt:status.checkedAt,checkId:'requested'}}return status},true,false,['/'],'default',win=>{win.setInterval=fn=>{poll=fn;return 1};win.clearInterval=()=>{};win.setTimeout=(fn,ms)=>{if(ms===5000)expire=fn;return 2};win.clearTimeout=()=>{expire=undefined}});
 return {...page,status:value=>{status={...status,...value}},poll:()=>act(async()=>{poll();await tick()}),expire:()=>act(async()=>{expire?.();await tick()}),posts:()=>posts};
}
test('update check waits for its own completed result then dismisses the no-update notice',async()=>{
 const page=await updateFixture();try{await page.click(page.container.querySelector('button'));assert.equal(page.posts(),1);assert.match(page.container.textContent,/Checking GitHub/);await page.poll();assert.match(page.container.textContent,/Checking GitHub/);page.status({checkId:'another-request',checkedAt:'new-time'});await page.poll();assert.match(page.container.textContent,/Checking GitHub/);page.status({checkId:'requested',state:'checking'});await page.poll();assert.match(page.container.textContent,/Checking GitHub/);page.status({state:'ready'});await page.poll();assert.match(page.container.textContent,/No new updates/);assert.equal(page.container.querySelector('button').disabled,false);await page.expire();assert.equal(page.container.querySelector('[role=status]'),null);}finally{await page.close()}
});
test('completed update checks expose new releases and retain failures instead of reporting up to date',async()=>{
 const page=await updateFixture();try{await page.click(page.container.querySelector('button'));page.status({checkId:'requested',available:true});await page.poll();assert.match(page.container.textContent,/new update is available/);assert.ok(page.container.querySelector('.update-dot'));await page.expire();assert.equal(page.container.querySelector('[role=status]'),null);}finally{await page.close()}
 const failed=await updateFixture();try{await failed.click(failed.container.querySelector('button'));failed.status({checkId:'requested',state:'failed',message:'GitHub could not be reached'});await failed.poll();assert.match(failed.container.textContent,/could not be reached/);await failed.expire();assert.match(failed.container.textContent,/could not be reached/);}finally{await failed.close()}
});

test('legacy updater completion works and stalled checks release the button with a useful error',async()=>{
 const legacy=await updateFixture();try{await legacy.click(legacy.container.querySelector('button'));legacy.status({checkId:'',checkedAt:'new-worker-time'});await legacy.poll();assert.match(legacy.container.textContent,/No new updates/);}finally{await legacy.close()}
 const stalled=await updateFixture(),clock=Date.now;try{await stalled.click(stalled.container.querySelector('button'));Date.now=()=>clock()+151000;await stalled.poll();assert.match(stalled.container.textContent,/did not finish/);assert.equal(stalled.container.querySelector('button').disabled,false);}finally{Date.now=clock;await stalled.close()}
});

const terminalButton=(page,label)=>[...page.container.querySelectorAll('.shell-session-toolbar button')].find(b=>b.textContent.trim()===label);
const terminalProps={target:'node:fixture',sessionId:'fixture',name:'Fixture',active:true};
test('terminal toolbar copies selected output, selects all and pastes through the ordered SSH input queue',async()=>{
 const copied=[],inputs=[];const page=await mounted('components/SSHAccess.tsx',terminalProps,async(p,o)=>{if(o?.body){const b=JSON.parse(o.body);if(b.input)inputs.push(b.input)}return {output:'',closed:false}},false,false,['/'],'default',win=>Object.defineProperty(win.navigator,'clipboard',{value:{writeText:async text=>copied.push(text),readText:async()=> 'echo clipboard text'}}));
 try{await page.click(terminalButton(page,'Copy'));assert.deepEqual(copied,['selected']);await page.click(terminalButton(page,'Select All'));await page.click(terminalButton(page,'Copy'));assert.equal(copied[1],'all terminal output');await page.click(terminalButton(page,'Paste'));await tick();assert.equal(inputs.join(''),'echo clipboard text');assert.match(page.container.textContent,/Ctrl\+Shift\+C/)}finally{await page.close();delete globalThis.__terminalSelection;delete globalThis.__terminalKey}
});
test('terminal clipboard fallback retains copied output and only sends manually pasted text on Insert',async()=>{
 const inputs=[],page=await mounted('components/SSHAccess.tsx',terminalProps,async(p,o)=>{if(o?.body){const b=JSON.parse(o.body);if(b.input)inputs.push(b.input)}return {output:'',closed:false}});
 try{await page.click(terminalButton(page,'Copy'));const copy=page.container.querySelector('textarea[aria-label="Selected terminal text"]');assert.equal(copy.value,'selected');assert.equal(copy.readOnly,true);await page.click(page.container.querySelector('[aria-label="Close dialog"]'));await page.click(terminalButton(page,'Paste'));const field=page.container.querySelector('textarea[aria-label="Text to paste"]');assert.ok(field);assert.equal(inputs.length,0);await change(page,field,'echo manual paste');assert.equal(inputs.length,0);await act(async()=>{field.closest('form').dispatchEvent(new page.dom.window.Event('submit',{bubbles:true,cancelable:true}));await tick()});assert.equal(inputs.join(''),'echo manual paste');assert.equal(page.container.querySelector('[role=dialog]'),null)}finally{await page.close();delete globalThis.__terminalKey}
});
test('terminal right-click opens text actions and shortcuts keep plain Ctrl+C as an interrupt',async()=>{
 let reads=0;const page=await mounted('components/SSHAccess.tsx',terminalProps,async()=>({output:'',closed:false}),false,false,['/'],'default',win=>Object.defineProperty(win.navigator,'clipboard',{value:{writeText:async()=>{},readText:async()=>{reads++;return 'paste'}}}));
 try{await act(async()=>page.container.querySelector('.ssh-terminal').dispatchEvent(new page.dom.window.MouseEvent('contextmenu',{bubbles:true,cancelable:true})));assert.match(page.container.querySelector('[role=dialog]').textContent,/Terminal Text Actions/);await page.click(page.container.querySelector('[aria-label="Close dialog"]'));let prevented=0;assert.equal(globalThis.__terminalKey({type:'keydown',key:'c',ctrlKey:true,shiftKey:false,preventDefault(){prevented++}}),true);await act(async()=>{assert.equal(globalThis.__terminalKey({type:'keydown',key:'v',ctrlKey:true,shiftKey:true,preventDefault(){prevented++}}),false);await tick()});assert.equal(reads,1);assert.equal(prevented,1)}finally{await page.close();delete globalThis.__terminalKey}
});
test('delayed clipboard reads cannot paste into an inactive terminal',async()=>{
 let finish;const inputs=[],page=await mounted('components/SSHAccess.tsx',terminalProps,async(p,o)=>{if(o?.body&&JSON.parse(o.body).input)inputs.push(JSON.parse(o.body).input);return {output:'',closed:false}},false,false,['/'],'default',win=>Object.defineProperty(win.navigator,'clipboard',{value:{readText:()=>new Promise(r=>finish=r)}}));
 try{await page.click(terminalButton(page,'Paste'));await page.render({...terminalProps,active:false});await act(async()=>{finish('wrong tab input');await tick()});assert.deepEqual(inputs,[]);assert.equal(terminalButton(page,'Paste').disabled,true)}finally{await page.close();delete globalThis.__terminalKey}
});

test('closing the SSH success screen releases a session not yet handed to its parent',async()=>{const calls=[];const page=await mounted('components/SSHAccess.tsx',{target:'node:pve',host:'192.0.2.1',onConnected(){assert.fail('Cancelled success screen cannot open a session')}},async(p,init)=>{calls.push({p,init});if(p==='/ssh/fingerprint')return {fingerprint:'SHA256:fixture'};if(p==='/ssh/connect')return {id:'new-session'};return {}},true,false,['/'],'SSHLogin');await act(async()=>{await new Promise(r=>setTimeout(r,300))});const form=page.container.querySelector('form');form.querySelector('[name=password]').value='fixture-password';await act(async()=>{form.dispatchEvent(new page.dom.window.Event('submit',{bubbles:true,cancelable:true}));await tick()});assert.ok(page.container.querySelector('.connection-success'));await page.close();assert.ok(calls.some(c=>c.p==='/ssh/session/new-session'&&c.init?.method==='DELETE'));});

test('SSH approval appears while saved connection lookup is pending and cancellation does not block the next approval',async()=>{
 let finishLookup,lookupSignal,rejected=0,reads=0;const waiting=new Promise(r=>finishLookup=r);
 const page=await mounted('components/SSHAccess.tsx',{},async(p,init)=>{if(p==='/ssh/connections'){reads++;if(reads===1){lookupSignal=init.signal;return waiting}return {}}return {fingerprint:'SHA256:'+'a'.repeat(43),host:'192.0.2.5'}},true,false,['/'],'SSHApproval');
 try{
  await act(async()=>{window.dispatchEvent(new CustomEvent('homecloud-ssh-approval',{detail:{path:'/docker/updates/id/install',body:{},method:'POST',target:'vm:node01:100',resolve(){},reject(){rejected++}}}));await tick()});
  assert.match(page.container.querySelector('[role=dialog]').textContent,/Preparing host authentication/);assert.equal(page.container.querySelector('form'),null);
  await page.click(page.container.querySelector('[aria-label="Close dialog"]'));assert.equal(rejected,1);assert.equal(lookupSignal.aborted,true);
  await act(async()=>{window.dispatchEvent(new CustomEvent('homecloud-ssh-approval',{detail:{path:'/docker/updates/id/install',body:{},method:'POST',target:'vm:node01:101',resolve(){},reject(){}}}));await tick()});assert.match(page.container.querySelector('[role=dialog]').textContent,/vm:node01:101/);assert.ok(page.container.querySelector('form'));
  await act(async()=>{finishLookup({});await tick()});assert.match(page.container.querySelector('[role=dialog]').textContent,/vm:node01:101/);
 }finally{finishLookup({});await page.close()}
});
