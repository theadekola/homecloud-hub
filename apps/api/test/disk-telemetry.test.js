import test from 'node:test';
import assert from 'node:assert/strict';
import {acceptDiskReport,recordDiskReport,nodeDiskTelemetry} from '../src/disk-telemetry.js';
const sample=(uptime,read='100',write='200',bootId='boot')=>({status:'ok',uptime,bootId,devices:[{id:'8:0',read,write}]});
test('disk sectors become byte rates, zero is measured and resets are gaps',()=>{
 const a=acceptDiskReport(null,sample(1),1000);assert.equal(a.diskRead,null);
 const b=acceptDiskReport(a,sample(6,'110','220'),6000);assert.equal(b.diskRead,1024);assert.equal(b.diskWrite,2048);
 assert.equal(acceptDiskReport(b,sample(11,'110','220'),11000).diskRead,0);
 assert.equal(acceptDiskReport(b,sample(11,'1'),11000).diskRead,null);
 assert.equal(acceptDiskReport(b,sample(11,'120','230','reboot'),11000).diskRead,null);
 assert.equal(acceptDiskReport(b,sample(100,'120','230'),100000).diskRead,null);
 assert.equal(acceptDiskReport(b,sample(6),12000),b);
 assert.equal(acceptDiskReport(null,sample(1,'-1')).status,'error');
 const added=sample(11);added.devices.push({id:'8:1',read:'1',write:'1'});assert.equal(acceptDiskReport(b,added).diskRead,null);
});
test('history remains isolated, bounded by time and unavailable for stale or ambiguous nodes',()=>{
 let disk=recordDiskReport('disk-one',null,sample(1),1000);
 disk=recordDiskReport('disk-one',disk,sample(6,'110','220'),6000);
 disk=recordDiskReport('disk-one',disk,sample(36,'210','320'),36000);
 const reports=[{id:'disk-one',kind:'proxmox',hostname:'one',online:true,disk}];
 const result=nodeDiskTelemetry('one',reports,'day',37000);assert.equal(result.series.length,2);assert.equal(result.current.diskRead,100*512/30);
 assert.equal(nodeDiskTelemetry('two',reports,'day',37000).series.length,0);
 assert.match(nodeDiskTelemetry('one',reports,'day',60001).message,/stale/);
 assert.match(nodeDiskTelemetry('one',[...reports,...reports],'day',37000).message,/Multiple/);
 assert.match(nodeDiskTelemetry('one',[{...reports[0],online:false}],'day',37000).message,/offline/);
});
