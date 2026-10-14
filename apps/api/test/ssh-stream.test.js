import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';
import {streamShellOutput} from '../src/ssh-stream.js';
class Response extends EventEmitter{headers={};frames=[];writableLength=0;destroyed=false;setHeader(k,v){this.headers[k]=v}flushHeaders(){}write(v){this.frames.push(JSON.parse(v));return true}end(){this.ended=true}destroy(){this.destroyed=true;this.emit('close')}}
test('shell output is sent immediately, flushed once and closed without an output polling timer',()=>{
 const s={output:'prompt',closed:false},r=new Response();streamShellOutput({},r,s);assert.deepEqual(r.frames,[{output:'prompt',closed:false}]);s.output='typed';s.onOutput();assert.equal(r.frames[1].output,'typed');assert.equal(s.output,'');s.closed=true;s.onOutput();assert.equal(r.frames[2].closed,true);assert.equal(r.ended,true);assert.equal(s.onOutput,null);
});
test('replacement reader, client disconnect and renewal release only their own subscription',async()=>{
 const s={output:'',closed:false},a=new Response(),b=new Response();streamShellOutput({},a,s);streamShellOutput({},b,s,{lifetime:20});assert.equal(a.ended,true);a.emit('close');assert.equal(typeof s.onOutput,'function');await new Promise(r=>setTimeout(r,30));assert.equal(b.ended,true);assert.equal(s.onOutput,null);const c=new Response();streamShellOutput({},c,s);c.emit('close');assert.equal(s.onOutput,null);
});
test('slow output consumers disconnect before draining unread data beyond bounded response backlog',()=>{
 const s={output:'keep for reconnect',closed:false},r=new Response();r.writableLength=1048577;streamShellOutput({},r,s);assert.equal(r.destroyed,true);assert.equal(s.output,'keep for reconnect');assert.equal(s.onOutput,null);
});
