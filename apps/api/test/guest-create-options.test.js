import test from 'node:test';import assert from 'node:assert/strict';
import {guestNetwork,ctExtra,guestGeneral,allocateGuestId,creationOptions,registerCreation,completeCreationHa} from '../src/guest-create-options.js';
import {proxmoxCreateVm,proxmoxCreateCt} from '../src/connectors.js';
test('VM and CT network fields serialize without accepting injected or incompatible options',()=>{
 assert.equal(guestNetwork({bridge:'vmbr0',networkModel:'e1000',mac:'02:aa:bb:cc:dd:ee',vlan:'10',firewall:'1'},'vm'),'e1000=02:AA:BB:CC:DD:EE,bridge=vmbr0,tag=10,firewall=1');assert.equal(guestNetwork({noNetwork:'1'},'vm'),undefined);
 assert.equal(guestNetwork({bridge:'vmbr0',interfaceName:'eth1',ipv4Mode:'static',ipv4:'192.0.2.20/24',gateway4:'192.0.2.1',ipv6Mode:'slaac',vlan:20,firewall:0},'ct'),'name=eth1,bridge=vmbr0,ip=192.0.2.20/24,ip6=auto,tag=20,firewall=0,gw=192.0.2.1');
 for(const input of [{vlan:4095},{mac:'ff:ff:ff:ff:ff:ff'},{bridge:'vmbr0,tag=20'},{ipv4Mode:'static',ipv4:'192.0.2.1/33'},{ipv4Mode:'dhcp',gateway4:'192.0.2.1'},{ipv6Mode:'static',ipv6:'2001:db8::1/129'},{interfaceName:'eth0,ip=dhcp'}])assert.throws(()=>guestNetwork(input,'ct'));
 assert.throws(()=>guestNetwork({networkModel:'arbitrary'},'vm'));
});
test('CT options preserve safe defaults, confirm passwords and validate DNS/public keys',()=>{
 assert.equal(ctExtra({}).unprivileged,1);const result=ctExtra({unprivileged:'0',nesting:'1',password:'fixture',confirmPassword:'fixture',nameserver:'192.0.2.53 2001:db8::53',searchdomain:'home.example'});assert.equal(result.unprivileged,0);assert.equal(result.features,'nesting=1');assert.equal(result.nameserver,'192.0.2.53 2001:db8::53');
 for(const input of [{password:'one',confirmPassword:'two'},{nameserver:'not-an-ip'},{searchdomain:'home,domain'},{sshKey:'-----BEGIN PRIVATE KEY-----'},{unprivileged:'invalid'}])assert.throws(()=>ctExtra(input));
});
test('manual guest IDs never replace existing VM or CT identities and resource pools are verified',async()=>{
 assert.equal(await allocateGuestId({guestId:'107'},async()=>[]),107);assert.equal(await allocateGuestId({},async p=>{assert.equal(p,'/cluster/nextid');return 108}),108);
 for(const kind of ['qemu','lxc'])await assert.rejects(()=>allocateGuestId({guestId:107},async()=>[{type:kind,vmid:107}]),e=>e.status===409);
 await assert.rejects(()=>allocateGuestId({guestId:99},async()=>[]));await assert.rejects(()=>allocateGuestId({guestId:107},async()=>null));
 assert.deepEqual(await guestGeneral({pool:'Apps'},async p=>{assert.equal(p,'/pools');return [{poolid:'Apps'}]}),{pool:'Apps'});await assert.rejects(()=>guestGeneral({pool:'missing'},async()=>[]));
});
test('creation discovery keeps node-scoped bridges and reports permission failures',async()=>{
 const result=await creationOptions('node02',async p=>p==='/pools'?[{poolid:'Apps'}]:p==='/cluster/nextid'?107:[{iface:'vmbr0',type:'bridge'},{iface:'eno1',type:'eth'}]);assert.equal(result.node,'node02');assert.deepEqual(result.bridges,[{name:'vmbr0'}]);assert.equal(result.nextId,107);
 const denied=await creationOptions('node01',async()=>{throw Error('403 fixture')});assert.equal(denied.errors.length,3);assert.deepEqual(denied.pools,[]);
});
test('HA is bound to a new creation receipt, waits for success and keeps the desired state stopped',async()=>{
 const created=registerCreation({node:'node02',vmid:'107',task:'UPID:new'},'ct','owner-one'),writes=[];let running=true,placement=true;
 const query=async(p,init)=>{if(init){writes.push({p,init});return null}if(p.endsWith('/status/current'))return {status:'stopped'};if(p.includes('/tasks/'))return running?{status:'running'}:{status:'stopped',exitstatus:'OK'};return placement?[{node:'node02',vmid:107,type:'lxc'}]:[]};
 await assert.rejects(()=>completeCreationHa(created.ha.receipt,'other-user',query),e=>e.status===404);assert.equal((await completeCreationHa(created.ha.receipt,'owner-one',query)).state,'pending');assert.equal(writes.length,0);
 running=false;placement=false;await assert.rejects(()=>completeCreationHa(created.ha.receipt,'owner-one',query));assert.equal(writes.length,0);placement=true;assert.equal((await completeCreationHa(created.ha.receipt,'owner-one',query)).state,'configured');assert.equal(writes[0].p,'/cluster/ha/resources');assert.equal(new URLSearchParams(writes[0].init.body).get('state'),'stopped');assert.equal(new URLSearchParams(writes[0].init.body).get('sid'),'ct:107');await completeCreationHa(created.ha.receipt,'owner-one',query);assert.equal(writes.length,1);
 const failed=registerCreation({node:'node02',vmid:'108',task:'UPID:failed'},'vm','owner-one');await assert.rejects(()=>completeCreationHa(failed.ha.receipt,'owner-one',async()=>({status:'stopped',exitstatus:'ERROR'})));assert.equal(writes.length,1);
});
test('extended creation sends IDs, pools, VM NIC and LXC network/security settings to Proxmox',async()=>{
 for(const kind of ['vm','ct']){const writes=[],payload={node:'n1',name:'fixture',storage:'local',guestId:'107',pool:'Apps',vlan:10,mac:'02:11:22:33:44:55',firewall:'1',networkModel:'e1000',ostemplate:'local:vztmpl/os.tar.zst',password:'fixture-password',confirmPassword:'fixture-password',unprivileged:'1',nesting:'1',ipv4Mode:'static',ipv4:'192.0.2.10/24',gateway4:'192.0.2.1',nameserver:'192.0.2.53'};
 const call=async(p,init)=>{if(init){writes.push(init);return 'UPID:new'}if(p==='/pools')return [{poolid:'Apps'}];if(p==='/cluster/resources')return [];if(p.endsWith('/storage'))return [{storage:'local',active:1,enabled:1,content:'images,rootdir,vztmpl'}];if(p.includes('/content'))return [{volid:payload.ostemplate,content:'vztmpl'}];throw Error('Unexpected '+p)};
 const result=await(kind==='vm'?proxmoxCreateVm:proxmoxCreateCt)(payload,call),body=new URLSearchParams(writes[0].body);assert.equal(result.vmid,'107');assert.equal(body.get('pool'),'Apps');assert.equal(body.get('force'),null);assert.equal(body.get('start'),'0');if(kind==='ct'){assert.equal(body.get('features'),'nesting=1');assert.equal(body.get('unprivileged'),'1');assert.ok(body.get('net0').includes('ip=192.0.2.10/24'));assert.equal(body.get('nameserver'),'192.0.2.53');assert.equal(JSON.stringify(result).includes(payload.password),false)}else assert.ok(body.get('net0').startsWith('e1000=02:11:22:33:44:55'));}
});

test('HA follow-up refuses a newly started guest without issuing power or HA writes',async()=>{
 const created=registerCreation({node:'n1',vmid:'109',task:'UPID:new'},'vm','owner'),calls=[];await assert.rejects(()=>completeCreationHa(created.ha.receipt,'owner',async(p,init)=>{calls.push({p,init});if(p.includes('/tasks/'))return {status:'stopped',exitstatus:'OK'};if(p==='/cluster/resources')return [{node:'n1',vmid:109,type:'qemu'}];return {status:'running'};}),/remain stopped/);assert.ok(calls.every(c=>!c.init));
});

test('CT swap is optional, bounded and serialized with explicit zero preserved',async()=>{
 assert.equal(ctExtra({}).swap,undefined);assert.equal(ctExtra({swap:'0'}).swap,0);assert.equal(ctExtra({swap:'512'}).swap,512);
 for(const swap of [-1,1048577,1.5,'bad','512,other=1'])assert.throws(()=>ctExtra({swap}),/Swap/);
 for(const swap of ['0','512']){let write;await proxmoxCreateCt({node:'n1',storage:'local',ostemplate:'local:vztmpl/debian.tar.zst',name:'fixture',password:'fixture-password',swap},async(path,init)=>{if(init){write=init;return 'UPID:ct'}if(path.endsWith('/storage'))return [{storage:'local',content:'rootdir,vztmpl',active:1,enabled:1}];if(path.includes('/content'))return [{content:'vztmpl',volid:'local:vztmpl/debian.tar.zst'}];return 108});const body=new URLSearchParams(write.body);assert.equal(body.get('swap'),swap);assert.equal(body.get('start'),'0');assert.equal(body.get('onboot'),'0');}
});
