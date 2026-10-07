import {test} from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import {registerOwner,setupStatus} from '../src/setup.js';
const token='test-setup-code'.repeat(4);
const input={name:'First Owner',email:'OWNER@example.test',password:'A strong test password',setupToken:token};
await test('registration rejects missing setup configuration, bad codes and invalid account details before writing',async()=>{
 const db={connect(){throw new Error('Must not write');}};
 for(const [body,key,status] of [[input,undefined,503],[{...input,setupToken:'wrong'},token,403],[{...input,password:'short'},token,400],[{...input,password:'é'.repeat(40)},token,400],[{...input,email:'invalid'},token,400]]){
  await assert.rejects(registerOwner(db,body,key),error=>error.status===status);
 }
});
await test('first owner is hashed, registration locks the table and closes without creating another account',async()=>{
 let registered=false,hash,connectionReleased=false;const queries=[];
 const client={async query(sql,values){queries.push(sql);
  if(sql.startsWith('SELECT EXISTS'))return {rows:[{registered}]};
  if(sql.startsWith('INSERT INTO users')){hash=values[2];registered=true;return {rows:[{id:'owner',email:values[0],name:values[1],role:'owner',status:'active'}]};}
  return {rows:[]};
 },release(){connectionReleased=true;}};
 const db={query:client.query.bind(client),connect:async()=>client};
 assert.equal((await setupStatus(db)).registrationOpen,true);
 const user=await registerOwner(db,input,token);assert.equal(user.email,'owner@example.test');assert.equal(user.role,'owner');assert.equal(await bcrypt.compare(input.password,hash),true);
 assert.ok(queries.indexOf('LOCK TABLE users IN EXCLUSIVE MODE')<queries.findIndex(q=>q.startsWith('INSERT INTO users')));
 assert.ok(connectionReleased);assert.equal((await setupStatus(db)).registrationOpen,false);
 await assert.rejects(registerOwner(db,{...input,email:'another@example.test'},token),error=>error.status===409);
 assert.equal(queries.at(-1),'ROLLBACK');assert.equal(queries.filter(q=>q.startsWith('INSERT INTO users')).length,1);
});
