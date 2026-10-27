import test from 'node:test';
import assert from 'node:assert/strict';
import {createGuestPermissionRepair,permissionRoles} from '../src/guest-permissions.js';
const needed='VM.GuestAgent.Unrestricted';
function fixture(options={}){
 const config={url:'https://pve.example:8006',tokenId:'iclusters@pve!reader',tokenSecret:'saved-secret',verifyTls:true,ca:'trusted-ca'},calls=[],roles=new Map(),acl=[],base={};
 for(const id of (options.power?['100','101','200']:['100','101']))for(const subject of ['iclusters@pve','iclusters@pve!reader'])base[subject+':/vms/'+id]={'VM.Audit':1,'VM.Backup':0};
 function effective(subject,path){const row={...base[subject+':'+path]};for(const a of acl)if(a.ugid===subject&&a.path===path)for(const p of roles.get(a.roleid)||[])row[p]=Number(a.propagate);if(subject.includes('!')){const user=effective(subject.split('!')[0],path);for(const p of Object.keys(row))if(!Object.hasOwn(user,p))delete row[p];}return row;}
 const response=(data,status=200)=>({ok:status<400,status,json:async()=>({data})});
 const query=async(path,init,c)=>{
  calls.push({path,method:'token'});assert.equal(c,config);
  if(path.startsWith('/cluster/resources'))return [{vmid:100,name:'One',node:'n1',type:'qemu',status:'running'},{vmid:101,name:'Two',node:'n2',type:'qemu',status:'running'},{vmid:200,name:'CT',node:'n1',type:'lxc'}];
  const u=new URL('https://pve.example'+path),target=u.searchParams.get('path');return {[target]:options.verifyFail?{'VM.Audit':1}:effective(options.privsep===false?'iclusters@pve':'iclusters@pve!reader',target)};
 };
 const transport=async(url,init,tls)=>{
  assert.equal(new URL(url).origin,new URL(config.url).origin);assert.equal(tls.rejectUnauthorized,config.verifyTls!==false);assert.equal(tls.ca,config.ca);const u=new URL(url),path=u.pathname.replace('/api2/json',''),form=Object.fromEntries(new URLSearchParams(init.body));calls.push({path,method:init.method,form,headers:init.headers});
  if(path==='/access/ticket'){assert.equal(form.username,'root@pam');assert.equal(form.password,'fresh password');if(options.authFail)return response({},401);if(options.tfa)return response({NeedTFA:1,ticket:'PVE:!tfa!challenge',CSRFPreventionToken:'csrf'});return response({ticket:'ticket',CSRFPreventionToken:'csrf'});}
  assert.equal(init.headers.Cookie,'PVEAuthCookie=ticket');assert.equal(init.headers.CSRFPreventionToken,'csrf');
  if(options.failWrite&&init.method==='PUT')return response({},403);
  if(path==='/version')return response({version:options.version||'9.1'});
  if(path.startsWith('/access/users/'))return response({privsep:options.privsep===false?0:1});
  if(path==='/access/permissions'){
   const at=u.searchParams.get('path'),who=u.searchParams.get('userid');
   if(at==='/access')return response({'/access':options.limited?{'Sys.Audit':1}:{'Sys.Audit':1,'Sys.Modify':1,'Permissions.Modify':1}});
   return response({[at]:effective(who,at)});
  }
  if(path==='/access/roles'&&init.method==='GET')return response([...roles].map(([roleid,privs])=>({roleid,privs:privs.join(',')})));
  if(path.startsWith('/access/roles/'))return response(Object.fromEntries((options.conflicting?['Permissions.Modify']:roles.get(path.split('/').pop())||[]).map(p=>[p,1])));
  if(path==='/access/roles'&&init.method==='POST'){roles.set(form.roleid,form.privs.split(' '));return response(null);}
  if(path==='/access/acl'&&init.method==='GET')return response(options.noAccess?[{path:'/vms/100',ugid:'iclusters@pve',type:'user',roleid:'NoAccess',propagate:1}]:[...acl].reverse());
  if(path==='/access/acl'&&init.method==='PUT'){acl.push({path:form.path,ugid:form.users||form.tokens,type:form.users?'user':'token',roleid:form.roles,propagate:Number(form.propagate)});return response(null);}
  throw Error('Unexpected '+path);
 };
 const service=createGuestPermissionRepair({config:()=>config,query,transport,...(options.power?{privilege:'VM.PowerMgmt',resourceTypes:['qemu','lxc']}:{})});
 const input=async extra=>({username:'root@pam',password:'fresh password',vmids:['100'],confirm:true,connectionId:(await service.inspect()).connectionId,...extra});
 return {service,config,calls,roles,acl,base,effective,input,transport,query};
}
test('permission roles retain both direct and inherited privileges without broadening propagation',()=>{
 const roles=permissionRoles({'VM.Audit':1,'VM.Backup':0});assert.deepEqual(roles.map(r=>[r.propagate,r.privs]),[[0,['VM.Backup',needed]],[1,['VM.Audit']]]);assert.deepEqual(permissionRoles({'VM.Backup':0,'VM.Audit':1}),roles);
});
test('repair updates only selected VM user and separated token ACLs, preserving privileges and clearing credentials',async()=>{
 const f=fixture(),input=await f.input();const result=await f.service.repair(input);assert.equal(result.verified,true);assert.equal(input.password,'');assert.ok(f.acl.length);assert.ok(f.acl.every(a=>a.path==='/vms/100'));assert.ok(f.acl.some(a=>a.type==='token'));assert.deepEqual(f.effective('iclusters@pve!reader','/vms/100'),{'VM.Audit':1,'VM.Backup':0,[needed]:0});assert.equal(f.effective('iclusters@pve!reader','/vms/101')[needed],undefined);assert.ok(!JSON.stringify(result).includes('secret'));assert.ok(!JSON.stringify(await f.service.inspect()).includes('saved-secret'));
 const repeat=await f.service.repair(await f.input());assert.equal(repeat.changed,false);
});
test('non-separated tokens need only a user grant and token settings stay unchanged',async()=>{
 const f=fixture({privsep:false});assert.equal((await f.service.repair(await f.input())).verified,true);assert.ok(f.acl.every(a=>a.type==='user'));assert.ok(!f.calls.some(c=>c.method==='PUT'&&c.path.includes('/token/')));
});
test('stale connection, unknown VM, invalid selection and missing consent never send credentials',async()=>{
 for(const extra of [{confirm:false},{vmids:[]},{vmids:['200']},{vmids:['100;reboot']},{connectionId:'stale'},{username:'root'},{otp:'wrong'}]){const f=fixture();const input=await f.input(extra);await assert.rejects(()=>f.service.repair(input));assert.ok(!f.calls.some(c=>c.path==='/access/ticket'));}
});

test('permission setup honors explicitly configured self-signed TLS without requiring a CA',async()=>{const f=fixture({power:true});f.config.verifyTls=false;delete f.config.ca;const input=await f.input();assert.equal((await f.service.repair(input)).verified,true);assert.equal(input.password,'');assert.ok(f.calls.some(c=>c.path==='/access/ticket'));});
test('bad authentication, MFA challenges, limited administrators, old versions and explicit NoAccess fail before mutations',async()=>{
 for(const options of [{authFail:true},{tfa:true},{limited:true},{version:'8.4'},{noAccess:true}]){const f=fixture(options),input=await f.input();await assert.rejects(()=>f.service.repair(input));assert.equal(input.password,'');assert.ok(!f.calls.some(c=>['POST','PUT'].includes(c.method)&&c.path!=='/access/ticket'));}
});
test('conflicting roles and failed verification never claim success',async()=>{
 const f=fixture();for(const r of permissionRoles({'VM.Audit':1,'VM.Backup':0}))f.roles.set(r.roleid,['Permissions.Modify']);const input=await f.input();await assert.rejects(()=>f.service.repair(input));assert.equal(f.acl.length,0);
 const unavailable=fixture({verifyFail:true});const second=await unavailable.input();await assert.rejects(()=>unavailable.service.repair(second),/Some permissions were applied/);
});

test('token privilege already granted but masked by its user is verified after repairing the user',async()=>{
 const f=fixture();f.base['iclusters@pve!reader:/vms/100'][needed]=1;const result=await f.service.repair(await f.input());assert.equal(result.verified,true);assert.ok(f.acl.every(a=>a.type==='user'));
});
test('connection change during authentication stops before further calls and clears credentials',async()=>{
 const f=fixture(),input=await f.input();f.config.url='https://other.example:8006';await assert.rejects(()=>f.service.repair(input),{status:409});assert.ok(!f.calls.some(c=>c.path==='/access/ticket'));
});
test('repair routes are owner-only, never audit credentials, and invalidate discovery after verification',async()=>{
 process.env.JWT_SECRET||='a'.repeat(64);process.env.JWT_REFRESH_SECRET||='b'.repeat(64);
 const {createApp}=await import('../src/app.js');let reads=0,writes=0,invalidations=0;const audits=[];
 const app=createApp({authenticate:(req,res,next)=>{req.user={sub:'fixture',role:req.headers['x-role']||'viewer'};next()},guestPermissions:{inspect:async()=>{reads++;return {guests:[]}},repair:async body=>{writes++;assert.equal(body.password,'fresh password');return {ok:true,verified:true,vmids:['100'],changed:true}}},audit:async(req,...args)=>{assert.equal(req.body.password,'');audits.push(args)},monitor:{invalidate:async()=>{invalidations++}}});
 app.set('trust proxy',1);const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const url=`http://127.0.0.1:${server.address().port}/api/connections/proxmox/guest-permissions`;
 try{for(const role of ['viewer','operator','admin'])for(const method of ['GET','POST']){const res=await fetch(url,{method,headers:{'Content-Type':'application/json','x-role':role},...(method==='POST'?{body:'{"password":"fresh password"}'}:{})});assert.equal(res.status,403);}assert.equal(reads+writes,0);
 const read=await fetch(url,{headers:{'x-role':'owner'}});assert.equal(read.status,200);assert.equal(read.headers.get('cache-control'),'no-store');
 const insecure=await fetch(url,{method:'POST',headers:{'x-role':'owner','Content-Type':'application/json'},body:'{"password":"fresh password"}'});assert.equal(insecure.status,400);assert.equal(writes,0);
 const write=await fetch(url,{method:'POST',headers:{'x-role':'owner','Content-Type':'application/json','X-Forwarded-Proto':'https'},body:'{"password":"fresh password","vmids":["100"]}'});assert.equal(write.status,200);assert.equal((await write.json()).verified,true);assert.equal(invalidations,1);assert.equal(writes,1);assert.ok(!JSON.stringify(audits).includes('fresh password'));
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});

test('real HTTPS repair verifies the configured CA, uses an ephemeral ticket and CSRF token, and rejects an untrusted certificate',async()=>{
 const {default:fs}=await import('node:fs'),{default:os}=await import('node:os'),{default:path}=await import('node:path'),{default:https}=await import('node:https'),{spawnSync}=await import('node:child_process');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'iclusters-guest-permissions-')),key=path.join(dir,'key.pem'),cert=path.join(dir,'cert.pem');
 try{
 const generated=spawnSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1'],{encoding:'utf8'});assert.equal(generated.status,0,generated.stderr);
 const f=fixture(),seen=[];f.config.ca=fs.readFileSync(cert,'utf8');
 const server=https.createServer({key:fs.readFileSync(key),cert:f.config.ca},async(req,res)=>{try{
 let raw='';for await(const chunk of req)raw+=chunk;seen.push({url:req.url,method:req.method,authorization:req.headers.authorization,cookie:req.headers.cookie,csrf:req.headers.csrfpreventiontoken});
 const path=req.url.replace('/api2/json','');let result;
 if(req.headers.authorization){assert.equal(req.headers.authorization,'PVEAPIToken=iclusters@pve!reader=saved-secret');result=await f.query(path,{},f.config);}else{
 const reply=await f.transport(f.config.url+req.url,{method:req.method,body:raw||undefined,headers:{Cookie:req.headers.cookie,CSRFPreventionToken:req.headers.csrfpreventiontoken}}, {rejectUnauthorized:f.config.verifyTls!==false,ca:f.config.ca});result=(await reply.json()).data;
 }res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:result}));
 }catch(error){res.statusCode=500;res.end(JSON.stringify({error:error.message}));}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));f.config.url=`https://127.0.0.1:${server.address().port}`;
 try{
 const service=createGuestPermissionRepair({config:()=>f.config}),connection=await service.inspect(),input={...await f.input(),connectionId:connection.connectionId};assert.equal((await service.repair(input)).verified,true);
 assert.ok(seen.some(r=>r.method==='PUT'&&r.cookie==='PVEAuthCookie=ticket'&&r.csrf==='csrf'));assert.ok(seen.some(r=>r.authorization&&r.url.includes('/access/permissions')));
 const credentialCalls=seen.filter(r=>r.url.includes('/access/ticket')).length;delete f.config.ca;
 const rejected=createGuestPermissionRepair({config:()=>f.config,query:f.query});const untrusted={...await f.input()};await assert.rejects(()=>rejected.repair(untrusted),/TLS trust/);assert.equal(seen.filter(r=>r.url.includes('/access/ticket')).length,credentialCalls);
 f.config.verifyTls=false;const selfSigned=createGuestPermissionRepair({config:()=>f.config});const inspected=await selfSigned.inspect();assert.equal(inspected.trustedTls,false);assert.equal((await selfSigned.repair({...await f.input(),connectionId:inspected.connectionId,vmids:['101']})).verified,true);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('concurrent repairs are rejected while the active repair retains its connection binding',async()=>{
 const f=fixture();let release,entered;const gate=new Promise(r=>release=r),ready=new Promise(r=>entered=r);
 const service=createGuestPermissionRepair({config:()=>f.config,query:f.query,transport:async(...args)=>{if(args[0].endsWith('/access/ticket')){entered();await gate;}return f.transport(...args)}});
 const input=await f.input(),pending=service.repair(input);await ready;const second=await f.input();await assert.rejects(()=>service.repair(second),{status:409});release();assert.equal((await pending).verified,true);
});
test('changing the configured token during login stops all permission mutations',async()=>{
 const f=fixture();const service=createGuestPermissionRepair({config:()=>f.config,query:f.query,transport:async(...args)=>{const result=await f.transport(...args);if(args[0].endsWith('/access/ticket'))f.config.tokenId='another@pve!token';return result}});
 const input=await f.input();await assert.rejects(()=>service.repair(input),/connection changed/);assert.equal(f.acl.length,0);assert.equal(input.password,'');
});
test('a failed write reports partial changes, releases the lock and permits a fresh retry',async()=>{
 const options={failWrite:true},f=fixture(options),input=await f.input();await assert.rejects(()=>f.service.repair(input),/Some permissions were applied/);assert.equal(input.password,'');options.failWrite=false;assert.equal((await f.service.repair(await f.input())).verified,true);
});
test('verified repair can clear cached discovery permission errors immediately',async()=>{
 const {inspectGuests,resetGuestDiscovery}=await import('../src/guest-discovery.js');const guests=[{id:'100',name:'One',node:'n1',status:'running'}];let reads=0;
 const denied=async()=>{reads++;throw Object.assign(Error('Proxmox HTTP 403'),{providerStatus:403})};await inspectGuests(guests,denied,'repair-cache');await inspectGuests(guests,denied,'repair-cache');assert.equal(reads,1);resetGuestDiscovery();
 const result=await inspectGuests(guests,async path=>path.endsWith('get-osinfo')?{result:{id:'linux'}}:path.endsWith('/exec')?{pid:42}:{exited:true,exitcode:0,'out-data':'__SERVICES__\nnginx.service loaded active running\n__END__'},'repair-cache');assert.equal(result.limitations.length,0);assert.equal(result.reports[0].services[0].name,'nginx.service');
});

test('repair list excludes already verified access, including direct non-propagated grants, and restores revoked VMs',async()=>{
 const f=fixture();for(const subject of ['iclusters@pve','iclusters@pve!reader'])f.base[subject+':/vms/100'][needed]=0;
 let state=await f.service.inspect();assert.deepEqual(state.guests.map(g=>g.id),['101']);assert.equal(state.verifiedCount,1);assert.equal(state.totalCount,2);assert.ok(!f.calls.some(c=>c.path==='/access/ticket'));
 delete f.base['iclusters@pve!reader:/vms/100'][needed];state=await f.service.inspect();assert.deepEqual(state.guests.map(g=>g.id),['100','101']);assert.equal(state.verifiedCount,0);
 const result=await f.service.repair(await f.input());assert.equal(result.verified,true);state=await f.service.inspect();assert.deepEqual(state.guests.map(g=>g.id),['101']);assert.equal(state.verifiedCount,1);
});
test('repair list checks effective token access rather than its user permission alone',async()=>{
 const f=fixture();f.base['iclusters@pve:/vms/100'][needed]=1;const state=await f.service.inspect();assert.deepEqual(state.guests.map(g=>g.id),['100','101']);assert.equal(state.verifiedCount,0);
});
test('unavailable permission checks remain visible with a warning instead of disappearing',async()=>{
 const config={url:'https://pve.example:8006',tokenId:'iclusters@pve!reader',tokenSecret:'saved',verifyTls:true};
 const service=createGuestPermissionRepair({config:()=>config,query:async path=>{if(path.startsWith('/cluster/resources'))return [{vmid:100,name:'Unknown',node:'n1',type:'qemu'},{vmid:101,name:'Verified',node:'n1',type:'qemu'}];if(path.includes('100'))throw Error('Unavailable');return {'/vms/101':{[needed]:0}};}});
 const state=await service.inspect();assert.deepEqual(state.guests.map(g=>g.id),['100']);assert.match(state.guests[0].permissionError,/could not be verified/);assert.equal(state.verifiedCount,1);
});


test('power setup grants only VM.PowerMgmt to selected VMs and CTs for both user and token',async()=>{
 const f=fixture({power:true}),inspection=await f.service.inspect();assert.equal(inspection.privilege,'VM.PowerMgmt');assert.deepEqual(inspection.guests.map(g=>[g.id,g.kind]),[['100','VM'],['101','VM'],['200','CT']]);
 const input=await f.input({vmids:['100','200']}),result=await f.service.repair(input);assert.equal(result.verified,true);assert.equal(input.password,'');assert.ok(f.acl.every(a=>['/vms/100','/vms/200'].includes(a.path)));assert.ok(f.acl.some(a=>a.type==='user'));assert.ok(f.acl.some(a=>a.type==='token'));
 for(const id of ['100','200'])assert.deepEqual(f.effective('iclusters@pve!reader','/vms/'+id),{'VM.Audit':1,'VM.Backup':0,'VM.PowerMgmt':0});assert.equal(f.effective('iclusters@pve!reader','/vms/101')['VM.PowerMgmt'],undefined);assert.ok([...f.roles.values()].flat().every(p=>!['VM.GuestAgent.Unrestricted','Permissions.Modify'].includes(p)));
 assert.equal((await f.service.inspect()).guests.length,1);assert.equal((await f.service.repair(await f.input({vmids:['100','200']}))).changed,false);
});
test('power and discovery setup bindings cannot be exchanged even on the same connection',async()=>{
 const f=fixture({power:true}),discovery=createGuestPermissionRepair({config:()=>f.config,query:f.query,transport:f.transport}),wrong=(await discovery.inspect()).connectionId;
 await assert.rejects(f.service.repair(await f.input({connectionId:wrong})),{status:409});assert.equal(f.acl.length,0);
});
test('power setup HTTP routes require owner, trusted transport and explicit verified service results',async()=>{
 process.env.JWT_SECRET||='a'.repeat(64);process.env.JWT_REFRESH_SECRET||='b'.repeat(64);const {createApp}=await import('../src/app.js');let writes=0;const audits=[];
 const app=createApp({authenticate:(req,res,next)=>{req.user={sub:'fixture',role:req.headers['x-role']||'viewer'};next()},powerPermissions:{inspect:async()=>({guests:[],privilege:'VM.PowerMgmt'}),repair:async body=>{writes++;assert.equal(body.password,'fresh');return {verified:true,vmids:['200'],changed:true}}},audit:async(req,...args)=>{assert.equal(req.body.password,'');audits.push(args)},monitor:{invalidate:async()=>{}}});app.set('trust proxy',1);const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const url=`http://127.0.0.1:${server.address().port}/api/connections/proxmox/power-permissions`;
 try{for(const role of ['viewer','operator','admin'])for(const method of ['GET','POST']){const r=await fetch(url,{method,headers:{'x-role':role,'Content-Type':'application/json'},...(method==='POST'?{body:'{}'}:{})});assert.equal(r.status,403)}
 const insecure=await fetch(url,{method:'POST',headers:{'x-role':'owner','Content-Type':'application/json'},body:'{"password":"fresh"}'});assert.equal(insecure.status,400);assert.equal(writes,0);
 const r=await fetch(url,{method:'POST',headers:{'x-role':'owner','Content-Type':'application/json','X-Forwarded-Proto':'https'},body:'{"password":"fresh","vmids":["200"]}'});assert.equal(r.status,200);assert.equal(writes,1);assert.ok(!JSON.stringify(audits).includes('fresh'));assert.ok(JSON.stringify(audits).includes('connection.proxmox.power-permissions'));
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r))}
});
