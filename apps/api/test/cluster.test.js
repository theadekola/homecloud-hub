import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import { spawnSync } from 'node:child_process';

const temporaryRoot=path.resolve('runtime');fs.mkdirSync(temporaryRoot,{recursive:true});
process.env.DATA_DIR=fs.mkdtempSync(path.join(temporaryRoot,'homecloud-cluster-'));
process.env.JWT_SECRET='cluster-test-key'.repeat(5);
process.env.JWT_REFRESH_SECRET='cluster-refresh-test-key'.repeat(4);
const {validateCluster,createClusterStore,clusterStore}=await import('../src/cluster-config.js');
const input={name:'Lab',host:'localhost',port:8006,tokenId:'lab@pve!hub',tokenSecret:'private-test-token',verifyTls:true,ca:''};
await test('cluster credentials are encrypted, authenticated and validated',()=>{
 const file=path.join(process.env.DATA_DIR,'test.json'),store=createClusterStore(file,()=>process.env.JWT_SECRET);
 store.save(input);assert.deepEqual(store.read(),validateCluster(input));
 const raw=fs.readFileSync(file,'utf8');assert.ok(!raw.includes(input.tokenSecret));assert.ok(!raw.includes(input.tokenId));
 assert.throws(()=>createClusterStore(file,()=> 'wrong-key'.repeat(8)).read());
 assert.throws(()=>validateCluster({...input,host:'https://example.com/path'}));
 assert.throws(()=>validateCluster({...input,port:0}));assert.throws(()=>validateCluster({...input,tokenId:'root@pam'}));
 assert.throws(()=>validateCluster({...input,verifyTls:'false'}));store.remove();assert.equal(store.read(),null);
});
const openssl=process.platform==='win32'?'C:/Program Files/Git/mingw64/bin/openssl.exe':'openssl';
await test('owner can test and save a live cluster, secrets stay hidden and failures preserve the connection',{skip:spawnSync(openssl,['version']).status!==0},async()=>{
 const key=path.join(process.env.DATA_DIR,'key.pem'),cert=path.join(process.env.DATA_DIR,'cert.pem');
 assert.equal(spawnSync(openssl,['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1']).status,0);
 const ca=fs.readFileSync(cert,'utf8');let calls=0;
 const upstream=https.createServer({key:fs.readFileSync(key),cert:ca},(req,res)=>{
  calls++;if(req.headers.authorization!==`PVEAPIToken=${input.tokenId}=${input.tokenSecret}`){res.writeHead(401);return res.end('{}');}
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:[{type:'node',node:'pve-a',status:'online'},{type:'node',node:'pve-b',status:'online'}]}));
 });
 await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));
 const {createApp}=await import('../src/app.js');const {requireRole}=await import('../src/security.js');const {proxmoxSnapshot}=await import('../src/connectors.js');
 const audits=[];let invalidated=0;
 const server=createApp({authenticate:(req,res,next)=>{req.user={role:req.headers['x-role']||'owner'};next();},authorize:requireRole,audit:async(...args)=>audits.push(args.slice(1)),monitor:{invalidate:()=>invalidated++},db:{}}).listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));
 const base=`http://127.0.0.1:${server.address().port}/api/connections/proxmox`;
 const call=async(method,body,suffix='',role='owner')=>{const response=await fetch(base+suffix,{method,headers:{'Content-Type':'application/json','x-role':role},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()};};
 const config={...input,host:'127.0.0.1',port:upstream.address().port,ca};
 try{
  assert.equal((await call('PUT',config,'','admin')).status,403);assert.equal(calls,0);
  assert.equal((await call('POST',config,'/test')).body.nodes.length,2);assert.equal(clusterStore.read(),null);
  assert.equal((await call('PUT',config)).status,200);assert.equal(invalidated,1);
  const read=await call('GET');assert.equal(read.body.cluster.name,'Lab');assert.ok(!JSON.stringify(read).includes(input.tokenSecret));assert.ok(!JSON.stringify(read).includes(ca));
  assert.equal((await proxmoxSnapshot()).nodes.length,2);
  assert.equal((await call('PUT',{...config,tokenSecret:'wrong'})).status,502);assert.equal(clusterStore.read().tokenSecret,input.tokenSecret);
  assert.ok(!JSON.stringify(audits).includes(input.tokenSecret));assert.equal((await call('DELETE')).status,200);assert.equal(clusterStore.read(),null);
 }finally{await new Promise(resolve=>server.close(resolve));await new Promise(resolve=>upstream.close(resolve));}
});
