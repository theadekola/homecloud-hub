import test from 'node:test';
import assert from 'node:assert/strict';
import {storageSummary} from '../src/storage.js';
const pool=(id,shared=false)=>({id,provider:'proxmox',name:id.split('/')[1],shared,status:'online',capacity:100,used:40,available:60});
test('storage summary counts shared pools once and keeps local pools per node',()=>{
 const s=storageSummary([pool('node01/shared',true),pool('node02/shared',true),pool('node01/local'),pool('node02/local')]);
 assert.equal(s.pools,3);assert.equal(s.capacity,300);assert.equal(s.used,120);assert.equal(s.available,180);
});
test('missing shared identity or online readings prevents misleading aggregate capacity',()=>{
 assert.equal(storageSummary([pool('node01/local',null)]).capacity,null);
 assert.equal(storageSummary([{...pool('node01/local'),capacity:null}]).complete,false);
 const s=storageSummary([pool('node01/local'),{...pool('node02/offline'),status:'offline',capacity:0}]);
 assert.equal(s.capacity,100);assert.equal(s.online,1);assert.equal(s.pools,2);
});

test('shared capacity uses an online node reading',()=>{
 const s=storageSummary([{...pool('node01/shared',true),status:'offline',capacity:0},pool('node02/shared',true)]);
 assert.equal(s.capacity,100);assert.equal(s.online,1);assert.equal(s.distribution[0].id,'node02/shared');
});
