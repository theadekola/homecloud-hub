import test from 'node:test';import assert from 'node:assert/strict';import {accountIdentity} from '../src/username.js';
test('username accounts do not require email, normalize case and reject ambiguous or malformed names',()=>{
 assert.deepEqual(accountIdentity({username:'  The.Adekola  '}),{username:'the.adekola',email:null});assert.deepEqual(accountIdentity({username:'owner',email:''}),{username:'owner',email:null});assert.deepEqual(accountIdentity({email:'OWNER@example.test'}),{username:'owner',email:'owner@example.test'});
 for(const username of ['ab','user name','@owner','owner@example.test','x'.repeat(65),'../owner'])assert.throws(()=>accountIdentity({username}),e=>e.status===400);
});
