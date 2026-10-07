import fs from 'node:fs';
import path from 'node:path';
export function updateBridge(directory=process.env.DATA_DIR||'runtime'){
 const statusFile=path.join(process.env.UPDATE_STATUS_DIR||directory,'update-status.json'),requestFile=path.join(directory,'update-request.json');
 return {
  status(){try{const status=JSON.parse(fs.readFileSync(statusFile,'utf8'));return {...status,enabled:Date.now()-Date.parse(status.checkedAt)<15*60*1000,pending:fs.existsSync(requestFile)};}catch{return {enabled:false,available:false,state:'unavailable',message:'On Ubuntu run: cd /opt/homecloud-hub && sudo bash deployment/setup-updater.sh'};}},
  check(){const status=this.status();if(!status.enabled)throw Object.assign(new Error(status.message||'Ubuntu updater unavailable. Run sudo bash deployment/setup-updater.sh in /opt/homecloud-hub.'),{status:503});if(status.state==='updating')return {ok:true,state:'updating'};fs.writeFileSync(path.join(directory,'update-check.json'),'{}\n',{mode:0o600});return {ok:true,state:'checking'};},
  request(){const status=this.status();if(!status.enabled)throw Object.assign(new Error(status.message||'Ubuntu updater is unavailable.'),{status:503});if(status.state==='updating'||status.pending)throw Object.assign(new Error('An update is already running.'),{status:409});if(!status.available)throw Object.assign(new Error('No update is available.'),{status:409});fs.writeFileSync(requestFile,'{}\n',{flag:'wx',mode:0o600});return {ok:true,state:'queued'};}
 };
}
export const updates=updateBridge();
