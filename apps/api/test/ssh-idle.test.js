import test from 'node:test';
import assert from 'node:assert/strict';
import {shellExpired,updateShellPresence,SHELL_IDLE_MS} from '../src/ssh-idle.js';
test('shell expires after twenty minutes of visible inactivity',()=>{
 const s={mode:'shell',touched:0};
 assert.equal(shellExpired(s,SHELL_IDLE_MS-1),false);
 assert.equal(shellExpired(s,SHELL_IDLE_MS),true);
 updateShellPresence(s,'active',1000);
 assert.equal(shellExpired(s,SHELL_IDLE_MS),false);
});
test('screen suspension preserves remaining idle time across mobile or desktop sleep',()=>{
 const s={mode:'shell',touched:0};
 updateShellPresence(s,'hidden',5*60000);
 updateShellPresence(s,'hidden',6*60000);
 assert.equal(shellExpired(s,24*60*60000),false);
 updateShellPresence(s,'visible',24*60*60000);
 assert.equal(shellExpired(s,24*60*60000+15*60000-1),false);
 assert.equal(shellExpired(s,24*60*60000+15*60000),true);
});
test('SFTP retains its existing keepalive policy',()=>{
 assert.equal(shellExpired({mode:'sftp',touched:0},60001),true);
});
