import {vpnGateways,requireVPNNode} from './vpn-gateways.js';
import {verifyProxmoxManagement} from './proxmox-management-access.js';
import {automaticDockerPairing} from './automatic-docker-pairing.js';
import {automaticNodePairing} from './automatic-node-pairing.js';
import {pairingTargets} from './pairing-targets.js';
import {proxmoxTestError} from './proxmox-test-error.js';
import {automaticConnectorUpdates} from './connector-auto-updates.js';
import {createHistoryCleanup} from './alert-history-cleanup.js';
import {dashboardHistory} from './dashboard-history.js';
import {createReportPerformance} from './report-performance.js';
import {createRecoveryTests} from './recovery-tests.js';
import {operationsView} from './operations-health.js';
import {operationalNodes,operationalAction} from './node-agents.js';
import {changeAlertStatus} from './alert-status.js';
import {sessionResponse,refreshCredential,browserSession} from './browser-sessions.js';
import {accountSecurityRouter} from './account-security.js';
import {beginMfaLogin,completeMfaLogin} from './mfa.js';
import {truenasTestError} from './truenas-test-error.js';
import {connectionActions} from './connection-actions.js';
import {dockerImageUpdates} from './docker-image-updates.js';
import {recoverDockerUpdate} from './docker-update-recovery.js';
import {createDockerUpdateProgress} from './docker-update-progress.js';
import {installDockerImageUpdate,updatePlan,ensureNoContainerDependents} from './docker-install-update.js';
import {createGuestConnectionReader} from './guest-connections.js';
import {guestPermissionRepair,powerPermissionSetup} from './guest-permissions.js';
import {resetGuestDiscovery} from './guest-discovery.js';
import {notificationIds} from './notification-channels.js';
import {buildInfo} from './build-info.js';
import {publicDockerImage,publicDockerVolume} from './docker-public.js';
import {queryAI,listAIModels} from './ai.js';
import {connectorSSHAddress} from './connector-ssh-target.js';
import {connectorUpdater} from './connector-updates.js';
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
import {closeSessionAccess,writeShellInput,actionTarget,consumeGrant,connectSSH,shellSession,closeShell,publicSavedSSH,sftpOperation,deleteSavedSSH} from './ssh-access.js';
import {providerDiagnostics} from './diagnostics.js';
import {notifier} from './notifications.js';
import {storagePerformance} from './storage-performance.js';
import {shareInventory,shareWrite,detectedShare,shareProtocol} from './shares.js';
import {snapshotInventory,guestSnapshot} from './snapshots.js';
import {datasetInventory,datasetCreateInput,datasetRoot,datasetPermissionsInput} from './datasets.js';
import {diskInventory,diskSmart} from './disks.js';
import {fileURLToPath} from 'node:url';
import {existsSync,readFileSync} from 'node:fs';
import {agentRequest,agentContext,selectedAgentHost,agentHosts,agentNodes,createPairing,pairingStatus,pairNode,authenticateAgent,pollAgent,revokeAgent,installAgentHost} from './node-agents.js';
import {dockerStore,dockerConfig,publicDocker,validateDocker,dockerTlsConfig} from './docker-config.js';
import os from 'node:os';
import {taskInventory,stopTask} from './tasks.js';
import {discovered,discoveredContainerCount} from './discovery.js';
import {storageInventory,storageDetails,createStorage,storageSummary,storageConfiguration} from './storage.js';
import {networkInventory,networkDetails,networkWrite,networkDnsWrite,networkFirewall} from './network.js';
import { updates } from './updates.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import {accountIdentity} from './username.js';
import { setupStatus,registerOwner } from './setup.js';
import { clusterStore,clusterConfig,publicCluster,validateCluster } from './cluster-config.js';
import { pool } from './db.js';
import { auth,requireRole,verifyPassword,issueTokens,rotateRefreshToken,roles } from './security.js';
import { writeAudit } from './audit.js';
import { get,mutate } from './store.js';
import { monitor as liveMonitor,providers } from './monitor.js';
import { request,pve,docker,dockerSnapshot,proxmoxVmAction,proxmoxLxcAction,proxmoxCreateVm,proxmoxInstallationMedia,proxmoxCtTemplates,proxmoxCreateCt,proxmoxBackup,dockerAction,dockerCreateContainer,dockerLogs,dockerPrune,dockerBuildImage } from './connectors.js';
import { encode,required,integer,httpError,retention,pveWrite,backupJobs,createBackupJob,runBackupJob,toggleBackupJob,backupArchives,restoreArchive,truenas } from './infrastructure.js';


export function createApp({authenticate=auth,authorize=requireRole,audit=writeAudit,monitor=liveMonitor,db=pool,configuration=configurationStore,activity=headerNotifications,notificationService=notifier,connectorUpdates=connectorUpdater,autoConnectorUpdates=automaticConnectorUpdates,connectionService=connectionActions,connectorAddress=connectorSSHAddress,guestPermissions=guestPermissionRepair,powerPermissions=powerPermissionSetup,guestConnectionReader=createGuestConnectionReader({config:clusterConfig}),imageUpdates=dockerImageUpdates,imageUpdateInstaller=installDockerImageUpdate,dockerUpdateQuery=docker,operationJournalFile,nodePairing=automaticNodePairing}={}){

 const app=express(),readCache=createReadCache(),reportPerformance=createReportPerformance();
 app.use((req,res,next)=>{const started=performance.now();res.on('finish',()=>{if(req.method==='GET'&&req.route?.path)reportPerformance.record(req.route.path,performance.now()-started,res.statusCode)});next()});
 app.use((req,res,next)=>{res.on('finish',()=>{try{activity.capture(req,res.statusCode,res.locals.activityStatus)}catch{console.error('Application activity could not be recorded.')}});next();});
 app.use((req,res,next)=>{res.on('finish',()=>{if(!['GET','HEAD'].includes(req.method)&&res.statusCode<400&&req.path!=='/api/node-agents/pairing/status'&&!/^\/api\/(auth|ssh|node-agent|header-notifications)(?:\/|$)/.test(req.path))readCache.clear();});next();});

 if(process.env.TRUST_PROXY)app.set('trust proxy',Number(process.env.TRUST_PROXY)||1);
 app.use(helmet());app.use(cors({origin:(process.env.WEB_ORIGIN||'http://localhost').split(',')}));app.use(express.json({limit:apiPolicy.jsonBodyBytes}));
 app.use(rateLimit({windowMs:60000,limit:apiPolicy.requestsPerMinute,standardHeaders:true,legacyHeaders:false,skip:req=>{if(req.path!=='/api/node-agent/poll')return false;try{req.nodeAgent=authenticateAgent(req.headers.authorization?.replace(/^Bearer /,''));return true;}catch{return false;}}}));
 const agentPollLimiter=rateLimit({windowMs:60000,limit:120,standardHeaders:true,legacyHeaders:false,keyGenerator:req=>req.nodeAgent.id});

 const loginLimiter=rateLimit({windowMs:apiPolicy.loginWindowMs,limit:apiPolicy.loginRequests,standardHeaders:true,legacyHeaders:false});
 app.get('/api/node-agent/download',(req,res)=>res.sendFile(fileURLToPath(new URL('./agent-assets/iclusters-node-agent.py',import.meta.url))));

 app.get('/api/node-agent/install',(req,res)=>res.sendFile(fileURLToPath(new URL('./agent-assets/install-node-agent.sh',import.meta.url))));
 app.get('/api/docker-agent/install',(req,res)=>res.sendFile(fileURLToPath(new URL('./agent-assets/install-docker-agent.sh',import.meta.url))));
 app.post('/api/node-agent/pair',loginLimiter,(req,res)=>res.json(pairNode(req.body.code,req.body.name,req.body.kind)));
 app.post('/api/node-agent/poll',(req,res,next)=>{req.nodeAgent=req.nodeAgent||authenticateAgent(req.headers.authorization?.replace(/^Bearer /,''));next();},agentPollLimiter,(req,res)=>{const result=pollAgent(req.nodeAgent,req.body);res.json({...result,...autoConnectorUpdates.poll(req.nodeAgent,req.body,result)})});

 app.post('/api/node-agent/setup-script',(req,res)=>{authenticateAgent(req.headers.authorization?.replace(/^Bearer /,''));res.json({script:readFileSync(new URL('./agent-assets/guest-docker-setup.sh',import.meta.url),'utf8')});});
 app.get('/api/auth/setup',async(req,res)=>{res.set('Cache-Control','no-store');res.json(await setupStatus(db));});
 app.post('/api/auth/register',loginLimiter,async(req,res)=>{
   const user=await registerOwner(db,req.body);res.status(201).json({ok:true,user:{id:user.id,email:user.email,username:user.username,name:user.name,role:user.role},message:'Owner account created. Sign in to continue.'});
 });
 app.get('/api/health',async(req,res,next)=>{try{await db.query('SELECT 1');res.json({ok:true,version:buildInfo.version,time:new Date().toISOString()});}catch(e){res.status(503).json({ok:false,error:'Database is unavailable'});}});
 app.post('/api/auth/login',loginLimiter,async(req,res)=>{
   browserSession(req);
   const email=required(req.body.username??req.body.email,'Username'),password=req.body.password;
   if(typeof password!=='string'||!password.length)throw httpError('Password is required');
   const user=await verifyPassword(email,password);if(user)req.activityUser={sub:user.id,role:user.role};if(!user)return res.status(401).json({error:'Invalid credentials'});

   if(user.two_factor_enabled)return res.json(await beginMfaLogin(db,user,req.body.remember===true));
   await db.query('UPDATE users SET last_login=NOW() WHERE id=$1',[user.id]);
   sessionResponse(req,res,{user:{id:user.id,email:user.email,username:user.username,name:user.name,role:user.role},...await issueTokens(user,{remember:req.body.remember===true,device:req.get('User-Agent')})});
 });
 app.post('/api/auth/refresh',loginLimiter,async(req,res)=>{try{sessionResponse(req,res,await rotateRefreshToken(refreshCredential(req)));}catch(e){res.status(e.status===503?503:401).json({error:e.status===503?e.message:'Refresh token rejected'});}});

 app.post('/api/auth/mfa',loginLimiter,async(req,res)=>{try{browserSession(req);const {user,remember}=await completeMfaLogin(db,req.body.challengeToken,req.body.code);req.activityUser={sub:user.id,role:user.role};await db.query('UPDATE users SET last_login=NOW() WHERE id=$1',[user.id]);sessionResponse(req,res,{user:{id:user.id,username:user.username,name:user.name,role:user.role},...await issueTokens(user,{remember,device:req.get('User-Agent')})});}catch(e){res.status(e.status||503).json({error:e.status?e.message:'Account verification is temporarily unavailable.'});}});
 app.get('/api/auth/me',authenticate,(req,res)=>res.json({user:req.user}));
 app.use('/api',authenticate);
 app.use('/api',(req,res,next)=>{if(!['GET','HEAD'].includes(req.method)&&process.env.DATA_DIR&&existsSync(process.env.DATA_DIR+'/maintenance.json'))return res.status(503).json({error:'Controller maintenance is in progress. Retry after it completes.'});next();});
 app.use('/api/account',accountSecurityRouter({db,audit,limiter:loginLimiter,onSessionRevoked:closeSessionAccess}));
 app.use('/api',(req,res,next)=>{for(const [key,value] of Object.entries(req.headers))if(key.startsWith('x-homecloud-')&&!Object.hasOwn(req.headers,key.replace('x-homecloud-','x-iclusters-')))req.headers[key.replace('x-homecloud-','x-iclusters-')]=value;next()});
 app.use('/api',(req,res,next)=>agentContext.run({host:String(req.headers['x-iclusters-docker-host']||'')},next));

 app.get('/api/docker/hosts',authorize('viewer'),(req,res)=>res.json({hosts:agentHosts().filter(h=>h.online||h.status==='connected'),directEnabled:providers.docker.configured()}));
 app.get('/api/node-agents',authorize('owner'),(req,res)=>res.json({nodes:agentNodes()}));
 app.get('/api/node-agents/:id/ssh-target',authorize('owner'),async(req,res)=>{const node=agentNodes().find(n=>n.id===req.params.id);if(!node)throw httpError('Paired connector not found',404);res.set('Cache-Control','no-store');res.json(await connectorAddress(node));});
 app.get('/api/node-agents/:id/automatic-updates',authorize('owner'),(req,res)=>{res.set('Cache-Control','no-store');res.json(autoConnectorUpdates.status(req.params.id));});
 app.put('/api/node-agents/:id/automatic-updates',authorize('owner'),async(req,res)=>{const result=autoConnectorUpdates.configure(req.params.id,req.body,req.user);await audit(req,'connector.automatic-updates',req.params.id,{enabled:result.enabled},'success');res.json(result);});
 app.get('/api/node-agents/:id/update',authorize('owner'),(req,res)=>{res.set('Cache-Control','no-store');res.json({update:connectorUpdates.status(req.params.id)});});
 app.post('/api/node-agents/:id/update',authorize('owner'),async(req,res)=>{const update=connectorUpdates.request(req.params.id,req.body);res.locals.activityStatus='queued';await audit(req,'connector.update',req.params.id,{version:update.version,revision:update.revision},'queued');res.status(202).json({update});});
 app.post('/api/node-agents/:id/maintenance',authorize('owner'),async(req,res)=>{res.set('Cache-Control','no-store');const result=await connectionService.perform(req.params.id,req.body);await audit(req,'connection.'+result.action,req.params.id,{target:result.target,active:result.active},'success');res.json({result});});
 app.get('/api/node-agents/automatic-pairing/target',authorize('owner'),async(req,res)=>{res.set('Cache-Control','no-store');res.json(await nodePairing.target(req.query.node));});
 app.get('/api/node-agents/automatic-pairing/:job',authorize('owner'),(req,res)=>{res.set('Cache-Control','no-store');res.json({job:nodePairing.status(req.params.job)});});
 app.post('/api/node-agents/automatic-pairing',authorize('owner'),loginLimiter,async(req,res)=>{try{if(!req.secure)throw httpError('Open i-Clusters over HTTPS before entering SSH credentials.',400);const job=await nodePairing.start(req.body);req.body.password='';await audit(req,'node-agent.automatic-pairing',job.node,{job:job.id},'queued');res.set('Cache-Control','no-store');res.status(202).json({job});}finally{req.body.password='';}});
 app.get('/api/node-agents/automatic-docker-pairing/target',authorize('owner'),async(req,res)=>{res.set('Cache-Control','no-store');res.json(await automaticDockerPairing.target(req.query.node));});
 app.get('/api/node-agents/automatic-docker-pairing/:job',authorize('owner'),(req,res)=>{res.set('Cache-Control','no-store');res.json({job:automaticDockerPairing.status(req.params.job)});});
 app.post('/api/node-agents/automatic-docker-pairing',authorize('owner'),loginLimiter,async(req,res)=>{try{if(!req.secure)throw httpError('Open i-Clusters over HTTPS before entering SSH credentials.',400);const job=await automaticDockerPairing.start(req.body);req.body.password='';await audit(req,'node-agent.automatic-pairing',job.node,{job:job.id},'queued');res.set('Cache-Control','no-store');res.status(202).json({job});}finally{req.body.password='';}});
 app.get('/api/node-agents/pairing-targets',authorize('owner'),async(req,res)=>{res.set('Cache-Control','no-store');res.json(await pairingTargets(req.query.kind));});
 app.post('/api/node-agents/pairing',authorize('owner'),async(req,res)=>{const pairing=createPairing(req.body);await audit(req,'node-agent.pairing','nodes',{},'success');res.set('Cache-Control','no-store');res.json(pairing);});
 app.post('/api/node-agents/pairing/status',authorize('owner'),(req,res)=>{res.set('Cache-Control','no-store');res.json(pairingStatus(req.body.code));});
 app.delete('/api/node-agents/:id',authorize('owner'),async(req,res)=>{revokeAgent(req.params.id);await audit(req,'node-agent.revoke',req.params.id,{},'success');res.json({ok:true});});

 app.get('/api/updates',authorize('owner'),(req,res)=>{res.set('Cache-Control','no-store');res.json(updates.status());});
 app.post('/api/updates/check',authorize('owner'),(req,res)=>res.status(202).json(updates.check()));
 app.post('/api/updates',authorize('owner'),async(req,res)=>{await audit(req,'software.update','iclusters',{},'queued');res.status(202).json(updates.request());});

 app.get('/api/connections/health',authorize('owner'),async(req,res)=>{res.set('Cache-Control','no-store');if(forceRead(req))void monitor.sample(true).catch(()=>{});const snapshot=await monitor.sample();res.json(connectionHealth({snapshot,cluster:publicCluster(clusterConfig()),direct:publicDocker(),nodes:agentNodes(),refreshing:!!monitor.isRefreshing?.(),configurations:Object.fromEntries(['truenas'].map(id=>{const c=configuration.resolve(id);return [id,{source:configuration.publicConfig(id).source,endpoint:c.TRUENAS_URL||null}]}))}));});
 app.get('/api/connections/proxmox/guests',authorize('owner'),async(req,res)=>{res.set('Cache-Control','no-store');res.json(await guestConnectionReader(req.query.refresh==='1'||req.headers['x-iclusters-refresh']==='1'));});
 app.get('/api/connections/proxmox/guest-permissions',authorize('owner'),async(req,res)=>{res.set('Cache-Control','no-store');res.json(await guestPermissions.inspect());});
 app.post('/api/connections/proxmox/guest-permissions',authorize('owner'),loginLimiter,async(req,res)=>{
  res.set('Cache-Control','no-store');let result;
  try{if(!req.secure)throw httpError('Open i-Clusters over HTTPS before entering administrator credentials.');result=await guestPermissions.repair(req.body);}catch(error){req.body.password='';req.body.otp='';await audit(req,'connection.proxmox.guest-permissions','proxmox',{vmids:Array.isArray(req.body.vmids)?req.body.vmids.filter(id=>/^\d+$/.test(String(id))).slice(0,20):[]},'failed');throw error;}
  finally{req.body.password='';req.body.otp='';}
  resetGuestDiscovery();try{await monitor.invalidate();}catch{}
  await audit(req,'connection.proxmox.guest-permissions','proxmox',{vmids:result.vmids,verified:result.verified,changed:result.changed},'success');res.json(result);
 });
 app.get('/api/connections/proxmox/power-permissions',authorize('owner'),async(req,res)=>{res.set('Cache-Control','no-store');res.json(await powerPermissions.inspect());});
 app.post('/api/connections/proxmox/power-permissions',authorize('owner'),loginLimiter,async(req,res)=>{
  res.set('Cache-Control','no-store');let result;
  try{if(!req.secure)throw httpError('Open i-Clusters over HTTPS before entering administrator credentials.');result=await powerPermissions.repair(req.body);}catch(error){req.body.password='';req.body.otp='';await audit(req,'connection.proxmox.power-permissions','proxmox',{vmids:Array.isArray(req.body.vmids)?req.body.vmids.filter(id=>/^\d+$/.test(String(id))).slice(0,20):[]},'failed');throw error;}
  finally{req.body.password='';req.body.otp='';}
  resetGuestDiscovery();try{await monitor.invalidate();}catch{}
  await audit(req,'connection.proxmox.power-permissions','proxmox',{vmids:result.vmids,verified:result.verified,changed:result.changed},'success');res.json(result);
 });
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
   const config=validateCluster(input,clusterConfig());
   try{const resources=await pve('/cluster/resources',{},config);
     if(!Array.isArray(resources))throw Object.assign(new Error(),{invalidResponse:true});
     if(!resources.some(r=>r.type==='node'))throw Object.assign(new Error(),{noNodes:true});
     return {config,nodes:resources.filter(r=>r.type==='node').map(r=>({name:r.node,status:r.status})),...(input.management===true?{management:await verifyProxmoxManagement(config,resources)}:{})};
   }catch(error){if(error.managementAccess)throw error;throw Object.assign(new Error(proxmoxTestError(error)),{status:502});}
 };
 app.post('/api/connections/proxmox/test',authorize('owner'),async(req,res)=>{const {nodes,management}=await testCluster(req.body);res.json({ok:true,nodes,...(management?{management}:{})});});
 app.put('/api/connections/proxmox',authorize('owner'),async(req,res)=>{
   const {config,nodes,management}=await testCluster(req.body);clusterStore.save(config);await monitor.invalidate();
   await audit(req,'connection.proxmox.save',config.name,{host:config.host,nodeCount:nodes.length},'success');
   res.json({ok:true,cluster:publicCluster(config),nodes,...(management?{management}:{})});
 });
 app.delete('/api/connections/proxmox',authorize('owner'),async(req,res)=>{
   clusterStore.remove();await monitor.invalidate();await audit(req,'connection.proxmox.remove','proxmox',{},'success');
   res.json({ok:true,cluster:publicCluster(clusterConfig())});
 });
 const connectionScope=()=>crypto.createHash('sha256').update(JSON.stringify([clusterConfig(),dockerConfig(),['truenas'].map(id=>configuration.resolve(id))])).digest('hex');
 const cachedReads=new Set(['/backups/jobs','/restore','/dashboard','/monitoring','/proxmox','/proxmox/tasks','/docker','/storage','/network','/backups','/schedules','/retention','/proxmox/storage','/storage/disks','/storage/datasets','/storage/snapshots']);
 const forceRead=req=>req?.query?.refresh==='1'||req?.get?.('X-IClusters-Refresh')==='1';
 const sampleView=async req=>{if(!monitor.isRefreshing)return monitor.sample(forceRead(req));if(forceRead(req))void monitor.sample(true).catch(()=>{});const s=await monitor.sample();return {...s,refreshing:!!s.refreshing||monitor.isRefreshing()};};
 const read=(path,handler,role='viewer')=>app.get(`/api${path}`,authorize(role),async(req,res)=>{res.set('Cache-Control','no-store');if(!cachedReads.has(path))return res.json(await handler(req));const url=new URL(req.originalUrl,'http://local');url.searchParams.delete('refresh');url.searchParams.sort();const key=JSON.stringify([req.user?.sub,req.user?.role,connectionScope(),selectedAgentHost(),url.pathname+url.search]);res.json(await readCache.run(key,()=>handler(req),{force:forceRead(req),background:true}));});

 app.get('/api/ssh/connections',authorize('admin'),(req,res)=>{try{res.json(publicSavedSSH(req.user.sub));}catch(e){res.status(500).json({error:'Saved connections unavailable'});}});
 const approvalHosts=new Map();
 app.delete('/api/ssh/connections',authorize('admin'),(req,res)=>{deleteSavedSSH(req.user.sub,req.body.target);res.json({ok:true});});
 app.post('/api/ssh/fingerprint',authorize('operator'),async(req,res)=>{try{const action=req.body.action===true;if(action){const approval=await resolveActionApproval(req.body.path,req.body.body,req.body.method,{dockerHost:req.body.dockerHost,query:pve});if(!approval||approval.target!==req.body.target)throw httpError('SSH approval does not match the actual target for this action',403);}if(!action&&!['admin','owner'].includes(req.user.role))return res.status(403).json({error:'Shell access requires admin access'});const host=action?await targetSSHHost(req.body.target,pve):req.body.host;try{await connectSSH({host,port:req.body.port,target:req.body.target,username:'host-key-probe',password:'unused'},req.user.sub);}catch(e){if(e.fingerprint){for(const [key,value] of approvalHosts)if(value.expires<Date.now())approvalHosts.delete(key);if(action)approvalHosts.set(`${req.user.sub}:${req.body.target}`,{host,port:Number(req.body.port||22),fingerprint:e.fingerprint,expires:Date.now()+300000});return res.json({host,fingerprint:e.fingerprint});}throw e;}res.status(400).json({error:'Host verification unavailable'});}catch(e){res.status(e.status||400).json({error:e.message});}});
 app.post('/api/ssh/connect',authorize('operator'),async(req,res)=>{try{if(req.body.mode==='authorize'){const approval=await resolveActionApproval(req.body.path,req.body.body,req.body.method,{dockerHost:req.body.dockerHost,query:pve});if(!approval||approval.target!==req.body.target)throw httpError('SSH approval does not match the actual target for this action',403);const host=await targetSSHHost(req.body.target,pve),binding=approvalHosts.get(`${req.user.sub}:${req.body.target}`);if(!binding||binding.expires<Date.now()||binding.host!==host||req.body.host!==host||binding.port!==Number(req.body.port||22)||binding.fingerprint!==req.body.fingerprint)return res.status(403).json({error:'Verify the actual target SSH host before approving this action'});}else if(!['admin','owner'].includes(req.user.role))return res.status(403).json({error:'Shell access requires admin access'});res.json(await connectSSH(req.body,req.user.sub,req.user.sid));}catch(e){res.status(e.status||400).json({error:e.message,fingerprint:e.fingerprint});}});
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
   if(needsConfirmation&&req.headers['x-iclusters-confirm']!==phrase){req.activityChallenge=true;return res.status(409).json({error:'confirmation_required',confirmationPhrase:phrase,sshTarget,approvalDescription:approval?.description});}
   if(sshTarget&&!consumeGrant(req.headers['x-iclusters-ssh-grant'],req.user.sub,req.method,req.path.replace(/^\/api/,''),req.body,approval?.scope||sshTarget))return res.status(428).json({error:'Target SSH authentication required',sshTarget,approvalDescription:approval?.description});
   let result;
   try{result=await handler(req);}catch(error){await audit(req,label,resource,{error:error.message},'failed');throw error;}
   monitor.invalidate();
   const status=result?.task||result?.jobId?'queued':'success';res.locals.activityStatus=status;

   await audit(req,label,resource,{result:result??null},status);
   res.json({ok:true,result,message:status==='queued'?'Task accepted. Check task history for completion.':'Operation completed.'});
 });
 action('post','/node-agents/guest/agent','owner','guest.install-agent',req=>bootstrapGuest({...req.body,purpose:'guest-agent'}));
 action('post','/node-agents/guest/bootstrap','owner','guest.install-agent-docker',req=>bootstrapGuest(req.body));
 action('post','/node-agents/guest/setup','owner','guest.install-docker',req=>installAgentHost(required(req.body.host,'Guest host')),true);
 const snapshot=async(provider,force=false)=>{

   if(provider==='docker'&&selectedAgentHost())return {...await dockerSnapshot(),sampledAt:new Date().toISOString(),mode:'node-agent'};
   if(monitor.provider){const result=await monitor.provider(provider,{force});if(!result.data)throw httpError(result.service?.error||`${provider} is not configured`,result.service?.status==='error'?502:503);return {...result.data,sampledAt:result.sampledAt,mode:'live'};}
   const s=await monitor.sample(force);const service=s.services.find(x=>x.provider===provider);
   if(!s[provider])throw httpError(service?.error||`${provider} is not configured`,service?.status==='error'?502:503);
   return {...s[provider],sampledAt:s.sampledAt,mode:'live'};
 };
 const selectedDocker=async(s,force=false)=>{

   if(!selectedAgentHost())return {inventory:s.docker||null,id:'direct',errors:[]};
   try{return {inventory:await readCache.run('docker-host:'+selectedAgentHost(),()=>dockerSnapshot({timeoutMs:15000,metrics:false}),{force}),id:selectedAgentHost(),errors:[]};}

   catch{return {inventory:null,id:selectedAgentHost(),errors:['Selected Docker host is unavailable. Inspect its node agent; no other host was substituted.']};}
 };
 const providerReads=async requests=>{
   const s=await sampleView();const response={errors:[],connectors:s.services,refreshing:false,providerInventory:{}};

   await Promise.all(requests.map(async([key,provider,handler])=>{
     response[key]=[];response.providerInventory[key]={configured:providers[provider].configured(),complete:false};
     if(!providers[provider].configured())return;
     try{const rows=await handler();if(!Array.isArray(rows))throw new Error('Unexpected provider inventory response');response[key]=rows;response.providerInventory[key].complete=true;}catch(e){response.errors.push(`${provider}: ${e.message}`);}
   }));
   return response;
 };
 read('/discovery',async()=>discovered(await monitor.sample()));
 read('/dashboard',async req=>{
   const s=await sampleView(req),inventory=discovered(s);return {sampledAt:s.sampledAt,refreshing:!!s.refreshing,services:s.services.filter(x=>x.status!=='not-configured'),hosts:s.hosts,metrics:dashboardHistory(s.metrics),alerts:s.alerts,...inventory,resourceInventoryComplete:s.proxmox?.resourceInventoryComplete===true,nodeCoverage:s.proxmox?.nodeCoverage||[],nodes:s.proxmox?.nodes||[],guests:[...(s.proxmox?.vms||[]),...(s.proxmox?.lxc||[])],storage:s.proxmox?.storage||[],

     stats:{servers:s.hosts.length,vms:s.proxmox?.vms.length??null,lxc:s.proxmox?.lxc.length??null,containers:discoveredContainerCount(s,inventory),alerts:s.alerts.filter(a=>a.status==='active').length,connected:s.services.filter(x=>x.status==='reachable').length,configured:s.services.filter(x=>x.status!=='not-configured').length}};
 });
 read('/monitoring',async req=>{const s=await sampleView(req);return {...s,...discovered(s),services:s.services.filter(x=>x.status!=='not-configured'),proxmox:undefined,docker:undefined,truenas:undefined,operations:undefined};});

 read('/proxmox',async req=>{if(forceRead(req))void monitor.sample(true).catch(()=>{});const config=clusterConfig();return {...await snapshot('proxmox',forceRead(req)),cluster:config.url?{name:config.name,url:config.url}:null};});

 const readStorage=req=>readCache.run('storage-inventory:'+connectionScope(),()=>storageInventory(),{force:forceRead(req)});
 const readBackupJobs=req=>readCache.run('backup-jobs:'+connectionScope(),()=>backupJobs(),{force:forceRead(req)});
 const readArchives=req=>readCache.run('backup-archives:'+connectionScope(),()=>backupArchives(),{force:forceRead(req)});
 read('/proxmox/storage',req=>readStorage(req));
 read('/proxmox/storage/configuration',()=>storageConfiguration());
 read('/network/dns',async()=>{const nodes=await pve('/nodes'),resolvers=[],errors=[];await Promise.all(nodes.map(async n=>{try{if(n.status==='offline')throw new Error('Node is offline');resolvers.push({node:n.node,...await pve(`/nodes/${encode(n.node)}/dns`)});}catch(e){errors.push(`${n.node}: ${e.message}`);}}));return {resolvers,errors,sampledAt:new Date().toISOString()};});
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
 read('/docker',async req=>{if(selectedAgentHost()||providers.docker.configured())return snapshot('docker',forceRead(req));const inventory=discovered(await sampleView(req));if(!inventory.resources.length&&!inventory.discoveryLimitations.length)return snapshot('docker',forceRead(req));return {readOnly:true,discoveryLimitations:inventory.discoveryLimitations,guestReports:inventory.reports.length,sampledAt:new Date().toISOString(),containers:inventory.resources.filter(r=>r.kind==='Docker container').map(r=>({...r,cpu:null,memory:null,ports:null})),images:[],volumes:[],networks:[],stacks:[],errors:inventory.reports.flatMap(r=>r.errors),note:'Guest API inventory is read-only. Connect a Docker Engine API to manage these containers.'};});
 read('/truenas',req=>snapshot('truenas',forceRead(req)));


 read('/storage',async req=>{const [s,storageResult]=await Promise.all([sampleView(req),providers.proxmox.configured()?readStorage(req).then(result=>({result}),error=>({error})):null]),errors=[];let proxmox=[],proxmoxComplete=false,coverage={complete:true,expectedNodes:[],readNodes:[],missingNodes:[]};
   if(providers.proxmox.configured())try{if(storageResult?.error)throw storageResult.error;const result=storageResult.result;proxmox=result.resources;coverage=result.coverage;proxmoxComplete=result.coverage.complete;errors.push(...result.errors);}catch(e){coverage.complete=false;errors.push(e.message);}
   if(providers.truenas.configured()&&(!s.truenas||(s.truenas.errors||[]).some(e=>/^pool\.(query|dataset\.query):/.test(e)))){coverage.complete=false;errors.push('TrueNAS pool capacity readings are incomplete');}
   errors.push(...(s.truenas?.errors||[]));
   const selected=req.query.view==='pools'?{inventory:null,id:selectedAgentHost()||'direct',errors:[]}:await selectedDocker(s,forceRead(req));errors.push(...selected.errors);
   const pools=[...proxmox.map(p=>({...p,provider:'proxmox'})),...(s.truenas?.pools||[]).map(pool=>({...pool,node:s.truenas?.info?.hostname||'TrueNAS',location:`TrueNAS pool ${pool.name}`,availabilityReason:'Managed by TrueNAS. Proxmox and Docker use this storage through their configured mounts or virtual disks.'}))];
   return {pools,providerInventory:{proxmox:{configured:providers.proxmox.configured(),complete:proxmoxComplete},truenas:{configured:providers.truenas.configured(),complete:!!s.truenas&&!(s.truenas.errors||[]).some(e=>/^pool\.(query|dataset\.query):/.test(e))}},summary:storageSummary(pools,coverage),datasets:s.truenas?.datasets||[],snapshots:s.truenas?.snapshots||[],disks:s.truenas?.disks||[],dockerHost:{id:selected.id,name:selected.inventory?.host?.hostname||null},volumes:selected.inventory?.volumes||[],jobs:s.truenas?.jobs||[],alerts:(s.alerts||[]).filter(a=>['proxmox','truenas'].includes(a.provider)&&a.status!=='resolved'),errors,services:s.services.filter(x=>['proxmox','truenas','docker'].includes(x.provider)),sampledAt:s.sampledAt,refreshing:providers.truenas.configured()&&s.services.some(x=>x.provider==='truenas'&&x.status==='pending')};});
 read('/storage/disks',async req=>{const s=await sampleView(req),errors=[];let resources=[];if(providers.truenas.configured()&&!s.truenas){const service=s.services.find(row=>row.provider==='truenas');errors.push('TrueNAS disk inventory unavailable'+(service?.error?': '+service.error:'.'));}if(s.refreshing)errors.push('Some provider measurements are still loading.');if(providers.proxmox.configured())try{const result=await diskInventory();resources=result.resources;errors.push(...result.errors);}catch(e){errors.push(e.message);}return {resources:[...resources,...(s.truenas?.disks||[]).map(d=>({...d,id:'truenas:'+d.id,provider:'truenas'}))],errors:[...errors,...(s.truenas?.errors||[])],sampledAt:new Date().toISOString(),refreshing:!!s.refreshing};});

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
 read('/storage/datasets',async req=>{const s=await sampleView(req);return {...await datasetInventory({proxmox:providers.proxmox.configured(),truenasEnabled:providers.truenas.configured(),snapshot:s.truenas||{},guests:s.services.some(x=>x.provider==='proxmox'&&x.status==='reachable')?s.proxmox||{}:{}}),refreshing:!!s.refreshing};});

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
 },req=>{if(req.params.provider==='docker'&&req.params.resourceType==='container'&&req.params.action==='remove'&&!['admin','owner'].includes(req.user.role))throw httpError('Container removal requires admin access',403);return (req.params.provider==='docker'&&req.params.resourceType==='container'&&['stop','restart','pause','unpause','remove'].includes(req.params.action))||['stop','shutdown','reboot','reset','suspend','delete','delete-snapshot','remove','kill'].includes(req.params.action);});
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
 read('/docker/updates',()=>({...imageUpdates.status(selectedAgentHost()),refreshing:!!imageUpdates.status(selectedAgentHost()).checking}));
 action('put','/docker/updates/settings','owner','docker.updates.settings',req=>imageUpdates.settings(req.body));
 action('post','/docker/updates/check','owner','docker.updates.check',()=>imageUpdates.checkHost(selectedAgentHost()));
 read('/docker/updates/:id/plan',async req=>{const row=imageUpdates.status(selectedAgentHost()).rows.find(r=>r.containerId===req.params.id);if(!row||row.status!=='available')throw httpError('Recheck available updates first',409);const c=await dockerUpdateQuery('/containers/'+encodeURIComponent(req.params.id)+'/json'),image=await dockerUpdateQuery('/images/'+encodeURIComponent(c.Image)+'/json'),plan=updatePlan(c,image);await ensureNoContainerDependents(c,dockerUpdateQuery);return {containerId:c.Id,name:plan.name,image:row.image,imageId:c.Image,remoteDigest:row.remoteDigest,configDigest:plan.binding,running:plan.running,mounts:(c.Mounts||[]).map(m=>({type:m.Type,target:m.Destination,readOnly:!m.RW})),networks:Object.keys(plan.networks),compose:!!c.Config.Labels?.['com.docker.compose.project'],environmentCount:c.Config.Env?.length||0};},'owner');
 const updateProgress=createDockerUpdateProgress({file:operationJournalFile});
 read('/docker/updates/:id/progress',req=>updateProgress.read(req.user.sub,selectedAgentHost()||'direct',req.params.id,req.query.operation),'owner');
 action('post','/docker/updates/:id/recover','owner','docker.container.recover-update',async req=>{const host=selectedAgentHost()||'direct',entry=updateProgress.interrupted(req.user.sub,host,req.params.id,req.body.operationId);try{const result=await recoverDockerUpdate(entry.checkpoint,{query:dockerUpdateQuery});if(result.reconciled)entry.tracking.finish(result);else entry.tracking.fail(result.message,{recovered:true});return result;}finally{entry.release()}},true);
 action('post','/docker/updates/:id/install','owner','docker.container.install-update',async req=>{
  const host=selectedAgentHost()||'direct',row=imageUpdates.status(selectedAgentHost()).rows.find(r=>r.containerId===req.params.id);
  const operationId=req.body.operationId;
  if(req.body.background===true){
   const existing=updateProgress.read(req.user.sub,host,req.params.id,operationId).progress;
   if(existing)return {jobId:operationId,message:'Installation already accepted. Follow its progress for the result.'};
   if(!row||row.status!=='available')throw httpError('Recheck available updates first',409);
   const tracking=updateProgress.start(req.user.sub,host,req.params.id,operationId),input={...req.body,containerId:req.params.id};
   void agentContext.run({host:host==='direct'?'':host},async()=>{
    let result;
    try{result=await imageUpdateInstaller(row,input,{hostId:host,onProgress:tracking.report,onCheckpoint:tracking.checkpoint});imageUpdates.installed(host,req.params.id,result);tracking.finish(result);try{await monitor.invalidate()}catch{}}
    catch(error){tracking.fail(error.message);try{await audit(req,'docker.container.install-update.result',req.params.id,{error:error.message},'failed')}catch{}return}
    try{await audit(req,'docker.container.install-update.result',req.params.id,{result},'success')}catch{}
   }).catch(error=>{console.error('Docker installation journal could not be updated:',error.message)});
   return {jobId:operationId,message:'Installation accepted. Progress and the verified result remain available if this page reloads.'};
  }
  const tracking=operationId?updateProgress.start(req.user.sub,host,req.params.id,operationId):null;
  try{const result=await imageUpdateInstaller(row,{...req.body,containerId:req.params.id},{hostId:host,onProgress:(percent,stage)=>tracking?.report(percent,stage),onCheckpoint:value=>tracking?.checkpoint(value)});imageUpdates.installed(host,req.params.id,result);tracking?.finish(result);return result}catch(error){tracking?.fail(error.message);throw error}
 },true);
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
 read('/backups/jobs',req=>providerReads([['jobs','proxmox',()=>readBackupJobs(req)]]));
 read('/backups',async req=>{
   const archiveWork=providers.proxmox.configured()?readArchives(req).then(value=>({value}),error=>({error})):null;
   const result=await providerReads([['jobs','proxmox',()=>readBackupJobs(req)]]);result.points=[];result.archiveInventory={configured:providers.proxmox.configured(),complete:false};
   if(providers.proxmox.configured())try{const archiveResult=await archiveWork;if(archiveResult.error)throw archiveResult.error;const archives=archiveResult.value;result.points=archives.points;result.archiveInventory={configured:true,...archives.coverage};result.errors.push(...archives.errors);}catch(e){result.errors.push(`proxmox: ${e.message}`);}
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
 read('/restore',async req=>{
   const result=await providerReads([['snapshots','truenas',async()=>(await snapshot('truenas',forceRead(req))).snapshots]]);result.points=[];result.archiveInventory={configured:providers.proxmox.configured(),complete:false};
   if(providers.proxmox.configured())try{const archives=await readArchives(req);result.points=archives.points;result.archiveInventory={configured:true,...archives.coverage};result.errors.push(...archives.errors);}catch(e){result.errors.push(`proxmox: ${e.message}`);}
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
   return truenas('pool.snapshottask.create',[{dataset:required(dataset,'Dataset'),recursive:false,lifetime_value:integer(lifetime,'Retention days',1,3650),lifetime_unit:'DAY',naming_schema:'iclusters-%Y-%m-%d_%H-%M',schedule:{minute:String(minute),hour:String(hour),dom:'*',month:'*',dow:'*'},enabled:true}]);

 });
 action('post','/truenas/schedule/:id/toggle','admin','truenas.snapshot.schedule.toggle',async req=>{const id=integer(req.params.id,'Task ID');const tasks=await truenas('pool.snapshottask.query',[[['id','=',id]]]);if(!tasks.length)throw httpError('Task not found',404);return truenas('pool.snapshottask.update',[id,{enabled:!tasks[0].enabled}]);});





 read('/header-notifications',req=>activity.read(req.user,req.user.role==='owner'?updates.status():null));
 app.post('/api/header-notifications/read',authorize('viewer'),(req,res)=>{res.set('Cache-Control','no-store');res.json(activity.markRead(req.user,req.body.sequence));});
 const historyCleanup=createHistoryCleanup({get,mutate});
 app.get('/api/alerts/history/cleanups',authorize('admin'),(req,res)=>res.json({jobs:historyCleanup.list()}));
 app.post('/api/alerts/history/preview',authorize('admin'),(req,res)=>res.json(historyCleanup.preview(req.body)));
 action('post','/alerts/history/clear','admin','alert.history.clear',req=>historyCleanup.clear(req.body),true);
 action('post','/alerts/history/cleanups','admin','alert.history.schedule',req=>historyCleanup.schedule(req.body,req.user),true);
 action('delete','/alerts/history/cleanups/:id','admin','alert.history.cancel',req=>historyCleanup.cancel(req.params.id));
 read('/alerts',async req=>{if(forceRead(req)){const snapshot=await sampleView(req);return {alerts:get().alerts,rules:get().rules,refreshing:!!snapshot.refreshing};}void monitor.sample().catch(()=>{});return {alerts:get().alerts,rules:get().rules,...(monitor.isRefreshing?.()?{refreshing:true}:{})};});

 action('post','/alerts/rules','admin','alert.rule.create',async req=>{const {name,metric,provider='all',severity='warning'}=req.body;if(!['cpu','memory','storage'].includes(metric)||!['all',...Object.keys(providers)].includes(provider)||!['critical','warning'].includes(severity))throw httpError('Invalid alert rule');const rule={id:crypto.randomUUID(),name:required(name,'Name'),metric,provider,severity,threshold:integer(req.body.threshold,'Threshold',1,100),enabled:true};mutate(s=>s.rules.push(rule));return rule;});
 action('put','/alerts/rules/:id','admin','alert.rule.update',async req=>{const b=req.body,patch={};if(b.name!==undefined)patch.name=required(b.name,'Name');if(b.metric!==undefined){if(!['cpu','memory','storage'].includes(b.metric))throw httpError('Invalid metric');patch.metric=b.metric;}if(b.provider!==undefined){if(!['all',...Object.keys(providers)].includes(b.provider))throw httpError('Invalid provider');patch.provider=b.provider;}if(b.severity!==undefined){if(!['critical','warning'].includes(b.severity))throw httpError('Invalid severity');patch.severity=b.severity;}if(b.threshold!==undefined)patch.threshold=integer(b.threshold,'Threshold',1,100);if(b.enabled!==undefined){if(typeof b.enabled!=='boolean')throw httpError('Invalid enabled state');patch.enabled=b.enabled;}if(!get().rules.some(r=>r.id===req.params.id))throw httpError('Rule not found',404);mutate(s=>Object.assign(s.rules.find(r=>r.id===req.params.id),patch));return {updated:true};});
 action('delete','/alerts/rules/:id','admin','alert.rule.delete',async req=>{mutate(s=>s.rules=s.rules.filter(r=>r.id!==req.params.id));});
 action('post','/alerts/:id/acknowledge','operator','alert.acknowledge',async req=>{let result;mutate(state=>{result=changeAlertStatus(state,req.params.id,req.user)});return result;});
 action('post','/alerts/:id/resolve','operator','alert.resolve',async req=>{let result;mutate(state=>{result=changeAlertStatus(state,req.params.id,req.user,{resolve:true})});return result;});
 action('post','/ai/health','viewer','health.inspect',async()=>{const s=await monitor.sample(true);return {summary:`${s.services.filter(x=>x.status==='reachable').length} reachable integrations/services; ${s.services.filter(x=>x.status==='error').length} connection failures; ${s.alerts.filter(a=>a.status==='active').length} active alerts. This is an API and threshold check, not a security scan.`};});
 action('post','/ai/chat','viewer','assistant.query',async req=>{
   const message=required(req.body.message,'Message');const s=await monitor.sample();
   const context={sampledAt:s.sampledAt,services:s.services,alerts:s.alerts.filter(a=>a.status!=='resolved'),proxmox:s.proxmox,docker:s.docker,dockerFleet:s.dockerFleet,truenas:s.truenas?{pools:s.truenas.pools}:undefined};
   const ai=configuration.resolve('ai');if(ai.OPENAI_API_KEY)return {answer:await queryAI(ai,JSON.stringify({context,message})),mode:ai.AI_PROVIDER||'openai'};

   return {answer:`Sampled ${s.sampledAt}. ${s.services.map(x=>`${x.name}: ${x.status}${x.error?` (${x.error})`:''}`).join('; ')}. ${context.alerts.length} active or acknowledged alerts. Configure the AI Assistant in Settings → Integrations for conversational analysis.`,mode:'local'};

 });
 read('/users',async()=>({users:(await db.query(`SELECT id,name,email,username,role,status,two_factor_enabled AS "twoFactor",last_login AS "lastLogin",created_at AS "createdAt" FROM users ORDER BY created_at`)).rows}),'admin');
 action('post','/users','admin','user.create',async req=>{
   const {email,name,password,role='viewer'}=req.body;if(!roles[role]||(role==='owner'&&req.user.role!=='owner')||roles[role]>roles[req.user.role])throw httpError('Role cannot be granted',403);
   const {email:normalizedEmail,username}=accountIdentity(req.body),normalizedName=required(name,'Name');if(normalizedName.length>200)throw httpError('Name must be at most 200 characters');if(typeof password!=='string'||password.length<12||Buffer.byteLength(password)>72)throw httpError('Password must have at least 12 characters and at most 72 bytes');

   const hash=await bcrypt.hash(password,12);try{return (await db.query(`INSERT INTO users(email,name,password_hash,role,status,username) VALUES($1,$2,$3,$4,'active',$5) RETURNING id,email,username,name,role,status`,[normalizedEmail,normalizedName,hash,role,username])).rows[0];}catch(e){if(e.code==='23505')throw httpError('Username or email already exists',409);throw e;}
 });
 action('post','/users/:id/toggle','admin','user.toggle',async req=>{
   if(req.params.id===req.user.sub)throw httpError('You cannot deactivate yourself');
   const user=(await db.query('SELECT role FROM users WHERE id=$1',[req.params.id])).rows[0];if(!user)throw httpError('User not found',404);
   if(user.role==='owner'||roles[user.role]>=roles[req.user.role])throw httpError('Only lower-privilege non-owner accounts can be changed',403);
   return (await db.query(`UPDATE users SET status=CASE status WHEN 'active' THEN 'inactive' ELSE 'active' END WHERE id=$1 RETURNING id,name,status`,[req.params.id])).rows[0];
 },true);
 read('/audit',async()=>({logs:(await db.query(`SELECT id::text,created_at AS time,COALESCE(user_email,'system') AS "user",action,resource,details,status,COALESCE(ip,'-') ip FROM audit_logs ORDER BY created_at DESC LIMIT 500`)).rows}),'auditor');
 const recoveryTests=createRecoveryTests();
 read('/recovery-tests',()=>recoveryTests.list(),'admin');
 read('/recovery-tests/:id',req=>recoveryTests.inspect(req.params.id),'admin');
 action('post','/recovery-tests','admin','backup.recovery-test.create',req=>recoveryTests.start(req.body,req.user.sub),true);
 action('post','/recovery-tests/:id/isolate','admin','backup.recovery-test.isolate',req=>recoveryTests.isolate(req.params.id),true);
 action('post','/recovery-tests/:id/boot','admin','backup.recovery-test.boot',req=>recoveryTests.boot(req.params.id),true);
 action('post','/recovery-tests/:id/verify','admin','backup.recovery-test.verify',req=>recoveryTests.attest(req.params.id,req.body,req.user.sub),true);
 read('/operations/performance',()=>reportPerformance.snapshot(),'admin');
 read('/operations/health',()=>operationsView(operationalNodes()),'admin');
 read('/operations/vpn-gateways',()=>vpnGateways({query:pve,agents:operationalNodes}),'admin');
 action('post','/operations/:id/network-check','owner','network.diagnose',req=>operationalAction(req.params.id,{action:'network-check'}));
 action('post','/operations/:id/tools','owner','host.monitoring-tools.install',req=>connectionService.perform(req.params.id,{...req.body,action:'monitoring-tools',target:'node'}));
 action('post','/operations/:id/vpn','owner','vpn.configure',async req=>{if(!['vpn-setup','vpn-add','vpn-remove','vpn-lan'].includes(req.body.action))throw httpError('Unsupported VPN action');await requireVPNNode(req.params.id,{query:pve,agents:operationalNodes});return operationalAction(req.params.id,req.body)},true);
 read('/diagnostics',req=>providerDiagnostics({hostId:typeof req.query.dockerHost==='string'?req.query.dockerHost:undefined}),'owner');
 action('post','/configuration/ai/models','owner','configuration.models',async req=>({models:await listAIModels(validateConfiguration('ai',req.body.configuration??{},configuration.resolve('ai')))}));
 read('/configuration/:service',req=>configuration.publicConfig(req.params.service),'owner');
 action('put','/configuration/:service','owner','configuration.save',req=>configuration.save(req.params.service,req.body));
 action('delete','/configuration/:service','owner','configuration.disable',req=>configuration.disable(req.params.service));
 action('post','/configuration/:service/test','owner','configuration.test',async req=>{const id=req.params.service;if(!Object.hasOwn(configurationSchemas,id))throw httpError('Unsupported configuration service');try{if(notificationIds.includes(id)){if(req.body.confirm!==true)throw httpError('Confirm sending an external test notification');const config=validateConfiguration(id,req.body.configuration??{},configuration.resolve(id));const result=await notificationService.test(id,{env:config});return {...result,message:req.body.configuration?'Test notification delivered for the entered settings. Save Configuration to apply them.':'Test notification delivered.'};}if(id==='ai'){if(req.body.confirm!==true)throw httpError('Confirm sending a test request to the selected AI provider');const config=validateConfiguration('ai',req.body.configuration??{},configuration.resolve('ai'));await queryAI(config,'Reply with OK.',true);return {service:id,verified:true,model:config.OPENAI_MODEL,apiType:config.OPENAI_API_TYPE,message:req.body.configuration?'AI connection verified for the entered settings. Save Configuration to apply them.':'AI connection verified.'};}const config=validateConfiguration('truenas',req.body.configuration??{},configuration.resolve('truenas'));const result=await truenas('system.info',[],{...configuration.environment(),...config});if(!result||typeof result!=='object'||Array.isArray(result))throw Object.assign(Error('Invalid provider response'),{truenasFailure:'response'});return {service:id,verified:true,message:`Read-only connection check passed. Write permissions were not tested.${req.body.configuration?' Save Configuration to apply these settings.':''}`};}catch(error){if(error.status===400||error.notificationTest||id==='ai'&&error.aiError)throw error;throw httpError(truenasTestError(error),502);}});

 read('/notifications',()=>notificationService.status(),'owner');
 action('put','/notifications/preferences','owner','notification.preferences',req=>{const preferences=validateNotificationPreferences(req.body);if(preferences.notifyDockerUpdates===undefined&&get().notificationPreferences?.notifyDockerUpdates!==undefined)preferences.notifyDockerUpdates=get().notificationPreferences.notifyDockerUpdates;mutate(s=>s.notificationPreferences=preferences);return preferences;});
 action('post','/notifications/test','owner','notification.test',req=>notificationService.test(required(req.body.channel,'Channel')));
 read('/security',()=>({authenticationRequired:true,roles:Object.keys(roles),twoFactor:true,accessTokenLifetime:process.env.JWT_EXPIRES_IN||'15m',refreshTokenLifetime:process.env.JWT_REFRESH_EXPIRES_IN||'7d',rememberedSessionLifetime:'10d',loginRequests:apiPolicy.loginRequests,loginWindowMs:apiPolicy.loginWindowMs,password:{minimumCharacters:12,maximumBytes:72,complexityRequired:false},sessionManagement:true,apiKeys:false,networkManagement:false}));
 read('/settings',async req=>{const snapshot=await sampleView(req);return {refreshing:!!snapshot.refreshing,system:{hostname:os.hostname(),platform:os.platform(),release:os.release(),runtime:process.version,architecture:os.arch(),operatingSystem:os.type(),serverTime:new Date().toISOString(),uptime:Math.floor(process.uptime()),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,...buildInfo},settings:get().settings,policy:apiPolicy,integrations:snapshot.services,capabilities:{twoFactor:true,notifications:'in-app and nine configurable notification delivery channels',monitoring:'API polling',truenas:'JSON-RPC API 25.04+; method compatibility depends on version'}};});

 action('put','/settings','admin','settings.update',async req=>{
   const settings={siteName:required(req.body.siteName,'Site name'),description:String(req.body.description||'').slice(0,500),refresh:integer(req.body.refresh,'Refresh interval',15,300)};
   mutate(s=>s.settings=settings);return settings;
 });
 app.use('/api',(req,res)=>res.status(404).json({error:'API endpoint not found'}));
 app.use((error,req,res,next)=>{console.error(error.message);res.status(error.status||502).json({error:error.message||'Request failed'});});
 return app;
}
