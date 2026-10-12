import {Client} from 'ssh2';
import crypto from 'node:crypto';
const sessions=new Map(),grants=new Map();
const failure=(message,status=400)=>Object.assign(new Error(message),{status});
export function actionTarget(req){
 if(req.params.node&&/^proxmox\.(node\.power|service)$/.test(req.sshLabel||''))return `node:${req.params.node}`;
 if(req.params.provider==='proxmox'&&['vm','lxc'].includes(req.params.resourceType))return `${req.params.resourceType}:${req.body.node}:${req.params.resourceId}`;
 return null;
}
const binding=(user,method,path,body)=>crypto.createHash('sha256').update(JSON.stringify([user,method,path,body])).digest('hex');
export function issueGrant(user,method,path,body){const token=crypto.randomBytes(32).toString('hex');grants.set(token,{binding:binding(user,method,path,body),expires:Date.now()+60000});return token;}
export function consumeGrant(token,user,method,path,body){const g=grants.get(token);grants.delete(token);return !!g&&g.expires>Date.now()&&g.binding===binding(user,method,path,body);}
export async function connectSSH(input,user){
 if(typeof input.host!=='string'||!input.host||input.host.length>253||/[\s/]/.test(input.host))throw failure('Enter the target SSH hostname or IP address');
 if(!/^(node|vm|lxc):/.test(input.target||''))throw failure('Invalid target');
 const port=Number(input.port||22);if(!Number.isInteger(port)||port<1||port>65535)throw failure('Invalid SSH port');
 if(typeof input.username!=='string'||!input.username||typeof input.password!=='string'||!input.password)throw failure('SSH username and password are required');
 const client=new Client();let fingerprint='';
 await new Promise((resolve,reject)=>{client.once('ready',resolve);client.once('error',e=>{client.end();reject(fingerprint&&input.fingerprint!==fingerprint?Object.assign(failure('Verify the target SSH host fingerprint before connecting',409),{fingerprint}):failure('SSH authentication or connection failed: '+e.message,401))});client.connect({host:input.host,port,username:input.username,password:input.password,readyTimeout:12000,keepaliveInterval:10000,hostVerifier:key=>{fingerprint='SHA256:'+crypto.createHash('sha256').update(key).digest('base64').replace(/=+$/,'');return input.fingerprint===fingerprint;}})});
 if(input.mode==='authorize'){
  try{const uid=await new Promise((resolve,reject)=>client.exec('id -u',(err,stream)=>{if(err)return reject(err);let text='';stream.on('data',d=>text+=d);stream.on('close',()=>resolve(text.trim()));}));if(uid!=='0')throw failure('Protected actions require the target root account',403);
   if(typeof input.path!=='string'||!/^\/(proxmox\/node\/|actions\/proxmox\/)/.test(input.path))throw failure('Invalid action path');
   const nodeMatch=input.path.match(/^\/proxmox\/node\/([^/]+)\//),guestMatch=input.path.match(/^\/actions\/proxmox\/(vm|lxc)\/([^/]+)\//);const expected=nodeMatch?`node:${decodeURIComponent(nodeMatch[1])}`:guestMatch?`${guestMatch[1]}:${input.body?.node}:${decodeURIComponent(guestMatch[2])}`:null;if(expected!==input.target)throw failure('SSH target does not match this action');return {token:issueGrant(user,input.method,input.path,input.body)};
  }finally{client.end();}
 }
 const stream=await new Promise((resolve,reject)=>client.shell({term:'xterm-256color',cols:100,rows:28},(e,s)=>e?reject(e):resolve(s)));
 const id=crypto.randomUUID(),s={user,client,stream,output:'',touched:Date.now(),closed:false};sessions.set(id,s);stream.on('data',d=>{s.output=(s.output+d.toString()).slice(-262144)});stream.on('close',()=>{s.closed=true;client.end()});client.on('error',()=>s.closed=true);return {id};
}
export function shellSession(id,user){const s=sessions.get(id);if(!s||s.user!==user)throw failure('Shell session unavailable',404);s.touched=Date.now();return s;}
export function closeShell(id,user){const s=shellSession(id,user);s.stream.close();s.client.end();sessions.delete(id);}
const timer=setInterval(()=>{for(const [id,s]of sessions)if(Date.now()-s.touched>60000){s.client.end();sessions.delete(id)}for(const [id,g]of grants)if(g.expires<Date.now())grants.delete(id)},15000);timer.unref();
