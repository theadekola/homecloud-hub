// Exercises real PostgreSQL transactions through the Compose API in isolated CI.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const base='http://localhost:8082/api';
const setupToken=fs.readFileSync('.env','utf8').match(/^SETUP_TOKEN=(.+)$/m)[1];
const request=async(path,body)=>{const response=await fetch(base+path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});return {status:response.status,body:await response.json()};};
assert.equal((await request('/auth/setup')).body.registrationOpen,true);
const account={name:'CI Owner',email:'owner@example.test',password:'CI-only-password-12345',setupToken};
assert.equal((await request('/auth/register',{...account,setupToken:'wrong'})).status,403);
assert.equal((await request('/auth/register',{...account,password:'short'})).status,400);
const competing=await Promise.all([request('/auth/register',account),request('/auth/register',{...account,email:'second@example.test'})]);
assert.deepEqual(competing.map(r=>r.status).sort(),[201,409]);
const owner=competing.find(r=>r.status===201).body.user;
assert.equal(owner.role,'owner');assert.equal((await request('/auth/setup')).body.registrationOpen,false);
assert.equal((await request('/auth/register',{...account,email:'third@example.test'})).status,409);
const login=await request('/auth/login',{email:owner.email,password:account.password});
assert.equal(login.status,200);assert.ok(login.body.accessToken);
console.log('First-use registration, concurrent owner protection and sign-in passed on port 8082.');
