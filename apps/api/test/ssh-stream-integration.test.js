import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import ssh2 from 'ssh2';
process.env.JWT_SECRET='s'.repeat(64);process.env.JWT_REFRESH_SECRET='r'.repeat(64);process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'shell-stream-'));
const {default:jwt}=await import('jsonwebtoken'),{pool}=await import('../src/db.js'),{createApp}=await import('../src/app.js'),{connectSSH,closeShell,shellSession}=await import('../src/ssh-access.js');
const users={alice:{id:'alice',role:'admin',status:'active'},bob:{id:'bob',role:'owner',status:'active'}};pool.query=async(_,args)=>({rows:users[args?.[0]]?[users[args[0]]]:[],rowCount:users[args?.[0]]?1:0});
const token=user=>jwt.sign({sub:user},process.env.JWT_SECRET,{algorithm:'HS256',expiresIn:'5m'});
test('real SSH echo reaches HTTP stream immediately for node VM and CT; access remains authenticated and owner-bound',async()=>{
 const {privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048}),clients=new Set(),writes=[];
 const ssh=new ssh2.Server({hostKeys:[privateKey.export({type:'pkcs1',format:'pem'})]},c=>{clients.add(c);c.on('error',()=>{});c.on('close',()=>clients.delete(c));c.on('authentication',ctx=>ctx.method==='password'&&ctx.username==='root'&&ctx.password==='fixture'?ctx.accept():ctx.reject());c.on('ready',()=>c.on('session',accept=>{const s=accept();s.on('pty',accept=>accept());s.on('shell',accept=>{const stream=accept();stream.on('data',bytes=>{writes.push(bytes.toString());stream.write(bytes)})})}))});
 await new Promise(r=>ssh.listen(0,'127.0.0.1',r));const app=createApp(),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const origin=`http://127.0.0.1:${server.address().port}`,headers={Authorization:'Bearer '+token('alice'),'Content-Type':'application/json'};
 const input={host:'127.0.0.1',port:ssh.address().port,username:'root',password:'fixture',mode:'shell',target:'node:a'};let fingerprint;
 await assert.rejects(connectSSH(input,'alice'),e=>{fingerprint=e.fingerprint;return e.status===409});
 const sessions=[];try{for(const target of ['node:a','vm:a:100','lxc:a:101']){
  const {id}=await connectSSH({...input,target,fingerprint},'alice');sessions.push(id);const endpoint=origin+`/api/ssh/session/${id}/output`;
  assert.equal((await fetch(endpoint)).status,401);assert.equal((await fetch(endpoint,{headers:{Authorization:'Bearer '+token('bob')}})).status,404);
  users.alice.role='operator';assert.equal((await fetch(endpoint,{headers})).status,403);users.alice.role='admin';
  const controller=new AbortController(),response=await fetch(endpoint,{headers,signal:controller.signal}),reader=response.body.getReader();assert.equal(response.headers.get('content-type'),'application/x-ndjson');
  const echo=reader.read(),start=Date.now();assert.equal((await fetch(origin+`/api/ssh/session/${id}`,{headers,method:'POST',body:JSON.stringify({input:'hello 😀\r'})})).status,200);
  let deadline;const chunk=await Promise.race([echo,new Promise((_,reject)=>deadline=setTimeout(()=>reject(Error('Echo exceeded one second')),1000))]);clearTimeout(deadline);assert.ok(Date.now()-start<1000);assert.equal(JSON.parse(new TextDecoder().decode(chunk.value)).output,'hello 😀\r');
  assert.equal((await fetch(origin+`/api/ssh/session/${id}`,{headers})).status,409);controller.abort();await reader.cancel().catch(()=>{});
  const cleanupDeadline=Date.now()+1000;while(shellSession(id,'alice').onOutput&&Date.now()<cleanupDeadline)await new Promise(r=>setTimeout(r,10));assert.equal(shellSession(id,'alice').onOutput,null);users.alice.status='inactive';assert.equal((await fetch(endpoint,{headers})).status,401);users.alice.status='active';
  shellSession(id,'alice').mode='sftp';assert.equal((await fetch(endpoint,{headers})).status,400);shellSession(id,'alice').mode='shell';closeShell(id,'alice');
 }assert.equal(writes.length,3);}finally{for(const id of sessions)try{closeShell(id,'alice')}catch{}for(const client of clients)client.end();server.closeAllConnections();await new Promise(r=>server.close(r));await new Promise(r=>ssh.close(r));fs.rmSync(process.env.DATA_DIR,{recursive:true,force:true})}
});
