import crypto from 'node:crypto';
import {accountIdentity} from './username.js';
import bcrypt from 'bcryptjs';

const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
export async function setupStatus(db) {
 const result=await db.query('SELECT EXISTS(SELECT 1 FROM users) AS registered');
 return {registrationOpen:!result.rows[0].registered};
}
export async function registerOwner(db,input={},setupToken=process.env.SETUP_TOKEN) {
 if(!setupToken||setupToken.length<32||setupToken==='replace-with-a-random-setup-code')fail('First-use setup is not configured. Set SETUP_TOKEN on the server.',503);
 const supplied=typeof input.setupToken==='string'?input.setupToken:'';
 const digest=value=>crypto.createHash('sha256').update(value).digest();
 if(!crypto.timingSafeEqual(digest(supplied),digest(setupToken)))fail('The setup code is incorrect.',403);
 const name=String(input.name||'').trim(),{email,username}=accountIdentity(input),password=input.password;
 if(!name||name.length>100)fail('Name is required (maximum 100 characters).');
 if(typeof password!=='string'||password.length<12||password.length>72||Buffer.byteLength(password)>72)fail('Password must be at least 12 characters and at most 72 bytes.');
 const hash=await bcrypt.hash(password,12),client=await db.connect();
 try{
  await client.query('BEGIN');
  // Serializes registration and user creation, including simultaneous first-use requests.
  await client.query('LOCK TABLE users IN EXCLUSIVE MODE');
  if(!(await setupStatus(client)).registrationOpen)fail('Registration is closed. Sign in or ask an administrator for an account.',409);
  const result=await client.query("INSERT INTO users(email,name,password_hash,role,status,username) VALUES($1,$2,$3,'owner','active',$4) RETURNING id,email,username,name,role,status",[email,name,hash,username]);
  await client.query('COMMIT');return result.rows[0];
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
