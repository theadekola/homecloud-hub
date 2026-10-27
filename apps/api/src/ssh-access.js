import {passwordAuthentication} from './ssh-password.js';
import {approvalTargetForPath,resolveActionApproval} from './action-approval.js';
export {approvalTargetForPath} from './action-approval.js';
import {shellExpired} from './ssh-idle.js';
import {StringDecoder} from 'node:string_decoder';
import path from 'node:path';
import {createClusterStore} from './cluster-config.js';
import {Client} from 'ssh2';
import crypto from 'node:crypto';
const connectionVault=()=>createClusterStore(path.join(process.env.DATA_DIR||'runtime','ssh-connections.json'),()=>process.env.JWT_SECRET,v=>v);
export function savedSSH(user,target){return connectionVault().read()?.[`${user}:${target}`]||null;}
export function publicSavedSSH(user){return Object.fromEntries(Object.entries(connectionVault().read()||{}).filter(([key])=>key.startsWith(user+':')).map(([key,value])=>[key.slice(user.length+1),{host:value.host,port:value.port,username:value.username,fingerprint:value.fingerprint,hasPassword:true}]));}
export function deleteSavedSSH(user,target){const vault=connectionVault(),all=vault.read()||{};delete all[`${user}:${target}`];vault.save(all);}
const sessions=new Map(),grants=new Map();
const failure=(message,status=400)=>Object.assign(new Error(message),{status});
export function actionTarget(req){
 if(req.params.node&&/^proxmox\.(node\.power|service)$/.test(req.sshLabel||''))return `node:${req.params.node}`;
 if(req.params.provider==='proxmox'&&['vm','lxc'].includes(req.params.resourceType))return `node:${req.body.node}`;
 return null;
}
const binding=(user,method,path,body,scope)=>crypto.createHash('sha256').update(JSON.stringify([user,method,path,body,scope])).digest('hex');
export function issueGrant(user,method,path,body,scope=approvalTargetForPath(path,body,method)||'',sessionId){const token=crypto.randomBytes(32).toString('hex');grants.set(token,{user,sessionId,binding:binding(user,method,path,body,scope),expires:Date.now()+60000});return token;}
export function consumeGrant(token,user,method,path,body,scope=approvalTargetForPath(path,body,method)||''){const g=grants.get(token);grants.delete(token);return !!g&&g.expires>Date.now()&&g.binding===binding(user,method,path,body,scope);}
export async function verifyApprovalPrivilege(client,password){
 const probe=(command,stdin)=>new Promise((resolve,reject)=>{
  let output='',settled=false;const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(value)};
  const timer=setTimeout(()=>{client.end();finish(failure('SSH permission verification timed out',422))},12000);
  client.exec(command,(error,stream)=>{if(error)return finish(failure('SSH permission verification failed',422));stream.on('data',chunk=>{output=(output+chunk.toString()).slice(-256)});stream.stderr?.on('data',()=>{});stream.on('error',()=>finish(failure('SSH permission verification failed',422)));stream.on('close',code=>finish(null,code===0?output.trim():''));stream.end(stdin||'');});
 });
 if(await probe('/usr/bin/id -u')==='0')return;
 if(typeof password!=='string'||password.length>2048||/[\r\n]/.test(password))throw failure('Enter a valid fresh SSH and sudo password');
 if(await probe("/usr/bin/sudo -k -S -p '' -- /usr/bin/id -u",password+'\n')!=='0')throw failure('Protected actions require root or verified sudo access on this target',403);
}
export async function connectSSH(input,user,sessionId){
 if(input.mode==='authorize'&&(input.saved||input.useSavedPassword))throw failure('Action approval requires a freshly entered target password',403);
 if(input.saved){const saved=savedSSH(user,input.target);if(!saved)throw failure('No saved connection',404);input={...saved,target:input.target,mode:input.mode==='sftp'?'sftp':'shell'};}
 if(input.useSavedPassword){const existing=savedSSH(user,input.target);if(!existing||existing.host!==input.host||existing.port!==Number(input.port||22)||existing.username!==input.username)throw failure('Enter a password for the changed connection');input={...input,password:existing.password};}
 if(typeof input.host!=='string'||!input.host||input.host.length>253||/[\s/]/.test(input.host))throw failure('Enter the target SSH hostname or IP address');
 if(!/^(node|vm|lxc):/.test(input.target||''))throw failure('Invalid target');
 const port=Number(input.port||22);if(!Number.isInteger(port)||port<1||port>65535)throw failure('Invalid SSH port');
 if(typeof input.username!=='string'||!input.username||typeof input.password!=='string'||!input.password)throw failure('SSH username and password are required');
 const client=new Client();let fingerprint='';
 await new Promise((resolve,reject)=>{client.once('ready',resolve);client.once('error',e=>{client.end();reject(fingerprint&&input.fingerprint!==fingerprint?Object.assign(failure('Verify the target SSH host fingerprint before connecting',409),{fingerprint}):failure(e.level==='client-authentication'?'SSH login failed. Check the username and password for this target. Use a Linux SSH account on the displayed host, such as root or a sudo user. An i-Clusters login or a Proxmox @pve account does not automatically grant SSH access.':'SSH connection failed: '+e.message,422))});client.connect({host:input.host,port,username:input.username,...passwordAuthentication(client,input.password),readyTimeout:12000,keepaliveInterval:10000,hostVerifier:key=>{fingerprint='SHA256:'+crypto.createHash('sha256').update(key).digest('base64').replace(/=+$/,'');return input.fingerprint===fingerprint;}})});
 if(input.mode==='authorize'){
  try{await verifyApprovalPrivilege(client,input.password);
   const approval=await resolveActionApproval(input.path,input.body,input.method,{dockerHost:input.dockerHost});if(!approval)throw failure('Invalid action path');if(approval.target!==input.target)throw failure('SSH target does not match this action');return {token:issueGrant(user,input.method,input.path,input.body,approval.scope,sessionId)};
  }finally{client.end();}
 }
 let stream;try{stream=await new Promise((resolve,reject)=>input.mode==='sftp'?client.sftp((e,s)=>e?reject(e):resolve(s)):client.shell({term:'xterm-256color',cols:100,rows:28},(e,s)=>e?reject(e):resolve(s)));}catch(e){client.end();throw e;}
 if(input.save===false&&input.mode!=='authorize')deleteSavedSSH(user,input.target);
 if(input.save===true){const vault=connectionVault(),all=vault.read()||{};all[`${user}:${input.target}`]={host:input.host,port,username:input.username,password:input.password,fingerprint:input.fingerprint};vault.save(all);}
 const id=crypto.randomUUID(),s={user,sessionId,client,stream,mode:input.mode==='sftp'?'sftp':'shell',output:'',touched:Date.now(),closed:false};sessions.set(id,s);const decoder=new StringDecoder('utf8'),closed=()=>{if(s.closed)return;s.output=(s.output+decoder.end()).slice(-262144);s.closed=true;s.onOutput?.();};if(s.mode==='shell')stream.on('data',d=>{s.output=(s.output+decoder.write(d)).slice(-262144);s.onOutput?.();});stream.on('close',()=>{closed();client.end()});client.on('error',closed);client.on('close',closed);return {id};
}
export function shellSession(id,user){const s=sessions.get(id);if(!s||s.user!==user||shellExpired(s))throw failure('Shell session unavailable',404);if(s.mode==='sftp')s.touched=Date.now();return s;}
export function closeShell(id,user){const s=shellSession(id,user);s.releaseOutput?.();if(s.mode==='sftp')s.stream.end();else s.stream.close();s.client.end();sessions.delete(id);}
const timer=setInterval(()=>{for(const [id,s]of sessions)if(shellExpired(s)){s.releaseOutput?.();s.client.end();sessions.delete(id)}for(const [id,g]of grants)if(g.expires<Date.now())grants.delete(id)},15000);timer.unref();

const remotePath=value=>{if(typeof value!=='string'||!value.startsWith('/')||value.includes('\0')||value.length>4096)throw failure('Enter an absolute remote path');return path.posix.normalize(value)};
const call=(s,method,...args)=>new Promise((resolve,reject)=>s[method](...args,(e,result)=>e?reject(failure(e.message,422)):resolve(result)));
export async function sftpOperation(id,user,input){
 const session=shellSession(id,user);if(session.mode!=='sftp')throw failure('Not an SFTP session');if(input.action==='keepalive')return {ok:true};const s=session.stream,p=remotePath(input.path||'/');
 if(input.action==='list'){const entries=await call(s,'readdir',p);return {path:p,entries:entries.map(e=>({name:e.filename,directory:e.attrs.isDirectory(),link:e.attrs.isSymbolicLink(),size:e.attrs.size,modified:e.attrs.mtime,mode:e.attrs.mode})).sort((a,b)=>Number(b.directory)-Number(a.directory)||a.name.localeCompare(b.name))};}
 if(input.action==='stat'){const stat=await call(s,'lstat',p);return {size:stat.size,file:stat.isFile(),link:stat.isSymbolicLink()};}
 if(input.action==='mkdir'){await call(s,'mkdir',p);return {ok:true};}
 if(input.action==='rename'){await call(s,'rename',p,remotePath(input.destination));return {ok:true};}
 if(input.action==='delete'){const stat=await call(s,'lstat',p);await call(s,stat.isDirectory()?'rmdir':'unlink',p);return {ok:true};}
 if(input.action==='read'){const offset=Number(input.offset||0);if(!Number.isSafeInteger(offset)||offset<0)throw failure('Invalid offset');const handle=await call(s,'open',p,'r');try{const buffer=Buffer.alloc(262144);const bytes=await new Promise((resolve,reject)=>s.read(handle,buffer,0,buffer.length,offset,(e,n)=>e?reject(e):resolve(n)));return {data:buffer.subarray(0,bytes).toString('base64'),done:bytes===0};}finally{await call(s,'close',handle);}}
 if(input.action==='write'){const offset=Number(input.offset||0);if(!Number.isSafeInteger(offset)||offset<0||typeof input.data!=='string'||input.data.length>350000)throw failure('Invalid upload chunk');const buffer=Buffer.from(input.data,'base64');const handle=await call(s,'open',p,offset===0?(input.replace===true?'w':'wx'):'r+');try{await call(s,'write',handle,buffer,0,buffer.length,offset);return {ok:true};}finally{await call(s,'close',handle);}}
 throw failure('Unsupported file operation');
}

export function writeShellInput(session,input){
 if(session.closed)throw failure('SSH session is closed',409);
 if(input!==undefined&&(typeof input!=='string'||input.length>8192))throw failure('Shell input must be text of at most 8192 characters');
 if(typeof input==='string')session.stream.write(input);
}

export function closeSessionAccess(user,sessionId){for(const [id,s] of sessions)if(s.user===user&&(!sessionId||s.sessionId===sessionId)){s.releaseOutput?.();s.client.end();sessions.delete(id)}for(const [id,g] of grants)if(g.user===user&&(!sessionId||g.sessionId===sessionId))grants.delete(id)}
