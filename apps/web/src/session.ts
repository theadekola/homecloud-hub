const ACCESS='homecloud_access_token',REFRESH='homecloud_refresh_token',ACTIVE='homecloud_last_activity',TIMEOUT='homecloud_idle_minutes',UNTIL='homecloud_remember_until';
export const idleOptions=[5,15,30,60,120,480];
const stores=()=>[localStorage,sessionStorage];
const tokenStore=()=>sessionStorage.getItem(ACCESS)?sessionStorage:localStorage;
export function getIdleMinutes(){const value=Number(localStorage.getItem(TIMEOUT));return idleOptions.includes(value)?value:30;}
export function setIdleMinutes(value:number){if(!idleOptions.includes(value))throw Error('Choose a valid sign-out time.');localStorage.setItem(TIMEOUT,String(value));window.dispatchEvent(new Event('homecloud-session-policy'));}
export function isSessionIdle(now=Date.now()){const store=tokenStore(),last=Number(store.getItem(ACTIVE));if(store.getItem(UNTIL))return now>=Number(store.getItem(UNTIL));return !!store.getItem(ACCESS)&&(!last||now-last>=getIdleMinutes()*60000);}
export function clearTokens(){for(const store of stores())for(const key of [ACCESS,REFRESH,ACTIVE,UNTIL])store.removeItem(key);window.dispatchEvent(new Event('homecloud-session-expired'));}
function expireIdle(){const remembered=!!tokenStore().getItem(UNTIL);clearTokens();sessionStorage.setItem('homecloud_session_message',remembered?'Your 10-day remembered sign-in has expired. Sign in again to continue.':'You were signed out after inactivity. Sign in again to continue.');}
export function getAccessToken(){if(isSessionIdle()){expireIdle();return '';}return tokenStore().getItem(ACCESS)||'';}
export function getRefreshToken(){return getAccessToken()?tokenStore().getItem(REFRESH)||'':'';}
export function setTokens(accessToken:string,refreshToken?:string,remember?:boolean,rememberUntil?:number){
 const store=remember===undefined?tokenStore():remember?localStorage:sessionStorage;
 if(remember!==undefined){for(const other of stores())for(const key of [ACCESS,REFRESH,ACTIVE,UNTIL])other.removeItem(key);store.setItem(ACTIVE,String(Date.now()));}
 if(remember===true)store.setItem(UNTIL,String(rememberUntil||Date.now()+10*24*60*60*1000));
 // Existing saved sessions migrate to the inactivity policy on their next refresh.
 if(!store.getItem(ACTIVE))store.setItem(ACTIVE,String(Date.now()));
 store.setItem(ACCESS,accessToken);if(refreshToken)store.setItem(REFRESH,refreshToken);
}
export function touchSession(now=Date.now()){if(isSessionIdle(now)){expireIdle();return;}const store=tokenStore();if(store.getItem(ACCESS))store.setItem(ACTIVE,String(now));}
export function startSessionActivity(){
 // Give sessions created before the inactivity feature a single migration timestamp.
 const store=tokenStore();if(store.getItem(ACCESS)&&!store.getItem(ACTIVE))store.setItem(ACTIVE,String(Date.now()));
 const check=()=>{if(isSessionIdle())expireIdle();};
 let written=0;const activity=()=>{check();if(Date.now()-written>1000){touchSession();written=Date.now();}};
 const visible=()=>{if(document.visibilityState==='visible')check();};
 const storage=(e:StorageEvent)=>{if([ACCESS,REFRESH,ACTIVE,UNTIL,TIMEOUT,null].includes(e.key)){check();if(!tokenStore().getItem(ACCESS))window.dispatchEvent(new Event('homecloud-session-expired'));}};
 const events=['pointerdown','keydown','wheel','touchstart'];for(const event of events)window.addEventListener(event,activity,{passive:true});
 window.addEventListener('focus',check);window.addEventListener('storage',storage);window.addEventListener('homecloud-session-policy',check);document.addEventListener('visibilitychange',visible);
 check();const timer=window.setInterval(check,1000);
 return()=>{window.clearInterval(timer);for(const event of events)window.removeEventListener(event,activity);window.removeEventListener('focus',check);window.removeEventListener('storage',storage);window.removeEventListener('homecloud-session-policy',check);document.removeEventListener('visibilitychange',visible);};
}
