import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
async function offlineHTML(){
 const events={};vm.runInNewContext(source,{self:{addEventListener:(name,fn)=>events[name]=fn},fetch:async()=>{throw Error('unreachable')},Response});
 let promise;events.fetch({request:{mode:'navigate'},respondWith:p=>promise=p});return (await promise).text();
}
function recovery(html,fetch){
 const events={},timers=new Map(),nodes=Object.fromEntries(['retry','status','address'].map(id=>[id,{textContent:'',disabled:false,addEventListener:(name,fn)=>events[id+':'+name]=fn}]));let count=0,reloads=0;
 const document={hidden:false,getElementById:id=>nodes[id],addEventListener:(name,fn)=>events['document:'+name]=fn};
 vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],{document,window:{addEventListener:(name,fn)=>events['window:'+name]=fn},location:{host:'192.168.20.104:6002',reload:()=>reloads++},fetch,AbortController,setTimeout:(fn,ms)=>{const id=++count;timers.set(id,{fn,ms});return id},clearTimeout:id=>timers.delete(id)});
 return {document,nodes,events,timers,reloads:()=>reloads};
}
test('navigation failures and server errors return a self-contained responsive screen; auth errors stay untouched',async()=>{
 const events={};let status=502;
 vm.runInNewContext(source,{self:{addEventListener:(name,fn)=>events[name]=fn},fetch:async()=>new Response('upstream error',{status}),Response});
 let response;events.fetch({request:{mode:'navigate'},respondWith:p=>response=p});const fallback=await response,html=await fallback.text();
 assert.equal(fallback.status,503);assert.match(html,/viewport-fit=cover/);assert.match(html,/prefers-color-scheme:light/);assert.match(html,/safe-area-inset/);assert.match(html,/Unable to reach i-Clusters/);assert.match(html,/Your VPN stays managed in its own app/);assert.doesNotMatch(html,/<(?:link|img)[^>]+(?:href|src)=/);assert.equal(fallback.headers.get('Cache-Control'),'no-store');
 status=403;events.fetch({request:{mode:'navigate'},respondWith:p=>response=p});assert.equal((await response).status,403);
});
test('retry probes public health without credentials or cache and reloads only after verified recovery',async()=>{
 const calls=[],page=recovery(await offlineHTML(),async(path,options)=>{calls.push({path,options});return {ok:true,json:async()=>({ok:true})}});
 assert.equal(page.nodes.address.textContent,'192.168.20.104:6002');await page.events['retry:click']();assert.equal(page.reloads(),1);assert.equal(calls[0].path,'/api/health');assert.equal(calls[0].options.cache,'no-store');assert.equal(calls[0].options.credentials,'omit');
});
test('server failures and captive-portal responses do not cause a reload loop',async()=>{
 for(const response of [{ok:false},{ok:true,json:async()=>({ok:false})},{ok:true,json:async()=>{throw Error('HTML response')}}]){
  const page=recovery(await offlineHTML(),async()=>response);await page.events['retry:click']();assert.equal(page.reloads(),0);assert.equal(page.nodes.retry.disabled,false);assert.ok([...page.timers.values()].some(t=>t.ms===5000));
 }
});
test('checks time out, pause in hidden pages and stop after leaving the page',async()=>{
 let calls=0;const page=recovery(await offlineHTML(),async(path,{signal})=>{calls++;return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('timeout'))))});
 const checking=page.events['retry:click']();assert.equal(page.nodes.retry.disabled,true);await page.events['window:online']();assert.equal(calls,1);
 [...page.timers.values()].find(t=>t.ms===6000).fn();await checking;assert.equal(page.nodes.retry.disabled,false);assert.equal(page.reloads(),0);
 page.document.hidden=true;page.events['document:visibilitychange']();assert.equal(page.timers.size,0);await page.events['window:online']();assert.equal(calls,1);
 page.events['window:pagehide']();page.document.hidden=false;await page.events['window:online']();assert.equal(calls,1);
});
