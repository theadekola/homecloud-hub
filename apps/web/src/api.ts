import {requestWithDeadline,waitForRequest} from './request-deadline';
export function setDockerHost(id:string){localStorage.setItem('homecloud_docker_host',id);window.dispatchEvent?.(new Event('homecloud-connection'));}
import {getAccessToken,getRefreshToken,setTokens,clearTokens,usesCookieSession} from './session';
export {getAccessToken,setTokens,clearTokens} from './session';
const API = import.meta.env.VITE_API_URL || '';
let refreshInFlight:Promise<boolean>|null=null;
function refreshAccessToken(){
  if(!refreshInFlight)refreshInFlight=(async()=>{
    const refreshToken=getRefreshToken(),cookie=usesCookieSession(),access=getAccessToken();
    if(!refreshToken&&!cookie){clearTokens();return false;}
    const {response,body}=await requestWithDeadline(`${API}/api/auth/refresh`,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-IClusters-Browser':'1'},body:JSON.stringify(refreshToken?{refreshToken}:{})},async response=>({response,body:await response.json().catch(()=>({}))}),30000);
    if(!response.ok){if(response.status===401&&getRefreshToken()===refreshToken&&getAccessToken()===access)clearTokens();throw Object.assign(new Error(response.status===401?'Session expired. Sign in again.':'Session refresh is temporarily unavailable.'),{status:response.status});}
    if(getRefreshToken()!==refreshToken||cookie&&getAccessToken()!==access)return false;setTokens(body.accessToken,body.refreshToken,undefined,body.rememberUntil,body.cookieSession===true);return true;
  })().catch(e=>{if(e.status!==401)window.dispatchEvent?.(new CustomEvent('homecloud-session-unavailable',{detail:e.message||'Connection temporarily unavailable'}));throw e;}).finally(()=>{refreshInFlight=null;});
  return refreshInFlight;
}

export async function api<T = any>(path: string, options: RequestInit = {}, confirmation?: string, rawResponse=false): Promise<T> {
  const headers:any = { 'Content-Type': 'application/json', 'X-IClusters-Browser':'1', ...Object.fromEntries(new Headers(options.headers).entries()) };
  const host=localStorage.getItem('homecloud_docker_host');if(host&&!Object.hasOwn(headers,'x-homecloud-docker-host')&&(/^\/(?:docker|actions\/docker)(?:\/|\?|$)|^\/(?:storage|network)(?:\?|$)/.test(path)))headers['X-HomeCloud-Docker-Host']=host;
  const token=getAccessToken(); if(token) headers.Authorization=`Bearer ${token}`;
  if(confirmation) headers['X-HomeCloud-Confirm']=confirmation;
  const deadline=path.startsWith('/auth/')?30000:/^\/(?:node-agents\/guest\/(?:agent|bootstrap|setup)|docker\/image\/(?:pull|build))(?:[/?]|$)/.test(path)?1020000:undefined;
  const readResponse=async(res:Response)=>({res,body:rawResponse&&res.ok?undefined:await res.json().catch(()=>({}))});
  let {res,body} = await requestWithDeadline(`${API}/api${path}`, { ...options, headers },readResponse,deadline,rawResponse);

  if(res.status===401 && (!path.startsWith('/auth/')||path==='/auth/me')){
    if((getAccessToken()!==token&&getAccessToken())||await waitForRequest(refreshAccessToken(),options.signal)){
      headers.Authorization=`Bearer ${getAccessToken()}`;({res,body}=await requestWithDeadline(`${API}/api${path}`,{...options,headers},readResponse,deadline,rawResponse));
    }
  }
  if(rawResponse&&res.ok)return res as T;

  if (!res.ok) {
    const err:any=new Error(body.error || `Request failed: ${res.status}`);
    err.status=res.status; err.body=body; throw err;
  }
  if(options.method&&!['GET','HEAD'].includes(options.method.toUpperCase())&&path!=='/node-agents/pairing/status'&&!/^\/(auth|ssh)(?:\/|$)/.test(path))window.dispatchEvent?.(new Event('homecloud-api-write'));
  return body;
}

export async function confirmedApi<T=any>(path:string, options:RequestInit={}):Promise<T>{
 const host=localStorage.getItem('homecloud_docker_host')||'';let confirmation:string|undefined,grant='';
 for(let attempt=0;attempt<4;attempt++){
  try{return await api<T>(path,{...options,headers:{...Object.fromEntries(new Headers(options.headers).entries()),'X-HomeCloud-Docker-Host':host,...(grant?{'X-HomeCloud-SSH-Grant':grant}:{})}},confirmation)}catch(e:any){
   if(e.status===409&&e.body?.confirmationPhrase){const phrase=e.body.confirmationPhrase;if(e.body.sshTarget){grant=await new Promise<string>((resolve,reject)=>window.dispatchEvent(new CustomEvent('homecloud-ssh-approval',{detail:{target:e.body.sshTarget,description:e.body.approvalDescription,path,dockerHost:host,method:options.method||'POST',body:JSON.parse(String(options.body||'{}')),resolve,reject}})));confirmation=phrase;continue;}if(window.prompt(`Type exactly:\n${phrase}`)!==phrase)throw new Error('Confirmation cancelled');confirmation=phrase;continue;}
   if(e.status===428&&e.body?.sshTarget){grant=await new Promise<string>((resolve,reject)=>window.dispatchEvent(new CustomEvent('homecloud-ssh-approval',{detail:{target:e.body.sshTarget,description:e.body.approvalDescription,path,dockerHost:host,method:options.method||'POST',body:JSON.parse(String(options.body||'{}')),resolve,reject}})));continue;}
   throw e;
  }
 }
 throw new Error('Action authentication could not be completed');
}
