import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';import crypto from 'node:crypto';import ssh2 from 'ssh2';
import {bootstrapGuest,bootstrapIdentity,enableAgentOption} from '../src/guest-bootstrap.js';
const mac='52:54:00:12:34:56',config={net0:'virtio='+mac,agent:'enabled=0,freeze-fs-on-backup=0',digest:'fixture-digest'};
const preflight='HC_UID=0\nHC_OS=ubuntu\nHC_MAC='+mac+'\n';
const fingerprint='SHA256:'+crypto.createHash('sha256').update('fixture-key').digest('base64').replace(/=+$/,'');
const input={node:'n1',vmid:'101',host:'192.0.2.10',username:'root',password:'fixture-password',fingerprint};
function fixture(output=preflight,channel='ready'){
 const calls=[],runs=[];let ended=false;
 const client=new EventEmitter();client.connect=options=>{assert.equal(options.hostVerifier(Buffer.from('fixture-key')),true);queueMicrotask(()=>client.emit('ready'));};client.end=()=>ended=true;
 const query=async(path,init)=>{calls.push({path,init});if(path==='/cluster/resources')return [{node:'n1',vmid:101,type:'qemu'}];if(path.endsWith('/status/current'))return {status:'running'};if(path.endsWith('/config')&&!init)return config;return {};};
 const run=async(_c,user,password,script)=>{runs.push({user,password,script});return runs.length===1?output:'Docker setup verified\nHC_AGENT='+channel+'\n'};
 return {query,run,clientFactory:()=>client,calls,runs,ended:()=>ended};
}
test('verified VM setup preserves agent options and digest, uses fixed scripts and returns no credentials',async()=>{
 const f=fixture();const result=await bootstrapGuest(input,f);const write=f.calls.find(c=>c.init?.method==='PUT');assert.equal(write.init.body.get('agent'),'enabled=1,freeze-fs-on-backup=0');assert.equal(write.init.body.get('digest'),'fixture-digest');assert.equal(result.agentVerified,true);assert.equal(result.requiresPowerCycle,false);assert.equal(f.runs.length,2);assert.ok(!JSON.stringify(result).includes(input.password));assert.ok(!f.calls.some(c=>/status\/(stop|shutdown|reboot|start)/.test(c.path)));assert.equal(f.ended(),true);
});
test('wrong SSH VM, unsupported OS and insufficient privilege stop before provider writes or installer',async()=>{
 for(const output of [preflight.replace(mac,'52:54:00:00:00:00'),preflight.replace('ubuntu','fedora'),preflight.replace('HC_UID=0','HC_UID=1000')]){const f=fixture(output);await assert.rejects(()=>bootstrapGuest(input,f));assert.equal(f.runs.length,1);assert.equal(f.calls.filter(c=>c.init).length,0);assert.equal(f.ended(),true);}
 assert.throws(()=>bootstrapIdentity({...config,smbios1:'uuid=real-uuid'},preflight+'HC_UUID=other-uuid\n'),/does not match/);
});
test('missing channel reports a power-cycle requirement without starting or stopping VM',async()=>{const f=fixture(preflight,'needs-power-cycle');const result=await bootstrapGuest(input,f);assert.equal(result.requiresPowerCycle,true);assert.equal(result.agentVerified,false);assert.ok(!f.calls.some(c=>/agent\/get-osinfo/.test(c.path)));});
test('guest moved or stopped fails before SSH or any write',async()=>{const f=fixture();const old=f.query;f.query=async(p,i)=>p==='/cluster/resources'?[]:old(p,i);await assert.rejects(()=>bootstrapGuest(input,f),/does not belong/);assert.equal(f.runs.length,0);const g=fixture();const query=g.query;g.query=async(p,i)=>p.endsWith('/status/current')?{status:'stopped'}:query(p,i);await assert.rejects(()=>bootstrapGuest(input,g),/Start this VM/);assert.equal(g.runs.length,0);});
test('agent option helper preserves unrelated options',()=>{assert.equal(enableAgentOption('0,type=virtio'),'enabled=1,type=virtio');assert.equal(enableAgentOption(undefined),'enabled=1');});
test('real SSH transport supports sudo without putting credentials in command arguments',async()=>{
 const {privateKey,publicKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});const key=privateKey.export({type:'pkcs1',format:'pem'});const commands=[],clients=[];
 const server=new ssh2.Server({hostKeys:[key]},client=>{clients.push(client);client.on('error',()=>{});client.on('authentication',ctx=>ctx.username==='ubuntu'&&ctx.password===input.password?ctx.accept():ctx.reject());client.on('ready',()=>client.on('session',accept=>{const session=accept();session.on('exec',(accept,_reject,info)=>{commands.push(info.command);const stream=accept();let received='';stream.on('data',chunk=>received+=chunk);stream.on('end',()=>{assert.ok(received.startsWith(input.password+'\n'));assert.equal(received,input.password+'\n');stream.write(info.command.includes('HC_OS=')?preflight:'Docker setup verified\nHC_AGENT=ready\n');stream.exit(0);stream.end();});});}));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const f=fixture();const fp='SHA256:'+crypto.createHash('sha256').update(ssh2.utils.parseKey(key).getPublicSSH()).digest('base64').replace(/=+$/,'');
 try{const result=await bootstrapGuest({...input,host:'127.0.0.1',port:server.address().port,username:'ubuntu',fingerprint:fp},{query:f.query});assert.equal(result.agentVerified,true);assert.equal(commands.length,2);assert.ok(commands.every(c=>c.startsWith("sudo -S -p '' /bin/sh -c '")&&!c.includes(input.password)));}finally{for(const c of clients)c.end();await new Promise(r=>server.close(r));}
});
test('concurrent setup for the same VM is rejected and lock releases after completion',async()=>{
 const f=fixture();let release;const old=f.run;f.run=async(...args)=>{if(!f.runs.length){f.runs.push({script:args[3]});await new Promise(r=>release=r);return preflight;}return old(...args)};
 const pending=bootstrapGuest(input,f);await new Promise(r=>setTimeout(r,0));await assert.rejects(()=>bootstrapGuest(input,fixture()),e=>e.status===409);release();await pending;const g=fixture();await bootstrapGuest(input,g);assert.equal(g.ended(),true);
});
test('installer failure returns no success or credentials and performs no power action',async()=>{
 const f=fixture();const old=f.run;f.run=async(...args)=>{if(f.runs.length)throw Error('Fixture package failure');return old(...args)};await assert.rejects(()=>bootstrapGuest(input,f),/package failure/);assert.equal(f.ended(),true);assert.ok(!f.calls.some(c=>/status\/(start|stop|reboot|shutdown)/.test(c.path)));
});
test('non-VirtIO agent channels require review before any SSH or configuration write',async()=>{
 const f=fixture();const old=f.query;f.query=async(p,i)=>p.endsWith('/config')&&!i?{...config,agent:'enabled=0,type=isa'}:old(p,i);await assert.rejects(()=>bootstrapGuest(input,f),/ISA channel/);assert.equal(f.runs.length,0);assert.equal(f.calls.filter(c=>c.init).length,0);
});
