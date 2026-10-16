import crypto from 'node:crypto';
import {get,mutate} from './store.js';
const text=value=>String(value??'').replace(/[\u0000-\u001f]/g,' ').slice(0,160);
const own=(object,key)=>Object.hasOwn(object||{},key)?object[key]:undefined;
const destinations={proxmox:'/proxmox',docker:'/docker',storage:'/storage',truenas:'/storage',network:'/network',backups:'/backups',backup:'/backups',restore:'/backups',retention:'/backups',schedules:'/backups',tasks:'/proxmox',alerts:'/alerts',users:'/users',settings:'/settings',configuration:'/settings?tab=Connections',connections:'/settings?tab=Connections','node-agents':'/settings?tab=Connections',updates:'/settings?tab=About',auth:'/settings?tab=Security',ssh:'/tools/shell'};
const names={proxmox:'Proxmox',docker:'Docker',storage:'Storage',truenas:'TrueNAS',network:'Network',backups:'Backup',backup:'Backup',restore:'Restore',retention:'Retention',schedules:'Schedule',tasks:'Task',alerts:'Alert',users:'User account',settings:'Settings',configuration:'Integration configuration',connections:'Connection','node-agents':'Connector',updates:'Software update',auth:'Sign-in',ssh:'Remote access'};
function append(state,row){state.headerActivitySequence=(state.headerActivitySequence||0)+1;state.headerActivities??=[];state.headerActivities.unshift({id:crypto.randomUUID(),sequence:state.headerActivitySequence,time:new Date().toISOString(),...row});state.headerActivities=state.headerActivities.slice(0,500);}
export function captureRequestActivity(state,req,statusCode,status){
 const route=String(req.route?.path||''),parts=route.replace(/^\/api\//,'').split('/');let group=parts[0];
 if(group==='actions')group=['proxmox','docker'].includes(req.params?.provider)?req.params.provider:'';
 if(group==='notifications')group='settings';
 if(group==='node-agents'&&parts[1]==='pairing'&&parts[2]==='status')return;
 if(!names[group]||['GET','HEAD','OPTIONS'].includes(req.method)||statusCode===428||statusCode===409&&(req.activityChallenge||group==='ssh'&&parts[1]==='connect'))return;
 if(group==='auth'&&parts[1]!=='login'||group==='ssh'&&!['connect','sftp'].includes(parts[1])||group==='ssh'&&parts[1]==='sftp'&&['list','stat','read','download'].includes(req.body?.operation||req.body?.action))return;
 const actor=req.user||req.activityUser;
 if(!actor?.sub&&!(group==='auth'&&parts[1]==='login'&&statusCode>=400))return;
 if(group==='ssh'&&parts[1]==='sftp'&&!['upload','write','mkdir','rename','delete','remove','rmdir','chmod'].includes(req.body?.operation||req.body?.action))return;
 // A chunked upload is one event, rather than one notification per chunk.
 if(group==='ssh'&&parts[1]==='sftp'&&req.body?.action==='write'&&Number(req.body.offset||0)>0&&statusCode<400)return;
 const security=['auth','users','ssh','configuration','connections','node-agents','updates'].includes(group),failed=statusCode>=400;
 const action=String(req.sshLabel||'').replace(/[^a-zA-Z0-9. -]/g,'').slice(0,90).split('.').join(' ');
 const operation=['start','stop','shutdown','reboot','restart','suspend','resume','reset','delete','remove','create'].includes(req.params?.action||req.params?.operation)?req.params.action||req.params.operation:null;
 const targetId=req.params?.vmid||req.params?.resourceId||req.params?.id;
 const target=/^\d+$/.test(String(targetId||''))?` #${targetId}`:'';
 const result=failed?'failed':status==='queued'||statusCode===202?'queued':'success';
 const uploading=group==='ssh'&&parts[1]==='sftp'&&req.body?.action==='write';
 append(state,{title:`${names[group]}${target}${operation?' '+operation:''}: ${result==='success'?uploading?'upload started':'completed':result}`,message:result==='queued'?'Request accepted. Completion has not been verified.':failed?'The request failed. Open the related page to review it.':uploading?'The first upload chunk was written. Full file completion has not been verified.':action?text(action):'An application action completed.',category:group,severity:failed?'warning':'info',status:result,link:group==='ssh'&&parts[1]==='sftp'?'/tools/sftp':destinations[group],audience:security?'private':'shared',userId:actor?.sub||null});
}
export function observeHeaderActivity(state,snapshot){
 const current={},prior=state.headerObservations||{},observe=(key,label,status,link)=>{if(!status)return;const next=text(status);current[key]=next;if(own(prior,key)!==undefined&&prior[key]!==next)append(state,{title:text(label),message:`${prior[key]} → ${next}`,category:'monitoring',severity:'info',status:'observed',link,audience:'shared',userId:null});};
 for(const service of snapshot.services||[])observe('provider:'+String(service.id||service.provider||service.name),`${service.name||service.provider} connection changed`,service.status,'/settings?tab=Connections');
 for(const node of snapshot.proxmox?.nodes||[])observe('node:'+node.name,`Node ${node.name} state changed`,node.status,'/proxmox');
 for(const [kind,rows] of [['VM',snapshot.proxmox?.vms],['CT',snapshot.proxmox?.lxc],['Docker container',snapshot.docker?.containers]])for(const row of rows||[])observe(kind+':'+(row.node||'')+':'+row.id,`${kind} ${row.name||row.id} state changed`,row.status,kind==='Docker container'?'/docker':'/proxmox');
 for(const host of snapshot.dockerFleet?.hosts||[]){for(const row of host.inventory?.containers||host.containers||[])observe('fleet:'+host.id+':'+row.id,`Docker container ${row.name||row.id} state changed`,row.status,'/docker');}
 for(const job of snapshot.truenas?.jobs||[])observe('job:'+job.id,'Storage job state changed',job.state,'/storage');
 for(const alert of state.alerts||[]){const key='alert:'+alert.id;current[key]=alert.status;if(alert.status==='resolved'&&own(prior,key)!==undefined&&prior[key]!=='resolved')append(state,{title:text(`Recovered: ${alert.title}`),message:text(alert.source),category:'alerts',severity:'info',status:'resolved',link:'/alerts?tab=Alert%20History',audience:'shared',userId:null});}
 // Missing/partial observations do not imply resources were deleted or recovered.
 state.headerObservations={...prior,...current};const keys=Object.keys(state.headerObservations);if(keys.length>10000)state.headerObservations=Object.fromEntries(keys.slice(-10000).map(key=>[key,state.headerObservations[key]]));
}
export function createHeaderNotifications(persistence={get,mutate}){
 return {capture(req,statusCode,status){const scratch={};captureRequestActivity(scratch,req,statusCode,status);if(scratch.headerActivities?.length){const {id,sequence,time,...row}=scratch.headerActivities[0];persistence.mutate(state=>append(state,row))}},read(user,update){const state=persistence.get(),cursor=own(state.headerNotificationReads,'u:'+user.sub)||0,visible=(state.headerActivities||[]).filter(row=>row.audience==='shared'||user.role==='owner'||row.userId===user.sub),attention=(state.alerts||[]).filter(a=>['active','acknowledged'].includes(a.status)).map(a=>({id:a.id,title:text(a.title),message:text(a.source),severity:a.severity||'warning',status:a.status,time:a.triggered,link:`/alerts?alert=${encodeURIComponent(a.id)}`,kind:'alert'}));
  if(user.role==='owner'&&update?.enabled&&(update.available||['error','failed'].includes(update.state)))attention.unshift({id:'software-update',title:update.available?'Software update available':'Software update needs attention',message:'Open About to review the updater status.',severity:update.available?'info':'warning',status:'active',time:update.checkedAt,link:'/settings?tab=About',kind:'update'});
  attention.sort((a,b)=>({critical:0,warning:1,info:2}[a.severity]??1)-({critical:0,warning:1,info:2}[b.severity]??1));
  const unread=visible.filter(row=>row.sequence>cursor).length;return {attention:attention.slice(0,50),attentionCount:attention.length,activity:visible.slice(0,50).map(({audience,userId,...row})=>({...row,unread:row.sequence>cursor})),unreadCount:unread,badgeCount:attention.length+unread,latestSequence:state.headerActivitySequence||0,retainedLimit:500,sampledAt:new Date().toISOString()};},markRead(user,sequence){const state=persistence.get();if(!Number.isSafeInteger(sequence)||sequence<0||sequence>(state.headerActivitySequence||0))throw Object.assign(Error('Choose a valid activity cursor'),{status:400});persistence.mutate(s=>{s.headerNotificationReads??={};const key='u:'+user.sub;s.headerNotificationReads[key]=Math.max(own(s.headerNotificationReads,key)||0,sequence)});return {read:true}}};
}
export const headerNotifications=createHeaderNotifications();
