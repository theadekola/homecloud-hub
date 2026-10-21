// Disposable CI-only Docker recovery drill. No published ports or customer resources.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createDockerUpdateProgress} from '../apps/api/src/docker-update-progress.js';
import {recoverDockerUpdate} from '../apps/api/src/docker-update-recovery.js';
import {updatePlan} from '../apps/api/src/docker-install-update.js';
if(process.env.ICLUSTERS_CI_DRILL!=='1'||process.env.GITHUB_ACTIONS!=='true')throw Error('This disposable-resource drill is restricted to explicit CI execution.');
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const query=(route,options={})=>new Promise((resolve,reject)=>{const req=http.request({socketPath:'/var/run/docker.sock',path:route,method:options.method||'GET',headers:{'Content-Type':'application/json'}},res=>{let body='';res.on('data',part=>body+=part);res.on('error',reject);res.on('end',()=>{if(res.statusCode>=300)return reject(Object.assign(Error(`Disposable Docker request failed (${res.statusCode}).`),{dockerStatus:res.statusCode}));try{resolve(body?JSON.parse(body):{})}catch{reject(Error('Unexpected Docker response.'))}})});req.setTimeout(options.timeoutMs||15000,()=>req.destroy(Error('Disposable Docker request timed out.')));req.on('error',reject);req.end(options.body)});
const containerExec=async(id,script)=>{const exec=await query(`/containers/${id}/exec`,{method:'POST',body:JSON.stringify({AttachStdout:false,AttachStderr:false,Cmd:['node','-e',script]})});await query(`/exec/${exec.Id}/start`,{method:'POST',body:JSON.stringify({Detach:true})});let state;for(let i=0;i<50;i++){state=await query(`/exec/${exec.Id}/json`);if(!state.Running)break;await new Promise(r=>setTimeout(r,100))}assert.equal(state.Running,false);assert.equal(state.ExitCode,0)};
const stage=process.argv[2];
if(stage){
 const c=JSON.parse(fs.readFileSync(process.env.ICLUSTERS_DRILL_CONTEXT,'utf8')),service=createDockerUpdateProgress({file:c.file}),tracking=service.start('ci',c.host,c.name,c.attempt);
 tracking.report(20,'Disposable pull stage');
 if(stage!=='pull'){
  const old=await query(`/containers/${c.oldId}/json`),image=await query(`/images/${c.image}/json`),plan=updatePlan(old,image);
  const checkpoint={oldId:old.Id,oldImage:old.Image,oldName:c.name,backupName:c.backup,tempName:c.temp,newImage:c.image,plan,configHash:hash(old.Config),hostHash:hash({...old.HostConfig,RestartPolicy:null})};
  tracking.checkpoint(checkpoint);
  if(stage!=='prepared'){
   const next=await query('/containers/create?name='+c.temp,{method:'POST',body:JSON.stringify({...old.Config,Image:c.image,HostConfig:plan.host,NetworkingConfig:{EndpointsConfig:plan.networks}})});
   checkpoint.newId=next.Id;tracking.checkpoint(checkpoint);
   await query(`/containers/${c.oldId}/update`,{method:'POST',body:JSON.stringify({RestartPolicy:{Name:'no',MaximumRetryCount:0}})});
   await query(`/containers/${c.oldId}/stop?t=1`,{method:'POST'});
   if(stage!=='stopped'){
    await query(`/containers/${c.oldId}/rename?name=${c.backup}`,{method:'POST'});
    await query(`/networks/${c.network}/disconnect`,{method:'POST',body:JSON.stringify({Container:c.oldId,Force:false})});
    if(stage==='replacement'){
     await query(`/containers/${next.Id}/rename?name=${c.name}`,{method:'POST'});
     await query(`/containers/${next.Id}/start`,{method:'POST'});
    }
   }
  }
 }
 // Bypass normal error/finally handlers, just as an abrupt worker loss does.
 process.kill(process.pid,'SIGKILL');
}else{
 const image=process.env.ICLUSTERS_DRILL_IMAGE;if(!/^sha256:[a-f0-9]{64}$/.test(image||''))throw Error('A built CI image ID is required.');
 process.env.JWT_SECRET=crypto.randomBytes(48).toString('hex');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'iclusters-crash-'));fs.chmodSync(root,0o700);
 const results=[];
 try{for(const phase of ['pull','prepared','stopped','renamed','replacement']){
  const name='iclusters-ci-drill-'+crypto.randomBytes(8).toString('hex'),network=name+'-net',volume=name+'-data';
  const c={name,network,volume,image,file:path.join(root,name+'.json'),attempt:'crash-attempt-'+crypto.randomBytes(12).toString('hex'),host:'ci-only',backup:name+'-old',temp:name+'-next'};
  try{
   await query('/networks/create',{method:'POST',body:JSON.stringify({Name:network,Internal:true,Labels:{'iclusters.ci-drill':'true'}})});
   await query('/volumes/create',{method:'POST',body:JSON.stringify({Name:volume,Labels:{'iclusters.ci-drill':'true'}})});
   const created=await query('/containers/create?name='+name,{method:'POST',body:JSON.stringify({Image:image,Entrypoint:['node','-e',"setInterval(()=>{},1000)"],Cmd:[],Labels:{'iclusters.ci-drill':'true'},HostConfig:{Binds:[volume+':/acceptance-data'],NetworkMode:network,RestartPolicy:{Name:'unless-stopped'}},NetworkingConfig:{EndpointsConfig:{[network]:{Aliases:['acceptance-original']}}}})});c.oldId=created.Id;
   await query(`/containers/${c.oldId}/start`,{method:'POST'});
   await containerExec(c.oldId,"require('fs').writeFileSync('/acceptance-data/sentinel','retained-original-data')");
   const context=path.join(root,'context.json');fs.writeFileSync(context,JSON.stringify(c),{mode:0o600});
   const worker=spawnSync(process.execPath,[fileURLToPath(import.meta.url),phase],{env:{...process.env,ICLUSTERS_DRILL_CONTEXT:context},timeout:60000,stdio:['ignore','pipe','pipe']});
   assert.equal(worker.signal,'SIGKILL',`${phase}: worker did not reach its intentional crash`);
   const restarted=createDockerUpdateProgress({file:c.file});assert.equal(restarted.read('ci',c.host,name,c.attempt).progress.status,'interrupted');
   assert.throws(()=>restarted.start('another-user',c.host,name,'duplicate-attempt-1234'),e=>e.status===409);
   const claim=restarted.interrupted('ci',c.host,name,c.attempt);
   assert.throws(()=>restarted.interrupted('ci',c.host,name,c.attempt),e=>e.status===409);
   const result=await recoverDockerUpdate(claim.checkpoint,{query});assert.ok(result.restored||phase==='pull'&&result.interrupted);
   claim.tracking.fail('CI original restored and verified',{recovered:true});
   const restored=await query(`/containers/${c.oldId}/json`);assert.equal(restored.Name,'/'+name);assert.equal(restored.State.Running,true);assert.equal(restored.HostConfig.RestartPolicy.Name,'unless-stopped');assert.ok(restored.NetworkSettings.Networks[network].Aliases.includes('acceptance-original'));
   assert.equal(restored.Mounts.find(m=>m.Destination==='/acceptance-data')?.Name,volume);
   await containerExec(c.oldId,"process.exit(require('fs').readFileSync('/acceptance-data/sentinel','utf8')==='retained-original-data'?0:1)");
   results.push({phase,workerKilled:true,exclusiveRecovery:true,originalRunning:true,networkAliasRetained:true,namedVolumeDataVerified:true});
  }finally{
   const failures=[];
   for(const candidate of [c.name,c.backup,c.temp]){try{await query('/containers/'+candidate+'?force=true&v=false',{method:'DELETE'})}catch(e){if(e.dockerStatus!==404)failures.push(e)}}
   try{await query('/volumes/'+volume,{method:'DELETE'})}catch(e){if(e.dockerStatus!==404)failures.push(e)}
   try{await query('/networks/'+network,{method:'DELETE'})}catch(e){if(e.dockerStatus!==404)failures.push(e)}
   if(failures.length)throw Error('Disposable drill cleanup failed; inspect CI runner.');
  }
 }
 fs.mkdirSync('artifacts/evidence',{recursive:true});fs.writeFileSync('artifacts/evidence/docker-crash-recovery.json',JSON.stringify({schema:1,scope:'Local disposable Docker containers and killed worker; not a live paired-provider, image-download, database-migration or customer acceptance test.',results},null,2));console.log('Disposable Docker worker-crash recovery passed at all five stages.');
 }finally{fs.rmSync(root,{recursive:true,force:true})}
}
