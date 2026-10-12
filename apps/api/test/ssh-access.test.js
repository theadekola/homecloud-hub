import test from 'node:test';
import assert from 'node:assert/strict';
import {issueGrant,consumeGrant,actionTarget} from '../src/ssh-access.js';
test('SSH grants are single-use and bound to identity method target and payload',()=>{const body={node:'pve'},path='/actions/proxmox/vm/100/reboot';let token=issueGrant('alice','POST',path,body);assert.equal(consumeGrant(token,'bob','POST',path,body),false);assert.equal(consumeGrant(token,'alice','POST',path,body),false);token=issueGrant('alice','POST',path,body);assert.equal(consumeGrant(token,'alice','POST',path,{node:'other'}),false);token=issueGrant('alice','POST',path,body);assert.equal(consumeGrant(token,'alice','POST',path,body),true);assert.equal(consumeGrant(token,'alice','POST',path,body),false);});
test('target identification distinguishes nodes VMs and containers',()=>{assert.equal(actionTarget({sshLabel:'proxmox.node.power',params:{node:'pve'},body:{}}),'node:pve');assert.equal(actionTarget({params:{provider:'proxmox',resourceType:'lxc',resourceId:'103'},body:{node:'pve'}}),'lxc:pve:103');});

import ssh2 from 'ssh2';
const {Server}=ssh2;
import crypto from 'node:crypto';
import {connectSSH} from '../src/ssh-access.js';
test('SSH authorization rejects unknown host keys and wrong passwords then issues an exact-action grant',async()=>{
 const {privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});const key=privateKey.export({type:'pkcs1',format:'pem'});
 const server=new Server({hostKeys:[key]},client=>{client.on('error',()=>{});client.on('authentication',ctx=>ctx.method==='password'&&ctx.username==='root'&&ctx.password==='correct'?ctx.accept():ctx.reject());client.on('ready',()=>client.on('session',accept=>{const session=accept();session.on('exec',(accept,reject,info)=>{if(info.command!=='id -u')return reject();const stream=accept();stream.write('0\n');stream.exit(0);stream.end();});}));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const input={host:'127.0.0.1',port:server.address().port,username:'root',password:'correct',target:'node:pve',mode:'authorize',path:'/proxmox/node/pve/power/reboot',method:'POST',body:{}};
 try{let fingerprint;await assert.rejects(()=>connectSSH(input,'alice'),e=>{fingerprint=e.fingerprint;return e.status===409&&fingerprint.startsWith('SHA256:')});await assert.rejects(()=>connectSSH({...input,fingerprint,password:'wrong'},'alice'),/authentication/);const result=await connectSSH({...input,fingerprint},'alice');assert.equal(consumeGrant(result.token,'alice','POST',input.path,{}),true);await assert.rejects(()=>connectSSH({...input,fingerprint,target:'node:other'},'alice'),/does not match/);}finally{server.close();}
});
