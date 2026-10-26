import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
import React,{act} from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter,useLocation} from 'react-router-dom';import {JSDOM} from 'jsdom';import {build} from 'esbuild';
function Location(){const location=useLocation();return React.createElement('output',{'data-location':location.pathname+location.search,hidden:true})}
const rootPath=fileURLToPath(new URL('../',import.meta.url));
async function component(file){
 const directory=fs.mkdtempSync(path.join(rootPath,'node_modules','audit-ui-'));
 const result=await build({entryPoints:[path.join(rootPath,'src',file)],bundle:true,format:'esm',platform:'node',packages:'external',jsx:'automatic',loader:{'.css':'empty'},write:false,plugins:[{name:'fixture-api',setup(b){b.onResolve({filter:/\/api$/},()=>({path:'fixture-api',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export const clearTokens=()=>{};export const api=(...a)=>globalThis.__auditApi(...a);export const confirmedApi=(...a)=>globalThis.__auditConfirmed(...a);export function setDockerHost(id){localStorage.setItem('iclusters_docker_host',id);window.dispatchEvent(new Event('iclusters-connection'));}` }));}}]});
 const modulePath=path.join(directory,'component.mjs');fs.writeFileSync(modulePath,result.outputFiles[0].text);const module=await import(pathToFileURL(modulePath));return {module,cleanup:()=>fs.rmSync(directory,{recursive:true,force:true})};
}
async function mounted(file,props,api,mobile=true){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://iclusters.test'});const originals={};for(const k of ['window','document','localStorage','Event','CustomEvent','HTMLElement','FormData','ResizeObserver']){originals[k]=globalThis[k];globalThis[k]=dom.window[k];}
 globalThis.ResizeObserver=class {observe(){}disconnect(){}};dom.window.matchMedia=()=>({matches:mobile,addEventListener(){},removeEventListener(){}});globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.__auditApi=api;globalThis.__auditConfirmed=api;dom.window.confirm=()=>true;
 const built=await component(file),container=dom.window.document.getElementById('root'),root=createRoot(container);const Component=built.module.default;
 const render=async values=>{await act(async()=>{root.render(React.createElement(MemoryRouter,{initialEntries:[props.initialEntry||'/']},React.createElement(Location),React.createElement(Component,values)));await new Promise(r=>setTimeout(r,0));});};
 await render(props);
 return {dom,container,render,click:async button=>{assert.ok(button,'Expected control is rendered');await act(async()=>{button.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,0));});},close:async()=>{await act(async()=>root.unmount());dom.window.close();built.cleanup();for(const k of Object.keys(originals)){if(originals[k]===undefined)delete globalThis[k];else globalThis[k]=originals[k];}delete globalThis.__auditApi;delete globalThis.__auditConfirmed;}};
}
const button=(container,label)=>[...container.querySelectorAll('button')].find(b=>b.textContent.trim()===label);
const change=async(page,select,value)=>act(async()=>{select.value=String(value);select.dispatchEvent(new page.dom.window.Event('change',{bubbles:true}));});
test('shared footer reports empty and clamped ranges and disables unavailable navigation',async()=>{
 const calls=[],props={total:0,page:0,pageSize:10,label:'Records',onPageChange:p=>calls.push(p),onPageSizeChange:()=>{}};
 const page=await mounted('components/Pagination.tsx',props,async()=>({}));
 try{assert.equal(page.container.querySelector('.table-pagination-range').textContent,'Showing 0–0 of 0');assert.ok([...page.container.querySelectorAll('button')].every(b=>b.disabled));await page.render({...props,total:21,page:99});assert.equal(page.container.querySelector('.table-pagination-range').textContent,'Showing 21–21 of 21');assert.equal(page.container.querySelector('b').textContent,'3 / 3');assert.equal(button(page.container,'Next').disabled,true);await page.click(button(page.container,'Previous'));assert.deepEqual(calls,[1]);}finally{await page.close()}
});
test('rows per page offers standard choices and resets to the first page',async()=>{
 const calls=[],page=await mounted('components/Pagination.tsx',{total:100,page:2,pageSize:8,label:'Disks',onPageChange:p=>calls.push(['page',p]),onPageSizeChange:s=>calls.push(['size',s])},async()=>({}));
 try{const select=page.container.querySelector('select');assert.deepEqual([...select.options].map(o=>o.value),['8','10','25','50']);await change(page,select,25);assert.deepEqual(calls,[['size',25],['page',0]]);assert.equal(page.container.querySelector('nav').getAttribute('aria-label'),'Disks pagination');}finally{await page.close()}
});
test('Docker image footer changes the actual page slice and preserves filtering',async()=>{
 const images=Array.from({length:31},(_,i)=>({id:'image-'+i,name:'repository-'+i,tags:[],size:1024,created:1}));
 const page=await mounted('pages/DockerImages.tsx',{data:{images,containers:[]},enabled:true,admin:true,refresh:async()=>{}},async()=>({}));
 try{assert.equal(page.container.querySelectorAll('tbody tr').length,10);await page.click(button(page.container,'Next'));assert.equal(page.container.querySelector('.table-pagination-range').textContent,'Showing 11–20 of 31');await change(page,page.container.querySelector('[aria-label="Images per page"]'),25);assert.equal(page.container.querySelectorAll('tbody tr').length,25);assert.equal(page.container.querySelector('nav b').textContent,'1 / 2');const input=page.container.querySelector('[aria-label="Search images"]');await act(async()=>input[Object.keys(input).find(k=>k.startsWith('__reactProps'))].onChange({target:{value:'repository-30'}}));assert.equal(page.container.querySelectorAll('tbody tr').length,1);assert.equal(page.container.querySelector('.table-pagination-range').textContent,'Showing 1–1 of 1');}finally{await page.close()}
});
test('one-based VM paging resets correctly when rows per page changes and clamps after inventory shrinks',async()=>{
 const vms=Array.from({length:31},(_,i)=>({id:String(i+100),name:'vm-'+i,node:'n1',status:'running'})),props={data:{vms,nodes:[{name:'n1'}],storage:[]},role:'viewer',refresh:async()=>{}};
 const page=await mounted('pages/VirtualMachines.tsx',props,async()=>({config:{},history:[],errors:[]}));
 try{await page.click(button(page.container,'Next'));assert.equal(page.container.querySelector('.table-pagination-range').textContent,'Showing 13–24 of 31');await change(page,page.container.querySelector('[aria-label="VMs per page"]'),25);assert.equal(page.container.querySelectorAll('.vm-table tbody tr').length,25);assert.equal(page.container.querySelector('nav b').textContent,'1 / 2');await page.click(button(page.container,'Next'));assert.equal(page.container.querySelectorAll('.vm-table tbody tr').length,6);await page.render({...props,data:{...props.data,vms:vms.slice(0,3)}});assert.equal(page.container.querySelector('nav b').textContent,'1 / 1');assert.equal(page.container.querySelectorAll('.vm-table tbody tr').length,3);}finally{await page.close()}
});
test('Storage disk footer changes the provider list page size without changing its target',async()=>{
 const disks=Array.from({length:27},(_,i)=>({id:'n1/disk-'+i,name:'disk-'+i,node:'n1',provider:'proxmox',type:'ssd',size:1024,health:'PASSED'}));
 const page=await mounted('pages/StorageDisks.tsx',{onTab:()=>{}},async()=>({resources:disks,errors:[]}));
 try{assert.equal(page.container.querySelectorAll('tbody tr').length,8);await page.click(button(page.container,'Next'));assert.equal(page.container.querySelector('.table-pagination-range').textContent,'Showing 9–16 of 27');await change(page,page.container.querySelector('[aria-label="Disks per page"]'),25);assert.equal(page.container.querySelectorAll('tbody tr').length,25);assert.equal(page.container.querySelector('.table-pagination-range').textContent,'Showing 1–25 of 27');}finally{await page.close()}
});
