import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const built=await build({entryPoints:[new URL('../src/page-navigation.ts',import.meta.url).pathname],bundle:true,format:'esm',platform:'node',write:false});
const {pageTrail,settingsTitle,settingsTabs}=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
const labels=(path,search='',host,role)=>pageTrail(path,search,host,role).map(i=>i.label);
test('Overview has no path and unknown routes do not invent a page',()=>{assert.deepEqual(labels('/'),[]);assert.deepEqual(labels('/missing'),[])});
test('every Settings title identifies the selected tab',()=>{
 const titles=['General Settings','System Settings','Security Settings','Connections','Appearance Settings','About i-Clusters'];
 settingsTabs.forEach((tab,index)=>{assert.equal(settingsTitle(tab),titles[index]);assert.equal(labels('/settings',`?tab=${tab}`)[1],tab)});
});
test('nested connection sections and legacy Settings links resolve to the real page',()=>{
 for(const [section,label] of Object.entries({connected:'Connected',setup:'Needs Setup',notifications:'Notifications',remote:'Remote Access'}))assert.deepEqual(labels('/settings',`?tab=Connections&section=${section}`),['Settings','Connections',label]);
 assert.deepEqual(labels('/settings','?tab=Notifications'),['Settings','Connections','Notifications']);
 assert.deepEqual(labels('/settings','?tab=Advanced'),['Settings','System']);
 assert.deepEqual(labels('/settings','?tab=Backup%20%26%20Restore'),['Settings','System']);
});
test('Docker paths retain host context across every resource tab',()=>{
 for(const tab of ['Containers','Images','Volumes','Networks','Compose Stacks','Events','Updates'])assert.deepEqual(labels('/docker',`?tab=${encodeURIComponent(tab)}`,'control-vm'),['Docker','control-vm',tab]);
});
test('all other pages show their current section and reject unknown tabs',()=>{
 for(const [route,tab] of Object.entries({proxmox:'Nodes',storage:'Datasets / Volumes',network:'Traffic Analysis',backups:'Reports',monitoring:'Provider Jobs',alerts:'Alert History',users:'Audit Logs'})){
  assert.equal(labels('/'+route,`?tab=${encodeURIComponent(tab)}`).at(-1),tab);
  assert.ok(!labels('/'+route,'?tab=Unknown').includes('Unknown'));
 }
 for(const route of ['/ai','/tools/shell','/tools/sftp'])assert.equal(labels(route).length,1);
});
test('effective action and role overrides agree with the displayed page',()=>{
 assert.equal(labels('/proxmox','?tab=Overview&action=Create%20VM').at(-1),'Virtual Machines');
 assert.equal(labels('/proxmox','?action=Create%20CT').at(-1),'LXC Containers');
 for(const role of ['operator','auditor'])assert.equal(labels('/users','?tab=Accounts',undefined,role).at(-1),'Audit Logs');
});
test('parent links lead to sections while only the last entry is current',()=>{
 const trail=pageTrail('/settings','?tab=Connections&section=notifications');
 assert.equal(trail[0].to,'/settings');assert.equal(trail[1].to,'/settings?tab=Connections');assert.equal(trail[2].to,undefined);
});
