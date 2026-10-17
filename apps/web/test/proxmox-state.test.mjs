import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';
const r=await build({entryPoints:[new URL('../src/proxmox-state.ts',import.meta.url).pathname],bundle:true,format:'esm',platform:'node',write:false});const {distinctStorage,taskState,inventoryComplete,archiveInventoryComplete}=await import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'));
test('shared storage chooses an online measured entry regardless of node order and preserves local entries',()=>{const offline={id:'a/shared',name:'shared',shared:true,status:'offline',capacity:null},online={id:'b/shared',name:'shared',shared:true,status:'online',capacity:100},local={id:'a/local',name:'shared',shared:false,status:'online',capacity:50};for(const rows of [[offline,online,local],[online,offline,local]]){const unique=distinctStorage(rows);assert.equal(unique.length,2);assert.ok(unique.includes(online));assert.ok(unique.includes(local));}});
test('task state handles provider list and status endpoint representations',()=>{assert.equal(taskState({status:'RUNNING'}),'Running');assert.equal(taskState({status:'running'}),'Running');assert.equal(taskState({status:'stopped',exitstatus:'OK'}),'Completed');assert.equal(taskState({status:'OK',endtime:1}),'Completed');assert.equal(taskState({status:'ERROR',endtime:1}),'Failed');assert.equal(taskState({endtime:1}),'Unknown');});
test('unknown, failed and partial inventories never represent a measured zero',()=>{assert.equal(inventoryComplete(null),false);assert.equal(inventoryComplete({errors:['Forbidden']}),false);assert.equal(inventoryComplete({errors:[]},'Unavailable'),false);assert.equal(inventoryComplete({resources:[],errors:[]}),true);});

test('backup source coverage distinguishes unconfigured, incomplete and measured empty providers',()=>{
 const off={configured:false,complete:false},ok={configured:true,complete:true},partial={configured:true,complete:false};
 assert.equal(inventoryComplete({providerInventory:{jobs:off},archiveInventory:off}),false);
 assert.equal(inventoryComplete({providerInventory:{snapshots:ok},archiveInventory:off}),true);
 assert.equal(archiveInventoryComplete({providerInventory:{snapshots:ok},archiveInventory:off}),false);
 assert.equal(inventoryComplete({providerInventory:{snapshots:off},archiveInventory:ok}),true);
 assert.equal(inventoryComplete({providerInventory:{snapshots:ok},archiveInventory:partial}),false);
 for(const data of [{truncated:['node01']},{coverage:{complete:false}},{archiveInventory:partial}])assert.equal(inventoryComplete(data),false);
 assert.equal(archiveInventoryComplete({points:[],archiveInventory:ok}),true);
});
