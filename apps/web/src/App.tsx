import { useEffect, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { api, clearTokens, getAccessToken } from './api';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard'; import {Proxmox} from './pages/Live'; import Docker from './pages/Docker'; import Storage from './pages/Storage'; import Network from './pages/Network'; import Vpn from './pages/Vpn'; import Backups from './pages/Backups'; import Schedules from './pages/Schedules'; import Retention from './pages/Retention'; import Restore from './pages/Restore'; import Monitoring from './pages/Monitoring'; import Alerts from './pages/Alerts'; import AI from './pages/AI'; import Users from './pages/Users'; import Audit from './pages/Audit'; import Settings from './pages/Settings';

export default function App(){
 const[authenticated,setAuthenticated]=useState<boolean|null>(null);
 const check=async()=>{if(!getAccessToken()){setAuthenticated(false);return}try{await api('/auth/me');setAuthenticated(true)}catch{clearTokens();setAuthenticated(false)}};
 useEffect(()=>{check()},[]);
 if(authenticated===null)return <div className="login-page"><div className="muted">Loading HomeCloud Hub…</div></div>;
 if(!authenticated)return <Login onLogin={()=>setAuthenticated(true)}/>;
 return <Routes><Route element={<Layout/>}><Route path="/" element={<Dashboard/>}/><Route path="/proxmox" element={<Proxmox/>}/><Route path="/docker" element={<Docker/>}/><Route path="/storage" element={<Storage/>}/><Route path="/network" element={<Network/>}/><Route path="/vpn" element={<Vpn/>}/><Route path="/backups" element={<Backups/>}/><Route path="/schedules" element={<Schedules/>}/><Route path="/retention" element={<Retention/>}/><Route path="/restore" element={<Restore/>}/><Route path="/monitoring" element={<Monitoring/>}/><Route path="/alerts" element={<Alerts/>}/><Route path="/ai" element={<AI/>}/><Route path="/users" element={<Users/>}/><Route path="/audit" element={<Audit/>}/><Route path="/settings" element={<Settings/>}/></Route></Routes>
}
