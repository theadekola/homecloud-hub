import {useRef,useState} from 'react';
import {api} from '../api';
export function useNotificationPreferences(live:any,draft:any,setDraft:(value:any)=>void){
 const pending=useRef(false),[saving,setSaving]=useState(false),[feedback,setFeedback]=useState(''),[saveError,setSaveError]=useState('');
 const change=async(next:any)=>{if(pending.current||!draft)return false;pending.current=true;setSaving(true);setFeedback('');setSaveError('');const previous=draft;setDraft(next);try{await api('/notifications/preferences',{method:'PUT',body:JSON.stringify(next)});live.setData({...live.data,preferences:next});window.dispatchEvent(new Event('homecloud-settings'));setFeedback('Delivery preferences saved.');return true;}catch(e:any){setDraft(previous);setSaveError(e.message||'Change could not be saved. Previous setting restored.');return false;}finally{pending.current=false;setSaving(false)}};
 return {change,saving,feedback,saveError};
}
