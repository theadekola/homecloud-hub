import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync(new URL('../src/api.ts',import.meta.url),'utf8').replace('import.meta.env.VITE_API_URL',"''");
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
let generation=0;
async function client(){
 const values=new Map();globalThis.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
 globalThis.window={prompt:()=>null};
 return import(`data:text/javascript;base64,${Buffer.from(compiled+`\n// ${++generation}`).toString('base64')}`);
}
const response=(status,body={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const original={fetch:globalThis.fetch,window:globalThis.window,localStorage:globalThis.localStorage};
try{
 await test('temporary refresh failures preserve both session tokens and report availability',async()=>{
  const c=await client();c.setTokens('old','refresh');
  globalThis.fetch=async url=>response(url.endsWith('/auth/refresh')?503:401);
  await assert.rejects(c.api('/auth/me'),{status:503});
  assert.equal(c.getAccessToken(),'old');assert.equal(localStorage.getItem('homecloud_refresh_token'),'refresh');
 });
 await test('rejected refresh tokens clear the session',async()=>{
  const c=await client();c.setTokens('old','refresh');globalThis.fetch=async()=>response(401);
  await assert.rejects(c.api('/auth/me'),{status:401});assert.equal(c.getAccessToken(),'');assert.equal(localStorage.getItem('homecloud_refresh_token'),null);
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
  assert.equal(new Headers(seen.headers).get('X-Test'),'present');assert.equal(seen.signal,controller.signal);
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
}finally{Object.assign(globalThis,original);}
