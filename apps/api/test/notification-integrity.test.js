import test from 'node:test';
import assert from 'node:assert/strict';
import {createMonitor,alertConditions} from '../src/monitor.js';
import {createNotifier} from '../src/notifications.js';
import {createHeaderNotifications} from '../src/header-notifications.js';
const memory=state=>({get:()=>state,mutate:fn=>fn(state)});
test('connection alert tracks the latest failure category and retires removed configuration without recovery',async()=>{
 const state={rules:[],alerts:[],metrics:[]};let mode='error';
 const monitor=createMonitor({truenas:{configured:()=>mode!=='removed',read:async()=>{if(mode==='error')throw Error('No response');return {info:{hostname:'nas'},errors:['Pool inventory denied']}}}},memory(state),async()=>[]);
 await monitor.sample(true);const alert=state.alerts[0];assert.equal(alert.title,'Connection failed');assert.equal(alert.severity,'critical');alert.status='acknowledged';
 mode='partial';await monitor.sample(true);assert.equal(alert.title,'Incomplete monitoring');assert.equal(alert.severity,'warning');assert.equal(alert.status,'acknowledged');assert.match(alert.details,/Pool inventory denied/);
 mode='removed';await monitor.sample(true);assert.equal(alert.status,'resolved');assert.equal(alert.resolution,'configuration-removed');assert.match(state.headerActivities[0].title,/^Closed:/);assert.doesNotMatch(state.headerActivities[0].title,/Recovered/);
});
test('only a complete connector registry retires removed connector alerts, while offline configured nodes remain active',async()=>{
 const state={rules:[],metrics:[],alerts:[{id:'a',key:'connection:docker:a:node-agent',connectorId:'docker:a:node-agent',provider:'docker',status:'active'}]};let fleet={hosts:[],connectors:[]};
 const monitor=createMonitor({},memory(state),async()=>[],async()=>fleet);
 await monitor.sample(true);assert.equal(state.alerts[0].status,'active');
 fleet={hosts:[],connectorsComplete:true,connectors:[{id:'a',online:false}]};await monitor.sample(true);assert.equal(state.alerts[0].status,'active');
 fleet.connectors=[];await monitor.sample(true);assert.equal(state.alerts[0].resolution,'configuration-removed');
});
test('offline and nonfinite resource values cannot trigger threshold alerts',()=>{
 const rules=[{id:'r',enabled:true,provider:'proxmox',metric:'cpu',threshold:80}];
 const conditions=alertConditions({services:[],proxmox:{nodes:[{id:'offline',status:'offline',cpu:99},{id:'bad',status:'online',cpu:Infinity},{id:'valid',status:'online',cpu:90}]}},rules);
 assert.deepEqual(conditions.map(a=>a.resourceId),['valid']);
});
test('recovered failures are never retried and removed configurations never send recovery notices',async()=>{
 let now=Date.now(),fail=true;const state={},sent=[],alert={id:'a',key:'connection:truenas',status:'active',severity:'critical',title:'Connection failed',triggered:new Date(now).toISOString()};
 const n=createNotifier({persistence:memory(state),env:{DISCORD_WEBHOOK_URL:'https://discord.com/api/webhooks/1/token'},now:()=>now,send:async(c,t)=>{if(fail)throw Error('failed');sent.push(t)}});
 await n.deliver([alert]);assert.equal(n.status().pending,1);now+=60000;fail=false;alert.status='resolved';alert.resolvedAt=new Date(now).toISOString();await n.deliver([alert]);assert.equal(sent.length,1);assert.match(sent[0],/Connection restored/);assert.equal(n.status().pending,0);
 const removed={...alert,id:'removed',resolution:'configuration-removed'};await n.deliver([removed]);assert.equal(sent.length,1);
});
test('retry uses the current alert category rather than the obsolete queued failure',async()=>{
 let now=Date.now(),fail=true;const state={},sent=[],alert={id:'a',status:'active',severity:'critical',title:'Connection failed',triggered:new Date(now).toISOString()};
 const n=createNotifier({persistence:memory(state),env:{DISCORD_WEBHOOK_URL:'https://discord.com/api/webhooks/1/token'},now:()=>now,send:async(c,t)=>{if(fail)throw Error('failed');sent.push(t)}});
 await n.deliver([alert]);now+=60000;fail=false;Object.assign(alert,{title:'Incomplete monitoring',severity:'warning'});await n.deliver([alert]);assert.equal(sent.length,1);assert.match(sent[0],/WARNING: Incomplete monitoring/);assert.doesNotMatch(sent[0],/Connection failed/);
});
test('header distinguishes fresh confirmation from retained alerts and unknown Docker update checks',()=>{
 const now=new Date().toISOString(),old=new Date(Date.now()-86400000*2).toISOString(),state={alerts:[{id:'fresh',status:'active',lastSeen:now},{id:'old',status:'active',lastSeen:old},{id:'image',status:'active',key:'docker-image:h:c:digest',updateHost:'h',updateContainer:'c',lastSeen:now}],dockerImageUpdates:{rows:[{hostId:'h',containerId:'c',status:'unknown',checkedAt:now}]}};
 const feed=createHeaderNotifications(memory(state),()=>[]);let rows=feed.read({sub:'u',role:'viewer'}).attention;assert.deepEqual(rows.map(r=>r.verification),['confirmed','unverified','unverified']);
 Object.assign(state.dockerImageUpdates.rows[0],{status:'available',remoteDigest:'digest'});rows=feed.read({sub:'u',role:'viewer'}).attention;assert.equal(rows[2].verification,'confirmed');
});
test('malformed and future-dated alert events do not generate deliveries',async()=>{
 const now=Date.now(),state={},sent=[],n=createNotifier({persistence:memory(state),env:{DISCORD_WEBHOOK_URL:'https://discord.com/api/webhooks/1/token'},now:()=>now,send:async(c,t)=>sent.push(t)});
 await n.deliver([{id:'bad',status:'active',triggered:'invalid'},{id:'future',status:'active',triggered:new Date(now+3600000).toISOString()}]);assert.equal(sent.length,0);
});
test('unverified old observations wait for a fresh confirmation before external delivery',async()=>{
 const now=Date.now(),state={},sent=[],n=createNotifier({persistence:memory(state),env:{DISCORD_WEBHOOK_URL:'https://discord.com/api/webhooks/1/token'},now:()=>now,send:async(c,t)=>sent.push(t)});
 const alert={id:'old',status:'active',triggered:new Date(now-600000).toISOString(),lastSeen:new Date(now-600000).toISOString()};await n.deliver([alert]);assert.equal(sent.length,0);alert.lastSeen=new Date(now).toISOString();await n.deliver([alert]);assert.equal(sent.length,1);
});
test('failed registry rechecks prevent delivery of earlier available-update claims',async()=>{
 const now=Date.now(),state={dockerImageUpdates:{rows:[{hostId:'h',containerId:'c',status:'unknown',checkedAt:new Date(now).toISOString()}]}},sent=[],n=createNotifier({persistence:memory(state),env:{DISCORD_WEBHOOK_URL:'https://discord.com/api/webhooks/1/token'},now:()=>now,send:async(c,t)=>sent.push(t)}),alert={id:'image',key:'docker-image:h:c:digest',updateHost:'h',updateContainer:'c',status:'active',lastSeen:new Date(now).toISOString(),triggered:new Date(now).toISOString()};
 await n.deliver([alert]);assert.equal(sent.length,0);Object.assign(state.dockerImageUpdates.rows[0],{status:'available',remoteDigest:'digest'});await n.deliver([alert]);assert.equal(sent.length,1);
});
