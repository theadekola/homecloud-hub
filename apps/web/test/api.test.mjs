import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildSync} from 'esbuild';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const source=fs.readFileSync(new URL('../src/api.ts',import.meta.url),'utf8').replace('import.meta.env.VITE_API_URL',"''");
const compiled=buildSync({stdin:{contents:source,loader:'ts',resolveDir:path.dirname(fileURLToPath(new URL('../src/api.ts',import.meta.url)))},bundle:true,format:'esm',platform:'node',write:false}).outputFiles[0].text;
let generation=0;
async function client(){
 const values=new Map();globalThis.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
 const temporary=new Map();globalThis.sessionStorage={getItem:key=>temporary.get(key)??null,setItem:(key,value)=>temporary.set(key,String(value)),removeItem:key=>temporary.delete(key)};
 globalThis.CustomEvent??=class extends Event{constructor(type,options){super(type);this.detail=options?.detail}};
 globalThis.window={prompt:()=>null,dispatchEvent:e=>{values.set('lastEvent',e.type)}};
 return import(`data:text/javascript;base64,${Buffer.from(compiled+`\n// ${++generation}`).toString('base64')}`);
}
const response=(status,body={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const original={fetch:globalThis.fetch,window:globalThis.window,localStorage:globalThis.localStorage,sessionStorage:globalThis.sessionStorage};
try{
 await test('Proxmox confirmation combines warning approval and SSH authentication without native prompt',async()=>{
  const c=await client();c.setTokens('token','refresh');let calls=0,requests=[];window.prompt=()=>{throw Error('Native prompt must not open')};window.dispatchEvent=e=>{if(e.type==='homecloud-api-write')return;assert.equal(e.type,'homecloud-ssh-approval');assert.equal(e.detail.target,'vm:pve:100');e.detail.resolve('grant')};globalThis.fetch=async(url,options)=>{requests.push(options);return ++calls===1?response(409,{confirmationPhrase:'CONFIRM reboot',sshTarget:'vm:pve:100'}):response(200,{ok:true})};assert.deepEqual(await c.confirmedApi('/actions/proxmox/vm/100/reboot',{method:'POST',body:JSON.stringify({node:'pve'})}),{ok:true});assert.equal(new Headers(requests[1].headers).get('X-HomeCloud-SSH-Grant'),'grant');assert.equal(requests[1].headers['X-HomeCloud-Confirm'],'CONFIRM reboot');
 });
 await test('PUT and DELETE target approvals use SSH modal metadata and pin selected Docker host without native passkeys',async()=>{
  for(const method of ['PUT','DELETE']){const c=await client();c.setTokens('token','refresh');c.setDockerHost('original-host');let detail,requests=[];window.prompt=()=>{throw Error('Native confirmation must not open')};window.dispatchEvent=e=>{if(e.type==='homecloud-ssh-approval'){detail=e.detail;c.setDockerHost('changed-host');detail.resolve('verified grant')}};
   globalThis.fetch=async(url,options)=>{requests.push(options);return requests.length===1?response(409,{confirmationPhrase:'server binding',sshTarget:'node:pve'}):response(200,{ok:true})};
   await c.confirmedApi('/network/dns/pve',{method,body:'{"dns1":"192.0.2.1"}'});assert.equal(detail.method,method);assert.equal(detail.target,'node:pve');assert.equal(detail.dockerHost,'original-host');assert.equal(new Headers(requests[1].headers).get('X-HomeCloud-SSH-Grant'),'verified grant');assert.equal(new Headers(requests[1].headers).get('X-HomeCloud-Docker-Host'),'original-host');
  }
 });
 await test('terminal streaming shares token refresh and returns an unread authenticated response',async()=>{
  const c=await client();c.setTokens('old','refresh');let refreshes=0;const requests=[];
  globalThis.fetch=async(url,options)=>{requests.push({url,headers:new Headers(options.headers)});if(url.endsWith('/auth/refresh')){refreshes++;return response(200,{accessToken:'new',refreshToken:'rotated'})}if(new Headers(options.headers).get('Authorization')!=='Bearer new')return response(401);return new Response('{"output":"echo","closed":false}\n',{headers:{'Content-Type':'application/x-ndjson'}})};
  const stream=await c.api('/ssh/session/test/output',{},undefined,true);assert.equal(refreshes,1);assert.equal(stream.bodyUsed,false);assert.equal(await stream.text(),'{"output":"echo","closed":false}\n');assert.equal(requests.at(-1).headers.get('Authorization'),'Bearer new');assert.ok(!requests.some(r=>r.url.includes('token=')));
  globalThis.fetch=async()=>response(403,{error:'Insufficient permissions'});await assert.rejects(c.api('/ssh/session/test/output',{},undefined,true),{status:403});
 });
 await test('temporary refresh failures preserve both session tokens and report availability',async()=>{
  const c=await client();c.setTokens('old','refresh');
  globalThis.fetch=async url=>response(url.endsWith('/auth/refresh')?503:401);
  await assert.rejects(c.api('/auth/me'),{status:503});
  assert.equal(c.getAccessToken(),'old');assert.equal(localStorage.getItem('homecloud_refresh_token'),'refresh');
 });
 await test('rejected refresh tokens clear the session',async()=>{
  const c=await client();c.setTokens('old','refresh');globalThis.fetch=async()=>response(401);
  await assert.rejects(c.api('/auth/me'),{status:401});assert.equal(c.getAccessToken(),'');assert.equal(localStorage.getItem('homecloud_refresh_token'),null);assert.equal(localStorage.getItem('lastEvent'),'homecloud-session-expired');
 });
 await test('simultaneous expired requests share one token refresh and retry successfully',async()=>{
  const c=await client();c.setTokens('old','refresh');let refreshes=0;
  globalThis.fetch=async(url,options)=>{
   if(url.endsWith('/auth/refresh')){refreshes++;await new Promise(resolve=>setTimeout(resolve,5));return response(200,{accessToken:'new',refreshToken:'rotated'});}
   return response(new Headers(options.headers).get('Authorization')==='Bearer new'?200:401,{ok:true});
  };
  const results=await Promise.all([c.api('/docker'),c.api('/storage')]);assert.equal(refreshes,1);assert.ok(results.every(r=>r.ok));
 });
 await test('confirmation retries stay on the original Docker host even when selection changes',async()=>{
  const c=await client();c.setDockerHost('node-a:lxc/101');const calls=[];
  globalThis.fetch=async(url,options)=>{calls.push(new Headers(options.headers));return calls.length===1?response(409,{confirmationPhrase:'CONFIRM host-a'}):response(200,{ok:true});};
  window.prompt=()=>{c.setDockerHost('node-b:lxc/101');return 'CONFIRM host-a'};
  await c.confirmedApi('/docker/volume/data',{method:'DELETE'});
  assert.equal(calls[0].get('X-HomeCloud-Docker-Host'),'node-a:lxc/101');assert.equal(calls[1].get('X-HomeCloud-Docker-Host'),'node-a:lxc/101');
  assert.equal(calls[1].get('X-HomeCloud-Confirm'),'CONFIRM host-a');
 });
 await test('direct Engine confirmation does not switch to a subsequently selected agent',async()=>{
  const c=await client();const calls=[];
  globalThis.fetch=async(url,options)=>{calls.push(new Headers(options.headers));return calls.length===1?response(409,{confirmationPhrase:'CONFIRM direct'}):response(200);};
  window.prompt=()=>{c.setDockerHost('node-b:lxc/101');return 'CONFIRM direct'};
  await c.confirmedApi('/docker/prune/volumes',{method:'POST'});assert.equal(calls[1].get('X-HomeCloud-Docker-Host'),'');
 });
 await test('request headers and cancellation signals reach fetch',async()=>{
  const c=await client(),controller=new AbortController();let seen;
  globalThis.fetch=async(url,options)=>{seen=options;return response(200)};
  await c.api('/storage',{headers:new Headers({'X-Test':'present'}),signal:controller.signal});
  assert.equal(new Headers(seen.headers).get('X-Test'),'present');assert.equal(seen.signal.aborted,false);controller.abort();assert.equal(seen.signal.aborted,false); // completed request has released its caller listener
 });
 await test('Storage and Network use the same selection while TrueNAS share reads remain separate',async()=>{
  const c=await client();c.setDockerHost('node-a:lxc/101');const calls=[];
  globalThis.fetch=async(url,options)=>{calls.push([url,new Headers(options.headers).get('X-HomeCloud-Docker-Host')]);return response(200)};
  await c.api('/storage');await c.api('/network');await c.api('/storage/shares');
  assert.equal(calls[0][1],'node-a:lxc/101');assert.equal(calls[1][1],'node-a:lxc/101');assert.equal(calls[2][1],null);
 });
 await test('cancelled confirmation never submits the destructive retry',async()=>{
  const c=await client();let calls=0;globalThis.fetch=async()=>{calls++;return response(409,{confirmationPhrase:'CONFIRM'})};
  await assert.rejects(c.confirmedApi('/docker/volume/data',{method:'DELETE'}),/cancelled/);assert.equal(calls,1);
 });
 await test('temporary account-service failures retain both access and refresh tokens',async()=>{
  const c=await client();c.setTokens('old','refresh');globalThis.fetch=async url=>url.endsWith('/auth/refresh')?response(503,{error:'Account service temporarily unavailable'}):response(401);
  await assert.rejects(c.api('/auth/me'),{status:503});assert.equal(c.getAccessToken(),'old');assert.equal(localStorage.getItem('homecloud_refresh_token'),'refresh');
 });
 await test('successful writes invalidate read caches while GET, SSH and failed writes do not',async()=>{
  const c=await client(),events=[];window.dispatchEvent=e=>{events.push(e.type)};globalThis.fetch=async()=>response(200,{});
  await c.api('/storage');await c.api('/ssh/session/one',{method:'POST',body:'{}'});assert.deepEqual(events,[]);
  await c.api('/actions/docker/container/one/restart',{method:'POST',body:'{}'});assert.deepEqual(events,['homecloud-api-write']);
  globalThis.fetch=async()=>response(403,{error:'Denied'});await assert.rejects(c.api('/users',{method:'POST',body:'{}'}));assert.equal(events.length,1);
 });
 await test('a late refresh response cannot restore tokens after sign out',async()=>{
  const c=await client();c.setTokens('old','refresh',false);let finish,started;const ready=new Promise(resolve=>started=resolve);
  globalThis.fetch=async url=>{if(url.endsWith('/auth/refresh')){started();return new Promise(resolve=>finish=resolve)}return response(401)};
  const pending=c.api('/auth/me');await ready;c.clearTokens();finish(response(200,{accessToken:'late',refreshToken:'late-refresh'}));await assert.rejects(pending,{status:401});assert.equal(c.getAccessToken(),'');assert.equal(sessionStorage.getItem('homecloud_refresh_token'),null);assert.equal(localStorage.getItem('homecloud_refresh_token'),null);
 });
 await test('concurrent reads and failures remain silent',async()=>{
  const c=await client(),counts=[];window.dispatchEvent=e=>{if(e.type==='homecloud-network-loading')counts.push(e.detail)};let finish;
  globalThis.fetch=async url=>url.endsWith('/one')?new Promise(resolve=>finish=resolve):Promise.reject(Error('Offline'));
  const first=c.api('/one');await assert.rejects(c.api('/two'),/Offline/);finish(response(200));await first;assert.deepEqual(counts,[]);
 });
}finally{Object.assign(globalThis,original);}
