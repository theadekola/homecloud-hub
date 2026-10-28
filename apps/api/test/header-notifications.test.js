import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {captureRequestActivity,observeHeaderActivity,createHeaderNotifications} from '../src/header-notifications.js';
const user={sub:'one',role:'viewer'},owner={sub:'owner',role:'owner'};
function fixture(state={alerts:[]}){return {state,feed:createHeaderNotifications({get:()=>state,mutate:fn=>fn(state)})}}
const request=(route='/api/actions/:provider/:resourceType/:resourceId/:action',extra={})=>({method:'POST',route:{path:route},params:{provider:'proxmox',resourceType:'vm',resourceId:'106',action:'start'},user,...extra});
test('reading is per user, monotonic and never resolves active or acknowledged alerts',()=>{
 const {state,feed}=fixture({alerts:[{id:'a',title:'CPU high',status:'active'},{id:'b',title:'Offline',status:'acknowledged'}]});feed.capture(request(),200,'queued');
 assert.equal(feed.read(user).badgeCount,1);feed.markRead(user,1);assert.equal(feed.read(user).badgeCount,1);assert.equal(feed.read(user).attention[1].status,'acknowledged');assert.equal(feed.read({sub:'two',role:'viewer'}).unreadCount,1);feed.markRead(user,0);assert.equal(feed.read(user).unreadCount,0);assert.deepEqual(state.alerts.map(a=>a.status),['active','acknowledged']);
 state.alerts[0].status='resolved';assert.equal(feed.read(user).attentionCount,1);for(const cursor of [-1,2,1.5,'1',null])assert.throws(()=>feed.markRead(user,cursor),{status:400});
});
test('activity excludes credential bodies and private actions from unrelated users',()=>{
 const {feed}=fixture();feed.capture(request('/api/configuration/:service',{params:{service:'email'},body:{password:'never-leak',url:'https://token.example/secret'}}),502);feed.capture(request(),200,'queued');
 const publicFeed=feed.read({sub:'other',role:'viewer'});assert.equal(publicFeed.activity.length,1);assert.equal(publicFeed.activity[0].status,'queued');assert.match(publicFeed.activity[0].message,/not been verified/);assert.match(publicFeed.activity[0].title,/#106 start/);assert.equal(publicFeed.activity[0].link,'/proxmox');assert.equal(feed.read(user).activity.length,2);assert.equal(feed.read(owner).activity.length,2);assert.ok(!JSON.stringify(feed.read(owner)).includes('never-leak'));assert.ok(!JSON.stringify(feed.read(owner)).includes('token.example'));assert.ok(!('userId' in publicFeed.activity[0]));
});
test('routine reads, authorization challenges, shell input and upload chunks do not flood activity',()=>{
 const state={};for(const req of [request(undefined,{method:'GET'}),request('/api/header-notifications/read'),request('/api/ssh/input/:id'),request('/api/ssh/fingerprint'),request('/api/ssh/sftp/:id',{body:{action:'list'}}),request('/api/ssh/sftp/:id',{body:{action:'write',offset:100}})])captureRequestActivity(state,req,200);captureRequestActivity(state,request(),428);captureRequestActivity(state,request(undefined,{activityChallenge:true}),409);assert.equal(state.headerActivities,undefined);
 captureRequestActivity(state,request('/api/ssh/sftp/:id',{body:{action:'write',offset:0,data:'private-file'}}),200);assert.equal(state.headerActivities.length,1);assert.match(state.headerActivities[0].title,/upload started/);assert.ok(!JSON.stringify(state).includes('private-file'));assert.equal(state.headerActivities[0].link,'/tools/sftp');captureRequestActivity(state,request('/api/users'),409);assert.equal(state.headerActivities[0].status,'failed');captureRequestActivity(state,request('/api/ssh/sftp/:id',{body:{action:'write',offset:100}}),422);assert.equal(state.headerActivities[0].status,'failed');
});
test('retained activity is bounded and failed anonymous sign-ins are owner-visible only',()=>{
 const {state,feed}=fixture();for(let i=0;i<510;i++)feed.capture(request(),200);assert.equal(state.headerActivities.length,500);assert.equal(feed.read(user).unreadCount,500);assert.equal(feed.read(user).activity.length,50);feed.capture(request('/api/auth/login',{user:null,params:{},body:{password:'secret'}}),401);assert.equal(feed.read(user).activity[0].category,'proxmox');assert.equal(feed.read(owner).activity[0].category,'auth');assert.equal(feed.read(owner).activity[0].status,'failed');
});
test('monitoring observes transitions once, preserves missing samples and reports real recovery',()=>{
 const state={alerts:[{id:'a',title:'Offline',source:'node',status:'acknowledged'}]},snapshot={services:[{id:'pve',name:'Proxmox',status:'reachable'}],proxmox:{vms:[{id:'101',name:'Media',node:'n1',status:'running'}]}};
 observeHeaderActivity(state,snapshot);assert.equal(state.headerActivities,undefined);observeHeaderActivity(state,{});assert.equal(state.headerActivities,undefined);snapshot.proxmox.vms[0].status='stopped';observeHeaderActivity(state,snapshot);assert.equal(state.headerActivities.length,1);observeHeaderActivity(state,snapshot);assert.equal(state.headerActivities.length,1);state.alerts[0].status='resolved';observeHeaderActivity(state,snapshot);assert.equal(state.headerActivities.length,2);assert.equal(state.headerActivities[0].status,'resolved');observeHeaderActivity(state,snapshot);assert.equal(state.headerActivities.length,2);
});
test('only owners receive updater attention and persisted read cursors survive recreation',()=>{
 const {state,feed}=fixture(),update={enabled:true,available:true};assert.equal(feed.read(owner,update).attentionCount,1);assert.equal(feed.read(user,update).attentionCount,0);feed.capture(request('/api/notifications/preferences'),200);feed.markRead(user,1);assert.equal(fixture(state).feed.read(user).unreadCount,0);assert.equal(fixture(state).feed.read(user).activity[0].category,'settings');
});
test('authenticated feed and read marker use no provider requests and never acknowledge alerts',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'iclusters-header-'));process.env.DATA_DIR=directory;process.env.JWT_SECRET='a'.repeat(64);process.env.JWT_REFRESH_SECRET='b'.repeat(64);const {createApp}=await import('../src/app.js');const {feed,state}=fixture({alerts:[{id:'a',status:'active',title:'CPU high'}]});feed.capture(request(),200);let scans=0;
 const server=createApp({activity:feed,authenticate:(req,res,next)=>{if(!req.headers.authorization)return res.status(401).json({error:'Authentication required'});req.user=user;next()},audit:async()=>{},monitor:{invalidate(){},sample:async()=>{scans++;throw Error('Unexpected provider scan')}}}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}/api/header-notifications`,headers={Authorization:'Bearer test','Content-Type':'application/json'};
 try{assert.equal((await fetch(base)).status,401);const response=await fetch(base,{headers});assert.match(response.headers.get('cache-control'),/no-store/);assert.equal((await response.json()).badgeCount,1);assert.equal((await fetch(base+'/read',{method:'POST',headers,body:JSON.stringify({sequence:1})})).status,200);assert.equal((await (await fetch(base,{headers})).json()).badgeCount,1);assert.equal(state.alerts[0].status,'active');assert.equal(scans,0);assert.equal((await fetch(base+'/read',{method:'POST',headers,body:'{"sequence":999}'})).status,400);assert.equal(state.headerActivities.length,1);}finally{server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(directory,{recursive:true,force:true})}
});

test('unread recent activity never contributes to the bell badge',()=>{
 const {state,feed}=fixture();feed.capture(request(),200);
 assert.equal(feed.read(user).badgeCount,0);assert.equal(feed.read(user).unreadCount,1);assert.equal(feed.read(user).activity.length,1);
 state.alerts.push({id:'a',title:'Offline',status:'active'});assert.equal(feed.read(user).badgeCount,1);
 state.alerts[0].status='acknowledged';assert.equal(feed.read(user).badgeCount,0);assert.equal(feed.read(user).acknowledgedCount,1);assert.equal(feed.read(user).attention[0].status,'acknowledged');
 state.alerts[0].status='resolved';assert.equal(feed.read(user).badgeCount,0);assert.equal(feed.read(user).unreadCount,1);
});

test('attention summary separates monitoring alerts from updates before preview truncation',()=>{
 const state={alerts:Array.from({length:60},(_,i)=>({id:String(i),status:i%2?'active':'acknowledged',severity:'critical'}))};const feed=createHeaderNotifications({get:()=>state,mutate:fn=>fn(state)},()=>[{id:'node1',name:'node1',update:{available:true,version:5}}]);const result=feed.read(owner,{enabled:true,available:true});assert.equal(result.attention.length,50);assert.equal(result.attentionCount,62);assert.equal(result.acknowledgedCount,30);assert.equal(result.badgeCount,32);assert.equal(result.alertCount,60);assert.equal(result.updateCount,2);assert.equal(result.criticalCount,60);assert.equal(feed.read(user).attentionCount,60);
});

test('manual resolution leaves attention counts and uses manual wording instead of recovered',()=>{
 const alert={id:'manual',key:'connection:pve',status:'acknowledged',severity:'critical',title:'Offline',source:'pve'},state={alerts:[alert]};
 const feed=createHeaderNotifications({get:()=>state,mutate:f=>f(state)},()=>[]),snapshot={services:[]};observeHeaderActivity(state,snapshot);
 alert.status='resolved';alert.resolution='manual';observeHeaderActivity(state,snapshot);
 const result=feed.read(user);assert.equal(result.badgeCount,0);assert.equal(result.attentionCount,0);assert.ok(result.activity.some(r=>r.title==='Manually resolved: Offline'));assert.ok(!result.activity.some(r=>r.title==='Recovered: Offline'));
});

test('owners see available updates throughout checking and get actionable warnings for stale workers',()=>{
 const {feed}=fixture();for(const state of ['ready','checking']){const result=feed.read(owner,{enabled:true,configured:true,available:true,state});assert.equal(result.updateCount,1);assert.equal(result.attention[0].title,'Software update available')}
 const stale=feed.read(owner,{enabled:false,configured:true,available:true,state:'unavailable',message:'Worker is stale.'});assert.equal(stale.updateCount,1);assert.equal(stale.attention[0].title,'Software update available');assert.equal(stale.attention[0].severity,'warning');assert.match(stale.attention[0].message,/stale/);assert.equal(feed.read(user,{enabled:false,configured:true,state:'unavailable'}).updateCount,0);assert.equal(feed.read(owner,{enabled:true,configured:true,available:false,state:'completed'}).updateCount,0);
});

test('failed checks retain the detected update and explain the worker issue to owners',()=>{
 const {feed}=fixture();for(const state of ['failed','error','unavailable']){const update={enabled:false,configured:true,available:true,state,message:'Fetch could not complete.'};const notice=feed.read(owner,update).attention[0];assert.equal(notice.title,'Software update available');assert.equal(notice.severity,'warning');assert.match(notice.message,/update was detected/);assert.match(notice.message,/Fetch could not complete/);assert.equal(feed.read(user,update).updateCount,0)}
 const issue=feed.read(owner,{enabled:false,configured:true,available:false,state:'unavailable'}).attention[0];assert.equal(issue.title,'Software updater needs attention');
});
