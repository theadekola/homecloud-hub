import test from 'node:test';import assert from 'node:assert/strict';
import {compareImage,createDockerImageUpdates} from '../src/docker-image-updates.js';
import {createNotifier} from '../src/notifications.js';
const old='sha256:'+'1'.repeat(64),next='sha256:'+'2'.repeat(64),img='sha256:'+'a'.repeat(64);
const snapshot={docker:{host:{hostname:'engine',engineId:'one'},containers:[{id:'c1',name:'web',image:'nginx:latest',imageId:img}]},services:[]};
test('digest comparison requires a matching repository, distinguishes updates and skips immutable references',()=>{
 assert.equal(compareImage({RepoDigests:['nginx@'+old]},{Descriptor:{digest:old}},'docker.io/library/nginx:latest').status,'current');assert.equal(compareImage({RepoDigests:['docker.io/library/nginx@'+old]},{Descriptor:{digest:next}},'nginx:latest').status,'available');assert.equal(compareImage({RepoDigests:['other@'+old]},{Descriptor:{digest:next}},'nginx:latest').status,'unknown');assert.equal(compareImage({RepoDigests:[]},{},'sha256:abc').status,'unsupported');assert.equal(compareImage({RepoDigests:['nginx@'+old]},{Descriptor:{digest:'bad'}},'nginx:latest').status,'unknown');
});
test('checks are background read-only, deduplicated per digest, survive failed checks and resolve only from fresh observations',async()=>{
 const state={alerts:[]},calls=[];let remote=next,fail=false,now=Date.now();const service=createDockerImageUpdates({persistence:{get:()=>state,mutate:fn=>fn(state)},now:()=>now,query:async(p,init)=>{calls.push({p,init});if(fail)throw Error('secret');return p.startsWith('/images/')?{RepoDigests:['nginx@'+old]}:{Descriptor:{digest:remote}}}});
 assert.equal(service.observe(snapshot).checking,true);await service.settled();assert.equal(service.status('direct').rows[0].status,'available');assert.equal(state.alerts.length,1);assert.equal(state.alerts[0].key,'docker-image:direct:c1:'+next);assert.ok(calls.every(c=>!c.init.method));service.observe(snapshot,true);await service.settled();assert.equal(state.alerts.length,1);
 fail=true;service.observe(snapshot,true);await service.settled();assert.equal(service.status('direct').rows[0].status,'unknown');assert.equal(state.alerts[0].status,'active');assert.ok(!JSON.stringify(service.status()).includes('secret'));
 fail=false;remote=old;service.observe(snapshot,true);await service.settled();assert.equal(state.alerts[0].status,'resolved');assert.equal(service.status('direct').rows[0].status,'current');
});
test('notification switch bypasses severity filters only for enabled update channels and never sends false recoveries',async()=>{
 const state={alerts:[],notificationPreferences:{enabled:true,notifyResolved:true,notifyDockerUpdates:true,minimumSeverity:'critical',channels:{discord:true,telegram:false,email:false}}},sent=[];const notifier=createNotifier({env:{DISCORD_WEBHOOK_URL:'https://discord.com/api/webhooks/1/test',DISCORD_NOTIFICATION_FILTER:'critical'},persistence:{get:()=>state,mutate:fn=>fn(state)},send:async(c,text)=>sent.push({c,text})});
 const alert={id:'a',key:'docker-image:direct:c1:'+next,status:'active',severity:'info',title:'Docker image update available',source:'host',triggered:new Date().toISOString()};await notifier.deliver([alert]);await notifier.deliver([alert]);assert.equal(sent.length,1);alert.status='resolved';alert.resolvedAt=new Date().toISOString();await notifier.deliver([alert]);assert.equal(sent.length,1);state.notificationPreferences.notifyDockerUpdates=false;await notifier.deliver([{...alert,id:'b',key:'docker-image:direct:c2:'+next,status:'active'}]);assert.equal(sent.length,1);
});
test('one registry check is shared by containers using the same host, tag and image',async()=>{
 let calls=0;const state={alerts:[]},service=createDockerImageUpdates({persistence:{get:()=>state,mutate:fn=>fn(state)},query:async p=>{calls++;return p.startsWith('/images/')?{RepoDigests:['nginx@'+old]}:{Descriptor:{digest:next}}}});service.observe({...snapshot,docker:{...snapshot.docker,containers:[...snapshot.docker.containers,{...snapshot.docker.containers[0],id:'c2'}]}});await service.settled();assert.equal(calls,2);assert.equal(service.status().rows.length,2);assert.equal(state.alerts.length,2);
});
test('install clears its update alert immediately and normal monitoring cannot falsely resolve an available image',async()=>{
 const state={alerts:[],metrics:[],rules:[]},service=createDockerImageUpdates({persistence:{get:()=>state,mutate:fn=>fn(state)},query:async p=>p.startsWith('/images/')?{RepoDigests:['nginx@'+old]}:{Descriptor:{digest:next}}});service.observe(snapshot);await service.settled();const {createMonitor}=await import('../src/monitor.js');let observations=0;const monitor=createMonitor({docker:{configured:()=>true,read:async()=>snapshot.docker}},{get:()=>state,mutate:fn=>fn(state)},async()=>[],async()=>({hosts:[]}),async()=>{},()=>observations++);await monitor.sample(true);assert.equal(state.alerts[0].status,'active');assert.equal(observations,1);service.installed('direct','c1',{});assert.equal(state.alerts[0].status,'resolved');assert.deepEqual(service.status('direct').rows,[]);
});
test('Docker update endpoints enforce owner review and explicit installation confirmation',async()=>{
 process.env.JWT_SECRET||='a'.repeat(64);process.env.JWT_REFRESH_SECRET||='b'.repeat(64);const {createApp}=await import('../src/app.js');let installs=0,checked=0;
 const row={containerId:'a'.repeat(64),status:'available',imageId:img,image:'nginx:latest',remoteDigest:next};const service={status:()=>({rows:[row],settings:{enabled:true,intervalHours:6}}),observe:()=>{checked++;return {}},settings:()=>({}),installed(){}};
 const app=createApp({authenticate:(req,res,next)=>{req.user={sub:'fixture',role:req.headers['x-role']||'viewer'};next()},imageUpdates:service,imageUpdateInstaller:async()=>{installs++;return {containerId:'new',message:'Updated'}},audit:async()=>{},monitor:{sample:async()=>snapshot,invalidate:async()=>{}}}),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const url=`http://127.0.0.1:${server.address().port}/api/docker/updates`,body=JSON.stringify({imageId:img,remoteDigest:next,configDigest:'fixture'});
 try{for(const role of ['viewer','operator','admin']){const headers={'x-role':role,'Content-Type':'application/json'};assert.equal((await fetch(url+'/check',{method:'POST',headers,body:'{}'})).status,403);assert.equal((await fetch(url+'/'+row.containerId+'/install',{method:'POST',headers,body})).status,403)}assert.equal(checked+installs,0);const headers={'x-role':'owner','Content-Type':'application/json'};const challenge=await fetch(url+'/'+row.containerId+'/install',{method:'POST',headers,body});assert.equal(challenge.status,409);const phrase=(await challenge.json()).confirmationPhrase;assert.equal(installs,0);const approved=await fetch(url+'/'+row.containerId+'/install',{method:'POST',headers:{...headers,'x-homecloud-confirm':phrase},body});assert.equal(approved.status,200);assert.equal(installs,1);}finally{server.closeAllConnections();await new Promise(r=>server.close(r))}
});
test('registry reads retain their exact paired-host scope',async()=>{
 const {selectedAgentHost}=await import('../src/node-agents.js');const state={alerts:[]},hosts=[];const fleet={dockerFleet:{hosts:['n:lxc/1','n:lxc/2'].map((id,i)=>({id,status:'reachable',inventory:{host:{hostname:id,engineId:id},containers:[{id:'c',name:'web',image:'nginx:latest',imageId:img}]}}))}};const service=createDockerImageUpdates({persistence:{get:()=>state,mutate:fn=>fn(state)},query:async p=>{hosts.push(selectedAgentHost());return p.startsWith('/images/')?{RepoDigests:['nginx@'+old]}:{Descriptor:{digest:selectedAgentHost()==='n:lxc/1'?next:old}}}});service.observe(fleet);await service.settled();assert.equal(state.alerts.length,1);assert.equal(service.status('n:lxc/1').rows[0].status,'available');assert.equal(service.status('n:lxc/2').rows[0].status,'current');assert.deepEqual(new Set(hosts),new Set(['n:lxc/1','n:lxc/2']));
});
test('header update alerts link to the matching Docker host and Updates page',async()=>{
 const {createHeaderNotifications}=await import('../src/header-notifications.js');const state={alerts:[{id:'u',key:'docker-image:n:lxc/1:c:'+next,updateHost:'n:lxc/1',status:'active',severity:'info',title:'Docker image update available',source:'node1/web'}]};const header=createHeaderNotifications({get:()=>state,mutate:fn=>fn(state)},()=>[]);assert.equal(header.read({sub:'viewer',role:'viewer'}).attention[0].link,'/docker?tab=Updates&host=n%3Alxc%2F1');
});
test('automatic checks honor their switch and interval, while explicit checks remain read-only',async()=>{
 const state={alerts:[]};let reads=0,now=Date.now();const service=createDockerImageUpdates({persistence:{get:()=>state,mutate:fn=>fn(state)},now:()=>now,query:async p=>{reads++;return p.startsWith('/images/')?{RepoDigests:['nginx@'+old]}:{Descriptor:{digest:old}}}});service.settings({enabled:false,intervalHours:6});service.observe(snapshot);assert.equal(reads,0);service.observe(snapshot,true);await service.settled();assert.equal(reads,2);service.settings({enabled:true,intervalHours:6});service.observe(snapshot);await service.settled();assert.equal(reads,2);now+=6*3600000;service.observe(snapshot);await service.settled();assert.equal(reads,4);assert.throws(()=>service.settings(null),e=>e.status===400);
});
test('installation progress is read-only, owner-only and isolated from other users, hosts and attempts',async()=>{
 process.env.JWT_SECRET||='a'.repeat(64);process.env.JWT_REFRESH_SECRET||='b'.repeat(64);const {createApp}=await import('../src/app.js');let release,started=false;const pending=new Promise(r=>release=r);
 const row={containerId:'a'.repeat(64),status:'available',imageId:img,image:'nginx:latest',remoteDigest:next},operationId='test-installation-attempt-1234';
 const app=createApp({authenticate:(req,res,next)=>{req.user={sub:req.headers['x-user']||'owner-one',role:req.headers['x-role']||'owner'};next()},imageUpdates:{status:()=>({rows:[row]}),installed(){}},imageUpdateInstaller:async(r,input,{onProgress})=>{started=true;onProgress(20,'Pulling image from registry');await pending;onProgress(95,'Finalizing');return {message:'Updated'}},audit:async()=>{},monitor:{invalidate(){}}}),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base=`http://127.0.0.1:${server.address().port}/api/docker/updates/${row.containerId}`,headers={'Content-Type':'application/json'},body=JSON.stringify({imageId:img,remoteDigest:next,configDigest:'fixture',operationId});let installation;
 try{
  const challenge=await fetch(base+'/install',{method:'POST',headers,body});assert.equal(challenge.status,409);const phrase=(await challenge.json()).confirmationPhrase;
  assert.equal((await (await fetch(base+'/progress?operation='+operationId)).json()).progress,null);
  installation=fetch(base+'/install',{method:'POST',headers:{...headers,'x-homecloud-confirm':phrase},body});for(let i=0;i<50&&!started;i++)await new Promise(r=>setTimeout(r,5));assert.ok(started);
  const progress=()=>fetch(base+'/progress?operation='+operationId);assert.equal((await (await progress()).json()).progress.percent,20);
  assert.equal((await fetch(base+'/progress?operation='+operationId,{headers:{'x-role':'viewer'}})).status,403);
  for(const header of [{'x-user':'owner-two'},{'x-homecloud-docker-host':'another-host'}])assert.equal((await (await fetch(base+'/progress?operation='+operationId,{headers:header})).json()).progress,null);
  assert.equal((await (await fetch(base+'/progress?operation=different-attempt-1234')).json()).progress,null);
  release();assert.equal((await installation).status,200);assert.equal((await (await progress()).json()).progress.percent,100);
 }finally{release();if(installation)await installation;server.closeAllConnections();await new Promise(r=>server.close(r))}
});
test('registry failures explain their cause without leaking raw messages',async()=>{
 const {registryCheckFailure}=await import('../src/docker-image-updates.js');
 for(const [error,code] of [[{dockerStatus:429},'registry-rate-limit'],[{dockerStatus:401},'registry-auth'],[{message:'x509 private-token'},'registry-tls'],[{message:'lookup registry: no such host private-token'},'registry-dns'],[{message:'Request expired private-token'},'registry-timeout'],[{dockerStatus:404},'registry-image-missing'],[{message:'Invalid Docker path private-token'},'connector-update'],[{dockerStatus:500},'registry-unavailable']]){
  const result=registryCheckFailure(error);assert.equal(result.code,code);assert.equal(result.status,'unknown');assert.ok(!JSON.stringify(result).includes('private-token'));
 }
});
test('transient registry errors retry once within bounded transport deadlines; auth and rate limits do not retry',async()=>{
 for(const status of [500,401,429]){
  const state={alerts:[]},calls=[];let failures=0;const service=createDockerImageUpdates({persistence:{get:()=>state,mutate:fn=>fn(state)},sleep:async()=>{},query:async(p,init)=>{calls.push({p,init});if(p.startsWith('/images/'))return {RepoDigests:['nginx@'+old]};if(++failures===1)throw Object.assign(Error('private-token'),{dockerStatus:status});return {Descriptor:{digest:next}}}});
  service.observe(snapshot,true);await service.settled();assert.equal(failures,status===500?2:1);assert.equal(service.status().rows[0].status,status===500?'available':'unknown');assert.equal(calls[0].init.timeoutMs,10000);assert.equal(calls[1].init.timeoutMs,15000);assert.ok(!JSON.stringify(service.status()).includes('private-token'));
 }
});
test('manual checks read only the selected guest and bypass a blocked fleet scan without being overwritten',async()=>{
 const {selectedAgentHost}=await import('../src/node-agents.js');let release;const blocked=new Promise(r=>release=r),state={alerts:[]},reads=[];
 const data={host:{hostname:'media-server',engineId:'media'},containers:[{id:'c1',name:'web',image:'nginx:latest',imageId:img}]};
 const service=createDockerImageUpdates({persistence:{get:()=>state,mutate:fn=>fn(state)},readHost:async()=>{reads.push(selectedAgentHost());return data},query:async p=>{if(selectedAgentHost()==='slow:qemu/1')await blocked;return p.startsWith('/images/')?{RepoDigests:['nginx@'+old]}:{Descriptor:{digest:selectedAgentHost()==='slow:qemu/1'?old:next}}}});
 service.observe({dockerFleet:{hosts:[{id:'slow:qemu/1',status:'reachable',inventory:data}]}});assert.equal(service.status().checking,true);
 const check=service.checkHost('node:qemu/201');assert.equal(check.manualChecking,true);service.checkHost('node:qemu/201');
 for(let i=0;i<50&&service.status('node:qemu/201').manualChecking;i++)await new Promise(r=>setTimeout(r,1));
 assert.deepEqual(reads,['node:qemu/201']);assert.equal(service.status('node:qemu/201').rows[0].status,'available');assert.equal(service.status('node:qemu/201').manualChecking,false);
 release();await service.settled();assert.equal(service.status('node:qemu/201').rows[0].status,'available');assert.equal(service.status('slow:qemu/1').rows[0].status,'current');
});
test('a newer selected-host result wins over an older in-flight automatic check for that same host',async()=>{
 let release,first=true;const block=new Promise(r=>release=r),state={alerts:[]},data={host:{hostname:'media',engineId:'m'},containers:[{id:'c1',name:'web',image:'nginx:latest',imageId:img}]};
 const service=createDockerImageUpdates({persistence:{get:()=>state,mutate:fn=>fn(state)},readHost:async()=>data,query:async p=>{if(p.startsWith('/images/'))return {RepoDigests:['nginx@'+old]};if(first){first=false;await block;return {Descriptor:{digest:old}}}return {Descriptor:{digest:next}}}});
 service.observe({dockerFleet:{hosts:[{id:'node:qemu/201',status:'reachable',inventory:data}]}});await new Promise(r=>setTimeout(r,0));service.checkHost('node:qemu/201');
 for(let i=0;i<50&&service.status('node:qemu/201').manualChecking;i++)await new Promise(r=>setTimeout(r,1));assert.equal(service.status('node:qemu/201').rows[0].status,'available');release();await service.settled();assert.equal(service.status('node:qemu/201').rows[0].status,'available');assert.equal(state.alerts[0].status,'active');
});
test('failed guest inventory retains update alerts, explains the guest failure, and can recover on a selected-host retry',async()=>{
 const state={alerts:[]};let failed=false;const data=snapshot.docker,service=createDockerImageUpdates({persistence:{get:()=>state,mutate:fn=>fn(state)},readHost:async()=>{if(failed)throw Error('Node agent request timed out private-token');return data},query:async p=>p.startsWith('/images/')?{RepoDigests:['nginx@'+old]}:{Descriptor:{digest:next}}});
 service.checkHost('node:qemu/201');await service.settled();assert.equal(state.alerts[0].status,'active');failed=true;service.checkHost('node:qemu/201');await service.settled();assert.equal(service.status('node:qemu/201').rows[0].code,'host-inventory-unavailable');assert.match(service.status('node:qemu/201').rows[0].detail,/guest inventory request timed out/);assert.equal(state.alerts[0].status,'active');assert.ok(!JSON.stringify(service.status()).includes('private-token'));
 failed=false;service.checkHost('node:qemu/201');await service.settled();assert.equal(service.status('node:qemu/201').rows[0].status,'available');
});
test('selected-host inventory requires no statistics, volume, network or image-list requests',async()=>{
 const {readUpdateHost}=await import('../src/docker-image-updates.js'),calls=[];const data=await readUpdateHost(async p=>{calls.push(p);return p==='/info'?{ID:'engine',Name:'media'}:[{Id:'c1',Names:['/web'],ImageID:img,Image:'nginx:latest'}]});assert.deepEqual(calls,['/containers/json?all=1','/info']);assert.equal(data.containers[0].name,'web');assert.equal(data.containers[0].imageId,img);
});
test('manual update endpoint queues the exact selected host without waiting for monitor.sample',async()=>{
 process.env.JWT_SECRET||='a'.repeat(64);process.env.JWT_REFRESH_SECRET||='b'.repeat(64);const {createApp}=await import('../src/app.js');let selected;
 const app=createApp({authenticate:(req,res,next)=>{req.user={sub:'fixture',role:'owner'};next()},imageUpdates:{checkHost:host=>{selected=host;return {checking:true,manualChecking:true}}},monitor:{sample(){throw Error('Must not wait for the fleet')},invalidate(){}},audit:async()=>{}}),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 try{const response=await fetch(`http://127.0.0.1:${server.address().port}/api/docker/updates/check`,{method:'POST',headers:{'Content-Type':'application/json','X-HomeCloud-Docker-Host':'node:qemu/201'},body:'{}'});assert.equal(response.status,200);assert.equal(selected,'node:qemu/201');assert.equal((await response.json()).result.manualChecking,true)}finally{server.closeAllConnections();await new Promise(r=>server.close(r))}
});
test('an inventory failure is visible even before any image rows exist, then clears on recovery',async()=>{
 const state={alerts:[]};let failed=true;const service=createDockerImageUpdates({persistence:{get:()=>state,mutate:fn=>fn(state)},readHost:async()=>{if(failed)throw Error('private-token');return {host:{hostname:'empty'},containers:[]}}});
 service.checkHost('');await service.settled();assert.match(service.status('').error,/did not return a usable inventory/);assert.ok(!JSON.stringify(service.status()).includes('private-token'));failed=false;service.checkHost('');await service.settled();assert.equal(service.status('').error,'');assert.deepEqual(service.status('').rows,[]);
});
test('completed image batches are visible while the remaining selected-host registry check is pending',async()=>{
 let release;const block=new Promise(r=>release=r),state={alerts:[]};const data={host:{hostname:'media'},containers:[1,2,3].map(i=>({id:'c'+i,name:'web'+i,image:'app'+i+':latest',imageId:img}))};
 const service=createDockerImageUpdates({persistence:{get:()=>state,mutate:fn=>fn(state)},readHost:async()=>data,query:async p=>{if(p.startsWith('/images/'))return {RepoDigests:[1,2,3].map(i=>'app'+i+'@'+old)};if(p.includes('app3'))await block;return {Descriptor:{digest:next}}}});service.checkHost('node:qemu/201');
 for(let i=0;i<50&&service.status('node:qemu/201').rows.length<2;i++)await new Promise(r=>setTimeout(r,1));
 assert.equal(service.status('node:qemu/201').rows.length,2);assert.deepEqual(service.status('node:qemu/201').progress,{stage:'registry',completed:2,total:3});assert.equal(service.status('node:qemu/201').manualChecking,true);release();await service.settled();assert.equal(service.status('node:qemu/201').rows.length,3);
});
test('fresh automatic guest inventory also clears an earlier manual inventory error',async()=>{
 const state={alerts:[]},service=createDockerImageUpdates({persistence:{get:()=>state,mutate:fn=>fn(state)},readHost:async()=>{throw Error('Node agent request timed out')},query:async p=>p.startsWith('/images/')?{RepoDigests:['nginx@'+old]}:{Descriptor:{digest:next}}});
 service.checkHost('node:qemu/201');await service.settled();assert.ok(service.status('node:qemu/201').error);service.observe({dockerFleet:{hosts:[{id:'node:qemu/201',status:'reachable',inventory:snapshot.docker}]}},true);await service.settled();assert.equal(service.status('node:qemu/201').error,'');assert.equal(service.status('node:qemu/201').rows[0].status,'available');
});
test('background installation acknowledges promptly, survives the request and reports its exact verified result',async()=>{
 process.env.JWT_SECRET||='a'.repeat(64);process.env.JWT_REFRESH_SECRET||='b'.repeat(64);const {createApp}=await import('../src/app.js');let release,started=false,installs=0,finished=false;const block=new Promise(r=>release=r),id='background-installation-12345';
 const row={containerId:'b'.repeat(64),status:'available',imageId:img,image:'nginx:latest',remoteDigest:next};const service={status:()=>({rows:[row]}),installed(){finished=true}};
 const app=createApp({authenticate:(req,res,next)=>{req.user={sub:req.headers['x-user']||'owner-one',role:'owner'};next()},imageUpdates:service,imageUpdateInstaller:async(r,input,{onProgress})=>{installs++;started=true;onProgress(20,'Pulling image');await block;return {containerId:'replacement',message:'Container updated and running.',imageCleanup:{status:'removed'}}},audit:async()=>{},monitor:{invalidate(){}}}),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base=`http://127.0.0.1:${server.address().port}/api/docker/updates/${row.containerId}`,headers={'Content-Type':'application/json'},body=JSON.stringify({imageId:img,remoteDigest:next,configDigest:'fixture',operationId:id,background:true});
 try{
  const challenge=await fetch(base+'/install',{method:'POST',headers,body}),phrase=(await challenge.json()).confirmationPhrase;
  const approved={...headers,'x-homecloud-confirm':phrase};const response=await fetch(base+'/install',{method:'POST',headers:approved,body});assert.equal(response.status,200);assert.equal((await response.json()).result.jobId,id);assert.equal(started,true);assert.equal(finished,false);
  const replay=await fetch(base+'/install',{method:'POST',headers:approved,body});assert.equal(replay.status,200);assert.equal(installs,1);
  const progress=()=>fetch(base+'/progress?operation='+id);assert.equal((await (await progress()).json()).progress.percent,20);
  assert.equal((await (await fetch(base+'/progress?operation='+id,{headers:{'x-user':'other-owner'}})).json()).progress,null);
  release();for(let i=0;i<50&&!finished;i++)await new Promise(r=>setTimeout(r,1));const result=(await (await progress()).json()).progress;assert.equal(result.status,'completed');assert.equal(result.percent,100);assert.equal(result.result.containerId,'replacement');assert.equal(result.result.imageCleanup.status,'removed');
 }finally{release();server.closeAllConnections();await new Promise(r=>server.close(r))}
});
test('background installation failure remains available with its explanation and never reports success',async()=>{
 process.env.JWT_SECRET||='a'.repeat(64);process.env.JWT_REFRESH_SECRET||='b'.repeat(64);const {createApp}=await import('../src/app.js');const id='background-failed-attempt-12345',row={containerId:'b'.repeat(64),status:'available',imageId:img,image:'nginx:latest',remoteDigest:next};let installs=0;
 const app=createApp({authenticate:(req,res,next)=>{req.user={sub:'owner',role:'owner'};next()},imageUpdates:{status:()=>({rows:[row]}),installed(){throw Error('Must not complete')}},imageUpdateInstaller:async()=>{installs++;throw Error('Image download timed out. The original container was not stopped.')},audit:async()=>{},monitor:{invalidate(){}}}),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}/api/docker/updates/${row.containerId}`,body=JSON.stringify({operationId:id,background:true}),headers={'Content-Type':'application/json'};
 try{const challenge=await fetch(base+'/install',{method:'POST',headers,body}),phrase=(await challenge.json()).confirmationPhrase;const approved={...headers,'x-homecloud-confirm':phrase};assert.equal((await fetch(base+'/install',{method:'POST',headers:approved,body})).status,200);const progress=(await (await fetch(base+'/progress?operation='+id)).json()).progress;assert.equal(progress.status,'failed');assert.ok(progress.percent<100);assert.match(progress.error,/original container was not stopped/);await fetch(base+'/install',{method:'POST',headers:approved,body});assert.equal(installs,1)}finally{server.closeAllConnections();await new Promise(r=>server.close(r))}
});

test('a stalled registry cannot block the scan forever or falsely resolve an update alert',async()=>{
 const state={alerts:[{key:'docker-image:direct:c1:'+next,status:'active'}]};let calls=0;
 const service=createDockerImageUpdates({persistence:{get:()=>state,mutate:fn=>fn(state)},scanBudgetMs:20,query:async p=>{calls++;if(p.startsWith('/images/'))return {RepoDigests:['nginx@'+old]};return new Promise(()=>{})}});
 service.observe(snapshot,true);await service.settled();assert.equal(service.status().checking,false);assert.equal(service.status().rows[0].status,'unknown');assert.equal(state.alerts[0].status,'active');assert.equal(calls,2);
});
test('rolling image workers publish fast results and start later work before a slow pair finishes',async()=>{
 let release;const gate=new Promise(r=>release=r),state={alerts:[]},seen=[];
 const data={host:{hostname:'engine'},containers:[1,2,3,4].map(i=>({id:'c'+i,name:'web'+i,image:'app'+i+':latest',imageId:img}))};
 const service=createDockerImageUpdates({persistence:{get:()=>state,mutate:fn=>fn(state)},readHost:async()=>data,query:async p=>{if(p.startsWith('/images/'))return {RepoDigests:[1,2,3,4].map(i=>'app'+i+'@'+old)};seen.push(p);if(p.includes('app1'))await gate;return {Descriptor:{digest:next}}}});
 try{service.checkHost('node:qemu/201');for(let i=0;i<50&&!seen.some(p=>p.includes('app4'));i++)await new Promise(r=>setTimeout(r,1));assert.ok(seen.some(p=>p.includes('app4')));assert.equal(service.status('node:qemu/201').rows.length,3);assert.equal(service.status('node:qemu/201').manualChecking,true);}finally{release();await service.settled()}
});

test('stalled selected-host inventory releases checking and reports a retryable inventory failure',async()=>{
 const state={alerts:[]},service=createDockerImageUpdates({persistence:{get:()=>state,mutate:fn=>fn(state)},inventoryBudgetMs:10,readHost:()=>new Promise(()=>{})});
 service.checkHost('node:qemu/201');await service.settled();assert.equal(service.status('node:qemu/201').manualChecking,false);assert.match(service.status('node:qemu/201').error,/timed out/);
});
