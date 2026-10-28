import {useState} from 'react';
import {api} from '../api';
import {useApi} from '../hooks';
import {PageHeader,Card} from '../components/UI';
import {Link} from 'react-router-dom';
export default function AI(){const session=useApi<any>('/auth/me',null);const[msg,setMsg]=useState(''),[messages,setMessages]=useState<any[]>([]),[pending,setPending]=useState(false),[error,setError]=useState('');
 const send=async(e:any)=>{e.preventDefault();if(!msg.trim()||pending)return;const message=msg;setMsg('');setPending(true);setError('');setMessages(m=>[...m,{role:'user',text:message}]);try{const response:any=await api('/ai/chat',{method:'POST',body:JSON.stringify({message})});setMessages(m=>[...m,{role:'assistant',text:response.result.answer}]);}catch(e:any){setError(e.message);}finally{setPending(false);}};
 return <><PageHeader title="Assistant" subtitle="Read-only analysis of the latest live measurements."/>{session.data?.user?.role==='owner'&&<Link className="btn secondary" to="/settings?tab=Connections&setup=ai">Configure AI</Link>}<Card><p className="muted">This assistant cannot execute infrastructure actions or perform security scans. With no AI API key it returns a measured status summary.</p><div className="chat">{messages.map((m,i)=><div key={i} className={`bubble ${m.role}`}>{m.text}</div>)}</div>{error&&<p role="alert">{error}</p>}<form onSubmit={send} className="composer"><input value={msg} onChange={e=>setMsg(e.target.value)} required placeholder="Ask about your connected homelab"/><button className="btn primary" aria-busy={!!(pending)} disabled={pending}>{pending?'Reading…':'Send'}</button></form></Card></>;
}
