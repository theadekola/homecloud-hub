import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';
const built=await build({entryPoints:[new URL('../src/cluster-topology.ts',import.meta.url).pathname],bundle:true,format:'esm',write:false});
const {clusterTopology,topologyState,topologyPercent}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
test('topology groups guests under reported nodes with scoped identities and no fictional resources',()=>{
 const input={clusterStatus:[{type:'cluster',name:'Example cluster'}],nodes:[{name:'two',status:'offline'},{name:'one',status:'online'}],vms:[{id:'100',name:'app',node:'one',status:'running'},{id:'200',node:'two',status:'running'}],lxc:[{id:'100',name:'service',node:'one',status:'running'}]};
 const view=clusterTopology(input);assert.equal(view.name,'Example cluster');assert.deepEqual(view.nodes.map(n=>n.name),['one','two']);assert.equal(view.nodes[0].guests.length,2);assert.notEqual(view.nodes[0].guests[0].key,view.nodes[0].guests[1].key);assert.equal(topologyState(view.nodes[1].guests[0],view.nodes[1].status),'unknown');assert.equal(topologyPercent(null),'Unavailable');assert.equal(topologyPercent(0),'0%');assert.equal(topologyPercent(101),'Unavailable');
 assert.deepEqual(clusterTopology({}).nodes,[]);assert.equal(clusterTopology({nodes:[{name:'alone',status:'online'}]}).nodes[0].guests.length,0);
});
test('search retains the parent branch and unknown parents never assert running status',()=>{
 const input={nodes:[{name:'one',status:'online'},{name:'two',status:'online'}],vms:[{id:'1',name:'api',node:'one'},{id:'2',name:'db',node:'two'}],lxc:[{id:'3',name:'cache',node:'missing',status:'running'}]};
 const result=clusterTopology(input,'cache');assert.equal(result.nodes.length,1);assert.equal(result.nodes[0].name,'missing');assert.equal(topologyState(result.nodes[0].guests[0],result.nodes[0].status),'unknown');assert.equal(clusterTopology(input,'one').nodes[0].guests.length,1);assert.equal(clusterTopology(input,'not found').nodes.length,0);
});
