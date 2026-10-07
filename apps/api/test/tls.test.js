import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import { spawnSync } from 'node:child_process';
import { WebSocketServer } from 'ws';
import { truenas,opnsense,tailscale,tailscaleSnapshot } from '../src/infrastructure.js';
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
   if(data.method==='pool.snapshot.query')return ws.send(JSON.stringify({jsonrpc:'2.0',id:data.id,error:{code:-32601,message:'Method not found'}}));
   ws.send(JSON.stringify(legacy?{msg:'result',id:data.id,result:[{id:'pool/data@snapshot'}]}:{jsonrpc:'2.0',id:data.id,result:[{id:'pool/data@snapshot'}]}));
 }));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`https://localhost:${server.address().port}`;
 process.env.TRUENAS_URL=base;process.env.TRUENAS_API_KEY='test-key';process.env.TRUENAS_TLS_CA=cert;
 process.env.OPNSENSE_URL=base;process.env.OPNSENSE_API_KEY='key';process.env.OPNSENSE_API_SECRET='secret';process.env.OPNSENSE_TLS_CA=cert;
 // The default Node CA set is extended only for this test process's HTTP connector.
 process.env.TAILSCALE_API_KEY='tail-key';process.env.TAILSCALE_TAILNET='tail';process.env.TAILSCALE_API_BASE=`${base}/api/v2`;process.env.TAILSCALE_TLS_CA=cert;
 try{
   const result=await truenas('pool.snapshot.query');assert.equal(result[0].id,'pool/data@snapshot');assert.ok(seen.some(r=>r.method==='zfs.snapshot.query'));
   process.env.TRUENAS_API_MODE='legacy';const legacy=await truenas('pool.snapshot.query');assert.equal(legacy[0].id,'pool/data@snapshot');delete process.env.TRUENAS_API_MODE;
   rejected=true;await assert.rejects(truenas('pool.dataset.query'),/authentication rejected/);rejected=false;
   const firewall=await opnsense('core/system/status');assert.equal(firewall.status,'ok');const request=seen.find(r=>r.path==='/api/core/system/status');assert.equal(request.headers.authorization,`Basic ${Buffer.from('key:secret').toString('base64')}`);
   await assert.rejects(opnsense('denied'),/403/);
   const tailnet=await tailscaleSnapshot();assert.equal(tailnet.devices[0].name,'actual-device');assert.equal(tailnet.devices[0].authorized,true);
   await tailscale('device/device/routes','POST',{routes:['192.168.1.0/24']});const route=seen.find(r=>r.path==='/api/v2/device/device/routes');assert.deepEqual(route.body.routes,['192.168.1.0/24']);assert.equal(route.headers.authorization,'Bearer tail-key');
   await assert.rejects(tailscale('denied'),/403/);
   // Certificate failure must be visible; no global TLS bypass is allowed.
   delete process.env.OPNSENSE_TLS_CA;await assert.rejects(opnsense('core/system/status'),/self-signed certificate/);
   assert.notEqual(process.env.NODE_TLS_REJECT_UNAUTHORIZED,'0');
 }finally{for(const client of wss.clients)client.terminate();await new Promise(resolve=>wss.close(resolve));await new Promise(resolve=>server.close(resolve));}
});
