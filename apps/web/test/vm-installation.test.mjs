import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';
const source=fs.readFileSync(new URL('../src/vm-installation.ts',import.meta.url),'utf8');const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;const {installationConsoleUrl}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
test('installation console targets the newly allocated VM on its selected node',()=>{
 const result=new URL(installationConsoleUrl('https://pve.example:8006/?existing=1',{id:'321',node:'pve2',name:'Android & Linux'}));
 assert.equal(result.origin,'https://pve.example:8006');assert.equal(result.searchParams.get('node'),'pve2');assert.equal(result.searchParams.get('vmid'),'321');assert.equal(result.searchParams.get('vmname'),'Android & Linux');assert.equal(result.searchParams.get('console'),'kvm');assert.equal(result.searchParams.get('novnc'),'1');assert.equal(result.searchParams.get('existing'),'1');
});
test('missing or unsafe console configurations do not produce navigation targets',()=>{
 for(const base of [undefined,'','bad url','javascript:alert(1)','file:///tmp/pve'])assert.equal(installationConsoleUrl(base,{id:'321',node:'pve1'}),null);
 assert.equal(installationConsoleUrl('https://pve.example',undefined),null);assert.equal(installationConsoleUrl('https://pve.example',{id:'321',node:''}),null);
});
