import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
test('all JSX button templates have handlers or form submission and click-only actions cannot implicitly submit forms',()=>{
 const result=spawnSync(process.execPath,['scripts/audit-controls.mjs'],{cwd:new URL('../',import.meta.url),encoding:'utf8'});
 assert.equal(result.status,0,result.stdout+result.stderr);
});
