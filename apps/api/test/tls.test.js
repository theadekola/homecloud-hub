import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import { spawnSync } from 'node:child_process';
import { WebSocketServer } from 'ws';
import { truenas } from '../src/infrastructure.js';
const executable=process.platform==='win32'?'C:/Program Files/Git/mingw64/bin/openssl.exe':'openssl';
const available=spawnSync(executable,['version']).status===0;
await test('TLS connectors authenticate, surface provider errors and support both TrueNAS protocols',{skip:!available},async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'homecloud-tls-test-'));const key=path.join(directory,'key.pem'),cert=path.join(directory,'cert.pem');
 const generated=spawnSync(executable,['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1'],{encoding:'utf8'});assert.equal(generated.status,0,generated.stderr);
 const seen=[];let rejected=false;
 const server=https.createServer({key:fs.readFileSync(key),cert:fs.readFileSync(cert)},async(req,res)=>{
   let raw='';for await(const chunk of req)raw+=chunk;seen.push({path:req.url,method:req.method,headers:req.headers,body:raw?JSON.parse(raw):null});
   res.setHeader('Content-Type','application/json');
   if(req.url.includes('denied')){res.statusCode=403;return res.end('{}');}
   if(req.url.includes('/devices'))return res.end(JSON.stringify({devices:[{id:'device',hostname:'actual-device',authorized:true,lastSeen:'2026-01-01',addresses:['100.64.0.1']}]}));
   res.end(JSON.stringify({status:'ok'}));
 });
 const wss=new WebSocketServer({server});
 wss.on('connection',(ws,req)=>ws.on('message',raw=>{
   const data=JSON.parse(raw.toString());seen.push(data);
   if(data.msg==='connect')return ws.send(JSON.stringify({msg:'connected',session:'test'}));
   const legacy=data.msg==='method';
   if(data.method==='auth.login_with_api_key')return ws.send(JSON.stringify(legacy?{msg:'result',id:data.id,result:!rejected}:{jsonrpc:'2.0',id:data.id,result:!rejected}));
   if(data.method==='system.info')return ws.send(JSON.stringify(legacy?{msg:'result',id:data.id,result:{hostname:'fixture-nas'}}:{jsonrpc:'2.0',id:data.id,result:{hostname:'fixture-nas'}}));
   if(data.method==='pool.snapshot.query')return ws.send(JSON.stringify({jsonrpc:'2.0',id:data.id,error:{code:-32601,message:'Method not found'}}));
   ws.send(JSON.stringify(legacy?{msg:'result',id:data.id,result:[{id:'pool/data@snapshot'}]}:{jsonrpc:'2.0',id:data.id,result:[{id:'pool/data@snapshot'}]}));
 }));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`https://localhost:${server.address().port}`;
 process.env.TRUENAS_URL=base;process.env.TRUENAS_API_KEY='test-key';process.env.TRUENAS_TLS_CA=cert;
 // The default Node CA set is extended only for this test process's HTTP connector.
 try{
   const {sendNotification}=await import('../src/notifications.js');
   for(const channel of ['gotify','webhook']){await sendNotification(channel,'TLS test',{env:channel==='gotify'?{GOTIFY_URL:base,GOTIFY_APP_TOKEN:'tls-test-key',GOTIFY_CA_PEM:fs.readFileSync(cert,'utf8')}:{WEBHOOK_URL:base+'/hook',WEBHOOK_BEARER_TOKEN:'tls-test-key',WEBHOOK_CA_PEM:fs.readFileSync(cert,'utf8')}});}
   assert.ok(seen.some(r=>r.path==='/message'&&r.headers['x-gotify-key']==='tls-test-key'));assert.ok(seen.some(r=>r.path==='/hook'&&r.headers.authorization==='Bearer tls-test-key'));
   const draft=await truenas('system.info',[],{TRUENAS_URL:process.env.TRUENAS_URL,TRUENAS_API_KEY:'draft-key',TRUENAS_API_MODE:'current',TRUENAS_CA_PEM:fs.readFileSync(cert,'utf8')});assert.ok(draft);assert.ok(seen.some(r=>r.method==='auth.login_with_api_key'&&r.params[0]==='draft-key'));assert.notEqual(process.env.TRUENAS_API_KEY,'draft-key');
   process.env.JWT_SECRET='a'.repeat(64);process.env.JWT_REFRESH_SECRET='b'.repeat(64);
   const {createApp}=await import('../src/app.js'),{createConfigurationStore}=await import('../src/runtime-configuration.js'),configuration=createConfigurationStore(path.join(directory,'configuration'));configuration.disable('truenas');
   const apiServer=createApp({configuration,authenticate:(req,res,next)=>{req.user={sub:'test',role:'owner'};next()},audit:async()=>{},monitor:{invalidate(){},sample:async()=>({services:[]})}}).listen(0,'127.0.0.1');await new Promise(r=>apiServer.once('listening',r));
   try{const url=`http://127.0.0.1:${apiServer.address().port}/api/configuration/truenas/test`,configurationDraft={TRUENAS_URL:base,TRUENAS_API_KEY:'route-draft-key',TRUENAS_API_MODE:'current',TRUENAS_CA_PEM:fs.readFileSync(cert,'utf8')},response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({configuration:configurationDraft})});assert.equal(response.status,200);assert.match((await response.json()).result.message,/Save Configuration/);assert.equal(configuration.publicConfig('truenas').disabled,true);assert.ok(seen.some(r=>r.method==='auth.login_with_api_key'&&r.params[0]==='route-draft-key'));}finally{apiServer.closeAllConnections();await new Promise(r=>apiServer.close(r));}
   const result=await truenas('pool.snapshot.query');assert.equal(result[0].id,'pool/data@snapshot');assert.ok(seen.some(r=>r.method==='zfs.snapshot.query'));
   process.env.TRUENAS_API_MODE='legacy';const legacy=await truenas('pool.snapshot.query');assert.equal(legacy[0].id,'pool/data@snapshot');delete process.env.TRUENAS_API_MODE;
   rejected=true;await assert.rejects(truenas('pool.dataset.query'),/authentication rejected/);rejected=false;
   // Certificate failure must be visible; no global TLS bypass is allowed.
   delete process.env.TRUENAS_TLS_CA;await assert.rejects(truenas('pool.dataset.query'),/self-signed certificate/);
   assert.notEqual(process.env.NODE_TLS_REJECT_UNAUTHORIZED,'0');
 }finally{for(const client of wss.clients)client.terminate();await new Promise(resolve=>wss.close(resolve));await new Promise(resolve=>server.close(resolve));}
});
