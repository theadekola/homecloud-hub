import { useState } from 'react';
import { Cloud, Lock, Mail } from 'lucide-react';
import { api, setTokens } from '../api';

export default function Login({onLogin}:{onLogin:()=>void}){
 const[email,setEmail]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(false);
  const submit=async(e:any)=>{e.preventDefault();setLoading(true);setError('');try{const r=await api<any>('/auth/login',{method:'POST',body:JSON.stringify({email,password})});setTokens(r.accessToken,r.refreshToken);onLogin()}catch(e:any){setError(e.message)}finally{setLoading(false)}};
  return <div className="login-page"><form className="login-card" onSubmit={submit}><div className="login-logo"><Cloud/> HomeCloud Hub</div><h1>Sign in</h1><p className="muted">Secure infrastructure control plane</p>{error&&<div className="login-error">{error}</div>}
  <label><span><Mail size={15}/> Email</span><input value={email} onChange={e=>setEmail(e.target.value)} type="email" required/></label>
  <label><span><Lock size={15}/> Password</span><input value={password} onChange={e=>setPassword(e.target.value)} type="password" required/></label>
  <button className="btn primary" disabled={loading}>{loading?'Signing in…':'Sign in'}</button><div className="small muted">Use the administrator credentials from your .env file on first start.</div></form></div>
}
