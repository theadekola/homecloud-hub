import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';
const source=fs.readFileSync(new URL('../src/backup-selection.ts',import.meta.url),'utf8'),code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;const {restoreLocation,distinctBackupPoints}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
test('archive selection survives encoded restore navigation',()=>{const id='archive+/= node:two';const url=new URL(restoreLocation(id),'https://homecloud.test');assert.equal(url.pathname,'/restore');assert.equal(url.searchParams.get('archive'),id);});

test('shared archives deduplicate only with explicit evidence and keep a requested source',()=>{
 const points=['n1','n2'].map(node=>({id:node,node,storage:'backup',volid:'backup:backup/archive',shared:true}));assert.equal(distinctBackupPoints(points).length,1);assert.equal(distinctBackupPoints(points,'n2')[0].node,'n2');assert.equal(distinctBackupPoints(points.map(p=>({...p,shared:false}))).length,2);assert.equal(distinctBackupPoints(points.map(({shared,...p})=>p)).length,2);assert.equal(distinctBackupPoints([...points,{...points[0],id:'different',volid:'backup:backup/another'}]).length,2);
});
