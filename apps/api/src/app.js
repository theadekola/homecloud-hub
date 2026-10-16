import {buildInfo} from './build-info.js';
import {publicDockerImage,publicDockerVolume} from './docker-public.js';
import {queryAI,listAIModels} from './ai.js';
import {headerNotifications} from './header-notifications.js';
import {configurationStore,configurationSchemas,validateConfiguration} from './runtime-configuration.js';
import {validateNotificationPreferences} from './notifications.js';
import {apiPolicy} from './api-policy.js';
import {connectionHealth} from './connection-health.js';
import {createReadCache} from './read-cache.js';
import {resolveActionApproval} from './action-approval.js';
import {updateShellPresence} from './ssh-idle.js';
import {streamShellOutput} from './ssh-stream.js';
import {flag,creationOptions,registerCreation,completeCreationHa} from './guest-create-options.js';
import {bootstrapGuest} from './guest-bootstrap.js';
import {targetSSHHost} from './ssh-target.js';
import {writeShellInput,actionTarget,consumeGrant,connectSSH,shellSession,closeShell,publicSavedSSH,sftpOperation,deleteSavedSSH} from './ssh-access.js';
import {providerDiagnostics} from './diagnostics.js';
import {notifier} from './notifications.js';
import {storagePerformance} from './storage-performance.js';
import {shareInventory,shareWrite,detectedShare,shareProtocol} from './shares.js';
import {snapshotInventory,guestSnapshot} from './snapshots.js';
import {datasetInventory,datasetCreateInput,datasetRoot,datasetPermissionsInput} from './datasets.js';
import {diskInventory,diskSmart} from './disks.js';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {agentRequest,agentContext,selectedAgentHost,agentHosts,agentNodes,createPairing,pairingStatus,pairNode,authenticateAgent,pollAgent,revokeAgent,installAgentHost} from './node-agents.js';
import {dockerStore,dockerConfig,publicDocker,validateDocker,dockerTlsConfig} from './docker-config.js';
import os from 'node:os';
import {taskInventory,stopTask} from './tasks.js';
import {discovered} from './discovery.js';
import {storageInventory,storageDetails,createStorage,storageSummary} from './storage.js';
import {networkInventory,networkDetails,networkWrite,networkDnsWrite,networkFirewall} from './network.js';
import { updates } from './updates.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { setupStatus,registerOwner } from './setup.js';
import { clusterStore,clusterConfig,publicCluster,validateCluster } from './cluster-config.js';
import { pool } from './db.js';
import { auth,requireRole,verifyPassword,issueTokens,rotateRefreshToken,roles } from './security.js';
import { writeAudit } from './audit.js';
import { get,mutate } from './store.js';
import { monitor as liveMonitor,providers } from './monitor.js';
import { request,pve,docker,dockerSnapshot,proxmoxVmAction,proxmoxLxcAction,proxmoxCreateVm,proxmoxInstallationMedia,proxmoxCtTemplates,proxmoxCreateCt,proxmoxBackup,dockerAction,dockerCreateContainer,dockerLogs,dockerPrune,dockerBuildImage } from './connectors.js';
import { encode,required,integer,httpError,retention,pveWrite,backupJobs,createBackupJob,runBackupJob,toggleBackupJob,backupArchives,restoreArchive,truenas } from './infrastructure.js';


export function createApp({authenticate=auth,authorize=requireRole,audit=writeAudit,monitor=liveMonitor,db=pool,configuration=configurationStore,activity=headerNotifications,notificationService=notifier}={}){

 const app=express(),readCache=createReadCache();
 app.use((req,res,next)=>{res.on('finish',()=>{try{activity.capture(req,res.statusCode,res.locals.activityStatus)}catch{console.error('Application activity could not be recorded.')}});next();});
 app.use((req,res,next)=>{res.on('finish',()=>{if(!['GET','HEAD'].includes(req.method)&&res.statusCode<400&&req.path!=='/api/node-agents/pairing/status'&&!/^\/api\/(auth|ssh|node-agent|header-notifications)(?:\/|$)/.test(req.path))readCache.clear();});next();});

 if(process.env.TRUST_PROXY)app.set('trust proxy',Number(process.env.TRUST_PROXY)||1);
 app.use(helmet());app.use(cors({origin:(process.env.WEB_ORIGIN||'http://localhost').split(',')}));app.use(express.json({limit:apiPolicy.jsonBodyBytes}));
 app.use(rateLimit({windowMs:60000,limit:apiPolicy.requestsPerMinute,standardHeaders:true,legacyHeaders:false,skip:req=>{if(req.path!=='/api/node-agent/poll')return false;try{req.nodeAgent=authenticateAgent(req.headers.authorization?.replace(/^Bearer /,''));return true;}catch{return false;}}}));
 const agentPollLimiter=rateLimit({windowMs:60000,limit:120,standardHeaders:true,legacyHeaders:false,keyGenerator:req=>req.nodeAgent.id});

 const loginLimiter=rateLimit({windowMs:apiPolicy.loginWindowMs,limit:apiPolicy.loginRequests,standardHeaders:true,legacyHeaders:false});
 app.get('/api/node-agent/download',(req,res)=>res.sendFile(fileURLToPath(new URL('./agent-assets/homecloud-node-agent.py',import.meta.url))));
 app.get('/api/node-agent/install',(req,res)=>res.sendFile(fileURLToPath(new URL('./agent-assets/install-node-agent.sh',import.meta.url))));
 app.get('/api/docker-agent/install',(req,res)=>res.sendFile(fileURLToPath(new URL('./agent-assets/install-docker-agent.sh',import.meta.url))));
 app.post('/api/node-agent/pair',loginLimiter,(req,res)=>res.json(pairNode(req.body.code,req.body.name,req.body.kind)));
 app.post('/api/node-agent/poll',(req,res,next)=>{req.nodeAgent=req.nodeAgent||authenticateAgent(req.headers.authorization?.replace(/^Bearer /,''));next();},agentPollLimiter,(req,res)=>res.json(pollAgent(req.nodeAgent,req.body)));

 app.post('/api/node-agent/setup-script',(req,res)=>{authenticateAgent(req.headers.authorization?.replace(/^Bearer /,''));res.json({script:readFileSync(new URL('./agent-assets/guest-docker-setup.sh',import.meta.url),'utf8')});});
 app.get('/api/auth/setup',async(req,res)=>{res.set('Cache-Control','no-store');res.json(await setupStatus(db));});
 app.post('/api/auth/register',loginLimiter,async(req,res)=>{
   const user=await registerOwner(db,req.body);res.status(201).json({ok:true,user:{id:user.id,email:user.email,name:user.name,role:user.role},message:'Owner account created. Sign in to continue.'});
 });
 app.get('/api/health',async(req,res,next)=>{try{await db.query('SELECT 1');res.json({ok:true,version:buildInfo.version,time:new Date().toISOString()});}catch(e){res.status(503).json({ok:false,error:'Database is unavailable'});}});
 app.post('/api/auth/login',loginLimiter,async(req,res)=>{
   const email=required(req.body.email,'Email'),password=req.body.password;
   if(typeof password!=='string'||!password.length)throw httpError('Password is required');
   const user=await verifyPassword(email,password);if(user)req.activityUser={sub:user.id,role:user.role};if(!user)return res.status(401).json({error:'Invalid credentials'});

   await db.query('UPDATE users SET last_login=NOW() WHERE id=$1',[user.id]);
   res.json({user:{id:user.id,email:user.email,name:user.name,role:user.role},...await issueTokens(user)});
 });
 app.post('/api/auth/refresh',loginLimiter,async(req,res)=>{try{res.json(await rotateRefreshToken(req.body?.refreshToken));}catch(e){res.status(e.status===503?503:401).json({error:e.status===503?e.message:'Refresh token rejected'});}});

 app.get('/api/auth/me',authenticate,(req,res)=>res.json({user:req.user}));
 app.use('/api',authenticate);
 app.use('/api',(req,res,next)=>agentContext.run({host:String(req.headers['x-homecloud-docker-host']||'')},next));
 app.get('/api/docker/hosts',authorize('viewer'),(req,res)=>res.json({hosts:agentHosts().filter(h=>h.online||h.status==='connected'),directEnabled:providers.docker.configured()}));
 app.get('/api/node-agents',authorize('owner'),(req,res)=>res.json({nodes:agentNodes()}));
 app.post('/api/node-agents/pairing',authorize('owner'),async(req,res)=>{const pairing=createPairing(req.body);await audit(req,'node-agent.pairing','nodes',{},'success');res.set('Cache-Control','no-store');res.json(pairing);});
 app.post('/api/node-agents/pairing/status',authorize('owner'),(req,res)=>{res.set('Cache-Control','no-store');res.json(pairingStatus(req.body.code));});
 app.delete('/api/node-agents/:id',authorize('owner'),async(req,res)=>{revokeAgent(req.params.id);await audit(req,'node-agent.revoke',req.params.id,{},'success');res.json({ok:true});});

 app.get('/api/updates',authorize('owner'),(req,res)=>{res.set('Cache-Control','no-store');res.json(updates.status());});
 app.post('/api/updates/check',authorize('owner'),(req,res)=>res.status(202).json(updates.check()));
 app.post('/api/updates',authorize('owner'),async(req,res)=>{await audit(req,'software.update','homecloud',{},'queued');res.status(202).json(updates.request());});
 app.get('/api/connections/health',authorize('owner'),async(req,res)=>{res.set('Cache-Control','no-store');if(req.query.refresh==='1')void monitor.sample(true).catch(()=>{});const snapshot=await monitor.sample();res.json(connectionHealth({snapshot,cluster:publicCluster(clusterConfig()),direct:publicDocker(),nodes:agentNodes(),refreshing:!!monitor.isRefreshing?.(),configurations:Object.fromEntries(['truenas'].map(id=>{const c=configuration.resolve(id);return [id,{source:configuration.publicConfig(id).source,endpoint:c.TRUENAS_URL||null}]}))}));});
 app.get('/api/connections/docker/verify',authorize('owner'),async(req,res)=>{const config=dockerConfig();if(!config.url)return res.json({configured:false,status:'not-configured',message:'No direct Docker endpoint is configured. Paired-node connections do not require one.'});try{const response=await request(config.url+'/info',{},dockerTlsConfig(config));if(!response.ok)throw new Error();const info=await response.json();if(!info.ServerVersion)throw new Error();res.json({configured:true,status:'reachable',host:{hostname:info.Name,version:info.ServerVersion}});}catch{res.json({configured:true,status:'error',message:'Direct Engine verification failed. Check endpoint reachability, TLS trust and client certificates. No settings were changed.'});}});
 app.get('/api/docker/hosts/:id/verify',authorize('viewer'),async(req,res)=>{const info=await agentContext.run({host:req.params.id},async()=>{if(req.params.id==='direct'){if(!dockerConfig().url)throw httpError('Direct Docker Engine is not configured',503);return agentContext.run({host:''},()=>docker('/info'));}const response=await agentRequest('/info');if(!response.ok)throw httpError('Selected Docker host verification failed',502);return response.json();});if(!info.ServerVersion)throw httpError('Selected host did not report a Docker Engine version',502);res.json({id:req.params.id,host:{hostname:info.Name,version:info.ServerVersion}});});

 app.get('/api/connections/docker',authorize('owner'),(req,res)=>res.json({connection:publicDocker()}));
 const testDocker=async input=>{const saved=dockerStore.read(),config=validateDocker({...input,ca:input.ca||saved?.ca,cert:input.cert||saved?.cert,key:input.key||saved?.key});try{const response=await request(config.url+'/info',{},dockerTlsConfig(config));if(!response.ok)throw new Error();const info=await response.json();if(!info.ServerVersion)throw new Error();return {config,host:{hostname:info.Name,version:info.ServerVersion}};}catch{throw httpError('Docker connection failed. Check the HTTPS endpoint, client certificate, key, CA and host access.',502)}};
 app.post('/api/connections/docker/test',authorize('owner'),async(req,res)=>{const {host}=await testDocker(req.body);res.json({ok:true,host});});
 app.put('/api/connections/docker',authorize('owner'),async(req,res)=>{const {config,host}=await testDocker(req.body);dockerStore.save(config);await monitor.invalidate();await audit(req,'connection.docker.save',config.url,{},'success');res.json({ok:true,connection:publicDocker(),host});});
 app.delete('/api/connections/docker',authorize('owner'),async(req,res)=>{dockerStore.remove();await monitor.invalidate();await audit(req,'connection.docker.remove','docker',{},'success');res.json({ok:true,connection:publicDocker()});});
 app.get('/api/connections/proxmox/verify',authorize('owner'),async(req,res)=>{const config=clusterConfig();if(!config.url)return res.json({status:'not-configured',message:'No Proxmox API connection configured.'});try{const resources=await pve('/cluster/resources',{},config);if(!Array.isArray(resources))throw new Error();res.json({status:'reachable',nodes:resources.filter(r=>r.type==='node').map(r=>({name:r.node,status:r.status}))});}catch{res.json({status:'error',message:'Cannot read Proxmox resources. Check token permissions, endpoint and TLS trust.'});}});
 app.get('/api/connections/proxmox',authorize('owner'),(req,res)=>res.json({cluster:publicCluster(clusterConfig())}));
 const testCluster=async input=>{
   const config=validateCluster(input);
   try{const resources=await pve('/cluster/resources',{},config);
     if(!Array.isArray(resources))throw new Error('Unexpected Proxmox response.');
     return {config,nodes:resources.filter(r=>r.type==='node').map(r=>({name:r.node,status:r.status}))};
   }catch{throw Object.assign(new Error('Cannot read the cluster. Check the host, API token permissions and TLS certificate.'),{status:502});}
 };
 app.post('/api/connections/proxmox/test',authorize('owner'),async(req,res)=>{const {nodes}=await testCluster(req.body);res.json({ok:true,nodes});});
 app.put('/api/connections/proxmox',authorize('owner'),async(req,res)=>{
   const {config,nodes}=await testCluster(req.body);clusterStore.save(config);await monitor.invalidate();
   await audit(req,'connection.proxmox.save',config.name,{host:config.host,nodeCount:nodes.length},'success');
   res.json({ok:true,cluster:publicCluster(config),nodes});
 });
 app.delete('/api/connections/proxmox',authorize('owner'),async(req,res)=>{
   clusterStore.remove();await monitor.invalidate();await audit(req,'connection.proxmox.remove','proxmox',{},'success');
   res.json({ok:true,cluster:publicCluster(clusterConfig())});
 });
 const connectionScope=()=>crypto.createHash('sha256').update(JSON.stringify([clusterConfig(),dockerConfig(),['truenas'].map(id=>configuration.resolve(id))])).digest('hex');
 const cachedReads=new Set(['/docker','/storage','/network','/backups','/schedules','/retention','/proxmox/storage','/storage/disks','/storage/datasets','/storage/snapshots']);
 const forceRead=req=>req?.query?.refresh==='1'||req?.get?.('X-HomeCloud-Refresh')==='1';
 const sampleView=async req=>{if(!monitor.isRefreshing)return monitor.sample(forceRead(req));if(forceRead(req))void monitor.sample(true).catch(()=>{});const s=await monitor.sample();return {...s,refreshing:!!s.refreshing||monitor.isRefreshing()};};
 const read=(path,handler,role='viewer')=>app.get(`/api${path}`,authorize(role),async(req,res)=>{res.set('Cache-Control','no-store');if(!cachedReads.has(path))return res.json(await handler(req));const url=new URL(req.originalUrl,'http://local');url.searchParams.delete('refresh');url.searchParams.sort();const key=JSON.stringify([req.user?.sub,req.user?.role,connectionScope(),selectedAgentHost(),url.pathname+url.search]);res.json(await readCache.run(key,()=>handler(req),{force:forceRead(req)}));});

 app.get('/api/ssh/connections',authorize('admin'),(req,res)=>{try{res.json(publicSavedSSH(req.user.sub));}catch(e){res.status(500).json({error:'Saved connections unavailable'});}});
 const approvalHosts=new Map();
 app.delete('/api/ssh/connections',authorize('admin'),(req,res)=>{deleteSavedSSH(req.user.sub,req.body.target);res.json({ok:true});});
 app.post('/api/ssh/fingerprint',authorize('operator'),async(req,res)=>{try{const action=req.body.action===true;if(action){const approval=await resolveActionApproval(req.body.path,req.body.body,req.body.method,{dockerHost:req.body.dockerHost,query:pve});if(!approval||approval.target!==req.body.target)throw httpError('SSH approval does not match the actual target for this action',403);}if(!action&&!['admin','owner'].includes(req.user.role))return res.status(403).json({error:'Shell access requires admin access'});const host=action?await targetSSHHost(req.body.target,pve):req.body.host;try{await connectSSH({host,port:req.body.port,target:req.body.target,username:'host-key-probe',password:'unused'},req.user.sub);}catch(e){if(e.fingerprint){for(const [key,value] of approvalHosts)if(value.expires<Date.now())approvalHosts.delete(key);if(action)approvalHosts.set(`${req.user.sub}:${req.body.target}`,{host,port:Number(req.body.port||22),fingerprint:e.fingerprint,expires:Date.now()+300000});return res.json({host,fingerprint:e.fingerprint});}throw e;}res.status(400).json({error:'Host verification unavailable'});}catch(e){res.status(e.status||400).json({error:e.message});}});
 app.post('/api/ssh/connect',authorize('operator'),async(req,res)=>{try{if(req.body.mode==='authorize'){const approval=await resolveActionApproval(req.body.path,req.body.body,req.body.method,{dockerHost:req.body.dockerHost,query:pve});if(!approval||approval.target!==req.body.target)throw httpError('SSH approval does not match the actual target for this action',403);const host=await targetSSHHost(req.body.target,pve),binding=approvalHosts.get(`${req.user.sub}:${req.body.target}`);if(!binding||binding.expires<Date.now()||binding.host!==host||req.body.host!==host||binding.port!==Number(req.body.port||22)||binding.fingerprint!==req.body.fingerprint)return res.status(403).json({error:'Verify the actual target SSH host before approving this action'});}else if(!['admin','owner'].includes(req.user.role))return res.status(403).json({error:'Shell access requires admin access'});res.json(await connectSSH(req.body,req.user.sub));}catch(e){res.status(e.status||400).json({error:e.message,fingerprint:e.fingerprint});}});
 app.post('/api/ssh/sftp/:id',authorize('admin'),async(req,res)=>{try{res.json(await sftpOperation(req.params.id,req.user.sub,req.body));}catch(e){res.status(e.status||422).json({error:e.message});}});
 app.get('/api/ssh/session/:id/output',authorize('admin'),(req,res)=>{const s=shellSession(req.params.id,req.user.sub);if(s.mode!=='shell')return res.status(400).json({error:'Not a shell session'});streamShellOutput(req,res,s);});
 app.get('/api/ssh/session/:id',authorize('admin'),(req,res)=>{const s=shellSession(req.params.id,req.user.sub);if(s.mode!=='shell')return res.status(400).json({error:'Not a shell session'});if(s.releaseOutput)return res.status(409).json({error:'Shell output is already streaming'});const output=s.output;s.output='';res.json({output,closed:s.closed});});
 app.post('/api/ssh/session/:id',authorize('admin'),(req,res)=>{const s=shellSession(req.params.id,req.user.sub);if(s.mode!=='shell')return res.status(400).json({error:'Not a shell session'});if(req.body.presence)updateShellPresence(s,req.body.presence);if(typeof req.body.input==='string'&&req.body.input.length)s.touched=Date.now();writeShellInput(s,req.body.input);if(Number.isInteger(req.body.cols)&&Number.isInteger(req.body.rows))s.stream.setWindow(Math.min(100,Math.max(10,req.body.rows)),Math.min(300,Math.max(20,req.body.cols)),0,0);res.json({ok:true});});

 app.delete('/api/ssh/session/:id',authorize('admin'),(req,res)=>{closeShell(req.params.id,req.user.sub);res.json({ok:true});});
 const confirmation=(label,body)=>`${label} ${crypto.createHash('sha256').update(JSON.stringify(body||{})).digest('hex').slice(0,8)}`;
 const action=(method,path,role,label,handler,sensitive=false)=>app[method](`/api${path}`,authorize(role),async(req,res)=>{
   const resource=(Object.values(req.params).join('/')||path)+((req.params.provider==='docker'||path.startsWith('/docker/'))?` [${selectedAgentHost()||'direct-engine'}]`:'');
   const phrase=confirmation(`CONFIRM ${label.toUpperCase()} ${resource}`,req.body);
   const needsConfirmation=typeof sensitive==='function'?sensitive(req):sensitive;
   req.sshLabel=label;const legacyTarget=actionTarget(req),approval=needsConfirmation||legacyTarget?await resolveActionApproval(req.path.replace(/^\/api/,''),req.body,req.method,{dockerHost:selectedAgentHost(),query:pve}):null,sshTarget=approval?.target||legacyTarget;
   if(needsConfirmation&&req.headers['x-homecloud-confirm']!==phrase){req.activityChallenge=true;return res.status(409).json({error:'confirmation_required',confirmationPhrase:phrase,sshTarget,approvalDescription:approval?.description});}
   if(sshTarget&&!consumeGrant(req.headers['x-homecloud-ssh-grant'],req.user.sub,req.method,req.path.replace(/^\/api/,''),req.body,approval?.scope||sshTarget))return res.status(428).json({error:'Target SSH authentication required',sshTarget,approvalDescription:approval?.description});
   let result;
   try{result=await handler(req);}catch(error){await audit(req,label,resource,{error:error.message},'failed');throw error;}
   monitor.invalidate();
   const status=result?.task||result?.jobId?'queued':'success';res.locals.activityStatus=status;

   await audit(req,label,resource,{result:result??null},status);
   res.json({ok:true,result,message:status==='queued'?'Task accepted. Check task history for completion.':'Operation completed.'});
 });
 action('post','/node-agents/guest/bootstrap','owner','guest.install-agent-docker',req=>bootstrapGuest(req.body));
 action('post','/node-agents/guest/setup','owner','guest.install-docker',req=>installAgentHost(required(req.body.host,'Guest host')),true);
 const snapshot=async(provider,force=false)=>{

   if(provider==='docker'&&selectedAgentHost())return {...await dockerSnapshot(),sampledAt:new Date().toISOString(),mode:'node-agent'};
   if(monitor.provider){const result=await monitor.provider(provider,{force});if(!result.data)throw httpError(result.service?.error||`${provider} is not configured`,result.service?.status==='error'?502:503);return {...result.data,sampledAt:result.sampledAt,mode:'live'};}
   const s=await monitor.sample();const service=s.services.find(x=>x.provider===provider);
   if(!s[provider])throw httpError(service?.error||`${provider} is not configured`,service?.status==='error'?502:503);
   return {...s[provider],sampledAt:s.sampledAt,mode:'live'};
 };
 const selectedDocker=async(s,force=false)=>{

   if(!selectedAgentHost())return {inventory:s.docker||null,id:'direct',errors:[]};
   try{return {inventory:await readCache.run('docker-host:'+selectedAgentHost(),()=>dockerSnapshot({timeoutMs:15000,metrics:false}),{force}),id:selectedAgentHost(),errors:[]};}

   catch{return {inventory:null,id:selectedAgentHost(),errors:['Selected Docker host is unavailable. Inspect its node agent; no other host was substituted.']};}
 };
 const providerReads=async requests=>{
   const s=await sampleView();const response={errors:[],connectors:s.services,refreshing:!!s.refreshing};

   await Promise.all(requests.map(async([key,provider,handler])=>{
     response[key]=[];
     if(!providers[provider].configured())return;
     try{response[key]=await handler();}catch(e){response.errors.push(`${provider}: ${e.message}`);}
   }));
   return response;
 };
 read('/discovery',async()=>discovered(await monitor.sample()));
 read('/dashboard',async req=>{
   const s=await sampleView(req),inventory=discovered(s);return {sampledAt:s.sampledAt,refreshing:!!s.refreshing,services:s.services.filter(x=>x.status!=='not-configured'),hosts:s.hosts,metrics:s.metrics,alerts:s.alerts,...inventory,nodes:s.proxmox?.nodes||[],guests:[...(s.proxmox?.vms||[]),...(s.proxmox?.lxc||[])],storage:s.proxmox?.storage||[],

     stats:{servers:s.hosts.length,vms:s.proxmox?.vms.length??null,lxc:s.proxmox?.lxc.length??null,containers:s.docker||inventory.reports.some(r=>r.status==='online')?inventory.resources.filter(r=>r.kind==='Docker container'&&r.status!=='stale').length:null,alerts:s.alerts.filter(a=>a.status==='active').length,connected:s.services.filter(x=>x.status==='reachable').length,configured:s.services.filter(x=>x.status!=='not-configured').length}};
 });
 read('/monitoring',async req=>{const s=await sampleView(req);return {...s,...discovered(s),services:s.services.filter(x=>x.status!=='not-configured'),proxmox:undefined,docker:undefined,truenas:undefined};});

 read('/proxmox',async req=>{if(forceRead(req))void monitor.sample(true).catch(()=>{});const config=clusterConfig();return {...await snapshot('proxmox',forceRead(req)),cluster:config.url?{name:config.name,url:config.url}:null};});

 read('/proxmox/storage',()=>storageInventory());
 read('/network/dns',async()=>{const nodes=await pve('/nodes'),resolvers=[],errors=[];await Promise.all(nodes.map(async n=>{try{resolvers.push({node:n.node,...await pve(`/nodes/${encode(n.node)}/dns`)});}catch(e){errors.push(`${n.node}: ${e.message}`);}}));return {resolvers,errors,sampledAt:new Date().toISOString()};});
 action('put','/network/dns/:node','admin','network.dns.configure',req=>networkDnsWrite(req.params.node,req.body),true);
 read('/network/firewall/:node',req=>networkFirewall(req.params.node));
 action('post','/network/firewall/:node/rules','admin','firewall.rule.create',req=>{const b=req.body;if(!['in','out'].includes(b.type)||!['ACCEPT','DROP','REJECT'].includes(b.action))throw httpError('Invalid rule direction or action');const body={type:b.type,action:b.action,enable:0};for(const k of ['source','dest','proto','dport','comment'])if(typeof b[k]==='string'&&b[k].trim())body[k]=b[k].trim();return pveWrite(`/nodes/${encode(req.params.node)}/firewall/rules`,'POST',body);},true);
 action('put','/network/firewall/:node/rules/:pos','admin','firewall.rule.toggle',req=>{const pos=integer(req.params.pos,'Rule position',0,10000);if(![0,1].includes(req.body.enable)||typeof req.body.digest!=='string'||!req.body.digest)throw httpError('A current rule digest and enabled state are required');return pveWrite(`/nodes/${encode(req.params.node)}/firewall/rules/${pos}`,'PUT',{enable:req.body.enable,digest:req.body.digest});},true);
 read('/proxmox/network',()=>networkInventory());
 read('/proxmox/network/:node',req=>networkDetails(req.params.node,req.query.timeframe));
 action('post','/proxmox/network/:node','admin','proxmox.network.create',req=>networkWrite(req.params.node,req.body),true);
 action('put','/proxmox/network/:node/:iface','admin','proxmox.network.edit',req=>networkWrite(req.params.node,{...req.body,iface:req.params.iface},true),true);
 action('put','/proxmox/network/:node','admin','proxmox.network.apply',async req=>({node:req.params.node,task:await pve(`/nodes/${encode(req.params.node)}/network`,{method:'PUT'})}),true);
 read('/proxmox/storage/:node/:id',req=>storageDetails(req.params.node,req.params.id,req.query.timeframe,req.query.history!=='0'));
 action('post','/proxmox/storage','admin','proxmox.storage.create',req=>createStorage(req.body),true);
 action('put','/proxmox/storage/:id/enabled','admin','proxmox.storage.enabled',req=>{if(typeof req.body.enabled!=='boolean')throw httpError('enabled must be a boolean');return pveWrite(`/storage/${encode(req.params.id)}`,'PUT',{disable:req.body.enabled?0:1});},true);
 read('/proxmox/node/:node/details',async req=>{const result={node:req.params.node,errors:[]};await Promise.all(['status','version','config'].map(async key=>{try{result[key]=await pve(`/nodes/${encode(req.params.node)}/${key}`);}catch(e){result.errors.push(`${key}: ${e.message}`);}}));return result;});
read('/proxmox/node/:node/logs',async req=>({logs:await pve(`/nodes/${encode(req.params.node)}/syslog?limit=200`)}));
 read('/proxmox/vm/:node/:id/details',async req=>{
   const base=`/nodes/${encode(req.params.node)}/qemu/${encode(req.params.id)}`,result={node:req.params.node,id:req.params.id,errors:[]};
   await Promise.all([
     ['status',`${base}/status/current`],['config',`${base}/config`],['snapshots',`${base}/snapshot`],['interfaces',`${base}/agent/network-get-interfaces`],['history',`${base}/rrddata?timeframe=hour&cf=AVERAGE`],['os',`${base}/agent/get-osinfo`]
   ].map(async([key,path])=>{try{result[key]=await pve(path);}catch(e){result.errors.push(`${key}: ${e.message}`);}}));
   return result;
 });
 read('/proxmox/lxc/:node/:id/details',async req=>{
   const base=`/nodes/${encode(req.params.node)}/lxc/${encode(req.params.id)}`,result={node:req.params.node,id:req.params.id,errors:[]};
   await Promise.all([
     ['status',`${base}/status/current`],['config',`${base}/config`],['snapshots',`${base}/snapshot`],['interfaces',`${base}/interfaces`],['history',`${base}/rrddata?timeframe=hour&cf=AVERAGE`]
   ].map(async([key,path])=>{try{result[key]=await pve(path);}catch(e){result.errors.push(`${key}: ${e.message}`);}}));
   return result;
 });
 action('post','/proxmox/node/:node/power/:operation','admin','proxmox.node.power',async req=>{
   if(!['reboot','shutdown'].includes(req.params.operation))throw httpError('Unsupported node power action');
   await pveWrite(`/nodes/${encode(req.params.node)}/status`,'POST',{command:req.params.operation});
   return {node:req.params.node,operation:req.params.operation,message:'Power command submitted to Proxmox. Watch node status for the outcome.'};
 },true);
 action('post','/proxmox/node/:node/service/:service/:operation','admin','proxmox.service',async req=>{if(!['start','stop','restart'].includes(req.params.operation))throw httpError('Unsupported service action');return {task:await pve(`/nodes/${encode(req.params.node)}/services/${encode(req.params.service)}/${req.params.operation}`,{method:'POST'})};},true);
 read('/docker',async()=>{if(selectedAgentHost()||providers.docker.configured())return snapshot('docker');const inventory=discovered(await monitor.sample());if(!inventory.resources.length&&!inventory.discoveryLimitations.length)return snapshot('docker');return {readOnly:true,discoveryLimitations:inventory.discoveryLimitations,guestReports:inventory.reports.length,sampledAt:new Date().toISOString(),containers:inventory.resources.filter(r=>r.kind==='Docker container').map(r=>({...r,cpu:null,memory:null,ports:null})),images:[],volumes:[],networks:[],stacks:[],errors:inventory.reports.flatMap(r=>r.errors),note:'Guest API inventory is read-only. Connect a Docker Engine API to manage these containers.'};});
 read('/truenas',()=>snapshot('truenas'));


 read('/storage',async req=>{const s=await sampleView(req),errors=[];let proxmox=[],coverage={complete:true,expectedNodes:[],readNodes:[],missingNodes:[]};
   if(providers.proxmox.configured())try{const result=await storageInventory();proxmox=result.resources;coverage=result.coverage;errors.push(...result.errors);}catch(e){coverage.complete=false;errors.push(e.message);}
   if(providers.truenas.configured()&&(!s.truenas||(s.truenas.errors||[]).some(e=>/^pool\.(query|dataset\.query):/.test(e)))){coverage.complete=false;errors.push('TrueNAS pool capacity readings are incomplete');}
   const selected=await selectedDocker(s,forceRead(req));errors.push(...selected.errors);
   const pools=[...proxmox.map(p=>({...p,provider:'proxmox'})),...(s.truenas?.pools||[])];
   return {pools,summary:storageSummary(pools,coverage),datasets:s.truenas?.datasets||[],snapshots:s.truenas?.snapshots||[],disks:s.truenas?.disks||[],dockerHost:{id:selected.id,name:selected.inventory?.host?.hostname||null},volumes:selected.inventory?.volumes||[],jobs:s.truenas?.jobs||[],alerts:(s.alerts||[]).filter(a=>['proxmox','truenas'].includes(a.provider)&&a.status!=='resolved'),errors,services:s.services.filter(x=>['proxmox','truenas','docker'].includes(x.provider)),sampledAt:s.sampledAt,refreshing:!!s.refreshing};});
 read('/storage/disks',async req=>{const s=await sampleView(req),errors=[];let resources=[];if(s.refreshing)errors.push('Some provider measurements are still loading.');if(providers.proxmox.configured())try{const result=await diskInventory();resources=result.resources;errors.push(...result.errors);}catch(e){errors.push(e.message);}return {resources:[...resources,...(s.truenas?.disks||[]).map(d=>({...d,id:'truenas:'+d.id,provider:'truenas'}))],errors:[...errors,...(s.truenas?.errors||[])],sampledAt:new Date().toISOString(),refreshing:!!s.refreshing};});

 read('/storage/disks/:node/smart',req=>diskSmart(req.params.node,req.query.disk));
 read('/storage/snapshots/browse',async req=>{const id=required(req.query.id,'Snapshot');const list=await truenas('pool.snapshot.query',[[['id','=',id]]]);if(!list.some(s=>(s.id||s.name)===id))throw httpError('Snapshot not found',404);const split=id.lastIndexOf('@'),dataset=id.slice(0,split),name=id.slice(split+1);if(split<1||!name||/[\/\\]/.test(name)||['.','..'].includes(name))throw httpError('Invalid snapshot path');const root=await datasetRoot(dataset);return {path:`${root}/.zfs/snapshot/${name}`,entries:await truenas('filesystem.listdir',[`${root}/.zfs/snapshot/${name}`,[],{limit:200}])};});
 read('/storage/performance',req=>storagePerformance({enabled:providers.proxmox.configured(),source:req.query.source,timeframe:req.query.timeframe||'day'}));
 read('/storage/shares',()=>shareInventory({proxmox:providers.proxmox.configured(),truenasEnabled:providers.truenas.configured()}));
 read('/storage/shares/:protocol/:id/:view',async req=>{const s=await detectedShare(req.params.protocol,req.params.id);if(req.params.view==='browse')return {path:s.path,entries:await truenas('filesystem.listdir',[s.path,[],{limit:200}])};if(req.params.view==='permissions')return {path:s.path,permissions:await truenas('filesystem.getacl',[s.path,true])};if(req.params.view==='check')return {path:s.path,stat:await truenas('filesystem.stat',[s.path]),services:await truenas('service.query',[[['service','=',req.params.protocol==='smb'?'cifs':'nfs']]])};throw httpError('Unsupported share view');});
 action('post','/storage/shares/:protocol','admin','storage.share.create',req=>shareWrite(req.params.protocol,null,req.body),true);
 action('put','/storage/shares/:protocol/:id','admin','storage.share.update',req=>shareWrite(req.params.protocol,req.params.id,req.body),true);
 action('post','/storage/shares/:protocol/:id/toggle','admin','storage.share.toggle',async req=>{const s=await detectedShare(req.params.protocol,req.params.id);return truenas(`sharing.${shareProtocol(req.params.protocol)}.update`,[integer(req.params.id,'Share ID'),{enabled:!s.enabled}]);},true);
 action('delete','/storage/shares/:protocol/:id','admin','storage.share.delete',async req=>{await detectedShare(req.params.protocol,req.params.id);return truenas(`sharing.${shareProtocol(req.params.protocol)}.delete`,[integer(req.params.id,'Share ID')]);},true);
 action('put','/storage/shares/:protocol/:id/permissions','admin','storage.share.permissions',async req=>{const s=await detectedShare(req.params.protocol,req.params.id);return {jobId:await truenas('filesystem.setperm',[datasetPermissionsInput(req.body,s.path)])};},true);
 read('/storage/snapshots',()=>snapshotInventory({proxmox:providers.proxmox.configured(),truenasEnabled:providers.truenas.configured()}));
 action('post','/storage/snapshots/guest/create','operator','proxmox.snapshot.create',req=>guestSnapshot(req.body,'create'));
 action('post','/storage/snapshots/guest/rollback','admin','proxmox.snapshot.rollback',req=>guestSnapshot(req.body,'rollback'),true);
 action('post','/storage/snapshots/guest/delete','admin','proxmox.snapshot.delete',req=>guestSnapshot(req.body,'delete'),true);
 read('/storage/datasets',async req=>{const s=await sampleView(req);return {...await datasetInventory({proxmox:providers.proxmox.configured(),truenasEnabled:providers.truenas.configured(),snapshot:s.truenas||{}}),refreshing:!!s.refreshing};});

 read('/storage/datasets/browse',async req=>({entries:await truenas('filesystem.listdir',[await datasetRoot(req.query.dataset),[],{limit:200}])}));
 read('/storage/datasets/permissions',async req=>({permissions:await truenas('filesystem.getacl',[await datasetRoot(req.query.dataset),true])}));
 read('/network',async req=>{

   const s=await sampleView(req);const interfaces=[],errors=[];

   if(providers.proxmox.configured())try{const inventory=await networkInventory();interfaces.push(...inventory.interfaces.map(n=>({...n,provider:'proxmox'})));errors.push(...inventory.errors);}catch(e){errors.push(`proxmox: ${e.message}`);}

   const selected=await selectedDocker(s,forceRead(req));errors.push(...selected.errors);

   return {interfaces,dockerHost:{id:selected.id,name:selected.inventory?.host?.hostname||null},networks:selected.inventory?.networks||[],services:[],errors,connectors:s.services.filter(x=>['proxmox','docker'].includes(x.provider)),sampledAt:s.sampledAt,refreshing:!!s.refreshing};

 });
 action('post','/actions/:provider/:resourceType/:resourceId/:action','operator','infrastructure.action',async req=>{
   const {provider,resourceType,resourceId,action:operation}=req.params;const body=req.body||{};
   if(provider==='proxmox'&&resourceType==='vm'){const node=required(body.node,'Node');return {node,task:await proxmoxVmAction(node,resourceId,operation,body)};}
   if(provider==='proxmox'&&resourceType==='lxc'){
     const node=required(body.node,'Node');return {node,task:await proxmoxLxcAction(node,resourceId,operation,body)};
   }
   if(provider==='docker'&&resourceType==='container')return dockerAction(resourceId,operation,body);
   throw httpError('Unsupported provider/resource');
 },req=>{if(req.params.provider==='docker'&&req.params.resourceType==='container'&&req.params.action==='remove'&&!['admin','owner'].includes(req.user.role))throw httpError('Container removal requires admin access',403);return ['stop','shutdown','reboot','reset','suspend','delete','delete-snapshot','remove','kill'].includes(req.params.action);});
 read('/proxmox/create-options/:node',req=>creationOptions(req.params.node,pve),'operator');
 action('post','/proxmox/creation/:receipt/ha','admin','proxmox.creation.ha',req=>completeCreationHa(req.params.receipt,req.user.sub,pve),true);
 read('/proxmox/ct-templates/:node',req=>proxmoxCtTemplates(req.params.node),'operator');
 read('/proxmox/installation-media/:node',req=>proxmoxInstallationMedia(req.params.node),'operator');
 action('post','/proxmox/vm','operator','proxmox.vm.create',async req=>{
   required(req.body.name,'Name');integer(req.body.cores||2,'Cores',1,128);integer(req.body.memory||4096,'Memory MB',128,1048576);integer(req.body.disk||40,'Disk GB',1,65536);if(flag(req.body.addHa)&&!['admin','owner'].includes(req.user.role))throw httpError('HA setup requires admin access',403);const result=await proxmoxCreateVm(req.body);return flag(req.body.addHa)?registerCreation(result,'vm',req.user.sub):result;
 });
 action('post','/proxmox/backup','operator','proxmox.backup',async req=>{required(req.body.storage,'Backup storage');integer(req.body.vmid,'VM ID',100);return {node:req.body.node,task:await proxmoxBackup(req.body)};});
 action('post','/proxmox/ct','operator','proxmox.ct.create',async req=>{
   for(const key of ['name','node','ostemplate','storage'])required(req.body[key],key);
   integer(req.body.cores||2,'Cores',1,128);integer(req.body.memory||1024,'Memory MB',128,1048576);integer(req.body.disk||8,'Disk GB',1,65536);
   if((flag(req.body.addHa)||!flag(req.body.unprivileged,true))&&!['admin','owner'].includes(req.user.role))throw httpError('HA and privileged containers require admin access',403);const result=await proxmoxCreateCt(req.body);return flag(req.body.addHa)?registerCreation(result,'ct',req.user.sub):result;
 },req=>{const privileged=!flag(req.body.unprivileged,true);if(privileged&&!['admin','owner'].includes(req.user.role))throw httpError('Privileged containers require admin access',403);return privileged;});
 action('post','/docker/container','operator','docker.container.create',req=>dockerCreateContainer(req.body));
 action('post','/docker/image/build','operator','docker.image.build',req=>dockerBuildImage(req.body));
 read('/docker/image/:id',async req=>publicDockerImage(await docker(`/images/${encode(req.params.id)}/json`)));

 action('post','/docker/image/pull','operator','docker.image.pull',req=>docker(`/images/create?fromImage=${encode(required(req.body.image,'Image reference'))}`,{method:'POST',timeoutMs:Number(process.env.ACTION_TIMEOUT_MS)||300000}));
 action('post','/docker/image/:id/tag','operator','docker.image.tag',req=>docker(`/images/${encode(req.params.id)}/tag?repo=${encode(required(req.body.repository,'Repository'))}&tag=${encode(req.body.tag||'latest')}`,{method:'POST'}));
 action('delete','/docker/image/:id','admin','docker.image.remove',req=>docker(`/images/${encode(req.params.id)}?force=false`,{method:'DELETE'}),true);
 read('/docker/container/:id/logs',async req=>({logs:await dockerLogs(req.params.id,Number(req.query.tail||200))}));
 action('post','/docker/prune/:kind','admin','docker.prune',req=>dockerPrune(req.params.kind),true);
 read('/docker/volumes/usage',async()=>{const result=await docker('/system/df');return {volumes:(result.Volumes||[]).map(v=>({name:v.Name,size:v.UsageData?.Size>=0?v.UsageData.Size:null,references:v.UsageData?.RefCount>=0?v.UsageData.RefCount:null}))};});
 read('/docker/volume/:id',async req=>publicDockerVolume(await docker(`/volumes/${encode(req.params.id)}`)));

 action('post','/docker/volume','operator','docker.volume.create',req=>docker('/volumes/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({Name:required(req.body.name,'Volume name'),Driver:'local'})}));
 action('delete','/docker/volume/:id','admin','docker.volume.remove',req=>docker(`/volumes/${encode(req.params.id)}`,{method:'DELETE'}),true);
 read('/docker/network/:id',req=>docker('/networks/'+encode(req.params.id)));
 action('post','/docker/network','operator','docker.network.create',req=>docker('/networks/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({Name:required(req.body.name,'Network name'),Driver:'bridge'})}));
 action('delete','/docker/network/:id','admin','docker.network.remove',req=>docker(`/networks/${encode(req.params.id)}`,{method:'DELETE'}),true);
 action('post','/docker/stack/:id/:action','operator','docker.stack.action',async req=>{
   const operation=req.params.action;if(!['start','stop','restart'].includes(operation))throw httpError('Unsupported stack action');
   const host=await snapshot('docker');const containers=host.containers.filter(c=>c.labels['com.docker.compose.project']===req.params.id);if(!containers.length)throw httpError('Stack not found',404);
   const results=[];for(const container of containers){try{await dockerAction(container.id,operation);results.push({id:container.id,ok:true});}catch(e){results.push({id:container.id,ok:false,error:e.message});}}
   if(results.some(r=>!r.ok))throw httpError(`Stack operation partially failed: ${JSON.stringify(results)}`,502);return {containers:results};
 },true);
 read('/docker/events',async req=>{const hours=integer(req.query.hours||1,'Hours',1,168),until=Math.floor(Date.now()/1000);return {events:await docker(`/events?since=${until-hours*3600}&until=${until}`),since:until-hours*3600,until};});
 read('/backups',async()=>{
   const result=await providerReads([['jobs','proxmox',backupJobs]]);result.points=[];
   if(providers.proxmox.configured())try{const archives=await backupArchives();result.points=archives.points;result.errors.push(...archives.errors);}catch(e){result.errors.push(`proxmox: ${e.message}`);}
   return result;
 });
 read('/schedules',()=>providerReads([['items','proxmox',backupJobs],['truenas','truenas',()=>truenas('pool.snapshottask.query')]]));
 for(const path of ['/backups','/schedules'])action('post',path,'admin','proxmox.backup.schedule.create',req=>createBackupJob(req.body));
 action('post','/backups/:id/run','operator','proxmox.backup.run',req=>runBackupJob(req.params.id));
 action('post','/schedules/:id/toggle','admin','proxmox.schedule.toggle',req=>toggleBackupJob(req.params.id));
 action('delete','/schedules/:id','admin','proxmox.schedule.delete',req=>pve(`/cluster/backup/${encode(req.params.id)}`,{method:'DELETE'}),true);
 read('/retention',()=>providerReads([['policies','proxmox',async()=>(await backupJobs()).map(j=>({...j,rule:j['prune-backups']??null}))],['truenas','truenas',()=>truenas('pool.snapshottask.query')]]));
 action('post','/retention','admin','proxmox.retention.update',req=>pveWrite(`/cluster/backup/${encode(required(req.body.jobId,'Backup job'))}`,'PUT',{'prune-backups':retention(req.body.rule)}),true);
 read('/retention/preview',async req=>({items:await pve(`/nodes/${encode(required(req.query.node,'Node'))}/storage/${encode(required(req.query.storage,'Backup storage'))}/prunebackups?${new URLSearchParams({'prune-backups':retention(req.query.rule),...(req.query.vmid?{vmid:String(integer(req.query.vmid,'VM ID',100))}:{})})}`)}),'admin');
 action('post','/retention/run','admin','proxmox.retention.prune',async req=>{
   const {node,storage,rule}=req.body;return {node,task:await pve(`/nodes/${encode(required(node,'Node'))}/storage/${encode(required(storage,'Backup storage'))}/prunebackups?${new URLSearchParams({'prune-backups':retention(rule),...(req.body.vmid?{vmid:String(integer(req.body.vmid,'VM ID',100))}:{})})}`,{method:'DELETE'})};
 },true);
 read('/restore',async()=>{
   const result=await providerReads([['snapshots','truenas',async()=>(await snapshot('truenas')).snapshots]]);result.points=[];
   if(providers.proxmox.configured())try{const archives=await backupArchives();result.points=archives.points;result.errors.push(...archives.errors);}catch(e){result.errors.push(`proxmox: ${e.message}`);}
   return result;
 });
 action('post','/restore/:id/run','admin','proxmox.restore',req=>restoreArchive(req.params.id,req.body),true);
 read('/proxmox/tasks',req=>taskInventory(req.query.hours||24));
 action('delete','/tasks/:node/:id','admin','proxmox.task.stop',req=>stopTask(req.params.node,req.params.id),true);
 read('/tasks',()=>providerReads([['proxmox','proxmox',()=>pve('/cluster/tasks')],['truenas','truenas',()=>truenas('core.get_jobs',[[],{limit:100}])]]));
 read('/tasks/:node/:id',req=>pve(`/nodes/${encode(req.params.node)}/tasks/${encode(req.params.id)}/status`));
 read('/tasks/:node/:id/log',async req=>({logs:await pve(`/nodes/${encode(req.params.node)}/tasks/${encode(req.params.id)}/log?limit=500${req.query.start?`&start=${integer(req.query.start,'Log offset',0,10000000)}`:''}`)}));
 action('post','/truenas/dataset','admin','truenas.dataset.create',req=>truenas('pool.dataset.create',[datasetCreateInput(req.body)]));
 action('put','/truenas/dataset/permissions','admin','truenas.dataset.permissions',async req=>({jobId:await truenas('filesystem.setperm',[datasetPermissionsInput(req.body,await datasetRoot(req.body.dataset))])}),true);
 action('post','/truenas/dataset/clone','admin','truenas.dataset.clone',req=>truenas('pool.snapshot.clone',[{snapshot:required(req.body.snapshot,'Snapshot'),dataset_dst:datasetCreateInput({name:req.body.name}).name}]));
 action('post','/truenas/snapshot','operator','truenas.snapshot.create',req=>truenas('pool.snapshot.create',[{dataset:required(req.body.dataset,'Dataset'),name:required(req.body.name,'Snapshot name'),recursive:false}]));
 action('delete','/truenas/snapshot/:id','admin','truenas.snapshot.delete',req=>truenas('pool.snapshot.delete',[req.params.id,{defer:false,recursive:false}]),true);
 action('post','/truenas/snapshot/:id/rollback','admin','truenas.snapshot.rollback',req=>truenas('pool.snapshot.rollback',[req.params.id,{recursive:false,recursive_clones:false,force:false}]),true);
 action('post','/truenas/pool/:id/scrub','admin','truenas.pool.scrub',async req=>({jobId:await truenas('pool.scrub.scrub',[integer(req.params.id,'Pool ID'),'START'])}));
 action('post','/truenas/schedule','admin','truenas.snapshot.schedule.create',req=>{
   const {dataset,hour='2',minute='0',lifetime=7}=req.body;integer(hour,'Hour',0,23);integer(minute,'Minute',0,59);
   return truenas('pool.snapshottask.create',[{dataset:required(dataset,'Dataset'),recursive:false,lifetime_value:integer(lifetime,'Retention days',1,3650),lifetime_unit:'DAY',naming_schema:'homecloud-%Y-%m-%d_%H-%M',schedule:{minute:String(minute),hour:String(hour),dom:'*',month:'*',dow:'*'},enabled:true}]);
 });
 action('post','/truenas/schedule/:id/toggle','admin','truenas.snapshot.schedule.toggle',async req=>{const id=integer(req.params.id,'Task ID');const tasks=await truenas('pool.snapshottask.query',[[['id','=',id]]]);if(!tasks.length)throw httpError('Task not found',404);return truenas('pool.snapshottask.update',[id,{enabled:!tasks[0].enabled}]);});





 read('/header-notifications',req=>activity.read(req.user,req.user.role==='owner'?updates.status():null));
 app.post('/api/header-notifications/read',authorize('viewer'),(req,res)=>{res.set('Cache-Control','no-store');res.json(activity.markRead(req.user,req.body.sequence));});
 read('/alerts',async()=>{void monitor.sample().catch(()=>{});return {alerts:get().alerts,rules:get().rules};});

 action('post','/alerts/rules','admin','alert.rule.create',async req=>{const {name,metric,provider='all',severity='warning'}=req.body;if(!['cpu','memory','storage'].includes(metric)||!['all',...Object.keys(providers)].includes(provider)||!['critical','warning'].includes(severity))throw httpError('Invalid alert rule');const rule={id:crypto.randomUUID(),name:required(name,'Name'),metric,provider,severity,threshold:integer(req.body.threshold,'Threshold',1,100),enabled:true};mutate(s=>s.rules.push(rule));return rule;});
 action('put','/alerts/rules/:id','admin','alert.rule.update',async req=>{const b=req.body,patch={};if(b.name!==undefined)patch.name=required(b.name,'Name');if(b.metric!==undefined){if(!['cpu','memory','storage'].includes(b.metric))throw httpError('Invalid metric');patch.metric=b.metric;}if(b.provider!==undefined){if(!['all',...Object.keys(providers)].includes(b.provider))throw httpError('Invalid provider');patch.provider=b.provider;}if(b.severity!==undefined){if(!['critical','warning'].includes(b.severity))throw httpError('Invalid severity');patch.severity=b.severity;}if(b.threshold!==undefined)patch.threshold=integer(b.threshold,'Threshold',1,100);if(b.enabled!==undefined){if(typeof b.enabled!=='boolean')throw httpError('Invalid enabled state');patch.enabled=b.enabled;}if(!get().rules.some(r=>r.id===req.params.id))throw httpError('Rule not found',404);mutate(s=>Object.assign(s.rules.find(r=>r.id===req.params.id),patch));return {updated:true};});
 action('delete','/alerts/rules/:id','admin','alert.rule.delete',async req=>{mutate(s=>s.rules=s.rules.filter(r=>r.id!==req.params.id));});
 action('post','/alerts/:id/resolve','operator','alert.acknowledge',async req=>{let found;mutate(s=>{found=s.alerts.find(a=>a.id===req.params.id);if(found?.status==='active'){found.status='acknowledged';found.acknowledgedBy=req.user.email;}});if(!found)throw httpError('Alert not found',404);return {status:found.status};});
 action('post','/ai/health','viewer','health.inspect',async()=>{const s=await monitor.sample(true);return {summary:`${s.services.filter(x=>x.status==='reachable').length} reachable integrations/services; ${s.services.filter(x=>x.status==='error').length} connection failures; ${s.alerts.filter(a=>a.status==='active').length} active alerts. This is an API and threshold check, not a security scan.`};});
 action('post','/ai/chat','viewer','assistant.query',async req=>{
   const message=required(req.body.message,'Message');const s=await monitor.sample();
   const context={sampledAt:s.sampledAt,services:s.services,alerts:s.alerts.filter(a=>a.status!=='resolved'),proxmox:s.proxmox,docker:s.docker,dockerFleet:s.dockerFleet,truenas:s.truenas?{pools:s.truenas.pools}:undefined};
   const ai=configuration.resolve('ai');if(ai.OPENAI_API_KEY)return {answer:await queryAI(ai,JSON.stringify({context,message})),mode:'openai'};

   return {answer:`Sampled ${s.sampledAt}. ${s.services.map(x=>`${x.name}: ${x.status}${x.error?` (${x.error})`:''}`).join('; ')}. ${context.alerts.length} active or acknowledged alerts. Configure the AI Assistant in Settings → Integrations for conversational analysis.`,mode:'local'};

 });
 read('/users',async()=>({users:(await db.query(`SELECT id,name,email,role,status,two_factor_enabled AS "twoFactor",last_login AS "lastLogin",created_at AS "createdAt" FROM users ORDER BY created_at`)).rows}),'admin');
 action('post','/users','admin','user.create',async req=>{
   const {email,name,password,role='viewer'}=req.body;if(!roles[role]||(role==='owner'&&req.user.role!=='owner')||roles[role]>roles[req.user.role])throw httpError('Role cannot be granted',403);
   const normalizedEmail=required(email,'Email').toLowerCase(),normalizedName=required(name,'Name');if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)||normalizedEmail.length>254)throw httpError('Enter a valid email address');if(normalizedName.length>200)throw httpError('Name must be at most 200 characters');if(typeof password!=='string'||password.length<12||Buffer.byteLength(password)>72)throw httpError('Password must have at least 12 characters and at most 72 bytes');

   const hash=await bcrypt.hash(password,12);try{return (await db.query(`INSERT INTO users(email,name,password_hash,role,status) VALUES($1,$2,$3,$4,'active') RETURNING id,email,name,role,status`,[normalizedEmail,normalizedName,hash,role])).rows[0];}catch(e){if(e.code==='23505')throw httpError('Email already exists',409);throw e;}
 });
 action('post','/users/:id/toggle','admin','user.toggle',async req=>{
   if(req.params.id===req.user.sub)throw httpError('You cannot deactivate yourself');
   const user=(await db.query('SELECT role FROM users WHERE id=$1',[req.params.id])).rows[0];if(!user)throw httpError('User not found',404);
   if(user.role==='owner'||roles[user.role]>=roles[req.user.role])throw httpError('Only lower-privilege non-owner accounts can be changed',403);
   return (await db.query(`UPDATE users SET status=CASE status WHEN 'active' THEN 'inactive' ELSE 'active' END WHERE id=$1 RETURNING id,name,status`,[req.params.id])).rows[0];
 },true);
 read('/audit',async()=>({logs:(await db.query(`SELECT id::text,created_at AS time,COALESCE(user_email,'system') AS "user",action,resource,details,status,COALESCE(ip,'-') ip FROM audit_logs ORDER BY created_at DESC LIMIT 500`)).rows}),'auditor');
 read('/diagnostics',()=>providerDiagnostics(),'owner');
 action('post','/configuration/ai/models','owner','configuration.models',async req=>({models:await listAIModels(validateConfiguration('ai',req.body.configuration??{},configuration.resolve('ai')))}));
 read('/configuration/:service',req=>configuration.publicConfig(req.params.service),'owner');
 action('put','/configuration/:service','owner','configuration.save',req=>configuration.save(req.params.service,req.body));
 action('delete','/configuration/:service','owner','configuration.disable',req=>configuration.disable(req.params.service));
 action('post','/configuration/:service/test','owner','configuration.test',async req=>{const id=req.params.service;if(!Object.hasOwn(configurationSchemas,id))throw httpError('Unsupported configuration service');try{if(['discord','telegram','email'].includes(id)){if(req.body.confirm!==true)throw httpError('Confirm sending an external test notification');const config=validateConfiguration(id,req.body.configuration??{},configuration.resolve(id));const result=await notificationService.test(id,{env:config});return {...result,message:req.body.configuration?'Test notification delivered for the entered settings. Save Configuration to apply them.':'Test notification delivered.'};}if(id==='ai'){if(req.body.confirm!==true)throw httpError('Confirm sending a test request to OpenAI');const config=validateConfiguration('ai',req.body.configuration??{},configuration.resolve('ai'));await queryAI(config,'Reply with OK.',true);return {service:id,verified:true,model:config.OPENAI_MODEL,apiType:config.OPENAI_API_TYPE,message:req.body.configuration?'AI connection verified for the entered settings. Save Configuration to apply them.':'AI connection verified.'};}const config=validateConfiguration('truenas',req.body.configuration??{},configuration.resolve('truenas'));const result=await truenas('system.info',[],{...configuration.environment(),...config});if(!result||typeof result!=='object'||Array.isArray(result))throw Error('Invalid provider response');return {service:id,verified:true,message:`Read-only connection check passed. Write permissions were not tested.${req.body.configuration?' Save Configuration to apply these settings.':''}`};}catch(error){if(error.status===400||error.notificationTest||id==='ai'&&error.aiError)throw error;throw httpError('Connection test failed. Check the endpoint, credentials, permissions, network and trusted CA certificate.',502);}});

 read('/notifications',()=>notificationService.status(),'owner');
 action('put','/notifications/preferences','owner','notification.preferences',req=>{const preferences=validateNotificationPreferences(req.body);mutate(s=>s.notificationPreferences=preferences);return preferences;});
 action('post','/notifications/test','owner','notification.test',req=>notificationService.test(required(req.body.channel,'Channel')));
 read('/security',()=>({authenticationRequired:true,roles:Object.keys(roles),twoFactor:false,accessTokenLifetime:process.env.JWT_EXPIRES_IN||'15m',refreshTokenLifetime:process.env.JWT_REFRESH_EXPIRES_IN||'7d',loginRequests:apiPolicy.loginRequests,loginWindowMs:apiPolicy.loginWindowMs,password:{minimumCharacters:12,maximumBytes:72,complexityRequired:false},sessionManagement:false,apiKeys:false,networkManagement:false}));
 read('/settings',async()=>{const snapshot=await sampleView();return {refreshing:!!snapshot.refreshing,system:{hostname:os.hostname(),platform:os.platform(),release:os.release(),runtime:process.version,architecture:os.arch(),operatingSystem:os.type(),serverTime:new Date().toISOString(),uptime:Math.floor(process.uptime()),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,...buildInfo},settings:get().settings,policy:apiPolicy,integrations:snapshot.services,capabilities:{twoFactor:false,notifications:'in-app and configured Discord, Telegram or SMTP channels',monitoring:'API polling',truenas:'JSON-RPC API 25.04+; method compatibility depends on version'}};});

 action('put','/settings','admin','settings.update',async req=>{
   const settings={siteName:required(req.body.siteName,'Site name'),description:String(req.body.description||'').slice(0,500),refresh:integer(req.body.refresh,'Refresh interval',15,300)};
   mutate(s=>s.settings=settings);return settings;
 });
 app.use('/api',(req,res)=>res.status(404).json({error:'API endpoint not found'}));
 app.use((error,req,res,next)=>{console.error(error.message);res.status(error.status||502).json({error:error.message||'Request failed'});});
 return app;
}
