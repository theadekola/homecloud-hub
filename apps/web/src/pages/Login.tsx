import { useEffect, useState } from 'react';
import { Cloud, Lock, Mail } from 'lucide-react';
import { api, setTokens } from '../api';

export default function Login({onLogin}:{onLogin:()=>void}){
 const[email,setEmail]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 const[registration,setRegistration]=useState<boolean|null>(null),[name,setName]=useState(''),[setupToken,setSetupToken]=useState(''),[confirmation,setConfirmation]=useState(''),[message,setMessage]=useState('');
 const checkSetup=()=>api<any>('/auth/setup').then(r=>{setRegistration(r.registrationOpen);setError('');}).catch(e=>setError(e.message));
 useEffect(()=>{checkSetup()},[]);
 const submit=async(e:any)=>{e.preventDefault();setLoading(true);setError('');try{
  if(registration){if(password!==confirmation)throw new Error('Passwords do not match.');await api('/auth/register',{method:'POST',body:JSON.stringify({name,email,password,setupToken})});setRegistration(false);setPassword('');setConfirmation('');setSetupToken('');setMessage('Owner account created. Sign in with your new password.');}
  else{const r=await api<any>('/auth/login',{method:'POST',body:JSON.stringify({email,password})});setTokens(r.accessToken,r.refreshToken);onLogin();}
 }catch(e:any){setError(e.message)}finally{setLoading(false)}};
 if(registration===null)return <div className="login-page"><div className="login-card"><h1>HomeCloud Hub</h1>{error?<><p role="alert" className="login-error">{error}</p><button className="btn primary" onClick={checkSetup}>Retry</button></>:<p>Checking first-use setup…</p>}</div></div>;
 return <div className="login-page"><form className="login-card" onSubmit={submit}><div className="login-logo"><Cloud/> HomeCloud Hub</div><h1>{registration?'Create your owner account':'Sign in'}</h1><p className="muted">{registration?'Welcome. Register once to start managing your homelab.':'Secure infrastructure control plane'}</p>{error&&<div role="alert" className="login-error">{error}</div>}{message&&<p role="status">{message}</p>}
 {registration&&<label><span>Your name</span><input value={name} onChange={e=>setName(e.target.value)} autoComplete="name" maxLength={100} required/></label>}
  <label><span><Mail size={15}/> Email</span><input value={email} onChange={e=>setEmail(e.target.value)} type="email" required/></label>
  <label><span><Lock size={15}/> Password</span><input value={password} onChange={e=>setPassword(e.target.value)} type="password" autoComplete={registration?'new-password':'current-password'} minLength={registration?12:undefined} maxLength={registration?72:undefined} required/></label>
 {registration&&<><label><span>Confirm password</span><input type="password" autoComplete="new-password" value={confirmation} onChange={e=>setConfirmation(e.target.value)} required/></label><label><span>Setup code</span><input type="password" autoComplete="off" value={setupToken} onChange={e=>setSetupToken(e.target.value)} required/><small className="muted">Use the code printed by the installer or stored as SETUP_TOKEN in your server's .env file.</small></label></>}
  <button className="btn primary" disabled={loading}>{loading?'Please wait…':registration?'Register owner account':'Sign in'}</button><div className="small muted">{registration?'Registration closes when the first account is created.':'Additional accounts are created by your administrator.'}</div></form></div>
}
