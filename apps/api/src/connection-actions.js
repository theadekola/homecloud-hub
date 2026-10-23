const packageErrors={
 PACKAGE_REPOSITORY_AUTH:'SSH login succeeded, but a configured package repository rejected access (401/403). Check the host repository and subscription settings.',
 PACKAGE_MANAGER_LOCKED:'SSH login succeeded, but another package operation holds the APT/dpkg lock. Let it finish before retrying; do not delete lock files.',
 PACKAGE_DNS_FAILED:'SSH login succeeded, but the host could not resolve a package repository. Check DNS on the selected host.',
 PACKAGE_DISK_FULL:'SSH login succeeded, but the host has insufficient disk space for package installation. Check free space before retrying.',
 PACKAGE_MANAGER_REPAIR:'SSH login succeeded, but APT/dpkg reported an interrupted installation or dependency problem. Review package-manager status on the host before retrying.',
 PACKAGE_REPOSITORY_INVALID:'SSH login succeeded, but a repository release, signature or certificate could not be verified. Check host repository configuration and time.',
 PACKAGE_NETWORK_FAILED:'SSH login succeeded, but package repository downloads failed. Check host network access and repository availability.',
 PACKAGE_TIMEOUT:'SSH login succeeded, but the package operation timed out. Check whether APT/dpkg is still running before retrying.',
 PACKAGE_MANAGER_MISSING:'SSH login succeeded, but apt-get is unavailable. This installation action requires a supported Debian/Ubuntu-based host.',
 PACKAGE_VERIFY_FAILED:'Monitoring package installation could not be verified. Check package-manager status before retrying.',
 PACKAGE_COMMAND_FAILED:'SSH login succeeded, but the host package command failed. Review APT/dpkg diagnostics on the selected host; SSH credentials were accepted.'
};
import {Client} from 'ssh2';
import crypto from 'node:crypto';
import {readFileSync} from 'node:fs';
import {get} from './store.js';
import {agentNodes,beginConnectorUpdate,endConnectorUpdate} from './node-agents.js';
const remote=readFileSync(new URL('./agent-assets/connection-service.py',import.meta.url),'utf8');
const actions=new Set(['connector-check','connector-start','docker-check','docker-start','monitoring-tools']);
const safeErrors=new Set(['Existing standard connector installation required','This SSH host is not the selected paired connector','Standalone connector cannot access Proxmox guests','Root or sudo access is required','VM guest access failed. Check that the VM and QEMU Guest Agent are running and guest execution is permitted.','Docker service is active but its Engine is not ready. Recheck Docker status before retrying.','The host did not return a valid service status']);
const fail=(message,status=400)=>Object.assign(Error(message),{status});
const quote=value=>"'"+value.replace(/'/g,"'\"'\"'")+"'";
export function executeConnectionAction(client,username,password,command,{timeoutMs=65000}={}){return new Promise((resolve,reject)=>{
 let output='',settled=false;const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(result)};
 const timer=setTimeout(()=>{finish(fail('Connection action timed out. Recheck its service status before retrying.',504));client.end()},timeoutMs);
 const shell=username==='root'?command:"sudo -k -S -p '' /bin/sh -c "+quote(command);
 client.exec(shell,(error,stream)=>{if(error)return finish(fail('SSH service action could not start',422));stream.on('data',chunk=>{output+=chunk.toString();if(output.length>32768){finish(fail('Diagnostic response exceeded the supported size',502));client.end()}});stream.stderr?.on('data',()=>{});stream.on('error',()=>finish(fail('SSH service action was interrupted. Recheck its status before retrying.',422)));stream.on('close',code=>{let result;try{result=JSON.parse(output)}catch{return finish(fail('The service action did not return a valid result. Check root/sudo access and service installation.',422))}if(!result||typeof result!=='object'||Array.isArray(result))return finish(fail('Invalid connection diagnostic response',502));if(code!==0&&typeof result.code==='string'&&Object.hasOwn(packageErrors,result.code)&&['package-index','package-install','package-verification'].includes(result.stage))return finish(fail(`${result.stage==='package-index'?'Package list refresh':result.stage==='package-install'?'Package installation':'Package verification'} failed. ${packageErrors[result.code]}`,422));if(code!==0)return finish(fail(safeErrors.has(result.error)?result.error:'Connection action failed. Check the selected host, service installation, root/sudo access and guest permissions, then recheck status.',422));if(!actions.has(result.action)||(result.action==='monitoring-tools'?result.installed!==true||result.target!=='node':!result.service||typeof result.active!=='boolean'))return finish(fail('Invalid connection diagnostic response',502));finish(null,result)});stream.end(username==='root'?'':password+'\n');});
});}
export function createConnectionActions({persistence={get},nodes=agentNodes,begin=beginConnectorUpdate,end=endConnectorUpdate,clientFactory=()=>new Client(),run=executeConnectionAction,now=()=>Date.now(),sleep=ms=>new Promise(r=>setTimeout(r,ms)),heartbeatTimeout=15000}={}){
 return {async perform(id,input){
  const agent=(persistence.get().nodeAgents||[]).find(n=>n.id===id),node=nodes().find(n=>n.id===id);if(!agent||!node)throw fail('Paired connector not found',404);
  if(!actions.has(input?.action)||input.confirm!==true)throw fail('Select and confirm a supported connection action');
  const target=input.target;if(typeof target!=='string'||!/^node$|^(qemu|lxc)\/\d+$/.test(target)||(input.action.startsWith('connector-')||input.action==='monitoring-tools')&&target!=='node'||target!=='node'&&(node.kind==='docker'||!node.hosts?.some(h=>h.id===target)))throw fail('The action does not match a host reported by this paired connector');
  if(typeof input.host!=='string'||!/^[A-Za-z0-9.:[\]_-]{1,253}$/.test(input.host)||!Number.isInteger(Number(input.port??22))||Number(input.port??22)<1||Number(input.port??22)>65535)throw fail('Enter a valid SSH address and port');
  if(typeof input.username!=='string'||!input.username||input.username.length>100||/[\r\n\0]/.test(input.username)||typeof input.password!=='string'||!input.password||input.password.length>2048||/[\r\n\0]/.test(input.password))throw fail('Enter fresh SSH credentials without line breaks');
  if(!/^SHA256:[A-Za-z0-9+/]{43}$/.test(input.fingerprint||''))throw fail('Verify the SSH host fingerprint first');
  begin(id);let client,password=input.password;const startedAt=now();
  try{
   client=clientFactory();
   await new Promise((resolve,reject)=>{client.once('ready',resolve);client.once('error',()=>reject(fail('SSH authentication or host verification failed. Check the address, fingerprint and credentials.',422)));client.connect({host:input.host,port:Number(input.port??22),username:input.username,password,readyTimeout:12000,keepaliveInterval:10000,hostVerifier:key=>'SHA256:'+crypto.createHash('sha256').update(key).digest('base64').replace(/=+$/,'')===input.fingerprint});});
   const paired=()=>persistence.get().nodeAgents?.some(n=>n.id===id&&n.tokenHash===agent.tokenHash);if(!paired())throw fail('Pairing changed; no action was performed',409);
   const payload=Buffer.from(JSON.stringify({id,tokenHash:agent.tokenHash,action:input.action,target})).toString('base64');
   const result=await run(client,input.username,password,'python3 -c '+quote(remote)+' '+quote(payload),{timeoutMs:input.action==='monitoring-tools'?330000:65000});
   if(!paired())throw fail('Pairing changed while the action ran. Recheck the connection.',409);
   if(result.action!==input.action||result.target!==target||input.action==='monitoring-tools'&&result.installed!==true)throw fail('Service response did not match the selected action and host',502);
   if(input.action.endsWith('-start')&&(!result.active||input.action==='docker-start'&&!result.docker?.ready))throw fail('Service readiness was not verified. Recheck status before retrying.',422);
   if(input.action==='connector-start'){const fresh=()=>nodes().some(n=>n.id===id&&n.online&&Date.parse(n.lastSeen)>=startedAt);const deadline=now()+heartbeatTimeout;while(!fresh()&&now()<deadline)await sleep(1000);if(!fresh())throw fail('Connector service is active, but its fresh connection to i-Clusters was not verified. Recheck Setup before retrying.',422);result.connected=true;result.message='Connector service is active and fresh connection verified.';}
   return result;
  }catch(error){throw error?.status?error:fail('Connection action failed. Verify the SSH address, fingerprint, credentials and service access.',422)}finally{password='';try{client?.end()}finally{end(id)}}
 }};
}
export const connectionActions=createConnectionActions();
