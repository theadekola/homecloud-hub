import crypto from 'node:crypto';
import {docker} from './connectors.js';
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const fail=()=>Object.assign(Error('Container state changed or recovery is ambiguous. Inspect this deployment on its Docker host before making changes.'),{status:409});
export async function recoverDockerUpdate(checkpoint,{query=docker,sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 // A download-only interruption has never stopped or renamed the original.
 if(!checkpoint)return {interrupted:true,message:'The controller restarted before replacement preparation. The original was not changed. Recheck updates before retrying.'};
 const c=checkpoint,inspect=async id=>{try{return await query('/containers/'+encodeURIComponent(id)+'/json',{timeoutMs:15000})}catch(e){if(e.dockerStatus===404)return null;throw e}};
 const old=await inspect(c.oldId),next=await inspect(c.newId||c.tempName);
 if(!old){if(!next||next.Image!==c.newImage||next.Name!=='/'+c.oldName||next.State?.Running!==c.plan.running||c.plan.running&&next.State.Health&&next.State.Health.Status!=='healthy')throw fail();await sleep(2000);const check=await inspect(next.Id);if(!check||check.Image!==next.Image||check.Name!=='/'+c.oldName||check.State?.Running!==c.plan.running||c.plan.running&&check.State.Health&&check.State.Health.Status!=='healthy')throw fail();return {containerId:next.Id,message:'The replacement is installed and verified after the restart. Review old image cleanup separately.',reconciled:true}}
 if(old.Image!==c.oldImage||!['/'+c.oldName,'/'+c.backupName].includes(old.Name)||hash(old.Config)!==c.configHash||hash({...old.HostConfig,RestartPolicy:null})!==c.hostHash)throw fail();
 if(next&&(next.Image!==c.newImage||!['/'+c.oldName,'/'+c.tempName].includes(next.Name)))throw fail();
 // Re-read before touching resources; never delete a foreign container or volumes.
 if(next){const check=await inspect(next.Id);if(!check||check.Id!==next.Id||check.Image!==c.newImage||check.Name!==next.Name)throw fail();if(check.State?.Running)await query('/containers/'+next.Id+'/stop?t=30',{method:'POST',timeoutMs:45000});await query('/containers/'+next.Id+'?v=false',{method:'DELETE'})}
 const base='/containers/'+encodeURIComponent(old.Id);if(old.Name!=='/'+c.oldName)await query(base+'/rename?name='+encodeURIComponent(c.oldName),{method:'POST'});
 const current=await inspect(old.Id);for(const [network,endpoint] of Object.entries(c.plan.networks))if(!current?.NetworkSettings?.Networks?.[network])await query('/networks/'+encodeURIComponent(network)+'/connect',{method:'POST',body:JSON.stringify({Container:old.Id,EndpointConfig:endpoint})});
 await query(base+'/update',{method:'POST',body:JSON.stringify({RestartPolicy:c.plan.host.RestartPolicy||{Name:'no',MaximumRetryCount:0}})});
 if(c.plan.running&&!current?.State?.Running)await query(base+'/start',{method:'POST'});
 await sleep(2000);const restored=await inspect(old.Id);if(!restored||restored.Name!=='/'+c.oldName||restored.Image!==c.oldImage||restored.State?.Running!==c.plan.running)throw fail();
 const expectedPolicy=c.plan.host.RestartPolicy||{Name:'no',MaximumRetryCount:0},policy=restored.HostConfig?.RestartPolicy;
 if(!policy||policy.Name!==expectedPolicy.Name||(policy.MaximumRetryCount||0)!==(expectedPolicy.MaximumRetryCount||0))throw fail();
 for(const [name,expected] of Object.entries(c.plan.networks)){const actual=restored.NetworkSettings?.Networks?.[name];if(!actual||(expected.Aliases||[]).some(a=>!(actual.Aliases||[]).includes(a))||Object.entries(expected.IPAMConfig||{}).some(([k,v])=>v&&actual.IPAMConfig?.[k]!==v))throw fail()}
 return {restored:true,containerId:old.Id,message:'The original container was restored and verified after the interrupted update. Recheck and review the image before retrying.'};
}
