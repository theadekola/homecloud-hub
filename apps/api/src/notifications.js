import {notificationIds,channelNames,channelAccepts} from './notification-channels.js';
import {notificationMessage,messageText,emailCard} from './notification-message.js';
import {sendAdapter} from './notification-adapters.js';
import {runtimeEnvironment} from './runtime-configuration.js';
import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import {get,mutate} from './store.js';

export function notificationChannels(env=process.env){
 const channels=[];
 if(env.DISCORD_WEBHOOK_URL)channels.push('discord');
 if(env.TELEGRAM_BOT_TOKEN&&env.TELEGRAM_CHAT_ID)channels.push('telegram');
 if(env.SMTP_HOST&&env.NOTIFICATION_EMAIL_FROM&&env.NOTIFICATION_EMAIL_TO)channels.push('email');
 for(const [id,keys] of Object.entries({slack:['SLACK_WEBHOOK_URL'],teams:['TEAMS_WEBHOOK_URL'],pushover:['PUSHOVER_APP_TOKEN','PUSHOVER_USER_KEY'],gotify:['GOTIFY_URL','GOTIFY_APP_TOKEN'],webhook:['WEBHOOK_URL'],ifttt:['IFTTT_EVENT','IFTTT_WEBHOOK_KEY']}))if(keys.every(k=>env[k]))channels.push(id);
 return channels;
}
const textFor=(alert,event)=>`HomeCloud ${event==='resolved'?'RECOVERED':alert.severity?.toUpperCase()||'ALERT'}: ${alert.title}\nSource: ${alert.source}\n${alert.details||''}\n${event==='resolved'?alert.resolvedAt:alert.triggered}`;
export async function sendNotification(channel,text,{env=process.env,fetcher=fetch,transport=nodemailer.createTransport,notification}={}){
 if(notification)text=messageText(notification);
 if(channel==='email'){
  const port=Number(env.SMTP_PORT||587);if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid SMTP port');
  if(Boolean(env.SMTP_USER)!==Boolean(env.SMTP_PASSWORD))throw Error('Incomplete SMTP authentication');
  const mail=transport({host:env.SMTP_HOST,port,secure:port===465,requireTLS:port!==465,
   auth:env.SMTP_USER?{user:env.SMTP_USER,pass:env.SMTP_PASSWORD}:undefined,
   connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000,tls:{rejectUnauthorized:true,...(env.SMTP_CA_PEM?{ca:env.SMTP_CA_PEM}:{})}});
  try{const r=await mail.sendMail({from:env.NOTIFICATION_EMAIL_FROM,to:env.NOTIFICATION_EMAIL_TO,subject:text.split('\n')[0].slice(0,150),text,...(notification?{html:emailCard(notification)}:{})});
   if(r.rejected?.length)throw Error('Email recipient rejected');return;
  }finally{mail.close?.();}
 }
 if(!['discord','telegram'].includes(channel))return sendAdapter(channel,text,{env,notification,fetcher});
 let url,body;
 if(channel==='discord'){
  url=new URL(env.DISCORD_WEBHOOK_URL);
  if(url.protocol!=='https:'||url.hostname!=='discord.com'||url.port||!/^\/api(?:\/v\d+)?\/webhooks\/\d+\/[^/]+$/.test(url.pathname)||url.username||url.password)throw Error('Use a Discord HTTPS webhook');
  url.searchParams.set('wait','true');body=notification?{username:'HomeCloud',allowed_mentions:{parse:[]},embeds:[{title:notification.title,description:notification.details,color:notification.color,fields:[{name:'Source',value:notification.source,inline:false},{name:'Status',value:notification.event==='resolved'?'Recovered':notification.severity.toUpperCase(),inline:true}],...(notification.time?{timestamp:notification.time}:{}),footer:{text:'HomeCloud'}}]}:{content:text.slice(0,2000),allowed_mentions:{parse:[]}};
 }else if(channel==='telegram'){
  if(!/^\d+:[A-Za-z0-9_-]+$/.test(env.TELEGRAM_BOT_TOKEN||''))throw Error('Invalid Telegram bot token');
  url=new URL(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`);body={chat_id:env.TELEGRAM_CHAT_ID,text:text.slice(0,4096)};
 }else throw Error('Unsupported notification channel');
 const response=await fetcher(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000),redirect:'error'});
 if(!response.ok)throw Object.assign(Error('Notification service rejected delivery'),{providerStatus:response.status});
 if(channel==='telegram'){const result=await response.json();if(result.ok!==true)throw Object.assign(Error('Telegram rejected delivery'),{providerStatus:result.error_code});}
}
export function notificationTestError(channel,error){
 const name=channelNames[channel]||'Notification',status=error?.providerStatus,code=error?.code||error?.cause?.code;
 if(status===429)return `${name} rate limit reached. Wait before testing again.`;
 if(status===401||status===403)return `${name} rejected access. Check the token or webhook permissions${channel==='telegram'?' and that the bot can message the chat':''}.`;
 if(status===404)return `${name} endpoint was not found. Check that the webhook or bot token is still valid.`;
 if(channel==='telegram'&&status===400)return 'Telegram rejected the destination. Check the chat ID and start the bot or add it to the intended chat.';
 if(channel==='email'&&(code==='EAUTH'||error?.responseCode===535))return 'SMTP authentication failed. Check the username, password or app password and relay permissions.';
 if(channel==='email'&&code==='EENVELOPE')return 'SMTP rejected the sender or recipient. Check both addresses and relay permissions.';
 if(['CERT_HAS_EXPIRED','DEPTH_ZERO_SELF_SIGNED_CERT','UNABLE_TO_VERIFY_LEAF_SIGNATURE','ERR_TLS_CERT_ALTNAME_INVALID'].includes(code))return `${name} TLS verification failed. Check the hostname, certificate and trusted CA.`;
 if(['ETIMEDOUT','ESOCKET','ECONNECTION','ECONNREFUSED','ENOTFOUND'].includes(code)||error?.name==='TimeoutError')return `${name} connection failed. Check the host, port, network, DNS and TLS settings.`;
 return `${name} test failed. Check the entered connection details and service availability.`;
}
export const defaultNotificationPreferences=()=>({enabled:true,channels:Object.fromEntries(notificationIds.map(id=>[id,['discord','telegram','email'].includes(id)])),minimumSeverity:'info',notifyResolved:true,notifyDockerUpdates:true});
export function notificationPreferences(state){const d=defaultNotificationPreferences(),p=state.notificationPreferences||{};return {...d,...p,channels:{...d.channels,...p.channels}};}
export function validateNotificationPreferences(input){
 if(input?.notifyDockerUpdates!==undefined&&typeof input.notifyDockerUpdates!=='boolean')throw Object.assign(Error('Choose a valid Docker update notification preference'),{status:400});
 if(!input||typeof input.enabled!=='boolean'||typeof input.notifyResolved!=='boolean'||!['info','warning','critical'].includes(input.minimumSeverity)||!input.channels||['discord','telegram','email'].some(c=>typeof input.channels[c]!=='boolean')||Object.keys(input).some(k=>!['enabled','notifyResolved','notifyDockerUpdates','minimumSeverity','channels'].includes(k))||Object.keys(input.channels).some(k=>!notificationIds.includes(k)||typeof input.channels[k]!=='boolean'))throw Object.assign(Error('Choose valid notification delivery preferences'),{status:400});
 return {enabled:input.enabled,channels:{...input.channels},minimumSeverity:input.minimumSeverity,notifyResolved:input.notifyResolved,...(input.notifyDockerUpdates===undefined?{}:{notifyDockerUpdates:input.notifyDockerUpdates})};
}
const connectionRecovery=(alert,event)=>event==='resolved'&&typeof alert?.key==='string'&&alert.key.startsWith('connection:');
export function createNotifier({persistence={get,mutate},env=runtimeEnvironment,send=sendNotification,now=()=>Date.now()}={}){
 const startedAt=now();let inFlight=null;
 const environment=()=>typeof env==='function'?env():env;
 const configured=()=>notificationChannels(environment());
 const status=()=>{const env=environment(),queue=persistence.get().notificationQueue||[];return {channels:configured(),preferences:notificationPreferences(persistence.get()),incomplete:[...(env.TELEGRAM_BOT_TOKEN&&!env.TELEGRAM_CHAT_ID||!env.TELEGRAM_BOT_TOKEN&&env.TELEGRAM_CHAT_ID?['Telegram requires both bot token and chat ID.']:[]),...([env.SMTP_HOST,env.NOTIFICATION_EMAIL_FROM,env.NOTIFICATION_EMAIL_TO].some(Boolean)&&![env.SMTP_HOST,env.NOTIFICATION_EMAIL_FROM,env.NOTIFICATION_EMAIL_TO].every(Boolean)?['Email requires SMTP host, sender and recipient.']:[])],pending:queue.filter(r=>r.event!=='test'&&!r.sentAt).length,
  failures:queue.filter(r=>!r.sentAt&&r.error).map(r=>({channel:r.channel,error:r.error,nextAttempt:r.nextAttempt})).slice(-20),
  history:queue.slice(-200).map(r=>{const current=(persistence.get().alerts||[]).find(a=>a.id===r.alertId),alert=r.alert||current;return {id:r.id,channel:r.channel,event:r.event,alertId:r.alertId||null,createdAt:r.createdAt||null,sentAt:r.sentAt||null,error:r.error||null,nextAttempt:r.nextAttempt||null,alert:alert?{title:alert.title||null,severity:alert.severity||null,source:alert.source||null,details:alert.details||null}:null,metadataSource:r.alert?'delivery-snapshot':current?'current-alert':null}}),
  lastSent:queue.filter(r=>r.sentAt).at(-1)?.sentAt||null};};
 async function deliver(alerts){
  if(inFlight)return inFlight;
  inFlight=(async()=>{
   const preferences=notificationPreferences(persistence.get()),channels=configured().filter(c=>preferences.channels[c]);if(!preferences.enabled||!channels.length)return;
   // Do not retroactively bypass filters for the installation's old recoveries.
   const policySince=persistence.get().connectionRecoveryNotificationsSince||new Date(startedAt).toISOString();
   const automaticRecovery=(alert,event)=>connectionRecovery(alert,event)&&Date.parse(alert.resolvedAt)>=Date.parse(policySince);
   const imageUpdate=alert=>alert?.key?.startsWith('docker-image:');
   const eligible=(alert,event=alert.status==='resolved'?'resolved':'active')=>imageUpdate(alert)?event==='active'&&['active','acknowledged'].includes(alert.status)&&preferences.notifyDockerUpdates!==false:event==='resolved'?(automaticRecovery(alert,event)||preferences.notifyResolved):({info:0,warning:1,critical:2}[alert.severity]??0)>=({info:0,warning:1,critical:2}[preferences.minimumSeverity]);
   const accepts=(channel,alert,event)=>imageUpdate(alert)||automaticRecovery(alert,event)||channelAccepts(channel,alert,event,environment());
   const queuedAlert=row=>({...alerts.find(a=>a.id===row.alertId),...row.alert});
   persistence.mutate(s=>{s.connectionRecoveryNotificationsSince??=policySince;s.notificationQueue??=[];
    for(const alert of alerts){if(!['active','acknowledged','resolved'].includes(alert.status)||!eligible(alert))continue;
     const event=alert.status==='resolved'?'resolved':'active',date=event==='resolved'?alert.resolvedAt:alert.triggered;
     if(!date||now()-Date.parse(date)>7*86400000)continue;
     for(const channel of channels){if(!accepts(channel,alert,event))continue;const key=`${alert.id}:${event}:${channel}`;
      if(!s.notificationQueue.some(r=>r.key===key)&&s.notificationQueue.filter(r=>!r.sentAt).length<1000)
       s.notificationQueue.push({id:crypto.randomUUID(),key,channel,alertId:alert.id,event,createdAt:new Date(now()).toISOString(),alert:{key:alert.key,title:alert.title,severity:alert.severity,source:alert.source,details:alert.details,triggered:alert.triggered,resolvedAt:alert.resolvedAt},text:textFor(alert,event),attempts:0,nextAttempt:now()});
     }
    }
    // Keep successful delivery keys for deduplication while the corresponding alert is retained.
    const ids=new Set(alerts.map(a=>a.id)),tests=new Set(s.notificationQueue.filter(r=>r.event==='test').slice(-100).map(r=>r.id));s.notificationQueue=s.notificationQueue.filter(r=>r.event==='test'?tests.has(r.id):ids.has(r.alertId));
   });
   const pending=(persistence.get().notificationQueue||[]).filter(r=>r.event!=='test'&&channels.includes(r.channel)&&eligible(queuedAlert(r),r.event)&&accepts(r.channel,queuedAlert(r),r.event)&&!r.sentAt&&r.nextAttempt<=now()).slice(0,20);
   for(const item of pending){let error=null;try{const n=notificationMessage({...queuedAlert(item),occurredAt:item.event==='resolved'?item.alert?.resolvedAt:item.alert?.triggered},item.event);if(!n.time){const date=item.text?.split('\n').at(-1);if(Number.isFinite(Date.parse(date)))n.time=new Date(date).toISOString();}await send(item.channel,messageText(n),{env:environment(),notification:n});}catch{error=`${item.channel} delivery failed. Check its saved configuration and service availability.`;}
    persistence.mutate(s=>{const row=s.notificationQueue.find(r=>r.id===item.id);if(!row)return;row.attempts++;
     if(error){row.error=error;row.nextAttempt=now()+Math.min(3600000,30000*2**Math.min(row.attempts-1,7));}
     else{row.sentAt=new Date(now()).toISOString();delete row.error;delete row.text;}
    });
   }
  })().finally(()=>{inFlight=null});return inFlight;
 }
 return {deliver,status,async test(channel,{env:override}={}){const testEnvironment=override||environment();if(!notificationChannels(testEnvironment).includes(channel))throw Object.assign(Error('Notification channel is not configured'),{status:400});
  const record={id:crypto.randomUUID(),channel,event:'test',createdAt:new Date(now()).toISOString(),attempts:1};
  try{await send(channel,'HomeCloud test notification: delivery is connected.',{env:testEnvironment,notification:notificationMessage({title:'Delivery check',source:'HomeCloud',details:'This is a test notification. Automatic alert preferences were not changed.',severity:'info',triggered:new Date(now()).toISOString()},'test')});record.sentAt=new Date(now()).toISOString();return {channel,delivered:true};}
  catch(error){record.error=notificationTestError(channel,error);throw Object.assign(Error(record.error),{status:502,notificationTest:true});}
  finally{persistence.mutate(s=>{s.notificationQueue??=[];s.notificationQueue.push(record);const keep=new Set(s.notificationQueue.filter(r=>r.event==='test').slice(-100).map(r=>r.id));s.notificationQueue=s.notificationQueue.filter(r=>r.event!=='test'||keep.has(r.id));});}}};
}
export const notifier=createNotifier();
