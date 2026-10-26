import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';import React,{act} from 'react';import {createRoot} from 'react-dom/client';import {JSDOM} from 'jsdom';import {build} from 'esbuild';
const rootPath=fileURLToPath(new URL('../',import.meta.url)),tick=()=>new Promise(r=>setTimeout(r,0));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
async function harness(read){
 const folder=fs.mkdtempSync(path.join(rootPath,'node_modules','loading-ui-'));const result=await build({entryPoints:[path.join(rootPath,'src/hooks.ts')],bundle:true,format:'esm',platform:'node',packages:'external',write:false,plugins:[{name:'fixture',setup(b){b.onResolve({filter:/^\.\/api$/},()=>({path:'api',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const api=(...args)=>globalThis.__loadingRead(...args)'}))}}]});const file=path.join(folder,'hooks.mjs');fs.writeFileSync(file,result.outputFiles[0].text);const hooks=await import(pathToFileURL(file));
 const dom=new JSDOM('<div id="root"></div>',{url:'https://fixture.test'}),original={};for(const key of ['window','document','Event','CustomEvent','localStorage']){original[key]=globalThis[key];globalThis[key]=dom.window[key];}globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.__loadingRead=read;localStorage.setItem('iclusters_access_token','owner');localStorage.setItem('iclusters_docker_host','one');
 const root=createRoot(document.getElementById('root'));function Probe({path,id,refreshMs=0}){const r=hooks.useApi(path,null,refreshMs);return React.createElement('section',{'data-id':id},React.createElement('span',null,r.data?.value||'Loading'),React.createElement('small',null,r.error),React.createElement('button',{onClick:()=>r.refresh()},'Refresh'));}
 function Bundle(){const r=hooks.useResourceRefresh(['/a','/b','/not-mounted']);return React.createElement('button',{'data-bundle':true,disabled:r.refreshing,onClick:r.refresh},r.refreshing?'Refreshing':'Refresh all')}
 const render=async(rows,strict=false)=>act(async()=>{root.render(React.createElement(strict?React.StrictMode:React.Fragment,null,rows.map(([id,path,refreshMs])=>path==='__bundle__'?React.createElement(Bundle,{key:id}):React.createElement(Probe,{key:id,id,path,refreshMs}))));await tick()});
 return {render,hooks,container:document.getElementById('root'),event:async name=>act(async()=>{window.dispatchEvent(new Event(name));await tick()}),close:async()=>{await act(async()=>root.unmount());await tick();dom.window.close();fs.rmSync(folder,{recursive:true,force:true});for(const key of Object.keys(original)){if(original[key]===undefined)delete globalThis[key];else globalThis[key]=original[key];}delete globalThis.__loadingRead;}};
}
test('matching consumers and StrictMode share a request and revisits show cached data immediately',async()=>{
 let calls=0;const page=await harness(async()=>{calls++;return {value:'Ready'}});try{await page.render([['a','/dashboard'],['b','/dashboard']],true);assert.equal(calls,1);assert.equal(page.container.querySelectorAll('span')[1].textContent,'Ready');await page.render([]);await page.render([['a','/dashboard']]);assert.equal(calls,1);assert.equal(page.container.querySelector('span').textContent,'Ready');await act(async()=>{page.container.querySelector('button').click();await tick()});assert.equal(calls,2);}finally{await page.close()}
});
test('unmounting one consumer keeps the shared request alive for the other consumer',async()=>{
 const gate=deferred();let signal,calls=0;const page=await harness((p,o)=>{calls++;signal=o.signal;return gate.promise});try{await page.render([['a','/network'],['b','/network']]);await page.render([['b','/network']]);assert.equal(signal.aborted,false);await act(async()=>{gate.resolve({value:'Network'});await tick()});assert.equal(calls,1);assert.equal(page.container.querySelector('span').textContent,'Network');}finally{gate.resolve({});await page.close()}
});
test('switching hosts aborts old reads and rejects their late replies even if transport ignores abort',async()=>{
 const old=deferred();let signal;const page=await harness((p,o)=>{if(localStorage.getItem('iclusters_docker_host')==='one'){signal=o.signal;return old.promise}return Promise.resolve({value:'Host Two'})});try{await page.render([['a','/docker']]);localStorage.setItem('iclusters_docker_host','two');await page.event('iclusters-connection');assert.equal(signal.aborted,true);assert.equal(page.container.querySelector('span').textContent,'Host Two');await act(async()=>{old.resolve({value:'Wrong Host'});await tick()});assert.equal(page.container.querySelector('span').textContent,'Host Two');}finally{old.resolve({});await page.close()}
});
test('write invalidation revalidates revisits and changed sessions cannot reuse another user data',async()=>{
 let calls=0;const page=await harness(async()=>({value:`Read ${++calls}`}));try{await page.render([['a','/storage']]);await page.render([]);await page.event('iclusters-api-write');await page.render([['a','/storage']]);assert.equal(calls,2);localStorage.setItem('iclusters_access_token','viewer');await page.render([['a','/storage']]);assert.equal(calls,3);assert.equal(page.container.querySelector('span').textContent,'Read 3');}finally{await page.close()}
});
test('resource refresh waits for the deduplicated operation and forbidden reads remove old data',async()=>{
 let calls=0;const gate=deferred();const page=await harness(async()=>{if(++calls===1)return {value:'Old'};return gate.promise});try{await page.render([['a','/users'],['b','/users']]);let finished=false;let work;await act(async()=>{work=page.hooks.refreshResources(['/users']).then(()=>{finished=true});await tick()});assert.equal(calls,2);assert.equal(finished,false);await act(async()=>{gate.reject(Object.assign(Error('Forbidden'),{status:403}));await work});assert.equal(finished,true);assert.ok(!page.container.textContent.includes('Old'));assert.ok(page.container.textContent.includes('Forbidden'));}finally{gate.resolve({});await page.close()}
});

test('partial startup polling completes without forcing another backend scan',async()=>{
 const requests=[];const page=await harness(async(p,o)=>{requests.push(o);return requests.length===1?{value:'Partial',refreshing:true}:{value:'Complete',refreshing:false}});
 try{await page.render([['a','/dashboard']]);await act(async()=>{await new Promise(r=>setTimeout(r,1100))});assert.equal(requests.length,2);assert.equal(requests[1].headers,undefined);assert.equal(page.container.querySelector('span').textContent,'Complete');await act(async()=>{await new Promise(r=>setTimeout(r,1100))});assert.equal(requests.length,2);}finally{await page.close()}
});

test('clearing the browser read cache revalidates mounted views without clearing credentials or host selection',async()=>{
 let calls=0;const page=await harness(async()=>({value:`Read ${++calls}`}));try{await page.render([['a','/settings']]);const token=localStorage.getItem('iclusters_access_token'),host=localStorage.getItem('iclusters_docker_host');await act(async()=>{page.hooks.clearApiCache();await tick()});assert.equal(calls,2);assert.equal(page.container.querySelector('span').textContent,'Read 2');assert.equal(localStorage.getItem('iclusters_access_token'),token);assert.equal(localStorage.getItem('iclusters_docker_host'),host);}finally{await page.close()}
});
test('scheduled reports use ordinary reads while the Refresh button requests an explicit fresh read',async()=>{
 const requests=[];const page=await harness(async(p,o)=>{requests.push(o);return {value:'Ready'}});
 try{await page.render([['a','/storage',20]]);await act(async()=>{await new Promise(r=>setTimeout(r,60))});assert.ok(requests.length>1);assert.ok(requests.every(o=>!o.headers));await act(async()=>{page.container.querySelector('button').click();await tick()});assert.ok(requests.some(o=>o.headers?.['X-IClusters-Refresh']==='1'));}finally{await page.close()}
});
test('timed-out report reads show a retryable error and keep the last available report',async()=>{
 let calls=0;const page=await harness(async(p,o)=>{if(++calls===1)return {value:'Last report'};return new Promise((resolve,reject)=>o.signal.addEventListener('abort',()=>reject(new Error('Aborted')),{once:true}))});
 const original=window.setTimeout;let expire;
 try{await page.render([['a','/storage']]);window.setTimeout=(fn,ms,...args)=>ms===30000?(expire=fn,1):original.call(window,fn,ms,...args);await act(async()=>{page.container.querySelector('button').click();await tick()});await act(async()=>{expire();await tick()});assert.match(page.container.textContent,/Last report/);assert.match(page.container.textContent,/timed out.*Refresh/);}finally{window.setTimeout=original;await page.close()}
});

test('a write during a pending first read immediately reloads mounted reports without waiting for polling',async()=>{
 const first=deferred();let calls=0,signal;const page=await harness((p,o)=>{calls++;if(calls===1){signal=o.signal;return first.promise}return Promise.resolve({value:'Updated inventory'})});
 try{await page.render([['a','/storage',0],['b','/storage',0]]);await page.event('iclusters-api-write');assert.equal(signal.aborted,true);assert.equal(calls,2);assert.equal(page.container.querySelectorAll('span')[0].textContent,'Updated inventory');await act(async()=>{first.resolve({value:'Obsolete inventory'});await tick()});assert.ok(!page.container.textContent.includes('Obsolete inventory'))}finally{first.resolve({});await page.close()}
});

test('active background checks select a faster polling interval and return to the quiet interval',async()=>{
 let calls=0;const interval=data=>data?.checking?15:30000;
 const page=await harness(async()=>({value:'Ready',checking:++calls<3}));
 try{await page.render([['a','/docker/updates',interval]]);await act(async()=>{await new Promise(r=>setTimeout(r,100))});assert.equal(calls,3);await act(async()=>{await new Promise(r=>setTimeout(r,50))});assert.equal(calls,3);}finally{await page.close()}
});

test('manual refresh during a background read queues one fresh request and keeps current measurements visible',async()=>{
 const gate=deferred(),requests=[];const page=await harness(async(p,o)=>{requests.push(o);if(requests.length===1)return {value:'Current'};if(requests.length===2)return gate.promise;return {value:'Fresh'}});
 try{await page.render([['a','/dashboard'],['b','/dashboard']]);await page.event('iclusters-api-write');assert.match(page.container.textContent,/Current/);let work;await act(async()=>{work=page.hooks.refreshResources(['/dashboard']);await tick()});assert.equal(requests.length,2);assert.match(page.container.textContent,/Current/);await act(async()=>{gate.resolve({value:'Background'});await work;await tick()});assert.equal(requests.length,3);assert.equal(requests[2].headers['X-IClusters-Refresh'],'1');assert.match(page.container.textContent,/Fresh/)}finally{gate.resolve({});await page.close()}
});
test('queued manual refresh is discarded when its last page unmounts',async()=>{
 const gate=deferred();let calls=0;const page=await harness(async()=>{calls++;return gate.promise});try{await page.render([['a','/dashboard']]);let work;await act(async()=>{work=page.hooks.refreshResources(['/dashboard']);await tick()});await page.render([]);await act(async()=>{gate.resolve({value:'Old'});await work;await tick()});assert.equal(calls,1)}finally{gate.resolve({});await page.close()}
});

test('workspace refresh coalesces repeat clicks and waits for every mounted report including failures',async()=>{
 const a=deferred(),b=deferred();let phase=0;const calls=[];const page=await harness(async(p,options)=>{calls.push({p,options});if(phase===1)return p==='/a'?a.promise:b.promise;return {value:'Fresh '+p}});
 try{await page.render([['a','/a'],['b','/b'],['bundle','__bundle__']]);phase=1;const button=page.container.querySelector('[data-bundle]');await act(async()=>{button.click();button.click();await tick()});assert.equal(calls.filter(c=>c.p==='/a').length,2);assert.equal(calls.filter(c=>c.p==='/b').length,2);assert.equal(calls.some(c=>c.p==='/not-mounted'),false);assert.equal(button.disabled,true);await act(async()=>{a.reject(Error('A unavailable'));await tick()});assert.equal(button.disabled,true);assert.match(page.container.querySelector('[data-id=a]').textContent,/A unavailable/);await act(async()=>{b.resolve({value:'B recovered'});await tick()});assert.equal(button.disabled,false);assert.match(page.container.querySelector('[data-id=b]').textContent,/B recovered/);phase=2;await act(async()=>{button.click();await tick()});assert.equal(page.container.querySelector('[data-id=a] small').textContent,'');assert.ok(calls.slice(2).every(c=>c.options.headers['X-IClusters-Refresh']==='1'));}finally{a.resolve({});b.resolve({});await page.close()}
});
