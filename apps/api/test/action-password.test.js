import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
process.env.JWT_SECRET='a'.repeat(64);process.env.JWT_REFRESH_SECRET='b'.repeat(64);process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'action-password-'));
const {approvalTargetForPath,resolveActionApproval}=await import('../src/action-approval.js'),{issueGrant,consumeGrant,verifyApprovalPrivilege}=await import('../src/ssh-access.js');
const agent={id:'a',hostname:'pve.example.test',name:'Friendly display name',kind:'proxmox',online:true};
const resources=[{type:'node',node:'pve'},{type:'qemu',node:'pve',vmid:101},{type:'lxc',node:'pve',vmid:102}];
const hosts=[{id:'a:qemu/101',agent:'a',setup:true},{id:'a:lxc/102',agent:'a',setup:true},{id:'a:node',agent:'a'}];
const context={nodes:()=>[agent],hosts:()=>hosts,query:async()=>resources};
test('node-level Proxmox approval supports POST PUT and DELETE without targeting stopped guests',()=>{
 for(const [p,m,b] of [['/actions/proxmox/vm/101/start','POST',{node:'pve'}],['/network/dns/pve','PUT',{}],['/network/firewall/pve/rules/0','PUT',{}],['/proxmox/network/pve/vmbr0','PUT',{}],['/tasks/pve/task','DELETE',{}],['/storage/snapshots/guest/rollback','POST',{node:'pve'}]])assert.equal(approvalTargetForPath(p,b,m),'node:pve');
 assert.equal(approvalTargetForPath('/network/dns/pve',{},'GET'),null);assert.equal(approvalTargetForPath('/actions/proxmox/vm/101/start',{node:'../wrong'}),null);
});
test('guest installation resolves the real VM or CT from original connector hostname, not its display label',async()=>{
 const vm=await resolveActionApproval('/node-agents/guest/setup',{host:'a:qemu/101'},'POST',context),ct=await resolveActionApproval('/node-agents/guest/setup',{host:'a:lxc/102'},'POST',context);
 assert.equal(vm.target,'vm:pve:101');assert.equal(ct.target,'lxc:pve:102');
 await assert.rejects(resolveActionApproval('/node-agents/guest/setup',{host:'a:node'},'POST',context));
 await assert.rejects(resolveActionApproval('/node-agents/guest/setup',{host:'missing'},'POST',context),{status:404});
 await assert.rejects(resolveActionApproval('/node-agents/guest/setup',{host:'a:qemu/101'},'POST',{...context,query:async()=>[{type:'qemu',node:'different',vmid:101}]}),{status:403});
 await assert.rejects(resolveActionApproval('/node-agents/guest/setup',{host:'a:qemu/101'},'POST',{...context,nodes:()=>[{...agent,online:false}]}),{status:503});
});
test('Docker approvals bind to guest, selected host, request body, method, user and one-time scope',async()=>{
 const first=await resolveActionApproval('/docker/volume/data',{},'DELETE',{...context,dockerHost:'a:qemu/101'});assert.equal(first.target,'vm:pve:101');
 for(const scope of ['vm:pve:101|docker:other:qemu/101','lxc:pve:102|docker:a:qemu/101']){const grant=issueGrant('alice','DELETE','/docker/volume/data',{},first.scope);assert.equal(consumeGrant(grant,'alice','DELETE','/docker/volume/data',{},scope),false);assert.equal(consumeGrant(grant,'alice','DELETE','/docker/volume/data',{},first.scope),false);}
 const ok=issueGrant('alice','DELETE','/docker/volume/data',{},first.scope);assert.equal(consumeGrant(ok,'alice','DELETE','/docker/volume/data',{},first.scope),true);assert.equal(consumeGrant(ok,'alice','DELETE','/docker/volume/data',{},first.scope),false);
 const wrongUser=issueGrant('alice','DELETE','/docker/volume/data',{},first.scope);assert.equal(consumeGrant(wrongUser,'bob','DELETE','/docker/volume/data',{},first.scope),false);
 const changed=issueGrant('alice','DELETE','/docker/volume/data',{},first.scope);assert.equal(consumeGrant(changed,'alice','DELETE','/docker/volume/data',{changed:true},first.scope),false);
});
test('cluster-wide changes select a reported cluster node and fail closed without one',async()=>{
 const approval=await resolveActionApproval('/proxmox/storage',{},'POST',{query:async()=>[{type:'node',name:'pve',ip:'192.0.2.1',online:1}]});assert.equal(approval.target,'node:pve');assert.equal(approval.scope,'node:pve|cluster');
 await assert.rejects(resolveActionApproval('/proxmox/storage',{},'POST',{query:async()=>[]}),{status:503});
 assert.equal(await resolveActionApproval('/docker/volume/a',{},'DELETE'),null);
});
function client(values){const commands=[],inputs=[];return {commands,inputs,end(){},exec(command,fn){commands.push(command);const stream=new EventEmitter();stream.stderr=new EventEmitter();stream.end=stdin=>{inputs.push(stdin);queueMicrotask(()=>{stream.emit('data',Buffer.from(String(values.shift())));stream.emit('close',0)})};fn(null,stream)}};}
test('root and sudo privilege checks use fixed commands and send the fresh sudo password only through stdin',async()=>{
 const root=client(['0']);await verifyApprovalPrivilege(root,'fresh');assert.deepEqual(root.commands,['/usr/bin/id -u']);
 const sudo=client(['1000','0']);await verifyApprovalPrivilege(sudo,"actual ' password");assert.deepEqual(sudo.commands,['/usr/bin/id -u',"/usr/bin/sudo -k -S -p '' -- /usr/bin/id -u"]);assert.equal(sudo.inputs[1],"actual ' password\n");assert.ok(sudo.commands.every(c=>!c.includes('password')));
 await assert.rejects(verifyApprovalPrivilege(client(['1000','1000']),'wrong'),{status:403});await assert.rejects(verifyApprovalPrivilege(client(['1000']),'bad\npassword'),{status:400});
});

test('saved SSH credentials cannot authorize protected actions',async()=>{const {connectSSH}=await import('../src/ssh-access.js');for(const input of [{saved:true},{useSavedPassword:true}])await assert.rejects(connectSSH({mode:'authorize',...input},'alice'),{status:403});});
test('every protected container lifecycle action requires a challenge before Docker execution',async()=>{
 const {createApp}=await import('../src/app.js'),app=createApp({authenticate:(req,res,next)=>{req.user={sub:'fixture',role:req.headers['x-role']||'owner'};next()},audit:async()=>{}}),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 try{for(const operation of ['stop','restart','pause','unpause','remove']){const url=`http://127.0.0.1:${server.address().port}/api/actions/docker/container/fixture/${operation}`,r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(r.status,409,operation);assert.match((await r.json()).confirmationPhrase,/CONFIRM/);const denied=await fetch(url,{method:'POST',headers:{'x-role':'viewer','Content-Type':'application/json'},body:'{}'});assert.equal(denied.status,403);}}
 finally{server.closeAllConnections();await new Promise(r=>server.close(r))}
});
test('container approval maps each protected action to its actual guest and cannot be reused for another action',async()=>{
 for(const operation of ['stop','restart','pause','unpause','remove']){
  const p=`/actions/docker/container/container-a/${operation}`,approval=await resolveActionApproval(p,{},'POST',{...context,dockerHost:'a:qemu/101'});
  assert.equal(approval.target,'vm:pve:101');assert.equal(approval.scope,'vm:pve:101|docker:a:qemu/101');
  const token=issueGrant('alice','POST',p,{},approval.scope);assert.equal(consumeGrant(token,'alice','POST','/actions/docker/container/other/stop',{},approval.scope),false);assert.equal(consumeGrant(token,'alice','POST',p,{},approval.scope),false);
 }
});

test('standalone Docker connector mutations require SSH approval bound to that connector',async()=>{
 const docker={...agent,id:'11111111-1111-4111-8111-111111111111',kind:'docker'};
 const identity=`${docker.id}:node`,ctx={nodes:()=>[docker],hosts:()=>[{id:identity,agent:docker.id,online:true}],dockerHost:identity};
 for(const [path,method] of [['/docker/updates/reviewed-image/install','POST'],['/actions/docker/container/app/restart','POST'],['/docker/volume/data','DELETE']]){
  const approval=await resolveActionApproval(path,{},method,ctx);
  assert.equal(approval.target,`docker:${docker.id}`);assert.equal(approval.scope,`docker:${docker.id}|docker:${identity}`);
  const grant=issueGrant('alice',method,path,{},approval.scope);
  assert.equal(consumeGrant(grant,'alice',method,path,{},approval.scope),true);
  assert.equal(consumeGrant(grant,'alice',method,path,{},approval.scope),false);
 }
 await assert.rejects(resolveActionApproval('/docker/updates/image/install',{},'POST',{...ctx,nodes:()=>[{...docker,online:false}]}),{status:503});
 await assert.rejects(resolveActionApproval('/docker/updates/image/install',{},'POST',{...ctx,dockerHost:'other:node'}),{status:404});
});

test('Docker image install challenge requests SSH and the typed phrase alone cannot authorize it',async()=>{
 const {createPairing,pairNode,pollAgent,revokeAgent}=await import('../src/node-agents.js');
 const registration=pairNode(createPairing({kind:'docker'}).code,'control-vm','docker');
 pollAgent({...registration}, {hosts:[{id:'node',online:true}],results:[]});
 const {createApp}=await import('../src/app.js'),app=createApp({authenticate:(req,res,next)=>{req.user={sub:'fixture',role:'owner'};next()},audit:async()=>{}}),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 try{
  const url=`http://127.0.0.1:${server.address().port}/api/docker/updates/image/install`,headers={'Content-Type':'application/json','x-iclusters-docker-host':`${registration.id}:node`};
  const first=await fetch(url,{method:'POST',headers,body:'{}'});assert.equal(first.status,409);const challenge=await first.json();assert.equal(challenge.sshTarget,`docker:${registration.id}`);
  const typed=await fetch(url,{method:'POST',headers:{...headers,'x-iclusters-confirm':challenge.confirmationPhrase},body:'{}'});assert.equal(typed.status,428);assert.equal((await typed.json()).sshTarget,challenge.sshTarget);
 }finally{revokeAgent(registration.id);server.closeAllConnections();await new Promise(r=>server.close(r))}
});
