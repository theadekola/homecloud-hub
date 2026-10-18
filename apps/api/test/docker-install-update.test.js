import test from 'node:test';import assert from 'node:assert/strict';
import {updatePlan,installDockerImageUpdate,ensureNoContainerDependents} from '../src/docker-install-update.js';
const oldId='a'.repeat(64),newId='b'.repeat(64),imageId='sha256:'+'c'.repeat(64),newImage='sha256:'+'d'.repeat(64),digest='sha256:'+'e'.repeat(64);
const container={Id:oldId,Name:'/web',Image:imageId,State:{Status:'running',Running:true},Config:{Image:'nginx:latest',Env:['DEFAULT=old','SECRET=private'],Cmd:['old-default'],Labels:{'com.docker.compose.project':'app'}},HostConfig:{RestartPolicy:{Name:'always'},PortBindings:{'80/tcp':[{HostIp:'',HostPort:'8080'}]},Binds:['/srv/web:/data:ro'],Mounts:[],NetworkMode:'app_default'},Mounts:[{Type:'bind',Source:'/srv/web',Destination:'/data',RW:false},{Type:'volume',Name:'anonymous-original',Destination:'/cache',RW:true}],NetworkSettings:{Networks:{app_default:{Aliases:['web',oldId.slice(0,12)],IPAMConfig:{IPv4Address:'172.20.0.5'}}}}};
const oldImage={Config:{Env:['DEFAULT=old'],Cmd:['old-default']}};
function fixture({unhealthy=false,change=false}={}){const calls=[];let originalReads=0,pulled=false;return {calls,sleep:async()=>{},healthAttempts:2,query:async(p,init)=>{calls.push({p,init});if(p.startsWith('/images/create?'))pulled=true;if(p.includes('%40')&&p.endsWith('/json')&&!pulled)throw Object.assign(Error('Not present'),{dockerStatus:404});if(p==='/containers/json?all=1')return [];if(p==='/containers/'+oldId+'/json'){originalReads++;return change&&originalReads>1?{...container,Config:{...container.Config,Env:['CHANGED=yes']}}:structuredClone(container)}if(p==='/images/'+encodeURIComponent(imageId)+'/json')return oldImage;if(p.startsWith('/images/')&&p.endsWith('/json'))return {Id:newImage,RepoDigests:['nginx@'+digest]};if(p.startsWith('/containers/create'))return {Id:newId};if(p==='/containers/'+newId+'/json')return {State:{Running:!unhealthy,Health:{Status:unhealthy?'unhealthy':'healthy'}}};return {}}}}
const row={status:'available',containerId:oldId,imageId,image:'nginx:latest',remoteDigest:digest};const input=()=>({containerId:oldId,imageId,remoteDigest:digest,configDigest:updatePlan(container,oldImage).binding});
test('update preserves mount identities, ports, user overrides, aliases and stopped state without exposing secrets',async()=>{
 const f=fixture();const result=await installDockerImageUpdate(row,input(),f);assert.equal(result.containerId,newId);assert.ok(f.calls.some(c=>c.p.includes('/tag?repo=nginx&tag=latest')));const create=JSON.parse(f.calls.find(c=>c.p.startsWith('/containers/create')).init.body);assert.equal(create.Image,newImage);assert.deepEqual(create.Env,['SECRET=private']);assert.equal(create.Cmd,undefined);assert.equal(create.HostConfig.PortBindings['80/tcp'][0].HostPort,'8080');assert.ok(create.HostConfig.Binds.includes('anonymous-original:/cache:rw'));assert.equal(create.NetworkingConfig.EndpointsConfig.app_default.IPAMConfig.IPv4Address,'172.20.0.5');assert.deepEqual(create.NetworkingConfig.EndpointsConfig.app_default.Aliases,['web']);assert.ok(!JSON.stringify(result).includes('private'));assert.ok(f.calls.some(c=>c.p==='/containers/'+oldId+'?v=false'));assert.ok(!f.calls.some(c=>/v=true/.test(c.p)));
});
test('failed startup restores the original container and restart policy without deleting volumes',async()=>{
 const f=fixture({unhealthy:true});await assert.rejects(()=>installDockerImageUpdate(row,input(),f),/original container restored/);assert.ok(f.calls.some(c=>c.p==='/containers/'+newId+'?force=1&v=false'));assert.ok(f.calls.some(c=>c.p==='/containers/'+oldId+'/start'));assert.ok(f.calls.some(c=>c.p==='/networks/app_default/connect'));assert.ok(f.calls.some(c=>c.p==='/containers/'+oldId+'/update'&&JSON.parse(c.init.body).RestartPolicy.Name==='always'));
});
test('stale reviews and config changes during pull fail before stopping the original',async()=>{
 const f=fixture();await assert.rejects(()=>installDockerImageUpdate(row,{...input(),remoteDigest:'sha256:'+'f'.repeat(64)},f),/update changed/);assert.equal(f.calls.length,0);const g=fixture({change:true});await assert.rejects(()=>installDockerImageUpdate(row,input(),g),/configuration changed during download/);assert.ok(!g.calls.some(c=>c.p.endsWith('/stop?t=30')));
});
test('unsafe shared lifecycle containers are rejected and image defaults are not frozen into replacements',()=>{
 for(const patch of [{AutoRemove:true},{VolumesFrom:['db']},{NetworkMode:'container:other'},{Links:['db:web']}])assert.throws(()=>updatePlan({...container,HostConfig:{...container.HostConfig,...patch}},oldImage),/original deployment tool/);const plan=updatePlan({...container,State:{Status:'exited',Running:false}},oldImage);assert.equal(plan.running,false);assert.equal(plan.config.Cmd,undefined);
});
test('stopped containers stay stopped, identical platform images do not restart, and unknown ports are blocked',async()=>{
 const stopped={...container,State:{Status:'exited',Running:false}},f=fixture(),query=f.query;f.query=async(p,i)=>p==='/containers/'+oldId+'/json'?structuredClone(stopped):query(p,i);const req={...input(),configDigest:updatePlan(stopped,oldImage).binding};await installDockerImageUpdate(row,req,f);assert.ok(!f.calls.some(c=>c.p.endsWith('/start')||c.p.endsWith('/stop?t=30')));
 const g=fixture(),read=g.query;g.query=async(p,i)=>p.startsWith('/images/')&&p.includes('%40')?{Id:imageId,RepoDigests:['nginx@'+digest]}:read(p,i);const same=await installDockerImageUpdate(row,input(),g);assert.equal(same.unchanged,true);assert.ok(!g.calls.some(c=>c.init?.method==='POST'&&c.p.startsWith('/containers/')));
 assert.throws(()=>updatePlan({...container,HostConfig:{...container.HostConfig,PortBindings:{'80/tcp':[{HostPort:''}]}}},oldImage),/assigned port/);
});
test('a wrong pulled digest leaves the original untouched, and incomplete rollback is reported honestly',async()=>{
 const f=fixture(),read=f.query;f.query=async(p,i)=>p.startsWith('/images/')&&p.includes('%40')?{Id:newImage,RepoDigests:['nginx@sha256:'+'f'.repeat(64)]}:read(p,i);await assert.rejects(()=>installDockerImageUpdate(row,input(),f),/pulled image did not match/);assert.ok(!f.calls.some(c=>c.p.startsWith('/containers/create')));
 const g=fixture({unhealthy:true}),query=g.query;g.query=async(p,i)=>{if(p==='/containers/'+newId+'?force=1&v=false')throw Error('Cannot remove replacement');return query(p,i)};await assert.rejects(()=>installDockerImageUpdate(row,input(),g),/restoration was incomplete/);assert.ok(!g.calls.some(c=>c.p==='/containers/'+oldId+'/start'));
});
test('namespace providers and legacy volume/link sources cannot be replaced underneath dependent containers',async()=>{
 for(const h of [{NetworkMode:'container:'+oldId},{PidMode:'container:web'},{IpcMode:'container:'+oldId.slice(0,12)},{VolumesFrom:['web:ro']},{Links:['/web:/sidecar/web']}]){
  await assert.rejects(()=>ensureNoContainerDependents(container,async p=>p==='/containers/json?all=1'?[{Id:'sidecar'}]:{HostConfig:h}),/deployment together/);
 }
 const f=fixture(),query=f.query;let lists=0;f.query=async(p,i)=>{if(p==='/containers/json?all=1')return ++lists===1?[]:[{Id:'sidecar'}];if(p==='/containers/sidecar/json')return {HostConfig:{NetworkMode:'container:'+oldId}};return query(p,i)};await assert.rejects(()=>installDockerImageUpdate(row,input(),f),/deployment together/);assert.ok(!f.calls.some(c=>c.p.includes('/stop?')||c.p.startsWith('/containers/create')));
});

test('installation progress follows real checkpoints and never reports completion during failed verification',async()=>{
 const stages=[],f=fixture();await installDockerImageUpdate(row,input(),{...f,onProgress:(percent,stage)=>stages.push({percent,stage})});assert.deepEqual(stages.map(s=>s.percent),[5,10,20,65,75,80,90,95,98]);assert.match(stages[2].stage,/Pulling image/);assert.match(stages[3].stage,/downloaded image/);
 const failed=[],g=fixture({unhealthy:true});await assert.rejects(()=>installDockerImageUpdate(row,input(),{...g,onProgress:(percent,stage)=>failed.push({percent,stage})}),/original container restored/);assert.ok(failed.every(s=>s.percent<100));assert.match(failed.at(-1).stage,/Restoring original/);
 let release;const download=new Promise(r=>release=r),h=fixture(),query=h.query,seen=[];h.query=async(p,init)=>{if(p.startsWith('/images/create?'))await download;return query(p,init)};const running=installDockerImageUpdate(row,input(),{...h,onProgress:p=>seen.push(p)});await new Promise(r=>setTimeout(r,0));assert.equal(seen.at(-1),20);assert.ok(!h.calls.some(c=>c.p.includes('/stop?')));release();await running;
});
test('download errors explain the failure without stopping the original container or reporting success',async()=>{
 for(const message of ['Node agent request timed out','Registry access denied']){const f=fixture(),query=f.query;f.query=async(p,i)=>{if(p.startsWith('/images/create?'))throw Error(message);return query(p,i)};await assert.rejects(()=>installDockerImageUpdate(row,input(),f),e=>/Image download/.test(e.message)&&/original container was not stopped/.test(e.message));assert.ok(!f.calls.some(c=>c.p.includes('/stop?')||c.p.startsWith('/containers/create')))}
 const f=fixture(),query=f.query;f.query=async(p,i)=>{if(p.startsWith('/images/create?'))throw Object.assign(Error('Update the paired connector'),{code:'CONNECTOR_UPDATE_REQUIRED',status:409});return query(p,i)};await assert.rejects(()=>installDockerImageUpdate(row,input(),f),/Update the paired connector/);
});
test('successful verification removes only the unused old image after removing its container',async()=>{
 const f=fixture();const result=await installDockerImageUpdate(row,input(),f);
 assert.equal(result.imageCleanup.status,'removed');const deletion=f.calls.findIndex(c=>c.p==='/images/'+encodeURIComponent(imageId)+'?force=false&noprune=true');
 assert.ok(deletion>f.calls.findIndex(c=>c.p==='/containers/'+oldId+'?v=false'));
 assert.ok(deletion>f.calls.findIndex(c=>c.p==='/containers/'+newId+'/json'));
 assert.ok(!f.calls.some(c=>c.p.includes('/prune')||c.p.includes('force=true')));
});
test('old images used by running or stopped containers, or remaining tags, are retained',async()=>{
 for(const shared of ['running','exited','tag']){
  const f=fixture(),query=f.query;let removed=false;
  f.query=async(p,i)=>{if(p==='/containers/'+oldId+'?v=false')removed=true;if(removed&&p==='/containers/json?all=1'&&shared!=='tag')return [{Id:'other',ImageID:imageId,State:shared}];if(removed&&p==='/images/'+encodeURIComponent(imageId)+'/json'&&shared==='tag')return {...oldImage,RepoTags:['nginx:keep']};return query(p,i)};
  const result=await installDockerImageUpdate(row,input(),f);assert.equal(result.imageCleanup.status,'retained');assert.ok(!f.calls.some(c=>c.init?.method==='DELETE'&&c.p.startsWith('/images/')));
 }
});
test('cleanup failures preserve the verified replacement and failed updates never remove old images',async()=>{
 for(const phase of ['tag','container','image']){
  const f=fixture(),query=f.query;f.query=async(p,i)=>{if(phase==='tag'&&p.includes('/tag?')||phase==='container'&&p==='/containers/'+oldId+'?v=false'||phase==='image'&&i?.method==='DELETE'&&p.startsWith('/images/'))throw Object.assign(Error('private registry token'),{dockerStatus:409});return query(p,i)};
  const result=await installDockerImageUpdate(row,input(),f);assert.equal(result.containerId,newId);assert.equal(result.imageCleanup.status,'retained');assert.ok(!JSON.stringify(result).includes('private registry token'));assert.ok(!f.calls.some(c=>c.p==='/containers/'+newId+'?force=1&v=false'));
 }
 const f=fixture({unhealthy:true});await assert.rejects(()=>installDockerImageUpdate(row,input(),f));assert.ok(!f.calls.some(c=>c.init?.method==='DELETE'&&c.p.startsWith('/images/')));
});
test('an already downloaded reviewed image is verified and installed without another registry pull',async()=>{
 const f=fixture(),query=f.query,progress=[];f.query=async(p,i)=>p.includes('%40')&&p.endsWith('/json')?{Id:newImage,RepoDigests:['nginx@'+digest]}:query(p,i);
 const result=await installDockerImageUpdate(row,input(),{...f,onProgress:(percent,stage)=>progress.push({percent,stage})});assert.equal(result.containerId,newId);assert.ok(!f.calls.some(c=>c.p.startsWith('/images/create?')));assert.match(progress.find(p=>p.percent===65).stage,/already downloaded/);assert.ok(f.calls.some(c=>c.p==='/containers/'+newId+'/start'));
});
