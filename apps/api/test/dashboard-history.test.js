import test from 'node:test';import assert from 'node:assert/strict';import {dashboardHistory} from '../src/dashboard-history.js';
test('overview history retains chart readings and gaps without copying full historical inventories',()=>{
 const original=[{time:'2026-10-22T07:00:00Z',cpu:12,memory:null,nodes:[{name:'node01',cpu:12,memory:null,irrelevant:'unused'}],docker:[{id:'private-container',cpu:100,status:'running'}],storage:[{id:'storage',usage:10}]}];
 const result=dashboardHistory(original);assert.deepEqual(result,[{time:original[0].time,cpu:12,memory:null,nodes:[{name:'node01',cpu:12,memory:null}]}]);assert.equal(original[0].docker.length,1);assert.equal(original[0].storage.length,1);assert.notEqual(result[0].nodes,original[0].nodes);
});
test('empty history and legacy samples without per-node readings remain usable',()=>{assert.deepEqual(dashboardHistory(),[]);assert.deepEqual(dashboardHistory([{time:'t',cpu:null,memory:0}]),[{time:'t',cpu:null,memory:0}])});
