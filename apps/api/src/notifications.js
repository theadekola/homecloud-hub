import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import {get,mutate} from './store.js';

export function notificationChannels(env=process.env){
 const channels=[];
 if(env.DISCORD_WEBHOOK_URL)channels.push('discord');
 if(env.TELEGRAM_BOT_TOKEN&&env.TELEGRAM_CHAT_ID)channels.push('telegram');
 if(env.SMTP_HOST&&env.NOTIFICATION_EMAIL_FROM&&env.NOTIFICATION_EMAIL_TO)channels.push('email');
 return channels;
}
const textFor=(alert,event)=>`HomeCloud ${event==='resolved'?'RECOVERED':alert.severity?.toUpperCase()||'ALERT'}: ${alert.title}\nSource: ${alert.source}\n${alert.details||''}\n${event==='resolved'?alert.resolvedAt:alert.triggered}`;
export async function sendNotification(channel,text,{env=process.env,fetcher=fetch,transport=nodemailer.createTransport}={}){
 if(channel==='email'){
  const port=Number(env.SMTP_PORT||587);if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid SMTP port');
  if(Boolean(env.SMTP_USER)!==Boolean(env.SMTP_PASSWORD))throw Error('Incomplete SMTP authentication');
  const mail=transport({host:env.SMTP_HOST,port,secure:port===465,requireTLS:port!==465,
   auth:env.SMTP_USER?{user:env.SMTP_USER,pass:env.SMTP_PASSWORD}:undefined,
   connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000,tls:{rejectUnauthorized:true}});
  try{const r=await mail.sendMail({from:env.NOTIFICATION_EMAIL_FROM,to:env.NOTIFICATION_EMAIL_TO,subject:text.split('\n')[0].slice(0,150),text});
   if(r.rejected?.length)throw Error('Email recipient rejected');return;
  }finally{mail.close?.();}
 }
 let url,body;
 if(channel==='discord'){
  url=new URL(env.DISCORD_WEBHOOK_URL);
  if(url.protocol!=='https:'||url.hostname!=='discord.com'||url.port||!/^\/api(?:\/v\d+)?\/webhooks\/\d+\/[^/]+$/.test(url.pathname)||url.username||url.password)throw Error('Use a Discord HTTPS webhook');
  url.searchParams.set('wait','true');body={content:text.slice(0,2000),allowed_mentions:{parse:[]}};
 }else if(channel==='telegram'){
  if(!/^\d+:[A-Za-z0-9_-]+$/.test(env.TELEGRAM_BOT_TOKEN||''))throw Error('Invalid Telegram bot token');
  url=new URL(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`);body={chat_id:env.TELEGRAM_CHAT_ID,text:text.slice(0,4096)};
 }else throw Error('Unsupported notification channel');
 const response=await fetcher(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000),redirect:'error'});
 if(!response.ok)throw Error('Notification service rejected delivery');
 if(channel==='telegram'&&(await response.json()).ok!==true)throw Error('Telegram rejected delivery');
}
export function createNotifier({persistence={get,mutate},env=process.env,send=sendNotification,now=()=>Date.now()}={}){
 let inFlight=null;
 const configured=()=>notificationChannels(env);
 const status=()=>{const queue=persistence.get().notificationQueue||[];return {channels:configured(),incomplete:[...(env.TELEGRAM_BOT_TOKEN&&!env.TELEGRAM_CHAT_ID||!env.TELEGRAM_BOT_TOKEN&&env.TELEGRAM_CHAT_ID?['Telegram requires both bot token and chat ID.']:[]),...([env.SMTP_HOST,env.NOTIFICATION_EMAIL_FROM,env.NOTIFICATION_EMAIL_TO].some(Boolean)&&![env.SMTP_HOST,env.NOTIFICATION_EMAIL_FROM,env.NOTIFICATION_EMAIL_TO].every(Boolean)?['Email requires SMTP host, sender and recipient.']:[])],pending:queue.filter(r=>!r.sentAt).length,
  failures:queue.filter(r=>!r.sentAt&&r.error).map(r=>({channel:r.channel,error:r.error,nextAttempt:r.nextAttempt})).slice(-20),
  lastSent:queue.filter(r=>r.sentAt).at(-1)?.sentAt||null};};
 async function deliver(alerts){
  if(inFlight)return inFlight;
  inFlight=(async()=>{
   const channels=configured();if(!channels.length)return;
   persistence.mutate(s=>{s.notificationQueue??=[];
    for(const alert of alerts){if(!['active','acknowledged','resolved'].includes(alert.status))continue;
     const event=alert.status==='resolved'?'resolved':'active',date=event==='resolved'?alert.resolvedAt:alert.triggered;
     if(!date||now()-Date.parse(date)>7*86400000)continue;
     for(const channel of channels){const key=`${alert.id}:${event}:${channel}`;
      if(!s.notificationQueue.some(r=>r.key===key)&&s.notificationQueue.filter(r=>!r.sentAt).length<1000)
       s.notificationQueue.push({id:crypto.randomUUID(),key,channel,alertId:alert.id,event,text:textFor(alert,event),attempts:0,nextAttempt:now()});
     }
    }
    // Keep successful delivery keys for deduplication while the corresponding alert is retained.
    const ids=new Set(alerts.map(a=>a.id));s.notificationQueue=s.notificationQueue.filter(r=>ids.has(r.alertId));
   });
   const pending=(persistence.get().notificationQueue||[]).filter(r=>channels.includes(r.channel)&&!r.sentAt&&r.nextAttempt<=now()).slice(0,20);
   for(const item of pending){let error=null;try{await send(item.channel,item.text,{env});}catch{error=`${item.channel} delivery failed. Check its server configuration and service availability.`;}
    persistence.mutate(s=>{const row=s.notificationQueue.find(r=>r.id===item.id);if(!row)return;row.attempts++;
     if(error){row.error=error;row.nextAttempt=now()+Math.min(3600000,30000*2**Math.min(row.attempts-1,7));}
     else{row.sentAt=new Date(now()).toISOString();delete row.error;delete row.text;}
    });
   }
  })().finally(()=>{inFlight=null});return inFlight;
 }
 return {deliver,status,async test(channel){if(!configured().includes(channel))throw Object.assign(Error('Notification channel is not configured'),{status:400});
  try{await send(channel,'HomeCloud test notification: delivery is connected.',{env});return {channel,delivered:true};}
  catch{throw Object.assign(Error(`${channel} test failed. Check server configuration and service availability.`),{status:502});}}};
}
export const notifier=createNotifier();
