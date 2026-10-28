import {Client} from 'ssh2';
import crypto from 'node:crypto';
import {readFileSync,existsSync} from 'node:fs';
import {deflateSync} from 'node:zlib';
import {clusterConfig} from './cluster-config.js';
import {pve} from './connectors.js';
import {targetSSHHost} from './ssh-target.js';
import {createPairing,pairNode,revokeAgent,agentNodes} from './node-agents.js';
import {passwordAuthentication} from './ssh-password.js';
import {connectorSource,connectorRelease} from './connector-release.js';
const script=readFileSync(new URL('./agent-assets/pair-node-ssh.py',import.meta.url),'utf8');
const fail=(message,status=400)=>Object.assign(Error(message),{status});
const quote=value=>"'"+value.replace(/'/g,"'\"'\"'")+"'";
const messages={'wrong-node':'This SSH host is not the selected Proxmox node. No installation was performed.','not-proxmox':'This host does not have the Proxmox node tools. Use the Proxmox node, not a VM or CT.','already-installed':'A connector is already installed on this node. Use its existing connection, or remove the old connector before pairing again.','root-required':'Root or password-based sudo access is required.','service-failed':'The connector service could not start. Inspect systemd on the selected node.','bootstrap-failed':'The node could not verify the controller HTTPS connection or complete installation. Check the controller address, certificate and node service.'};
export function executePairingSSH(client,username,password,payload){return new Promise((resolve,reject)=>{
 let output='',settled=false;const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(result)};
 const timer=setTimeout(()=>{client.end();finish(fail('SSH installation timed out. Inspect the node before retrying.',504))},75000);
 const command='python3 -c '+quote(script),shell=username==='root'?command:"sudo -k -S -p '' /usr/bin/python3 -c "+quote(script);
 client.exec(shell,(error,stream)=>{if(error)return finish(fail('SSH installation could not start.',422));stream.on('data',chunk=>{output=(output+chunk.toString()).slice(-8192)});stream.stderr?.on('data',()=>{});stream.on('error',()=>finish(fail('SSH installation was interrupted. Inspect the connector service before retrying.',422)));stream.on('close',code=>{let result;try{result=JSON.parse(output)}catch{return finish(fail('SSH installation did not return a verification result. Check root/sudo access.',422))}if(code!==0||result.error)return finish(fail(messages[result.error]||'Connector installation failed. Inspect the node before retrying.',422));finish(null,result)});stream.end((username==='root'?'':password+'\n')+JSON.stringify(payload));});
});}
export function createAutomaticNodePairing({config=clusterConfig,query=pve,nodes=agentNodes,pairing=createPairing,pair=pairNode,revoke=revokeAgent,clientFactory=()=>new Client(),run=executePairingSSH,origin=()=>process.env.WEB_ORIGIN?.split(',')[0],ca=()=>existsSync('/run/iclusters/ca/controller-ca.pem')?readFileSync('/run/iclusters/ca/controller-ca.pem','utf8'):'',now=()=>Date.now(),sleep=ms=>new Promise(r=>setTimeout(r,ms)),heartbeatTimeout=60000}={}){
 const jobs=new Map(),running=new Map();
 const binding=()=>crypto.createHash('sha256').update(JSON.stringify(config())).digest('hex');
 const nodeName=node=>{if(typeof node!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(node))throw fail('Select a valid Proxmox node.');return node};
 const controller=()=>{let url;try{url=new URL(origin())}catch{throw fail('Configure the controller WEB_ORIGIN as its reachable HTTPS address.',409)}if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw fail('Configure a reachable HTTPS controller origin without credentials or a path.',409);return url.origin};
 const readTarget=async node=>{nodeName(node);const c=config(),bound=binding(),host=await targetSSHHost('node:'+node,(path)=>query(path,{},c));if(binding()!==bound)throw fail('The Proxmox connection changed. Reopen setup.',409);return {node,host,port:22,connectionId:bound,controller:controller()}};
 const fresh=job=>nodes().some(n=>n.id===job.agentId&&n.hostname===job.node&&n.online&&n.version===connectorRelease.version&&n.revision===connectorRelease.revision&&Date.parse(n.lastSeen)>=Date.parse(job.startedAt));
 const read=id=>{const job=jobs.get(id);if(!job)throw fail('Installation status is no longer available. Check the node connector before retrying.',404);if(job.state==='unverified'&&fresh(job))Object.assign(job,{state:'completed',message:'Node connector installed, paired and fresh heartbeat verified.'});return {...job}};
 async function perform(job,input){let client,registered,installed=false;try{
  if(binding()!==input.connectionId)throw fail('The Proxmox connection changed. Reopen setup.',409);
  client=clientFactory();await new Promise((resolve,reject)=>{client.once('ready',resolve);client.once('error',()=>reject(fail('SSH authentication or host verification failed. Check the node address, fingerprint and password.',422)));client.connect({host:input.host,port:input.port,username:input.username,...passwordAuthentication(client,input.password),readyTimeout:12000,hostVerifier:key=>'SHA256:'+crypto.createHash('sha256').update(key).digest('base64').replace(/=+$/,'')===input.fingerprint})});
  if(binding()!==input.connectionId)throw fail('The Proxmox connection changed. Reopen setup.',409);
  const base={mode:'probe',node:job.node,url:controller(),ca:ca()};
  Object.assign(job,{state:'checking',message:'Checking the selected node, root access and controller HTTPS trust.'});
  const probe=await run(client,input.username,input.password,base);if(!probe?.ready||probe.hostname!==job.node)throw fail('The selected Proxmox node identity was not verified.',422);
  if(binding()!==input.connectionId)throw fail('The Proxmox connection changed. No connector was installed.',409);
  registered=pair(pairing({kind:'proxmox',name:job.node}).code,job.node,'proxmox');job.agentId=registered.id;
  Object.assign(job,{state:'installing',message:'Installing and pairing the connector on the verified node.'});
  const result=await run(client,input.username,input.password,{...base,mode:'install',...registered,source:deflateSync(Buffer.from(connectorSource)).toString('base64'),revision:connectorRelease.revision});
  if(!result?.installed)throw fail('The node did not verify connector installation.',422);installed=true;registered.token='';input.password='';client.end();
  Object.assign(job,{state:'verifying',message:'Connector started. Waiting for its first fresh heartbeat.'});const deadline=now()+heartbeatTimeout;
  do{if(fresh(job)){Object.assign(job,{state:'completed',message:'Node connector installed, paired and fresh heartbeat verified.'});return}if(now()>=deadline)break;await sleep(1000)}while(true);
  Object.assign(job,{state:'unverified',message:'Connector installed, but its heartbeat is not verified yet. Check HTTPS connectivity and its systemd service. Do not reinstall it.'});
 }catch(error){if(registered&&!installed)revoke(registered.id);Object.assign(job,{state:'failed',message:error?.status?error.message:'Automatic pairing failed. Check the selected node, SSH credentials and controller HTTPS access. Inspect the node before retrying.'});}finally{input.password='';if(registered)registered.token='';client?.end();running.delete(job.node)}}
 return {async target(node){const target=await readTarget(node),job=[...jobs.values()].reverse().find(j=>j.node===node&&['connecting','checking','installing','verifying','unverified','completed'].includes(j.state));return {...target,...(job?{job:read(job.id)}:{})}},status:read,async start(input){
  if(input?.confirm!==true||input?.verified!==true)throw fail('Approve installation and verify the SSH host fingerprint.');nodeName(input.node);
  if(typeof input.username!=='string'||!/^[A-Za-z_][A-Za-z0-9_.-]{0,99}$/.test(input.username)||typeof input.password!=='string'||!input.password||input.password.length>2048||/[\r\n\0]/.test(input.password))throw fail('Enter fresh SSH username and password credentials.');
  if(!Number.isInteger(Number(input.port))||Number(input.port)<1||Number(input.port)>65535||!/^SHA256:[A-Za-z0-9+/]{43}$/.test(input.fingerprint||''))throw fail('Enter a valid SSH port and verify the host fingerprint.');
  const target=await readTarget(input.node);if(input.connectionId!==target.connectionId||input.host!==target.host)throw fail('The selected node address or Proxmox connection changed. Reopen setup.',409);
  if(running.has(input.node))throw fail('Automatic pairing is already running for this node.',409);
  if(nodes().some(n=>n.kind==='proxmox'&&(n.hostname===input.node||n.name===input.node)))throw fail('This node already has a pairing. Recheck its existing connector or revoke it before a new installation.',409);
  if(jobs.size>=100){const old=[...jobs].find(([,j])=>!running.has(j.node));if(old)jobs.delete(old[0]);else throw fail('Too many node installations are running.',429)}
  const job={id:crypto.randomUUID(),node:input.node,state:'connecting',message:'Connecting to the selected Proxmox node.',startedAt:new Date(now()).toISOString()};jobs.set(job.id,job);
  const credentials={node:input.node,host:input.host,port:Number(input.port),username:input.username,password:input.password,fingerprint:input.fingerprint,connectionId:input.connectionId};const pending=Promise.resolve().then(()=>perform(job,credentials)).catch(()=>{Object.assign(job,{state:'failed',message:'Installation tracking failed. Inspect the node connector before retrying.'})});running.set(job.node,pending);return {...job};
 },wait:node=>running.get(node)};
}
export const automaticNodePairing=createAutomaticNodePairing();
