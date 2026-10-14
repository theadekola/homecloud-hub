import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import ssh2 from 'ssh2';
import {connectSSH,closeShell,sftpOperation} from '../src/ssh-access.js';
const {Server,utils:{sftp:{STATUS_CODE,OPEN_MODE}}}=ssh2;
test('SFTP transfers binary chunks, manages files, and isolates sessions by user',async()=>{
 const {privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
 const nodes=new Map([['/',{directory:true,data:Buffer.alloc(0)}]]),clients=[];
 const server=new Server({hostKeys:[privateKey.export({type:'pkcs1',format:'pem'})]},client=>{clients.push(client);client.on('error',()=>{});client.on('authentication',ctx=>ctx.method==='password'&&ctx.password==='correct'?ctx.accept():ctx.reject());client.on('ready',()=>client.on('session',accept=>{const session=accept();session.on('sftp',accept=>{
  const stream=accept(),handles=new Map();let number=0;const ok=id=>stream.status(id,STATUS_CODE.OK),fail=id=>stream.status(id,STATUS_CODE.FAILURE),attrs=n=>({mode:n.directory?0o040755:0o100644,size:n.data.length,mtime:1700000000,atime:1700000000,uid:0,gid:0});
  const handle=(id,value)=>{const buffer=Buffer.alloc(4);buffer.writeUInt32BE(++number);handles.set(number,value);stream.handle(id,buffer)};
  stream.on('OPENDIR',(id,p)=>nodes.get(p)?.directory?handle(id,{path:p,directory:true,read:false}):fail(id));
  stream.on('READDIR',(id,h)=>{const state=handles.get(h.readUInt32BE());if(state.read)return stream.status(id,STATUS_CODE.EOF);state.read=true;stream.name(id,[...nodes].filter(([p])=>p!=='/'&&p.slice(0,p.lastIndexOf('/'))===(state.path==='/'?'':state.path)).map(([p,n])=>({filename:p.slice(p.lastIndexOf('/')+1),longname:'',attrs:attrs(n)})))});
  stream.on('OPEN',(id,p,flags)=>{if(flags&OPEN_MODE.EXCL&&nodes.has(p))return fail(id);if(flags&OPEN_MODE.CREAT)nodes.set(p,{directory:false,data:Buffer.alloc(0)});if(!nodes.has(p))return fail(id);handle(id,{path:p})});
  stream.on('WRITE',(id,h,offset,data)=>{const n=nodes.get(handles.get(h.readUInt32BE()).path),buffer=Buffer.alloc(Math.max(n.data.length,offset+data.length));n.data.copy(buffer);data.copy(buffer,offset);n.data=buffer;ok(id)});
  stream.on('READ',(id,h,offset,length)=>{const data=nodes.get(handles.get(h.readUInt32BE()).path).data;if(offset>=data.length)return stream.status(id,STATUS_CODE.EOF);stream.data(id,data.subarray(offset,offset+length))});
  stream.on('CLOSE',(id,h)=>{handles.delete(h.readUInt32BE());ok(id)});
  stream.on('MKDIR',(id,p)=>{if(nodes.has(p))return fail(id);nodes.set(p,{directory:true,data:Buffer.alloc(0)});ok(id)});
  stream.on('RENAME',(id,p,to)=>{nodes.set(to,nodes.get(p));nodes.delete(p);ok(id)});
  stream.on('LSTAT',(id,p)=>nodes.has(p)?stream.attrs(id,attrs(nodes.get(p))):fail(id));
  const remove=(id,p)=>{nodes.delete(p);ok(id)};stream.on('REMOVE',remove);stream.on('RMDIR',remove);
 });}));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const input={host:'127.0.0.1',port:server.address().port,username:'root',password:'correct',target:'node:test',mode:'sftp'};let id;
 try{let fingerprint;await assert.rejects(()=>connectSSH(input,'alice'),e=>{fingerprint=e.fingerprint;return e.status===409});({id}=await connectSSH({...input,fingerprint},'alice'));const op=body=>sftpOperation(id,'alice',body);await assert.rejects(()=>sftpOperation(id,'bob',{action:'list',path:'/'}),e=>e.status===404);await assert.rejects(()=>op({action:'list',path:'relative'}),/absolute/);await op({action:'mkdir',path:'/folder'});const binary=crypto.randomBytes(262144);await op({action:'write',path:'/binary',offset:0,data:binary.toString('base64')});await op({action:'write',path:'/binary',offset:binary.length,data:Buffer.from('tail').toString('base64')});assert.deepEqual(await op({action:'stat',path:'/binary'}),{size:binary.length+4,file:true,link:false});assert.deepEqual(await op({action:'stat',path:'/folder'}),{size:0,file:false,link:false});await assert.rejects(()=>sftpOperation(id,'bob',{action:'stat',path:'/binary'}),e=>e.status===404);assert.deepEqual(Buffer.from((await op({action:'read',path:'/binary',offset:0})).data,'base64'),binary);const tail=await op({action:'read',path:'/binary',offset:binary.length});assert.equal(Buffer.from(tail.data,'base64').toString(),'tail');assert.equal(tail.done,false);assert.equal((await op({action:'read',path:'/binary',offset:binary.length+4})).done,true);await assert.rejects(()=>op({action:'write',path:'/binary',offset:0,data:''}));await op({action:'write',path:'/binary',offset:0,data:Buffer.from('replaced').toString('base64'),replace:true});assert.equal(Buffer.from((await op({action:'read',path:'/binary',offset:0})).data,'base64').toString(),'replaced');await op({action:'rename',path:'/binary',destination:'/renamed'});const listed=await op({action:'list',path:'/'});assert.deepEqual(listed.entries.map(e=>e.name),['folder','renamed']);assert.equal(listed.entries[0].directory,true);await op({action:'delete',path:'/renamed'});await op({action:'delete',path:'/folder'});assert.deepEqual((await op({action:'list',path:'/'})).entries,[]);assert.deepEqual(await op({action:'keepalive'}),{ok:true});}finally{if(id)closeShell(id,'alice');for(const client of clients)client.end();server.close();}
});

