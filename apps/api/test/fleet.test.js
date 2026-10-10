import test from 'node:test';
import assert from 'node:assert/strict';
import {createDockerFleet,monitoredDocker} from '../src/docker-fleet.js';
import {selectedAgentHost,agentContext} from '../src/node-agents.js';
import {createMonitor,alertConditions} from '../src/monitor.js';
import {discovered} from '../src/discovery.js';
const inventory=(name,cpu=90)=>({host:{hostname:name,engineId:name},containers:[{id:'same-id',name:'app',status:'running',cpu,memoryPercent:80}],volumes:[],networks:[]});
test('fleet samples hosts in isolated contexts, retains partial success and detects offline hosts',async()=>{
 let list=[{id:'a',node:'node01',name:'first',online:true},{id:'b',node:'node02',name:'second',online:true}];
 const read=createDockerFleet({hosts:()=>list,read:async()=>{const host=selectedAgentHost();if(host==='b')throw Error('unavailable');return inventory(host)}});
 const data=await agentContext.run({host:'caller'},()=>read());assert.equal(data.hosts[0].status,'reachable');assert.equal(data.hosts[1].status,'error');
 list[0].online=false;const offline=await read();assert.equal(offline.hosts[0].status,'error');assert.ok(offline.hosts[0].lastSeen);
 list=[];assert.deepEqual((await read()).hosts,[]);
});
test('identical container IDs remain separate across hosts and the same Engine is deduplicated',()=>{
 const s={docker:inventory('direct'),dockerFleet:{hosts:[{id:'a',status:'reachable',inventory:inventory('engine-a')},{id:'b',status:'reachable',inventory:inventory('engine-b')},{id:'alias',status:'reachable',inventory:inventory('direct')}]}};
 assert.equal(monitoredDocker(s).length,3);assert.equal(new Set(monitoredDocker(s).map(c=>c.monitorId)).size,3);
 const resources=discovered(s).resources;assert.equal(resources.length,3);assert.equal(new Set(resources.map(r=>r.id)).size,3);
 const alerts=alertConditions({...s,services:[]},[{id:'cpu',name:'CPU',metric:'cpu',threshold:85,provider:'docker'}]);
 assert.equal(alerts.length,3);assert.equal(new Set(alerts.map(a=>a.key)).size,3);
});
test('host threshold alerts survive its outage and resolve only after that host reports recovery',async()=>{
 const state={rules:[{id:'cpu',name:'CPU',metric:'cpu',threshold:85,provider:'docker'}],alerts:[],metrics:[]};let offline=false,cpu=90;
 const monitor=createMonitor({}, {get:()=>state,mutate:fn=>fn(state)},async()=>[],async()=>({hosts:[
  offline?{id:'a',node:'node01',name:'first',status:'error',error:'offline'}:{id:'a',node:'node01',name:'first',status:'reachable',inventory:inventory('a',cpu)},
  {id:'b',node:'node02',name:'second',status:'reachable',inventory:inventory('b',10)}]}));
 await monitor.sample(true);const alert=state.alerts.find(a=>a.key.startsWith('rule:'));assert.equal(alert.status,'active');assert.equal(state.metrics[0].docker.length,2);
 offline=true;await monitor.sample(true);assert.equal(alert.status,'active');
 offline=false;cpu=10;await monitor.sample(true);assert.equal(alert.status,'resolved');
});
test('a paired node that has not polled is monitored as offline',async()=>{
 const fleet=createDockerFleet({hosts:()=>[],nodes:()=>[{id:'paired',name:'node01',online:false}],read:async()=>{throw Error('must not query offline agent')}});
 const r=await fleet();assert.equal(r.hosts[0].id,'paired:node-agent');assert.equal(r.hosts[0].status,'error');
});
test('partial statistics remain visible without claiming that missing metrics recovered',async()=>{
 const fleet=createDockerFleet({hosts:()=>[{id:'a',online:true}],read:async()=>({...inventory('a'),errors:['statistics unavailable']})});
 const result=await fleet();assert.equal(result.hosts[0].status,'partial');assert.equal(monitoredDocker({dockerFleet:result}).length,1);
});
test('missing CPU measurements do not resolve a Docker threshold alert',async()=>{
 let cpu=90;const state={rules:[{id:'cpu',name:'CPU',metric:'cpu',threshold:85,provider:'docker'}],alerts:[],metrics:[]};
 const monitor=createMonitor({}, {get:()=>state,mutate:fn=>fn(state)},async()=>[],async()=>({hosts:[{id:'a',status:'reachable',inventory:inventory('a',cpu)}]}));
 await monitor.sample(true);cpu=null;await monitor.sample(true);assert.equal(state.alerts[0].status,'active');
 cpu=10;await monitor.sample(true);assert.equal(state.alerts[0].status,'resolved');
});
