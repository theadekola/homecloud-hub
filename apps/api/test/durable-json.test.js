import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {readDurableJson,writeDurableJson} from '../src/durable-json.js';
test('durable state recovers a corrupt primary without losing the valid recovery copy',()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'durable-'));try{const file=path.join(root,'state.json');writeDurableJson(file,{revision:1});writeDurableJson(file,{revision:2});fs.writeFileSync(file,'broken');assert.deepEqual(readDurableJson(file),{revision:1});assert.deepEqual(readDurableJson(file),{revision:1});assert.equal(fs.statSync(file).mode&0o777,0o600);fs.writeFileSync(file,'broken');fs.writeFileSync(file+'.previous','broken');assert.throws(()=>readDurableJson(file),/unreadable/)}finally{fs.rmSync(root,{recursive:true,force:true})}});
