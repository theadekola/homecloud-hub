import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';
import {passwordAuthentication} from '../src/ssh-password.js';
test('password PAM authentication only answers a single hidden password challenge',()=>{
 const client=new EventEmitter(),options=passwordAuthentication(client,'fresh-password');assert.equal(options.password,'fresh-password');assert.equal(options.tryKeyboard,true);
 for(const [prompts,expected] of [[[{prompt:'Password: ',echo:false}],['fresh-password']],[[{prompt:"root@pve's password: ",echo:false}],['fresh-password']],[[{prompt:'Verification code: ',echo:false}],['']],[[{prompt:'Password: ',echo:true}],['']],[[{prompt:'Password:',echo:false},{prompt:'OTP:',echo:false}],['','']]]){let answers;client.emit('keyboard-interactive','','','',prompts,value=>answers=value);assert.deepEqual(answers,expected)}
});
