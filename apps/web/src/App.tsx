import Shell from './pages/Shell';
import {useApi} from './hooks';
import {SSHApproval} from './components/SSHAccess';
import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, Link } from 'react-router-dom';
import { api, clearTokens, getAccessToken } from './api';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard'; import {Proxmox} from './pages/Live'; import Docker from './pages/Docker'; import Storage from './pages/Storage'; import Network from './pages/Network'; import Backups from './pages/Backups';    import Monitoring from './pages/Monitoring'; import Alerts from './pages/Alerts'; import AI from './pages/AI'; import Users from './pages/Users'; import Audit from './pages/Audit'; import Settings from './pages/Settings';

export default function App(){
 const [connectionError,setConnectionError]=useState('');
 const[authenticated,setAuthenticated]=useState<boolean|null>(null);
 const check=async()=>{setConnectionError('');if(!getAccessToken()){setAuthenticated(false);return}try{await api('/auth/me');setAuthenticated(true)}catch(e:any){if(e.status===401){clearTokens();setAuthenticated(false)}else setConnectionError(e.message||'Cannot reach HomeCloud.')}};
 useEffect(()=>{check();const expired=()=>{setConnectionError('');setAuthenticated(false)};const unavailable=(e:any)=>setConnectionError(e.detail);window.addEventListener('homecloud-session-unavailable',unavailable);window.addEventListener('homecloud-session-expired',expired);return()=>{window.removeEventListener('homecloud-session-expired',expired);window.removeEventListener('homecloud-session-unavailable',unavailable)}},[]);
 if(connectionError)return <div className="login-page"><div><p role="alert">{connectionError}</p><button className="btn primary" onClick={check}>Retry connection</button></div></div>;
 if(authenticated===null)return <div className="login-page"><div className="muted">Loading HomeCloud Hub…</div></div>;
 if(!authenticated)return <Login onLogin={()=>setAuthenticated(true)}/>;
 return <><SSHApproval/><Routes><Route element={<Layout/>}><Route path="/" element={<Dashboard/>}/><Route path="/proxmox" element={<Proxmox/>}/><Route path="/docker" element={<Docker/>}/><Route path="/storage" element={<Storage/>}/><Route path="/network" element={<Network/>}/><Route path="/backups" element={<Backups/>}/><Route path="/schedules" element={<Navigate to="/backups?tab=Schedules" replace/>}/><Route path="/retention" element={<Navigate to="/backups?tab=Retention%20Policies" replace/>}/><Route path="/restore" element={<Navigate to="/backups?tab=Restore%20Points" replace/>}/><Route path="/monitoring" element={<Monitoring/>}/><Route path="/alerts" element={<Alerts/>}/><Route path="/ai" element={<AI/>}/><Route path="/users" element={<RoleGate roles={['admin','owner']}><Users/></RoleGate>}/><Route path="/audit" element={<RoleGate roles={['auditor','operator','admin','owner']}><Audit/></RoleGate>}/><Route path="/tools/sftp" element={<RoleGate roles={['admin','owner']}><Shell key="sftp" mode="sftp"/></RoleGate>}/><Route path="/tools/shell" element={<RoleGate roles={['admin','owner']}><Shell key="shell"/></RoleGate>}/><Route path="/settings" element={<Settings/>}/><Route path="*" element={<div className="card"><h1>Page not found</h1><p>This address does not match a page.</p><Link className="btn primary" to="/">Back to Dashboard</Link></div>}/></Route></Routes></>
}

function RoleGate({roles,children}:{roles:string[];children:any}){const session=useApi<any>('/auth/me',null);if(!session.data)return <div className="card"><p>{session.error||'Checking access…'}</p>{session.error&&<button className="btn secondary" onClick={()=>session.refresh()}>Retry</button>}</div>;return roles.includes(session.data.user.role)?children:<div className="card"><h1>Access denied</h1><p>Your role cannot access this page.</p><Link className="btn primary" to="/">Back to Dashboard</Link></div>}
