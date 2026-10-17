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
