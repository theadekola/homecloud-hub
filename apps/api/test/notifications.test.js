import test from 'node:test';
import assert from 'node:assert/strict';
import {createNotifier,sendNotification,notificationChannels} from '../src/notifications.js';
const env={DISCORD_WEBHOOK_URL:'https://discord.com/api/webhooks/123/token',TELEGRAM_BOT_TOKEN:'123:token',TELEGRAM_CHAT_ID:'456'};
test('delivery deduplicates per channel, retries failures and sends one recovery',async()=>{
 const state={notificationQueue:[]};let now=Date.now(),fail=true;const calls=[];
 const options={env,persistence:{get:()=>state,mutate:fn=>fn(state)},now:()=>now,send:async(channel,text)=>{calls.push([channel,text]);if(channel==='telegram'&&fail)throw Error('token secret')}};
 const alert={id:'alert',title:'CPU',source:'host',details:'90%',severity:'warning',status:'active',triggered:new Date(now).toISOString()};
 let notify=createNotifier(options);await notify.deliver([alert]);assert.equal(notify.status().pending,1);assert.ok(!JSON.stringify(notify.status()).includes('token secret'));
 await notify.deliver([alert]);assert.equal(calls.length,2);
 // A restart retains delivery keys and pending retries.
 notify=createNotifier(options);now+=30000;fail=false;await notify.deliver([alert]);assert.equal(calls.length,3);assert.equal(notify.status().pending,0);
 alert.status='acknowledged';await notify.deliver([alert]);assert.equal(calls.length,3);
 alert.status='resolved';alert.resolvedAt=new Date(now).toISOString();await notify.deliver([alert]);await notify.deliver([alert]);assert.equal(calls.length,5);
});
test('concurrent notifications share a flush and channel tests hide secrets',async()=>{
 let release;const wait=new Promise(resolve=>release=resolve),state={},calls=[];
 const n=createNotifier({env:{DISCORD_WEBHOOK_URL:env.DISCORD_WEBHOOK_URL},persistence:{get:()=>state,mutate:fn=>fn(state)},send:async(...args)=>{calls.push(args);await wait}});
 const alerts=[{id:'x',status:'active',triggered:new Date().toISOString(),title:'Test'}];
 const a=n.deliver(alerts),b=n.deliver(alerts);release();await Promise.all([a,b]);assert.equal(calls.length,1);
 await assert.rejects(n.test('email'),{status:400});
});
test('Discord and Telegram use bounded plain text and reject unsafe endpoints or API failures',async()=>{
 const requests=[];const fetcher=async(url,init)=>{requests.push([String(url),JSON.parse(init.body)]);return {ok:true,json:async()=>({ok:true})}};
 await sendNotification('discord','@everyone '+ 'x'.repeat(3000),{env,fetcher});assert.equal(requests[0][1].content.length,2000);assert.deepEqual(requests[0][1].allowed_mentions,{parse:[]});
 await sendNotification('telegram','test',{env,fetcher});assert.equal(requests[1][1].chat_id,'456');
 await assert.rejects(sendNotification('discord','test',{env:{DISCORD_WEBHOOK_URL:'http://internal/private'},fetcher}));
 await assert.rejects(sendNotification('telegram','test',{env,fetcher:async()=>({ok:true,json:async()=>({ok:false})})}));
});
test('SMTP requires verified TLS and treats rejected recipients as failures',async()=>{
 let config,mail;const smtp={SMTP_HOST:'smtp.example',NOTIFICATION_EMAIL_FROM:'from@example.com',NOTIFICATION_EMAIL_TO:'to@example.com'};
 const transport=c=>{config=c;return {sendMail:async m=>{mail=m;return {rejected:[]}}}};
 await sendNotification('email','Test\nDetails',{env:smtp,transport});assert.equal(config.requireTLS,true);assert.equal(config.tls.rejectUnauthorized,true);assert.equal(mail.to,smtp.NOTIFICATION_EMAIL_TO);
 await assert.rejects(sendNotification('email','test',{env:smtp,transport:()=>({sendMail:async()=>({rejected:['to@example.com']})})}));
 assert.deepEqual(notificationChannels({}),[]);
});
