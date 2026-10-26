import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.JWT_SECRET='a'.repeat(64);
process.env.JWT_REFRESH_SECRET='b'.repeat(64);
process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'iclusters-users-test-'));
const {createApp}=await import('../src/app.js');
const {requireRole}=await import('../src/security.js');
test('user account reads return creation dates through the admin-only safe projection',async()=>{
 const queries=[];const record={id:'u1',name:'Account',email:'account@test.local',role:'viewer',status:'active',twoFactor:false,lastLogin:null,createdAt:'2025-01-12T09:14:00Z'};
 const app=createApp({authenticate:(req,res,next)=>{req.user={sub:'self',role:req.headers['x-test-role']||'admin'};next()},authorize:requireRole,audit:async()=>{},monitor:{sample:async()=>({}),invalidate:()=>{}},db:{query:async sql=>{queries.push(sql);return {rows:[record],rowCount:1}}}});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 try{const url=`http://127.0.0.1:${server.address().port}/api/users`;const denied=await fetch(url,{headers:{'x-test-role':'viewer'}});assert.equal(denied.status,403);assert.equal(queries.length,0);const response=await fetch(url);assert.equal(response.status,200);assert.deepEqual(await response.json(),{users:[record]});assert.match(queries[0],/created_at AS "createdAt"/);assert.match(queries[0],/two_factor_enabled AS "twoFactor"/);assert.doesNotMatch(queries[0],/password|SELECT \*/i);}finally{await new Promise(resolve=>server.close(resolve));fs.rmSync(process.env.DATA_DIR,{recursive:true,force:true})}
});

test('only explicitly supported account roles can be granted or authorize requests',async()=>{
 const queries=[];
 const app=createApp({authenticate:(req,res,next)=>{req.user={sub:'self',role:req.headers['x-test-role']||'admin'};next()},authorize:requireRole,audit:async()=>{},activity:{capture(){}},monitor:{sample:async()=>({}),invalidate:()=>{}},db:{query:async(sql,args)=>{queries.push({sql,args});return {rows:[{}],rowCount:1}}}});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 try{
  const url=`http://127.0.0.1:${server.address().port}/api/users`;
  for(const role of ['toString','constructor','__proto__','hasOwnProperty','unknown']){
   const read=await fetch(url,{headers:{'x-test-role':role}});assert.equal(read.status,403,`Unsupported stored role ${role} must be denied`);
   const created=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Account',username:'account',password:'long-test-password',role})});assert.equal(created.status,403,`Unsupported role ${role} must not be created`);
  }
  assert.deepEqual(queries,[]);
 }finally{await new Promise(resolve=>server.close(resolve));fs.rmSync(process.env.DATA_DIR,{recursive:true,force:true})}
});
