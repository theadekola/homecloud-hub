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
test('a node listed online without a successful direct status read remains unconfirmed',()=>{
 const view=clusterTopology({nodes:[{name:'one',status:'online'}],nodeCoverage:[{node:'one',status:'partial',readings:['qemu']}],vms:[{id:1,node:'one',status:'running'}]});assert.equal(view.nodes[0].status,'unknown');assert.equal(view.nodes[0].reportedStatus,'online');assert.equal(topologyState(view.nodes[0].guests[0],view.nodes[0].status),'unknown');
});

test('verified membership never recreates a departed node from stale guest rows or search matches',()=>{
 const input={nodeInventory:{complete:true,members:['node01','offline']},nodes:[{name:'node01',status:'online'},{name:'offline',status:'offline'},{name:'node02',status:'unknown'}],vms:[{id:'100',node:'node01'},{id:'200',node:'node02'},{id:'201',node:'offline'}],lxc:[{id:'300',node:'node02'}]};
 assert.deepEqual(clusterTopology(input).nodes.map(n=>n.name),['node01','offline']);assert.equal(clusterTopology(input).nodes[1].guests.length,1);assert.deepEqual(clusterTopology(input,'node02').nodes,[]);assert.deepEqual(clusterTopology({...input,nodeInventory:{complete:true,members:[]}}).nodes,[]);
});
test('unverified membership retains a guest-referenced unknown node without claiming its removal',()=>{assert.equal(clusterTopology({nodeInventory:{complete:false,members:[]},vms:[{node:'node02',id:200}]}).nodes[0].name,'node02')});
