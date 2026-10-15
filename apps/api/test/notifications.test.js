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

test('explicit channel tests are recorded with safe errors, retained and never automatically retried',async()=>{
 const state={notificationQueue:[]};let fail=false,count=0;const n=createNotifier({env:{DISCORD_WEBHOOK_URL:env.DISCORD_WEBHOOK_URL},persistence:{get:()=>state,mutate:fn=>fn(state)},send:async()=>{count++;if(fail)throw Error('sensitive webhook token');}});
 await n.test('discord');assert.equal(n.status().history[0].event,'test');assert.ok(n.status().history[0].sentAt);fail=true;await assert.rejects(n.test('discord'),{status:502});assert.ok(n.status().history[1].error);assert.equal(n.status().pending,0);assert.equal(JSON.stringify(n.status()).includes('sensitive webhook token'),false);await n.deliver([]);assert.equal(count,2);assert.equal(n.status().history.length,2);
});

test('notification history captures safe alert metadata and queue creation time',async()=>{
 const now=Date.parse('2026-10-15T10:00:00Z'),alert={id:'metadata-alert',title:'CPU high',severity:'critical',source:'node01',details:'90%',status:'active',triggered:new Date(now).toISOString()},state={alerts:[alert],notificationQueue:[]};const n=createNotifier({env:{DISCORD_WEBHOOK_URL:env.DISCORD_WEBHOOK_URL},persistence:{get:()=>state,mutate:fn=>fn(state)},now:()=>now,send:async()=>{}});await n.deliver([alert]);alert.details='Changed reading';const row=n.status().history[0];assert.equal(row.createdAt,new Date(now).toISOString());assert.equal(row.alertId,'metadata-alert');assert.deepEqual(row.alert,{title:'CPU high',severity:'critical',source:'node01',details:'90%'});assert.equal(row.metadataSource,'delivery-snapshot');assert.ok(!JSON.stringify(n.status()).includes(env.DISCORD_WEBHOOK_URL));
});
test('legacy notification metadata projects linked alert fields without exposing queue payloads',()=>{
 const state={alerts:[{id:'legacy',title:'Old alert',severity:'warning',source:'host',details:'Reading',credentials:'private-value'}],notificationQueue:[{id:'delivery',alertId:'legacy',event:'active',channel:'discord',text:'private-payload',sentAt:'2026-10-15T10:00:00Z'}]};const n=createNotifier({env:{},persistence:{get:()=>state,mutate:fn=>fn(state)}});const result=n.status();assert.equal(result.history[0].metadataSource,'current-alert');assert.equal(result.history[0].alert.title,'Old alert');assert.ok(!JSON.stringify(result).includes('private-value'));assert.ok(!JSON.stringify(result).includes('private-payload'));
});

test('notification preferences pause delivery, filter severity and channels, and survive notifier recreation',async()=>{
 const state={notificationQueue:[]},calls=[],persistence={get:()=>state,mutate:fn=>fn(state)},options={env,persistence,send:async c=>calls.push(c)},make=(id,severity='warning')=>({id,status:'active',severity,title:id,triggered:new Date().toISOString()});
 const {validateNotificationPreferences}=await import('../src/notifications.js');state.notificationPreferences=validateNotificationPreferences({enabled:false,channels:{discord:true,telegram:true,email:true},minimumSeverity:'info',notifyResolved:true});let n=createNotifier(options);await n.deliver([make('paused')]);assert.equal(calls.length,0);assert.equal(state.notificationQueue.length,0);
 state.notificationPreferences={...state.notificationPreferences,enabled:true,minimumSeverity:'critical',channels:{discord:true,telegram:false,email:true}};n=createNotifier(options);await n.deliver([make('low'),make('high','critical')]);assert.deepEqual(calls,['discord']);assert.equal(state.notificationQueue.length,1);assert.equal(n.status().preferences.minimumSeverity,'critical');assert.deepEqual(n.status().channels,['discord','telegram']);
 const recovery={...make('high','critical'),status:'resolved',resolvedAt:new Date().toISOString()};state.notificationPreferences.notifyResolved=false;await n.deliver([recovery]);assert.equal(calls.length,1);state.notificationPreferences.notifyResolved=true;await n.deliver([recovery]);assert.equal(calls.length,2);
});
test('paused retries wait for channel and severity eligibility; explicit tests remain available',async()=>{
 let now=Date.now(),fail=true;const calls=[],state={},n=createNotifier({env:{DISCORD_WEBHOOK_URL:env.DISCORD_WEBHOOK_URL},now:()=>now,persistence:{get:()=>state,mutate:fn=>fn(state)},send:async c=>{calls.push(c);if(fail)throw Error('secret')}}),alert={id:'retry',severity:'warning',status:'active',triggered:new Date(now).toISOString()};await n.deliver([alert]);assert.equal(n.status().pending,1);state.notificationPreferences={enabled:true,minimumSeverity:'critical',channels:{discord:true},notifyResolved:true};now+=60000;fail=false;await n.deliver([alert]);assert.equal(calls.length,1);state.notificationPreferences.minimumSeverity='info';state.notificationPreferences.channels.discord=false;await n.deliver([alert]);assert.equal(calls.length,1);await n.test('discord');assert.equal(calls.length,2);state.notificationPreferences.channels.discord=true;await n.deliver([alert]);assert.equal(calls.length,3);assert.equal(n.status().pending,0);
});
test('notification preference validation rejects invalid or unsupported values',async()=>{
 const {validateNotificationPreferences,defaultNotificationPreferences}=await import('../src/notifications.js'),valid=defaultNotificationPreferences();assert.deepEqual(validateNotificationPreferences(valid),valid);for(const bad of [null,{}, {...valid,enabled:'false'},{...valid,minimumSeverity:'all'},{...valid,quietHours:true},{...valid,channels:{...valid.channels,webhook:true}},{...valid,channels:{discord:true}},{...valid,notifyResolved:1}])assert.throws(()=>validateNotificationPreferences(bad),{status:400});
});
