import test from 'node:test';
import assert from 'node:assert/strict';
import {createDockerUpdateProgress} from '../src/docker-update-progress.js';
const id='installation-attempt-1234';
test('progress is scoped to the owner, exact Docker host, container and attempt',()=>{
 const service=createDockerUpdateProgress(),tracking=service.start('owner','node:qemu/100','container',id);
 tracking.report(20,'Pulling image');
 assert.equal(service.read('owner','node:qemu/100','container',id).progress.percent,20);
 for(const args of [['other','node:qemu/100','container',id],['owner','node:qemu/101','container',id],['owner','node:qemu/100','other',id],['owner','node:qemu/100','container','another-attempt-1234']])assert.equal(service.read(...args).progress,null);
 tracking.report(5,'Still downloading');assert.equal(service.read('owner','node:qemu/100','container',id).progress.percent,20);
 assert.throws(()=>service.start('owner','node:qemu/100','container',id),/already running/);
 tracking.finish();assert.equal(service.read('owner','node:qemu/100','container',id).progress.percent,100);
 tracking.report(20,'Late report');assert.equal(service.read('owner','node:qemu/100','container',id).progress.status,'completed');
});
test('failed attempts never reach 100%, and retained entries are bounded and expire',()=>{
 let now=1000;const service=createDockerUpdateProgress({now:()=>now,limit:1,ttl:100}),tracking=service.start('owner','direct','a',id);
 tracking.report(95,'Restoring original');tracking.fail();assert.equal(service.read('owner','direct','a',id).progress.percent,95);assert.equal(service.read('owner','direct','a',id).progress.status,'failed');
 service.start('owner','direct','b',id);assert.equal(service.read('owner','direct','a',id).progress,null);
 assert.throws(()=>service.start('owner','direct','c',id),e=>e.status===429);
 const expiring=createDockerUpdateProgress({now:()=>now,ttl:100});expiring.start('owner','direct','a',id).finish();now+=101;assert.equal(expiring.read('owner','direct','a',id).progress,null);
 assert.throws(()=>service.start('owner','direct','c','invalid'),e=>e.status===400);
});
test('concurrent attempts cannot target the same host/container even across owners, and terminal details survive reads',()=>{
 const service=createDockerUpdateProgress(),tracking=service.start('one','node:qemu/1','plex',id);assert.throws(()=>service.start('two','node:qemu/1','plex','another-attempt-1234'),/already running/);tracking.fail('Download timed out; original container retained.');assert.match(service.read('one','node:qemu/1','plex',id).progress.error,/original container retained/);const next=service.start('two','node:qemu/1','plex','another-attempt-1234');next.finish({containerId:'new',message:'Verified replacement'});assert.equal(service.read('two','node:qemu/1','plex','another-attempt-1234').progress.result.containerId,'new');
});
