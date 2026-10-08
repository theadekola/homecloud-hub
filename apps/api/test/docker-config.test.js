import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {validateDocker} from '../src/docker-config.js';
import {createClusterStore} from '../src/cluster-config.js';
test('Docker connection validates TLS input and encrypts credentials at rest',()=>{
 const input={url:'https://docker.example:2376',ca:'-----BEGIN CERTIFICATE-----\nCA\n-----END CERTIFICATE-----',cert:'-----BEGIN CERTIFICATE-----\nCLIENT\n-----END CERTIFICATE-----',key:'-----BEGIN PRIVATE KEY-----\nSECRET\n-----END PRIVATE KEY-----'};
 assert.throws(()=>validateDocker({...input,url:'http://docker.example:2375'}));assert.throws(()=>validateDocker({...input,url:'https://user:password@docker.example'}));assert.throws(()=>validateDocker({...input,key:''}));
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'docker-config-')),file=path.join(directory,'connection.json'),store=createClusterStore(file,()=> 'x'.repeat(64),validateDocker);
 try{store.save(input);assert.equal(store.read().key,input.key);assert.ok(!fs.readFileSync(file,'utf8').includes('SECRET'));store.remove();assert.equal(store.read(),null)}finally{fs.rmSync(directory,{recursive:true,force:true})}
});
