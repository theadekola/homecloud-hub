import {useEffect,useRef,useState,type ReactNode} from 'react';
import {Pencil,Save} from 'lucide-react';
import {Card} from './UI';

/** A section owns its draft and commits only its own fields. */
export default function EditableSettingsSection<T extends object>({title,detail,icon:Icon,value,onSave,allowed=true,children,after,className=''}:{title:string;detail:string;icon:any;value:T;onSave:(draft:T)=>Promise<void>|void;allowed?:boolean;children:(draft:T,change:(patch:Partial<T>)=>void,editing:boolean)=>ReactNode;after?:ReactNode;className?:string}){
 const [draft,setDraft]=useState(value),[editing,setEditing]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 const saving=useRef(false);
 useEffect(()=>{if(!editing)setDraft(value)},[value,editing]);
 const save=async(e:React.FormEvent<HTMLFormElement>)=>{e.preventDefault();if(!editing||!allowed||saving.current||!e.currentTarget.reportValidity())return;saving.current=true;setBusy(true);setError('');setSaved(false);try{await onSave(draft);setEditing(false);setSaved(true)}catch(e:any){setError(e.message||'This section could not be saved.')}finally{saving.current=false;setBusy(false)}};
 return <Card className={`settings-overview-card ${className}`}><form onSubmit={save} aria-label={title}><div className="settings-card-heading"><span><Icon size={23}/></span><div><h2>{title}</h2><p>{detail}</p></div>{allowed&&(editing?<button type="submit" className="btn secondary settings-section-action" aria-label={`Save ${title}`} title={`Save ${title}`} disabled={busy}><Save size={18}/></button>:<button type="button" className="btn secondary settings-section-action" aria-label={`Edit ${title}`} title={`Edit ${title}`} onClick={()=>{setDraft(value);setSaved(false);setError('');setEditing(true)}}><Pencil size={18}/></button>)}</div>{children(draft,patch=>setDraft(current=>({...current,...patch})),editing&&allowed&&!busy)}{error&&<p className="error" role="alert">{error}</p>}{saved&&<p role="status">{title} saved.</p>}</form>{after}</Card>;
}
