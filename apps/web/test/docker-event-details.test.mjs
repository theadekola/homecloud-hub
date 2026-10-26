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

const command='/bin/sh -c curl "${HEALTHCHECK_URL}" || exit 1';
const event=(Action,extra={})=>({Type:'container',Action,time:1792278000,Actor:{ID:'abc',Attributes:{name:'jellyfin',...extra}}});
const events=[event('exec_create: '+command),{...event('die',{exitCode:'1'}),time:1792277990}];
test('event details open only from View, close without reopening, and retain selection across refresh',async()=>{
 let refreshes=0;const page=await mounted('pages/DockerEvents.tsx',{host:{hostname:'node01'}},async()=>{refreshes++;return {events,since:1792270000,until:1792280000}});
 try{
  assert.equal(page.container.querySelector('.docker-event-details'),null);
  await page.click(button(page.container,'Refresh'));
  assert.equal(page.container.querySelector('.docker-event-details'),null);
  await page.click(button(page.container,'View'));
  const panel=()=>page.container.querySelector('.docker-event-details');
  assert.match(panel().textContent,/Command prepared/);assert.match(panel().textContent,/No command result/);
  assert.equal(panel().querySelectorAll('details[open]').length,0);
  assert.equal(panel().querySelector('pre').textContent,command);
  await page.click(button(page.container,'Refresh'));assert.match(panel().textContent,/Command prepared/);
  await page.click(page.container.querySelector('[aria-label="Close event details"]'));assert.equal(panel(),null);
  await page.click(button(page.container,'Refresh'));assert.equal(panel(),null);assert.ok(refreshes>=4);
  await page.click(button(page.container,'Event Timeline'));assert.equal(panel(),null);
  await page.click(button(page.container,'View'));assert.match(panel().textContent,/Command prepared/);
  await page.click(page.container.querySelector('[aria-label="Close event details"]'));
  await page.click(button(page.container,'Event Log'));
  const views=[...page.container.querySelectorAll('tbody button')];await page.click(views[1]);assert.match(panel().textContent,/non-zero exit/);
  await page.render({host:{hostname:'node02'}});assert.equal(panel(),null);
 }finally{await page.close()}
});
test('event explanations use reported exit codes and never infer failure from shell command text',async()=>{
 const built=await component('docker-event-presentation.ts');try{
  const describe=built.module.describeDockerEvent;
  assert.match(describe(events[0]).outcome,/No command result/);
  assert.equal(describe(events[0]).command,command);
  assert.match(describe(event('exec_die',{exitCode:0})).outcome,/successful exit/);
  assert.match(describe(event('exec_die',{exitCode:'2'})).outcome,/non-zero exit/);
  assert.match(describe(event('die')).outcome,/cannot be determined/);
  assert.match(describe(event('health_status: unhealthy')).title,/failed/);
  assert.match(describe(event('health_status: healthy')).title,/passed/);
  assert.match(describe({...event('create'),Type:'network'}).description,/source: network/);
  assert.match(describe(event('future_action')).description,/future_action/);
 }finally{built.cleanup()}
});
