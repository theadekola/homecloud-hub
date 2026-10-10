export function setDockerHost(id:string){localStorage.setItem('homecloud_docker_host',id);}
const API = import.meta.env.VITE_API_URL || '';
let refreshInFlight:Promise<boolean>|null=null;
function refreshAccessToken(){
  if(!refreshInFlight)refreshInFlight=(async()=>{
    const refreshToken=localStorage.getItem('homecloud_refresh_token');
    if(!refreshToken)return false;
    const response=await fetch(`${API}/api/auth/refresh`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refreshToken})});
    if(!response.ok){if(response.status===401)clearTokens();throw Object.assign(new Error(response.status===401?'Session expired. Sign in again.':'Session refresh is temporarily unavailable.'),{status:response.status});}
    const body=await response.json();setTokens(body.accessToken,body.refreshToken);return true;
  })().finally(()=>{refreshInFlight=null;});
  return refreshInFlight;
}

export function getAccessToken(){ return localStorage.getItem('homecloud_access_token') || ''; }
export function setTokens(accessToken:string, refreshToken?:string){
  localStorage.setItem('homecloud_access_token',accessToken);
  if(refreshToken) localStorage.setItem('homecloud_refresh_token',refreshToken);
}
export function clearTokens(){ localStorage.removeItem('homecloud_access_token'); localStorage.removeItem('homecloud_refresh_token'); }

export async function api<T = any>(path: string, options: RequestInit = {}, confirmation?: string): Promise<T> {
  const headers:any = { 'Content-Type': 'application/json', ...Object.fromEntries(new Headers(options.headers).entries()) };
  const host=localStorage.getItem('homecloud_docker_host');if(host&&!Object.hasOwn(headers,'x-homecloud-docker-host')&&(path.startsWith('/docker')||path.startsWith('/actions/docker')))headers['X-HomeCloud-Docker-Host']=host;
  const token=getAccessToken(); if(token) headers.Authorization=`Bearer ${token}`;
  if(confirmation) headers['X-HomeCloud-Confirm']=confirmation;
  let res = await fetch(`${API}/api${path}`, { ...options, headers });

  if(res.status===401 && (!path.startsWith('/auth/')||path==='/auth/me')){
    if((getAccessToken()!==token&&getAccessToken())||await refreshAccessToken()){
      headers.Authorization=`Bearer ${getAccessToken()}`;res=await fetch(`${API}/api${path}`,{...options,headers});
    }
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err:any=new Error(body.error || `Request failed: ${res.status}`);
    err.status=res.status; err.body=body; throw err;
  }
  return body;
}

export async function confirmedApi<T=any>(path:string, options:RequestInit={}):Promise<T>{
  const host=localStorage.getItem('homecloud_docker_host')||'';
  try{return await api<T>(path,options)}
  catch(e:any){
    if(e.status===409 && e.body?.confirmationPhrase){
      const phrase=e.body.confirmationPhrase;
      const entered=window.prompt(`This is a sensitive action.\nType exactly:\n${phrase}`);
      if(entered!==phrase) throw new Error('Confirmation cancelled');
      return api<T>(path,{...options,headers:{...Object.fromEntries(new Headers(options.headers).entries()),'X-HomeCloud-Docker-Host':host}},phrase);
    }
    throw e;
  }
}
