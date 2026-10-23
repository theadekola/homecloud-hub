import test from 'node:test';import assert from 'node:assert/strict';
import {guestAddresses,createGuestAddressReader} from '../src/guest-addresses.js';
test('runtime host addresses strip prefixes and exclude loopback, link-local and nested Docker networks',()=>{
 assert.deepEqual(guestAddresses({result:[{name:'eth0','ip-addresses':[{'ip-address':'192.0.2.20'},{'ip-address':'2001:db8::20'},{'ip-address':'fe80::1'}]},{name:'lo','ip-addresses':[{'ip-address':'127.0.0.1'}]},{name:'docker0','ip-addresses':[{'ip-address':'172.17.0.1'}]}]}),['192.0.2.20','2001:db8::20']);
 assert.deepEqual(guestAddresses([{name:'eth0',inet:'192.0.2.30/24',inet6:'2001:db8::30/64'}]),['192.0.2.30','2001:db8::30']);assert.deepEqual(guestAddresses([{name:'br-lan',inet:'192.0.2.1/24'}]),['192.0.2.1']);assert.deepEqual(guestAddresses({net0:'ip=192.0.2.0/24'}),[]);
});
test('guest address readings are node/type scoped, fresh and removed on failed reads or offline state',async()=>{
 let now=100000,fail=false;const read=createGuestAddressReader({clock:()=>now,ttl:10,fresh:20}),guests=[{node:'a',type:'qemu',vmid:100,status:'running'},{node:'b',type:'lxc',vmid:100,status:'running'}],paths=[];
 const query=async(path,options)=>{paths.push(path);assert.equal(options.timeoutMs,3000);if(fail)throw Error('denied');return [{name:'eth0',inet:path.includes('/a/')?'192.0.2.10/24':'192.0.2.20/24'}]};
 let result=await read(guests,query,'one');assert.deepEqual(result.get('a/qemu/100').addresses,['192.0.2.10']);assert.deepEqual(result.get('b/lxc/100').addresses,['192.0.2.20']);assert.ok(paths.includes('/nodes/a/qemu/100/agent/network-get-interfaces'));assert.ok(paths.includes('/nodes/b/lxc/100/interfaces'));
 assert.deepEqual((await read([{...guests[0],nodeAvailable:false}],query,'one')).get('a/qemu/100').addresses,[]);
 now+=11;fail=true;result=await read(guests,query,'one');assert.deepEqual(result.get('a/qemu/100').addresses,[]);assert.equal(result.get('a/qemu/100').addressStatus,'unavailable');
 const separate=await read(guests,query,'new-connection');assert.deepEqual(separate.get('a/qemu/100').addresses,[]);
});
test('slow optional IP discovery does not block inventory and never reuses stale samples',async()=>{
 let now=100000,release;const read=createGuestAddressReader({budget:1,ttl:10,fresh:20,clock:()=>now}),guest={node:'a',type:'qemu',vmid:1,status:'running'};
 await read([guest],async()=>[{name:'eth0',inet:'192.0.2.10/24'}],'one');now+=30;
 const result=await read([guest],()=>new Promise(r=>release=r),'one');assert.equal(result.get('a/qemu/1').addressStatus,'stale');assert.deepEqual(result.get('a/qemu/1').addresses,[]);release([]);
});
