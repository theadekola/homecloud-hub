import test from 'node:test';
import assert from 'node:assert/strict';
import {parseLinuxInventory,inspectGuests} from '../src/guest-discovery.js';
const output='__SERVICES__\nnginx.service loaded active running nginx\nbackup.service loaded inactive dead backup\n__PACKAGES__\nnginx\t1.24\tinstalled\nold\t1\tconfig-files\n__DOCKER__\n{"ID":"abc","Names":"nextcloud","Image":"nextcloud:apache","State":"running"}\n__END__\n';
test('automatic guest inventory runs only fixed read commands and caches actual results',async()=>{
 const parsed=parseLinuxInventory(output);assert.equal(parsed.services[0].status,'running');assert.equal(parsed.packages.length,1);assert.equal(parsed.containers[0].name,'nextcloud');
 const calls=[];const call=async(path,init)=>{calls.push({path,init});if(path.endsWith('get-osinfo'))return {result:{name:'Ubuntu'}};if(path.endsWith('/exec')){assert.equal(init.method,'POST');const command=JSON.parse(init.body).command;assert.equal(command[0],'/bin/sh');assert.ok(command[2].includes('docker ps'));assert.ok(!command[2].includes('apt-get'));return {pid:42};}return {exited:true,exitcode:0,'out-data':output};};
 const guests=[{id:'101',node:'pve',name:'vm01',status:'running'},{id:'102',status:'stopped'}];
 const result=await inspectGuests(guests,call,'fixture');assert.equal(result.reports[0].containers[0].name,'nextcloud');assert.equal(result.limitations.length,0);assert.equal(calls.length,3);await inspectGuests(guests,call,'fixture');assert.equal(calls.length,3);
});
test('missing guest access is reported without invented service inventory',async()=>{const result=await inspectGuests([{id:'103',node:'pve',name:'blocked',status:'running'}],async()=>{throw new Error('Proxmox HTTP 403');},'blocked-fixture');assert.equal(result.reports.length,0);assert.match(result.limitations[0],/403/);});
test('unsupported guest commands are distinguished from denied permissions',async()=>{
 const result=await inspectGuests([{id:'501',node:'pve',name:'unsupported',status:'running'}],async()=>{throw Object.assign(new Error('Proxmox HTTP 501'),{providerStatus:501})},'unsupported-fixture');
 assert.match(result.limitations[0],/does not support/);assert.doesNotMatch(result.limitations[0],/lacks guest-agent access/);
});
