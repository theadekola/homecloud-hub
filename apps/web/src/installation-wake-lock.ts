import {useEffect,useState} from 'react';
// Wake locks are a viewing aid. Server jobs must never depend on them.
export function createScreenAwake({nav=navigator,doc=document,onChange=(_state:string)=>{}}={}){
 let wanted=false,stopped=false,held:WakeLockSentinel|null=null,pending=false;
 const visible=()=>doc.visibilityState!=='hidden';
 const acquire=async()=>{if(stopped||!wanted||held||pending||!visible())return;if(!('wakeLock' in nav)){onChange('unavailable');return}pending=true;try{const lock=await nav.wakeLock.request('screen');if(stopped||!wanted||!visible()){await lock.release();return}held=lock;onChange('active');lock.addEventListener('release',()=>{if(held===lock){held=null;if(wanted&&!stopped)onChange('released')}})}catch{if(!stopped)onChange('unavailable')}finally{pending=false}};
 const visibility=()=>{if(doc.visibilityState==='visible')void acquire()};doc.addEventListener('visibilitychange',visibility);
 return {setActive(value:boolean){wanted=value;if(value)void acquire();else {const lock=held;held=null;void lock?.release();onChange('idle')}},retry:acquire,stop(){stopped=true;wanted=false;doc.removeEventListener('visibilitychange',visibility);const lock=held;held=null;void lock?.release()}};
}
export function useInstallationWakeLock(active:boolean){const [state,setState]=useState('idle');useEffect(()=>{const awake=createScreenAwake({onChange:setState});awake.setActive(active);return()=>awake.stop()},[active]);return active?(state==='active'?'Screen stays awake while this page is visible.':state==='unavailable'?'Screen-awake mode is unavailable on this device. Installation does not depend on the screen staying on.':state==='released'?'The device released screen-awake mode. Return to this page to request it again.':'Requesting screen-awake mode…'):''}
