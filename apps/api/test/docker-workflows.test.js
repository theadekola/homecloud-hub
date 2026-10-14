import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'docker-audit-'));process.env.JWT_SECRET='a'.repeat(64);process.env.JWT_REFRESH_SECRET='b'.repeat(64);
const {createApp}=await import('../src/app.js');const {requireRole}=await import('../src/security.js');const {dockerCreateContainer}=await import('../src/connectors.js');
test('container removal requires admin access and confirmation before any Engine write',async()=>{
 const writes=[],engine=http.createServer((req,res)=>{writes.push({method:req.method,path:req.url});res.statusCode=204;res.end()});await new Promise(r=>engine.listen(0,'127.0.0.1',r));process.env.DOCKER_API_URL=`http://127.0.0.1:${engine.address().port}`;
 const app=createApp({authenticate:(req,res,next)=>{req.user={sub:'fixture',role:req.headers['x-role']||'operator'};next()},authorize:requireRole,audit:async()=>{},monitor:{invalidate:()=>{},sample:async()=>({services:[]})},db:{query:async()=>({rows:[]})}});const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 try{const endpoint=`http://127.0.0.1:${server.address().port}/api/actions/docker/container/fixture/remove`;const options={method:'POST',headers:{'Content-Type':'application/json'},body:'{}'};
 for(const role of ['viewer','operator']){const denied=await fetch(endpoint,{...options,headers:{...options.headers,'x-role':role,'X-HomeCloud-Confirm':'anything'}});assert.equal(denied.status,403);assert.deepEqual(writes,[]);}
 const challenge=await fetch(endpoint,{...options,headers:{...options.headers,'x-role':'admin'}});assert.equal(challenge.status,409);assert.deepEqual(writes,[]);const phrase=(await challenge.json()).confirmationPhrase;const response=await fetch(endpoint,{...options,headers:{...options.headers,'x-role':'admin','X-HomeCloud-Confirm':phrase}});assert.equal(response.status,200);assert.deepEqual(writes,[{method:'DELETE',path:'/containers/fixture?force=false&v=false'}]);}

 finally{delete process.env.DOCKER_API_URL;await new Promise(r=>server.close(r));await new Promise(r=>engine.close(r))}
});
test('container creation uses available local image IDs without a registry pull',async()=>{
 const calls=[],engine=http.createServer((req,res)=>{calls.push(req.url);if(req.url.startsWith('/images/create?')){res.statusCode=404;return res.end('{"message":"repository does not exist"}')}if(req.url.startsWith('/images/'))return res.end('{"Id":"sha256:local"}');if(req.url.startsWith('/containers/create'))return res.end('{"Id":"new"}');res.statusCode=404;res.end('{}')});await new Promise(r=>engine.listen(0,'127.0.0.1',r));process.env.DOCKER_API_URL=`http://127.0.0.1:${engine.address().port}`;
 try{const created=await dockerCreateContainer({name:'new',image:'sha256:local'});assert.equal(created.Id,'new');assert.deepEqual(calls,['/images/sha256%3Alocal/json','/containers/create?name=new'])}
 finally{delete process.env.DOCKER_API_URL;await new Promise(r=>engine.close(r))}
});
test.after(()=>fs.rmSync(process.env.DATA_DIR,{recursive:true,force:true}));

test('container creation pulls only missing images and stops on other inspection failures',async()=>{
 const calls=[];let status=404;const engine=http.createServer(async(req,res)=>{calls.push(req.url);if(req.url==='/images/missing%3Alatest/json'){res.statusCode=status;return res.end('{"message":"image lookup failed"}')}if(req.url.startsWith('/images/create?'))return res.end('{"status":"Downloaded"}\n');if(req.url.startsWith('/containers/create'))return res.end('{"Id":"created"}');res.statusCode=404;res.end('{}')});await new Promise(r=>engine.listen(0,'127.0.0.1',r));process.env.DOCKER_API_URL=`http://127.0.0.1:${engine.address().port}`;
 try{assert.equal((await dockerCreateContainer({name:'new',image:'missing:latest'})).Id,'created');assert.deepEqual(calls,['/images/missing%3Alatest/json','/images/create?fromImage=missing%3Alatest','/containers/create?name=new']);calls.length=0;status=503;await assert.rejects(dockerCreateContainer({name:'new',image:'missing:latest'}),error=>error.dockerStatus===503);assert.deepEqual(calls,['/images/missing%3Alatest/json'])}
 finally{delete process.env.DOCKER_API_URL;await new Promise(r=>engine.close(r))}
});

test('paired Docker hosts use local images and pull only after an actual 404',async()=>{
 const agents=await import('../src/node-agents.js');
 for(const missing of [false,true]){
  const pair=agents.createPairing({kind:'docker',name:'Fixture Host'}),node=agents.pairNode(pair.code,'fixture-host','docker'),identity=agents.authenticateAgent(node.token),hosts=[{id:'node',name:'fixture',online:true}];agents.pollAgent(identity,{hosts,results:[]});
  const task=agents.agentContext.run({host:node.id+':node'},()=>dockerCreateContainer({name:'new',image:'local:latest'}));task.catch(()=>{});const seen=[];let results=[];
  try{
   const count=missing?3:2;
   for(let i=0;i<count;i++){
    let job;
    for(let attempt=0;attempt<20&&!job;attempt++){job=agents.pollAgent(identity,{hosts,results}).jobs[0];results=[];if(!job)await new Promise(r=>setTimeout(r,0));}
    assert.ok(job,'Paired connector job is queued');seen.push(job.path);
    const inspect=job.path.startsWith('/images/')&&job.path.endsWith('/json'),body=inspect?JSON.stringify({Id:'sha256:local'}):job.path.startsWith('/images/create?')?'{"status":"Downloaded"}\n':JSON.stringify({Id:'created'});
    if(job.path.startsWith('/containers/create'))assert.equal(JSON.parse(Buffer.from(job.body,'base64').toString()).Image,'local:latest');
    results=[{id:job.id,status:inspect&&missing?404:200,body:Buffer.from(body).toString('base64')}];
   }
   agents.pollAgent(identity,{hosts,results});assert.equal((await task).Id,'created');assert.deepEqual(seen,missing?['/images/local%3Alatest/json','/images/create?fromImage=local%3Alatest','/containers/create?name=new']:['/images/local%3Alatest/json','/containers/create?name=new']);
  }finally{agents.revokeAgent(node.id)}
 }
});
