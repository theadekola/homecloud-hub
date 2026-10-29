import test from 'node:test';
import assert from 'node:assert/strict';
import {vpnGateways,requireVPNNode} from '../src/vpn-gateways.js';
const reading={receivedAt:1000,vpn:{status:'not-configured',peers:[]}};
const node={id:'node-agent',name:'Friendly name',hostname:'node01',kind:'proxmox',online:true,version:9,operations:reading};
const guests=[{...node,id:'vm',name:'node01',hostname:'control-vm'},{...node,id:'ct',hostname:'container'},{...node,id:'docker',kind:'docker'}];
const options={now:1000,query:async path=>{assert.equal(path,'/nodes');return [{node:'node01',status:'online'},{node:'node02',status:'offline'}]},agents:()=>[node,...guests]};
test('VPN gateways list actual Proxmox nodes and match connector hostname, never guest labels',async()=>{
 const view=await vpnGateways(options);assert.deepEqual(view.nodes.map(n=>n.name),['node01','node02']);assert.equal(view.nodes[0].agentId,'node-agent');assert.equal(view.nodes[0].status,'current');assert.equal(view.nodes[1].status,'pairing-required');assert.equal(view.nodes[1].agentId,null);
});
test('VPN writes reject VM CT standalone and unpaired identifiers',async()=>{
 for(const id of ['vm','ct','docker','proxmox:node02'])await assert.rejects(requireVPNNode(id,options),/paired Proxmox node/);
 assert.equal((await requireVPNNode('node-agent',options)).name,'node01');
});
test('discovery errors and duplicate connectors never fall back to a VM gateway',async()=>{
 await assert.rejects(vpnGateways({...options,query:async()=>{throw Error('unavailable')}}));
 await assert.rejects(vpnGateways({...options,query:async()=>({})}),/discovery/);
 const view=await vpnGateways({...options,agents:()=>[node,{...node,id:'duplicate'}]});assert.equal(view.nodes[0].status,'connector-conflict');assert.equal(view.nodes[0].agentId,null);
});
test('offline node state takes precedence over a current connector report',async()=>{
 const view=await vpnGateways({...options,query:async()=>[{node:'node01',status:'offline'}]});assert.equal(view.nodes[0].status,'offline');
 await assert.rejects(requireVPNNode('node-agent',{...options,query:async()=>[{node:'node01',status:'offline'}]}),/current Proxmox node connector/);
});
