import fs from 'node:fs';
import path from 'node:path';
import {unseal} from '../src/mfa.js';
const file=path.join(process.env.DATA_DIR||'/app/runtime','docker-operation-journal.json');
if(fs.existsSync(file)){const state=JSON.parse(fs.readFileSync(file,'utf8'));const entries=JSON.parse(unseal(state.data));if(entries.some(([,v])=>['running','interrupted'].includes(v.status))){console.error('Finish or recover Docker updates before controller maintenance.');process.exit(1)}}
console.log('No active or interrupted Docker update requires recovery.');
