import test from 'node:test';import assert from 'node:assert/strict';import {alertConditions} from '../src/monitor.js';
test('resource threshold alerts carry Proxmox node ownership for overview filtering',()=>{
 const conditions=alertConditions({services:[],proxmox:{nodes:[{id:'n1',name:'n1',cpu:95}],storage:[{id:'disk-n1',name:'local-lvm',node:'n1',usage:95}]}},[{id:'cpu',provider:'proxmox',metric:'cpu',threshold:90,severity:'critical',name:'CPU'},{id:'disk',provider:'proxmox',metric:'storage',threshold:90,severity:'critical',name:'Disk'}]);
 assert.equal(conditions.length,2);assert.ok(conditions.every(a=>a.node==='n1'));assert.equal(conditions.find(a=>a.metric==='storage').source,'local-lvm');
});
import {createMonitor} from '../src/monitor.js';
test('monitor refresh adds node ownership to existing threshold alert records',async()=>{
 const state={metrics:[],rules:[{id:'disk',provider:'proxmox',metric:'storage',threshold:90,severity:'critical',name:'Disk'}],alerts:[{id:'existing',key:'rule:disk:proxmox:disk-n1',status:'active',provider:'proxmox',source:'local-lvm'}]};
 const monitor=createMonitor({proxmox:{configured:()=>true,read:async()=>({nodes:[],storage:[{id:'disk-n1',name:'local-lvm',node:'n1',usage:95}],errors:[]})}},{get:()=>state,mutate:fn=>fn(state)},async()=>[]);
 const result=await monitor.sample(true);assert.equal(result.alerts[0].id,'existing');assert.equal(result.alerts[0].node,'n1');
});
