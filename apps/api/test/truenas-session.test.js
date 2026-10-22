import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readTrueNASBatch} from '../src/truenas-session.js';
const env={TRUENAS_URL:'https://storage.test',TRUENAS_API_KEY:'fixture-private-key'};
function fixture(handler){const sockets=[],messages=[];class Socket extends EventEmitter{constructor(url,options){super();this.url=url;this.options=options;sockets.push(this);queueMicrotask(()=>this.emit('open'))}send(text){const message=JSON.parse(text);messages.push(message);queueMicrotask(()=>handler(this,message))}close(){this.closed=true}terminate(){this.terminated=true}}return {Socket,sockets,messages}}
const reply=(socket,message,body)=>socket.emit('message',JSON.stringify({id:message.id,...body}));
test('a report authenticates once and serializes queries on one TLS-verified session',async()=>{
 const f=fixture((s,m)=>reply(s,m,{result:m.method==='auth.login_with_api_key'?true:[m.method]}));
 const result=await readTrueNASBatch([['system.info'],['pool.query'],['disk.query']],env,{WebSocketImpl:f.Socket});
 assert.equal(f.sockets.length,1);assert.equal(f.messages.filter(m=>m.method==='auth.login_with_api_key').length,1);assert.equal(f.sockets[0].options.rejectUnauthorized,true);
 assert.deepEqual(result.map(r=>r.value),[['system.info'],['pool.query'],['disk.query']]);assert.equal(f.sockets[0].closed,true);
});
test('legacy transport uses the same authenticated connection and answers ping frames',async()=>{
 const f=fixture((s,m)=>{if(m.msg==='connect'){s.emit('message',JSON.stringify({msg:'ping',id:'ping'}));s.emit('message',JSON.stringify({msg:'connected'}));return}if(m.msg==='pong')return;reply(s,m,{result:m.method==='auth.login_with_api_key'?true:[]})});
 await readTrueNASBatch([['pool.snapshot.query']],{...env,TRUENAS_API_MODE:'legacy'},{WebSocketImpl:f.Socket});
 assert.ok(f.messages.some(m=>m.msg==='pong'));assert.ok(f.messages.some(m=>m.method==='zfs.snapshot.query'));assert.equal(f.sockets.length,1);
});
test('method fallback and permission failures preserve separate successful readings',async()=>{
 const f=fixture((s,m)=>reply(s,m,m.method==='pool.snapshot.query'?{error:{code:-32601,message:'Method not found'}}:m.method==='disk.query'?{error:{code:13,data:{errno:13,reason:'Denied'}}}:{result:m.id===1?true:[]}));
 const result=await readTrueNASBatch([['pool.snapshot.query'],['disk.query'],['pool.query']],env,{WebSocketImpl:f.Socket});
 assert.deepEqual(result[0].value,[]);assert.equal(result[1].error.providerErrno,13);assert.deepEqual(result[2].value,[]);assert.equal(f.messages.filter(m=>m.method==='auth.login_with_api_key').length,1);
});
test('authentication rejection never submits inventory requests or retries bad credentials',async()=>{
 const f=fixture((s,m)=>reply(s,m,{result:false}));await assert.rejects(readTrueNASBatch([['pool.query']],env,{WebSocketImpl:f.Socket}),{truenasFailure:'authentication'});assert.equal(f.messages.length,1);assert.equal(f.sockets[0].closed,true);
});
test('timeout after a successful read preserves that read and marks remaining results unavailable',async()=>{
 const f=fixture((s,m)=>{if(m.id===1)reply(s,m,{result:true});else if(m.id===2)reply(s,m,{result:[]})});
 const results=await readTrueNASBatch([['pool.query'],['disk.query'],['alert.list']],env,{WebSocketImpl:f.Socket,timeoutMs:5});assert.deepEqual(results[0].value,[]);assert.equal(results[1].error.code,'ETIMEDOUT');assert.equal(results[2].error.code,'ETIMEDOUT');assert.equal(f.sockets[0].terminated,true);
});
