import test from 'node:test';
import assert from 'node:assert/strict';
import {shareInventory,shareInput,shareWrite,detectedShare} from '../src/shares.js';
test('shares retain protocol identity and distinguish remote mounts from exports',async()=>{
 const r=await shareInventory({truenasEnabled:true,proxmox:true,tn:async m=>m==='sharing.smb.query'?[{id:1,name:'media',path:'/mnt/tank/media',enabled:true}]:m==='sharing.nfs.query'?[{id:1,path:'/mnt/tank/media',enabled:false,ro:true,networks:['192.0.2.0/24']}]:[{id:3,service:'cifs',state:'RUNNING'}],query:async()=>[{type:'nfs',storage:'remote',server:'192.0.2.10',export:'/media',disable:1},{type:'dir',storage:'local'}]});
 assert.equal(r.resources.length,3);assert.equal(new Set(r.resources.map(s=>s.id)).size,3);assert.equal(r.resources[2].protocol,'NFS mount');assert.equal(r.resources[2].enabled,false);assert.equal(r.resources[0].readonly,null);assert.equal(r.services[0].state,'RUNNING');
});
test('one share query failure retains other protocols and records missing service status',async()=>{
 const r=await shareInventory({truenasEnabled:true,tn:async m=>{if(m==='sharing.nfs.query')return [{id:2,path:'/mnt/tank/nfs',enabled:true}];throw Error('denied')}});assert.equal(r.resources.length,1);assert.equal(r.errors.length,2);assert.equal(r.services.length,0);
});
test('share writes whitelist fields, reject unsafe paths and require NFS restrictions',()=>{
 assert.deepEqual(shareInput('smb',{name:'media',path:'/mnt/tank/media',enabled:true,guestok:true,options:{guest:true}}),{name:'media',path:'/mnt/tank/media',comment:'',enabled:true});
 for(const path of ['/etc','/mnt/../etc','/mnt/tank/./media'])assert.throws(()=>shareInput('smb',{name:'media',path}));assert.throws(()=>shareInput('nfs',{path:'/mnt/tank/media',networks:[]}));assert.throws(()=>shareInput('nfs',{path:'/mnt/tank/media',networks:['all']}));assert.throws(()=>shareInput('ftp',{}));
});
test('share actions use detected ID and existing directory, not caller-supplied arbitrary permissions path',async()=>{
 const calls=[];const tn=async(m,p)=>{calls.push([m,p]);if(m==='filesystem.stat')return {type:'DIRECTORY'};if(m.endsWith('.query'))return [{id:4,path:'/mnt/tank/media'}];return {id:4}};
 await shareWrite('smb',4,{name:'updated',path:'/mnt/tank/media',enabled:false},tn);assert.equal(calls.at(-1)[0],'sharing.smb.update');assert.equal(calls.at(-1)[1][0],4);
 assert.equal((await detectedShare('smb',4,tn)).path,'/mnt/tank/media');await assert.rejects(detectedShare('smb',5,tn),/not found/);await assert.rejects(shareWrite('smb',null,{name:'file',path:'/mnt/tank/file'},async()=>({type:'FILE'})),/existing directory/);
});

test('NFS accepts IPv4 and IPv6 CIDRs with boundary prefixes without rewriting them',()=>{
 const networks=['192.0.2.0/24','192.0.2.7/32','0.0.0.0/0','192.0.2.7/24',
  '2001:db8::/64','2001:db8::1/128','::/0','::1/128',
  '2001:0db8:0000:0000:0000:0000:0000:0001/64','::ffff:192.0.2.1/128'];
 assert.deepEqual(shareInput('nfs',{path:'/mnt/tank/media',networks,ro:true,enabled:false,hosts:['*']}),
  {path:'/mnt/tank/media',comment:'',networks,ro:true,enabled:false});
});
test('NFS rejects malformed and unsafe network entries with HTTP 400',()=>{
 const invalid=['not-an-ip/999','not-an-ip/24','256.0.0.1/24','192.0.2/24',
  '192.000.2.1/24','192.0.2.1/33','2001:db8::/129','2001:db8:::1/64',
  '2001:db8::gg/64','::ffff:999.0.0.1/128','192.0.2.0','192.0.2.0/',
  '/24','192.0.2.0/24/1','192.0.2.0/-1','::/+64','::/1.5','::/1e2',
  '::/0x40','::/064','::/999999999999999999999',' 192.0.2.0/24',
  '192.0.2.0/24 ','192.0.2.0/2\t4','192.0.2.0/24\n','::/64\r',
  '192.0.2.0/24\0','fe80::1%eth0/64','fe80::1%1/64','[2001:db8::]/64',
  '*/0','example.com/24','192.0.2.0/24;touch /tmp/test','$(id)/24',
  null,undefined,24,{},['192.0.2.0/24']];
 for(const network of invalid)assert.throws(()=>shareInput('nfs',{
  path:'/mnt/tank/media',networks:['192.0.2.0/24',network]}),
  error=>error.status===400&&/CIDR/.test(error.message),String(network));
 assert.throws(()=>shareInput('nfs',{path:'/mnt/tank/media',networks:Array(1)}),{status:400});
 for(const networks of [undefined,null,'192.0.2.0/24',[]])
  assert.throws(()=>shareInput('nfs',{path:'/mnt/tank/media',networks}),/at least one/);
});
test('invalid NFS CIDRs stop creates and updates before any provider call',async()=>{
 for(const id of [null,4]){
  const calls=[];
  await assert.rejects(shareWrite('nfs',id,{path:'/mnt/tank/media',networks:['not-an-ip/999']},
   async(...args)=>{calls.push(args);throw Error('Provider must not be called')}),{status:400});
  assert.deepEqual(calls,[]);
 }
});
test('valid NFS create and update retain directory checks and provider payloads',async()=>{
 for(const id of [null,4]){
  const calls=[];const input={path:'/mnt/tank/media',networks:['192.0.2.0/24','2001:db8::/64'],ro:true};
  const tn=async(method,params)=>{calls.push([method,params]);
   if(method==='filesystem.stat')return {type:'DIRECTORY'};
   if(method==='sharing.nfs.query')return [{id:4,path:input.path}];return {id:4};};
  await shareWrite('nfs',id,input,tn);
  assert.deepEqual(calls[0],['filesystem.stat',[input.path]]);
  const body={path:input.path,comment:'',ro:true,networks:input.networks};
  assert.deepEqual(calls.at(-1),id===null?['sharing.nfs.create',[body]]:['sharing.nfs.update',[id,body]]);
  await assert.rejects(shareWrite('nfs',id,input,async()=>({type:'FILE'})),/existing directory/);
 }
 for(const path of ['/etc','/mnt/../etc','/mnt/tank/./media','/mnt/tank/media\0'])
  assert.throws(()=>shareInput('nfs',{path,networks:['192.0.2.0/24']}),{status:400});
});
test('SMB keeps name validation and ignores NFS-only inputs',()=>{
 assert.deepEqual(shareInput('smb',{name:'media',path:'/mnt/tank/media',networks:['not-an-ip/999'],ro:true}),
  {name:'media',path:'/mnt/tank/media',comment:''});
 for(const name of ['', 'bad/name', 'bad\\name', 'bad\0name', 'x'.repeat(81)])
  assert.throws(()=>shareInput('smb',{name,path:'/mnt/tank/media'}),{status:400});
});
