import test from 'node:test';
import assert from 'node:assert/strict';
import {guestFilesystemUsage} from '../src/connectors.js';
test('guest filesystem usage sums distinct disks and excludes duplicate and memory filesystems',()=>{assert.deepEqual(guestFilesystemUsage({result:[{name:'/dev/sda1',type:'ext4','total-bytes':1000,'used-bytes':400},{name:'/dev/sda1',type:'ext4','total-bytes':1000,'used-bytes':400},{name:'tmpfs',type:'tmpfs','total-bytes':500,'used-bytes':200},{name:'/dev/sdb1',type:'xfs','total-bytes':2000,'used-bytes':1000}]}),{total:3000,used:1400,free:1600});assert.equal(guestFilesystemUsage({result:[{name:'bad','total-bytes':10,'used-bytes':20}]}),null);assert.equal(guestFilesystemUsage(null),null)});
