import test from 'node:test';import assert from 'node:assert/strict';import {targetSSHHost} from '../src/ssh-target.js';
test('approval addresses are resolved from the cluster and guests must belong to the selected node',async()=>{const query=async path=>path==='/cluster/status'?[{type:'node',name:'pve',ip:'192.0.2.10'}]:path==='/cluster/resources'?[{type:'qemu',node:'pve',vmid:100}]:{result:[{'ip-addresses':[{'ip-address':'127.0.0.1'},{'ip-address':'192.0.2.20'}]}]};assert.equal(await targetSSHHost('node:pve',query),'192.0.2.10');assert.equal(await targetSSHHost('vm:pve:100',query),'192.0.2.20');await assert.rejects(()=>targetSSHHost('vm:other:100',query),e=>e.status===403);await assert.rejects(()=>targetSSHHost('node:unknown',query),e=>e.status===422)});

test('Docker SSH approval uses the selected connector host address and excludes Docker bridges',async()=>{
 const id='11111111-1111-4111-8111-111111111111',network={status:'ok',receivedAt:Date.now(),interfaces:[{name:'lo',addresses:['127.0.0.1/8']},{name:'docker0',addresses:['172.17.0.1/16']},{name:'br-abc',addresses:['172.18.0.1/16']},{name:'eth0',addresses:['192.168.10.100/24']}]};
 const reports=()=>[{id,kind:'docker',online:true,network}],query=()=>assert.fail('Standalone Docker approval must not resolve a Proxmox node IP');
 assert.equal(await targetSSHHost(`docker:${id}`,query,reports),'192.168.10.100');
 await assert.rejects(targetSSHHost('docker:missing',query,reports),{status:404});
 await assert.rejects(targetSSHHost(`docker:${id}`,query,()=>[{...reports()[0],online:false}]),{status:503});
 await assert.rejects(targetSSHHost(`docker:${id}`,query,()=>[{...reports()[0],network:{...network,receivedAt:Date.now()-100000}}]),{status:422});
 await assert.rejects(targetSSHHost(`docker:${id}`,query,()=>[{...reports()[0],network:{...network,interfaces:network.interfaces.slice(0,3)}}]),{status:422});
});
