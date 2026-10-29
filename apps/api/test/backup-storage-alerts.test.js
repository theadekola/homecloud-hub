import test from 'node:test';import assert from 'node:assert/strict';import {createMonitor} from '../src/monitor.js';
test('backup storage alerts recover only from a matching online storage reading',async()=>{
 const state={alerts:[],metrics:[],rules:[]};let storage=[{id:'node02/media-storage',name:'media-storage',node:'node02',content:'backup,images',status:'offline'}];
 const monitor=createMonitor({proxmox:{configured:()=>true,read:async()=>({nodes:[],storage})}},{get:()=>state,mutate:fn=>fn(state)},async()=>[]);
 await monitor.sample(true);assert.equal(state.alerts.length,1);assert.equal(state.alerts[0].title,'Backup storage unavailable');assert.equal(state.alerts[0].status,'active');
 storage=[];await monitor.sample(true);assert.equal(state.alerts[0].status,'active');
 storage=[{id:'node02/media-storage',name:'media-storage',node:'node01',content:'backup',status:'online'}];await monitor.sample(true);assert.equal(state.alerts[0].status,'active');
 storage=[{id:'node02/media-storage',name:'media-storage',node:'node02',content:'backup',status:'online'}];await monitor.sample(true);assert.equal(state.alerts[0].status,'resolved');assert.ok(state.alerts[0].resolvedAt);
 state.alerts=[{id:'background-update',status:'active'}];const cached=await monitor.sample();assert.equal(cached.alerts[0].id,'background-update');
});

test('explicit removal of backup content retires an obsolete backup alert without claiming the mount recovered',async()=>{const state={alerts:[],metrics:[],rules:[]};let content='backup';const monitor=createMonitor({proxmox:{configured:()=>true,read:async()=>({nodes:[],storage:[{id:'node02/media',node:'node02',name:'media',status:'offline',content}]})}},{get:()=>state,mutate:fn=>fn(state)},async()=>[]);await monitor.sample(true);assert.equal(state.alerts[0].status,'active');content='images,iso';await monitor.sample(true);assert.equal(state.alerts[0].status,'resolved');assert.equal(state.alerts[0].resolution,'no-longer-backup-destination');assert.match(state.alerts[0].details,/does not mean.*mount was repaired/)});

test('recent backup failures alert without metric rules and stay unresolved until investigated',async()=>{
 const state={alerts:[],metrics:[],rules:[]},now=Math.floor(Date.now()/1000);
 let tasks=[{upid:'UPID:failure',node:'node01',type:'vzdump',id:'100',starttime:now-30,endtime:now-20,status:'job errors'}];
 const monitor=createMonitor({proxmox:{configured:()=>true,read:async()=>({nodes:[],storage:[{id:'backup',node:'node01',content:'backup',status:'online'}],backupHistory:{verified:true,tasks}})}},{get:()=>state,mutate:fn=>fn(state)},async()=>[]);
 await monitor.sample(true);assert.equal(state.alerts.length,1);assert.equal(state.alerts[0].severity,'critical');assert.equal(state.alerts[0].title,'Backup task failed');
 tasks=[];await monitor.sample(true);assert.equal(state.alerts[0].status,'active');
 tasks=[{upid:'UPID:failure',node:'node01',type:'vzdump',id:'100',starttime:now-30,endtime:now-20,status:'job errors'}];Object.assign(state.alerts[0],{status:'resolved',resolution:'manual',resolvedAt:new Date().toISOString()});await monitor.sample(true);assert.equal(state.alerts.length,1);assert.equal(state.alerts[0].status,'resolved');
 tasks=[{upid:'UPID:ok',node:'node01',type:'vzdump',starttime:now-30,endtime:now-20,status:'OK'},{upid:'UPID:running',node:'node01',type:'vzdump',starttime:now-30,status:'running'},{upid:'UPID:old',node:'node01',type:'vzdump',starttime:now-90000,endtime:now-89990,status:'job errors'}];await monitor.sample(true);assert.equal(state.alerts.length,1);
});
test('Proxmox snapshots capture backup task history and mark unavailable history unverified',async()=>{
 const {proxmoxSnapshot}=await import('../src/connectors.js');let unavailable=false;
 const query=async path=>{if(path==='/cluster/tasks'){if(unavailable)throw Error('Unavailable');return [{type:'vzdump',upid:'backup'},{type:'qmstart',upid:'other'}];}return [];};
 const first=await proxmoxSnapshot(query);assert.equal(first.backupHistory.verified,true);assert.deepEqual(first.backupHistory.tasks,[{type:'vzdump',upid:'backup'}]);unavailable=true;const second=await proxmoxSnapshot(query);assert.equal(second.backupHistory.verified,false);assert.deepEqual(second.backupHistory.tasks,[]);
});
