import crypto from 'node:crypto';
import {docker} from './connectors.js';
import {digestPattern,imageRepository,trackedImageLabel} from './docker-image-updates.js';
const fail=(message,status=409)=>Object.assign(Error(message),{status});
const fingerprint=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const locks=new Set();
export function updatePlan(container,image){
 if(image.Os&&image.Os!=='linux')throw fail('Use the original deployment tool for non-Linux containers.');
 const h=container.HostConfig||{},state=container.State||{},labels=container.Config?.Labels||{};
 if(!container.Id||!container.Image||!container.Config||!['running','exited','created'].includes(state.Status)||state.Paused||state.Restarting)throw fail('This container must be running or stopped before updating.');
 if(h.AutoRemove||h.VolumesFrom?.length||h.Links?.length||[h.NetworkMode,h.PidMode,h.IpcMode].some(v=>String(v||'').startsWith('container:'))||labels['com.docker.swarm.service.id'])throw fail('This container uses shared lifecycle or namespace settings. Update it using its original deployment tool.');
 const networks=Object.fromEntries(Object.entries(container.NetworkSettings?.Networks||{}).filter(([name])=>!['host','none'].includes(name)).map(([name,n])=>{if(n.Links?.length)throw fail('Legacy linked networks require the original deployment tool.');return [name,{...(n.IPAMConfig?{IPAMConfig:n.IPAMConfig}:{}),Aliases:(n.Aliases||[]).filter(a=>a!==container.Id&&a!==container.Id.slice(0,12)),...(n.DriverOpts?{DriverOpts:n.DriverOpts}:{})}]}));
 const host=structuredClone(h),mounts=container.Mounts||[];
 for(const [port,bindings] of Object.entries(host.PortBindings||{}))if(bindings?.some(b=>!b.HostPort)){const assigned=container.NetworkSettings?.Ports?.[port];if(!assigned?.length||assigned.some(b=>!/^\d+$/.test(b.HostPort)))throw fail('An automatically assigned port could not be preserved.');host.PortBindings[port]=assigned;}
 host.Binds=[...(h.Binds||[])];host.Mounts=structuredClone(h.Mounts||[]);
 for(const mount of mounts){
  if(mount.Type==='tmpfs')continue;
  const existing=host.Mounts.find(m=>m.Target===mount.Destination);
  if(existing){if(mount.Type==='volume'){existing.Source=mount.Name;delete existing.VolumeOptions?.Anonymous}continue}
  if(host.Binds.some(b=>b.split(':')[1]===mount.Destination))continue;
  if(!['bind','volume'].includes(mount.Type)||!mount.Destination||!(mount.Name||mount.Source))throw fail('A mount could not be preserved. Use the original deployment configuration.');
  host.Binds.push(`${mount.Type==='volume'?mount.Name:mount.Source}:${mount.Destination}:${mount.RW?'rw':'ro'}${mount.Propagation&&mount.Type==='bind'?','+mount.Propagation:''}`);
 }
 const config=structuredClone(container.Config);
 // Carry user overrides while allowing the updated image to supply its new default command and metadata.
 for(const key of ['Cmd','Entrypoint','WorkingDir','User','Healthcheck','StopSignal','Shell'])if(JSON.stringify(config[key])===JSON.stringify(image.Config?.[key]))delete config[key];
 const defaults=new Map((image.Config?.Env||[]).map(e=>[e.split('=')[0],e]));config.Env=(config.Env||[]).filter(e=>defaults.get(e.split('=')[0])!==e);
 const name=String(container.Name||'').replace(/^\//,'');if(!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(name))throw fail('Container name cannot be preserved.');
 return {name,config,host,networks,running:state.Running===true,binding:fingerprint({id:container.Id,image:container.Image,config:container.Config,host:container.HostConfig,mounts:container.Mounts,networks:container.NetworkSettings?.Networks,state:state.Status})};
}
export async function ensureNoContainerDependents(container,query=docker){
 const rows=await query('/containers/json?all=1',{timeoutMs:15000});
 if(!Array.isArray(rows))throw fail('Container dependencies could not be verified. Retry before updating.');
 const name=container.Name.replace(/^\//,''),matches=value=>{const ref=String(value||'').replace(/^container:/,'').replace(/^\//,'').split(':')[0];return ref===name||ref===container.Id||/^[a-f0-9]{4,64}$/.test(ref)&&container.Id.startsWith(ref)};
 const others=rows.filter(c=>c.Id!==container.Id);
 for(let i=0;i<others.length;i+=4)await Promise.all(others.slice(i,i+4).map(async c=>{
  const inspect=await query('/containers/'+encodeURIComponent(c.Id)+'/json',{timeoutMs:15000}),h=inspect.HostConfig;
  if(!h)throw fail('Container dependencies could not be verified. Retry before updating.');
  if([h.NetworkMode,h.PidMode,h.IpcMode].some(v=>String(v||'').startsWith('container:')&&matches(v))||(h.VolumesFrom||[]).some(matches)||(h.Links||[]).some(matches))throw fail('Another container shares this container’s namespace or lifecycle. Update the deployment together using its original tool.');
 }));
}
export async function installDockerImageUpdate(row,input,{query=docker,hostId='',sleep=ms=>new Promise(r=>setTimeout(r,ms)),healthAttempts=30,onProgress=()=>{}}={}){
 if(!row||row.status!=='available'||row.containerId!==input.containerId||row.imageId!==input.imageId||row.remoteDigest!==input.remoteDigest||!digestPattern.test(input.remoteDigest||''))throw fail('The update changed. Recheck and review it before installing.');
 const lock=hostId+':'+row.containerId;if(locks.has(lock))throw fail('An update is already running for this container.');locks.add(lock);
 let pullFailure=false;
 let old,newId='',stopped=false,renamed=false,changedPolicy=false,switched=false;const disconnected=[];
 const base='/containers/'+encodeURIComponent(row.containerId),backup='homecloud-backup-'+row.containerId.slice(0,12)+'-'+crypto.randomBytes(4).toString('hex');
 try{
  onProgress(5,'Checking reviewed configuration');
  old=await query(base+'/json');if(old.Image!==input.imageId)throw fail('This container is already using a different image. Recheck updates.');
  const oldImage=await query('/images/'+encodeURIComponent(old.Image)+'/json'),plan=updatePlan(old,oldImage);
  if(input.configDigest!==plan.binding)throw fail('The container configuration changed since review. Reopen the update before installing.');
  onProgress(10,'Checking container dependencies');
  await ensureNoContainerDependents(old,query);
  const ref=old.Config.Labels?.[trackedImageLabel]||old.Config.Image;if(ref!==row.image)throw fail('The container image reference changed. Recheck updates.');
  const repository=imageRepository(row.image),pin=repository+'@'+row.remoteDigest;
  let pulled;
  try{const cached=await query('/images/'+encodeURIComponent(pin)+'/json',{timeoutMs:15000});if(cached.Id&&(cached.RepoDigests||[]).some(d=>d.endsWith('@'+row.remoteDigest)))pulled=cached}catch(error){if(error.dockerStatus!==404)throw fail('The reviewed local image could not be checked. Check Docker access and retry before replacing the container.',502)}
  if(!pulled){
  onProgress(20,'Pulling image from registry');
  try{await query('/images/create?fromImage='+encodeURIComponent(pin),{method:'POST',timeoutMs:900000,onProgress})}catch(error){pullFailure=true;if(error.code==='CONNECTOR_UPDATE_REQUIRED')throw error;const timed=/timed? ?out|timeout|expired/i.test(error.message||'');throw fail(timed?'Image download timed out. Check the Docker host’s registry access, DNS and free disk space, then retry. The original container was not stopped.':'Image download failed. Check registry access, credentials, DNS and free disk space on the Docker host. The original container was not stopped.',502)}
  onProgress(65,'Verifying downloaded image digest');
  pulled=await query('/images/'+encodeURIComponent(pin)+'/json');
  }else onProgress(65,'Verified reviewed image already downloaded; preparing installation');
  if(!pulled.Id||!(pulled.RepoDigests||[]).some(d=>d.endsWith('@'+row.remoteDigest)))throw fail('The pulled image did not match the reviewed registry digest.');
  if(pulled.Id===old.Image)return {unchanged:true,containerId:old.Id,message:'The registry metadata changed, but this platform already has the current image. No container restart was needed.'};
  const fresh=await query(base+'/json');if(updatePlan(fresh,oldImage).binding!==plan.binding)throw fail('The container configuration changed during download. Nothing was stopped; recheck before retrying.');
  await ensureNoContainerDependents(fresh,query);
  onProgress(75,'Preparing replacement container');
  const temp='homecloud-update-'+crypto.randomBytes(10).toString('hex');
  const created=await query('/containers/create?name='+temp,{method:'POST',body:JSON.stringify({...plan.config,Image:pulled.Id,Labels:{...plan.config.Labels,[trackedImageLabel]:row.image},HostConfig:plan.host,NetworkingConfig:{EndpointsConfig:plan.networks}})});newId=created.Id;if(!/^[a-f0-9]{12,64}$/.test(newId||''))throw fail('Docker did not return a replacement container identity.');
  onProgress(80,'Switching to the updated container');
  await query(base+'/update',{method:'POST',body:JSON.stringify({RestartPolicy:{Name:'no',MaximumRetryCount:0}})});changedPolicy=true;
  if(plan.running){await query(base+'/stop?t=30',{method:'POST',timeoutMs:45000});stopped=true}
  await query(base+'/rename?name='+backup,{method:'POST'});renamed=true;
  for(const network of Object.keys(plan.networks)){await query('/networks/'+encodeURIComponent(network)+'/disconnect',{method:'POST',body:JSON.stringify({Container:old.Id,Force:false})});disconnected.push(network)}
  await query('/containers/'+newId+'/rename?name='+encodeURIComponent(plan.name),{method:'POST'});
  onProgress(90,plan.running?'Starting and checking container health':'Verifying stopped replacement');
  if(plan.running){await query('/containers/'+newId+'/start',{method:'POST'});let healthy=false,stable=0;
   for(let i=0;i<healthAttempts;i++){await sleep(2000);const check=await query('/containers/'+newId+'/json');if(!check.State?.Running||check.State.Health?.Status==='unhealthy')throw fail('The replacement failed its startup or health check.');if(check.State.Health?.Status==='healthy'||!check.State.Health&&++stable>=3){healthy=true;break}}
   if(!healthy)throw fail('The replacement did not become healthy in time.');
  }
  onProgress(95,'Finalizing image tag and cleanup');
  switched=true;let warning='';try{const tag=row.image===repository?'latest':row.image.slice(repository.length+1);await query('/images/'+encodeURIComponent(pulled.Id)+'/tag?repo='+encodeURIComponent(repository)+'&tag='+encodeURIComponent(tag),{method:'POST'})}catch{warning='The container uses the reviewed image, but its local tag could not be updated. Pull the tag before a future redeployment. '}try{await query(base+'?v=false',{method:'DELETE'})}catch{warning+=`The old container is retained, stopped, as ${backup}. Its restart policy is disabled. Remove it manually after review.`}
  let imageCleanup={status:'retained',reason:'The old container or image tag could not be cleaned up.'};
  if(!warning){
   onProgress(98,'Removing the unused previous image');
   try{
    const containers=await query('/containers/json?all=1',{timeoutMs:15000});
    if(!Array.isArray(containers))throw Error('Container references unavailable');
    if(containers.some(c=>c.ImageID===old.Image))imageCleanup={status:'retained',reason:'Another container still uses the previous image.'};
    else{
     const previous=await query('/images/'+encodeURIComponent(old.Image)+'/json');
     if((previous.RepoTags||[]).some(t=>t!=='<none>:<none>'))imageCleanup={status:'retained',reason:'The previous image still has another tag.'};
     else{await query('/images/'+encodeURIComponent(old.Image)+'?force=false&noprune=true',{method:'DELETE'});imageCleanup={status:'removed',reason:'The unused previous image was removed automatically.'}}
    }
   }catch(error){imageCleanup=error.dockerStatus===404?{status:'removed',reason:'The previous image is already absent.'}:{status:'retained',reason:'Docker could not remove the previous image safely. The verified update remains installed.'}}
  }
  warning+=(warning?' ':'')+imageCleanup.reason;
  return {containerId:newId,previousId:old.Id,imageId:pulled.Id,imageCleanup,warning,message:plan.running?'Container updated and running. Review its application logs and health.':'Stopped container updated. It remains stopped.'};
 }catch(error){
  if(newId&&!switched){onProgress(95,'Restoring original container after failed verification');let restored=true;
   try{await query('/containers/'+newId+'?force=1&v=false',{method:'DELETE'})}catch{restored=false}
   if(restored&&old){try{if(renamed)await query(base+'/rename?name='+encodeURIComponent(old.Name.replace(/^\//,'')),{method:'POST'});for(const name of disconnected){const n=old.NetworkSettings.Networks[name];await query('/networks/'+encodeURIComponent(name)+'/connect',{method:'POST',body:JSON.stringify({Container:old.Id,EndpointConfig:{...(n.IPAMConfig?{IPAMConfig:n.IPAMConfig}:{}),Aliases:(n.Aliases||[]).filter(a=>a!==old.Id&&a!==old.Id.slice(0,12)),...(n.DriverOpts?{DriverOpts:n.DriverOpts}:{})}})})}if(changedPolicy)await query(base+'/update',{method:'POST',body:JSON.stringify({RestartPolicy:old.HostConfig.RestartPolicy||{Name:'no'}})});if(stopped)await query(base+'/start',{method:'POST'})}catch{restored=false}}
   throw fail(restored?'The update failed. The replacement was removed and the original container restored. Mounted data was not removed.':'The update failed and automatic restoration was incomplete. Inspect the original and replacement containers before retrying.',502);
  }
  throw fail(error.status===409||pullFailure?error.message:'The image could not be pulled or the replacement could not be prepared. The original container was not replaced.',error.status||502);
 }finally{locks.delete(lock)}
}
