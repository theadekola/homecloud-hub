import test from 'node:test';import assert from 'node:assert/strict';
import {changeAlertStatus} from '../src/alert-status.js';
import {createMonitor} from '../src/monitor.js';
import {createNotifier} from '../src/notifications.js';
const actor={sub:'user',username:'operator'};
test('manual resolution requires acknowledgement, records attribution and is idempotent',()=>{
 const state={alerts:[{id:'a',status:'active'}]};
 assert.throws(()=>changeAlertStatus(state,'a',actor,{resolve:true}),{status:409});assert.equal(state.alerts[0].status,'active');
 changeAlertStatus(state,'a',actor,{now:()=> '2026-10-21T01:00:00Z'});assert.equal(state.alerts[0].acknowledgedBy,'operator');
 changeAlertStatus(state,'a',actor,{resolve:true,now:()=> '2026-10-21T01:01:00Z'});assert.equal(state.alerts[0].status,'resolved');assert.equal(state.alerts[0].resolution,'manual');assert.equal(state.alerts[0].resolvedAt,'2026-10-21T01:01:00Z');assert.equal(state.alerts[0].resolvedBy,'operator');
 changeAlertStatus(state,'a',{sub:'other'},{resolve:true});assert.equal(state.alerts[0].resolvedBy,'operator');
 assert.throws(()=>changeAlertStatus(state,'missing',actor),{status:404});
});
test('manual closure is retained and a later measured failure creates a new alert',async()=>{
 const state={alerts:[],metrics:[],rules:[]},persistence={get:()=>state,mutate:f=>f(state)};
 const monitor=createMonitor({proxmox:{configured:()=>true,read:async()=>{throw Error('offline')}}},persistence,async()=>[]);
 await monitor.sample(true);const first=state.alerts[0];changeAlertStatus(state,first.id,actor);changeAlertStatus(state,first.id,actor,{resolve:true});
 await new Promise(r=>setTimeout(r,5));await monitor.sample(true);
 assert.equal(first.status,'resolved');assert.equal(state.alerts.filter(a=>a.status==='active').length,1);assert.notEqual(state.alerts[0].id,first.id);
});
test('manual closure never sends a false measured-recovery notification',async()=>{
 const alert={id:'a',key:'connection:pve',status:'resolved',resolution:'manual',title:'Offline',source:'pve',severity:'critical',resolvedAt:new Date().toISOString()},state={alerts:[alert],notificationQueue:[{id:'pending',key:'a:active:discord',alertId:'a',channel:'discord',event:'active',nextAttempt:0,attempts:0}],notificationPreferences:{enabled:true,notifyResolved:true}},sent=[];
 const notify=createNotifier({env:{DISCORD_WEBHOOK_URL:'https://discord.com/api/webhooks/fixture'},persistence:{get:()=>state,mutate:f=>f(state)},send:async(...a)=>sent.push(a)});
 await notify.deliver(state.alerts);assert.equal(sent.length,0);assert.equal(state.notificationQueue.length,0);
});

test('alert HTTP actions enforce operator access and keep acknowledgement separate from resolution',async()=>{
 process.env.JWT_SECRET||='alert-test-access-secret-at-least-32';process.env.JWT_REFRESH_SECRET||='alert-test-refresh-secret-at-least-32';
 const {createApp}=await import('../src/app.js'),{get,mutate}=await import('../src/store.js'),before=structuredClone(get()),audits=[];
 mutate(s=>{s.alerts=[{id:'route-alert',status:'active',severity:'critical'}]});
 const app=createApp({authenticate:(req,res,next)=>{req.user={sub:'operator-id',username:'operator',role:req.headers['x-role']||'operator'};next()},monitor:{sample:async()=>({services:[],alerts:get().alerts}),invalidate:async()=>{}},audit:async(...a)=>audits.push(a)}),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const post=(suffix,role='operator')=>fetch(`http://127.0.0.1:${server.address().port}/api/alerts/route-alert/${suffix}`,{method:'POST',headers:{'Content-Type':'application/json','x-role':role},body:'{}'});
 try{
  assert.equal((await post('acknowledge','viewer')).status,403);assert.equal((await post('resolve','viewer')).status,403);
  assert.equal((await post('resolve')).status,409);assert.equal(get().alerts[0].status,'active');
  assert.equal((await post('acknowledge')).status,200);assert.equal(get().alerts[0].status,'acknowledged');
  assert.equal((await post('resolve')).status,200);assert.equal(get().alerts[0].status,'resolved');assert.equal(get().alerts[0].resolvedBy,'operator');assert.ok(audits.some(a=>a[1]==='alert.resolve'&&a[4]==='success'));
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));mutate(s=>{for(const key of Object.keys(s))delete s[key];Object.assign(s,before)})}
});
