import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
import React,{act} from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import {JSDOM} from 'jsdom';import {build} from 'esbuild';
const rootPath=fileURLToPath(new URL('../',import.meta.url));
async function component(file){
 const directory=fs.mkdtempSync(path.join(rootPath,'node_modules','audit-ui-'));
 const result=await build({entryPoints:[path.join(rootPath,'src',file)],bundle:true,format:'esm',platform:'node',packages:'external',loader:{'.css':'empty'},jsx:'automatic',write:false,plugins:[{name:'fixture-api',setup(b){b.onResolve({filter:/^@xterm\//},()=>({path:'terminal',namespace:'terminal'}));b.onLoad({filter:/.*/,namespace:'terminal'},()=>({contents:`export class Terminal {cols=100;rows=28;loadAddon(){}open(){}onData(fn){globalThis.__terminalInput=fn;return {dispose(){}}}write(){}dispose(){}focus(){}getSelection(){return 'selected'}clear(){}paste(text){globalThis.__terminalInput(text)}}export class FitAddon{fit(){}}`}));b.onResolve({filter:/\/api$/},()=>({path:'fixture-api',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export const setTokens=(...args)=>{globalThis.__brandTokens=args};export const clearTokens=()=>{};export const api=(...a)=>globalThis.__auditApi(...a);export const confirmedApi=(...a)=>globalThis.__auditConfirmed(...a);export function setDockerHost(id){localStorage.setItem('homecloud_docker_host',id);window.dispatchEvent(new Event('homecloud-connection'));}` }));}}]});
 const modulePath=path.join(directory,'component.mjs');fs.writeFileSync(modulePath,result.outputFiles[0].text);const module=await import(pathToFileURL(modulePath));return {module,cleanup:()=>fs.rmSync(directory,{recursive:true,force:true})};
}
async function mounted(file,props,api,mobile=true,strict=false){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://homecloud.test'});const navigatorDescriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});const originals={};for(const k of ['window','document','localStorage','sessionStorage','Event','CustomEvent','HTMLElement','FormData','ResizeObserver','requestAnimationFrame']){originals[k]=globalThis[k];globalThis[k]=dom.window[k];}
 dom.window.matchMedia=()=>({matches:mobile,addEventListener(){},removeEventListener(){}});globalThis.ResizeObserver=class {observe(){}disconnect(){}};globalThis.requestAnimationFrame=fn=>{fn();return 1};globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.__auditApi=api;globalThis.__auditConfirmed=api;dom.window.confirm=()=>true;
 const built=await component(file),container=dom.window.document.getElementById('root'),root=createRoot(container);const Component=built.module.default;
 const render=async values=>{await act(async()=>{root.render(React.createElement(strict?React.StrictMode:React.Fragment,null,React.createElement(MemoryRouter,null,React.createElement(Component,values))));await new Promise(r=>setTimeout(r,0));});};
 await render(props);
 return {dom,container,render,click:async button=>{assert.ok(button,'Expected control is rendered');await act(async()=>{button.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,0));});},close:async()=>{await act(async()=>root.unmount());await new Promise(r=>setTimeout(r,10));dom.window.close();built.cleanup();for(const k of Object.keys(originals)){if(originals[k]===undefined)delete globalThis[k];else globalThis[k]=originals[k];}if(navigatorDescriptor)Object.defineProperty(globalThis,'navigator',navigatorDescriptor);else delete globalThis.navigator;delete globalThis.__auditApi;delete globalThis.__auditConfirmed;}};
}



const change=async(page,selector,value)=>{const input=page.container.querySelector(selector);await act(async()=>{input[Object.keys(input).find(k=>k.startsWith('__reactProps'))].onChange({target:{value}})})};
test('i-Clusters sign in retains password visibility, remembered sessions and safe support links',async()=>{
 let request;const page=await mounted('pages/Login.tsx',{onLogin(){request.loggedIn=true}},async(p,init)=>{if(p==='/auth/setup')return {registrationOpen:false};request={body:JSON.parse(init.body)};return {accessToken:'access',refreshToken:'refresh'}});
 try{assert.match(page.container.textContent,/i-Clusters/);assert.equal(page.container.querySelector('.login-logo img').getAttribute('src'),'/assets/iclusters-512.png');for(const link of page.container.querySelectorAll('a'))assert.match(link.href,/^https:\/\/(www|support)\.i-clusters\.com/);
 await change(page,'input[type=email]','owner@example.test');await change(page,'#login-password','secret');await page.click(page.container.querySelector('[aria-label="Show password"]'));assert.equal(page.container.querySelector('#login-password').type,'text');await page.click(page.container.querySelector('input[type=checkbox]'));
 await act(async()=>page.container.querySelector('form').dispatchEvent(new page.dom.window.Event('submit',{bubbles:true,cancelable:true})));assert.deepEqual(request.body,{email:'owner@example.test',password:'secret'});assert.equal(request.loggedIn,true);assert.deepEqual(globalThis.__brandTokens,['access','refresh',true]);
 }finally{delete globalThis.__brandTokens;await page.close()}
});
test('i-Clusters first-use owner registration still requires its setup code and returns to sign in',async()=>{
 let body;const page=await mounted('pages/Login.tsx',{onLogin(){}},async(p,init)=>p==='/auth/setup'?{registrationOpen:true}:((body=JSON.parse(init.body)),{}));
 try{const inputs=[...page.container.querySelectorAll('input')];
 const values=['Owner','owner@example.test','long-password','long-password','setup-code'];await act(async()=>{inputs.forEach((input,index)=>input[Object.keys(input).find(k=>k.startsWith('__reactProps'))].onChange({target:{value:values[index]}}))});
 await act(async()=>page.container.querySelector('form').dispatchEvent(new page.dom.window.Event('submit',{bubbles:true,cancelable:true})));assert.deepEqual(body,{name:'Owner',email:'owner@example.test',password:'long-password',setupToken:'setup-code'});assert.match(page.container.textContent,/Owner account created/);assert.match(page.container.querySelector('h1').textContent,/Sign in/);assert.equal(page.container.querySelector('#login-password').value,'');
 }finally{await page.close()}
});
