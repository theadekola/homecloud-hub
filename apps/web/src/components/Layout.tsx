import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Boxes, Container, Database, Network, ShieldCheck, HardDriveDownload,
  CalendarClock, History, RotateCcw, Activity, Bell, Sparkles, Users, ScrollText, Settings,
  Menu, Cloud, ChevronDown, LogOut
} from 'lucide-react';
import { useState,useEffect,useRef } from 'react';
import UpdateButton from './UpdateButton';
import { useApi,configureRefresh } from '../hooks';
import { clearTokens } from '../api';

const sections = [
  { title: 'OVERVIEW', items: [['Dashboard','/',LayoutDashboard]] },
  { title: 'INFRASTRUCTURE', items: [['Proxmox','/proxmox',Boxes],['Docker','/docker',Container],['Storage','/storage',Database],['Network','/network',Network],['VPN','/vpn',ShieldCheck]] },
  { title: 'DATA PROTECTION', items: [['Backups','/backups',HardDriveDownload],['Schedules','/schedules',CalendarClock],['Retention Policies','/retention',History],['Restore Points','/restore',RotateCcw]] },
  { title: 'MONITORING', items: [['Monitoring','/monitoring',Activity],['Alerts','/alerts',Bell],['AI Assistant','/ai',Sparkles]] },
  { title: 'MANAGEMENT', items: [['Users','/users',Users],['Audit Logs','/audit',ScrollText],['Settings','/settings',Settings]] },
];

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const [profileOpen,setProfileOpen]=useState(false);
  const profileRef=useRef<HTMLDivElement>(null);
  const location = useLocation();
  const {data:session}=useApi<any>('/auth/me',null);
  const {data:configuration}=useApi<any>('/settings',null);
  useEffect(()=>{if(configuration?.settings)configureRefresh(configuration.settings.refresh);},[configuration?.settings?.refresh]);
  useEffect(()=>{const close=(event:MouseEvent)=>{if(!profileRef.current?.contains(event.target as Node))setProfileOpen(false)};const key=(event:KeyboardEvent)=>{if(event.key==='Escape')setProfileOpen(false)};document.addEventListener('mousedown',close);document.addEventListener('keydown',key);return()=>{document.removeEventListener('mousedown',close);document.removeEventListener('keydown',key)}},[]);
  const signOut=()=>{clearTokens();window.location.assign('/');};
  return <div className="app-shell">
    <aside className={collapsed ? 'sidebar collapsed' : 'sidebar'}>
      <div className="brand"><div className="brand-icon"><Cloud size={22}/></div>{!collapsed && <b>{configuration?.settings?.siteName||'HomeCloud Hub'}</b>}</div>
      <div className="nav-scroll">
        {sections.map(sec => <div className="nav-section" key={sec.title}>
          {!collapsed && <div className="nav-title">{sec.title}</div>}
          {sec.items.map(([label,path,Icon]: any) => <NavLink key={path} to={path} end={path === '/'} className={({isActive}) => `nav-item ${isActive?'active':''}`}>
            <Icon size={18}/>{!collapsed && <span>{label}</span>}
          </NavLink>)}
        </div>)}
      </div>
    </aside>
    <div className="main-shell">
      <header className="topbar">
        <button className="icon-btn" onClick={()=>setCollapsed(v=>!v)}><Menu size={19}/></button>
        <div className="top-actions">{session?.user?.role==='owner' && <UpdateButton/>}<div className="profile-menu" ref={profileRef}><button className="profile-trigger" aria-haspopup="menu" aria-expanded={profileOpen} onClick={()=>setProfileOpen(v=>!v)}><span className="profile"><b>{session?.user?.name||'Signed in'}</b><span>{session?.user?.role||''}</span></span><ChevronDown size={15}/></button>{profileOpen&&<div className="profile-dropdown" role="menu"><button role="menuitem" onClick={signOut}><LogOut size={15}/>Sign out</button></div>}</div></div>
      </header>
      <main className="content" key={location.pathname}><Outlet/></main>
    </div>
  </div>
}
