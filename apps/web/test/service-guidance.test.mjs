import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';
const {outputFiles}=await build({entryPoints:[new URL('../src/service-guidance.ts',import.meta.url).pathname],bundle:true,format:'esm',write:false});const {serviceGuidance}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
test('connector warnings give relevant guidance without unrelated Proxmox permission advice',()=>{
 for(const error of ['Docker host or its node agent is offline','app: statistics unavailable','Docker inventory request timed out','Docker HTTP 403: Engine access rejected','Docker inventory unavailable; inspect the selected host and node agent']){const help=serviceGuidance({provider:'docker',status:'error',error});assert.ok(help.length>20);assert.doesNotMatch(help,/PVEAuditor|Datacenter/)}
 assert.match(serviceGuidance({provider:'docker',error:'offline'}),/homecloud-node-agent.service/);
 assert.match(serviceGuidance({provider:'docker',error:'app: statistics unavailable'}),/inventory is connected/);
 assert.match(serviceGuidance({provider:'proxmox',error:'Proxmox HTTP 403'}),/PVEAuditor/);
 assert.match(serviceGuidance({provider:'truenas',error:'offline'}),/provider/);
});
