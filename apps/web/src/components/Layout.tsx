import PageIcon, {pageIconForPath} from './PageIcon';
import BrandIcon from './BrandIcon';
import HeaderNotifications from './HeaderNotifications';
import {canAccessPage} from '../permissions';
import {applyAppearance,watchSystemTheme} from '../appearance';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Boxes, Container, Database, Network, HardDriveDownload,
  CalendarClock, History, RotateCcw, Activity, Bell, Sparkles, Users, Settings,
  Terminal, FolderOpen, Menu, X, Cloud, ChevronDown, LogOut
} from 'lucide-react';
import { useState,useEffect,useRef } from 'react';
import UpdateButton from './UpdateButton';
import { useApi,configureRefresh } from '../hooks';
import { api,clearTokens } from '../api';

const sections = [
  { title: 'OVERVIEW', items: [['Dashboard','/',LayoutDashboard]] },
  { title: 'INFRASTRUCTURE', items: [['Proxmox','/proxmox',Boxes],['Docker','/docker',Container],['Storage','/storage',Database],['Network','/network',Network]] },
  { title: 'DATA PROTECTION', items: [['Backups','/backups',HardDriveDownload]] },
  { title: 'MONITORING', items: [['Monitoring','/monitoring',Activity],['Alerts','/alerts',Bell],['AI Assistant','/ai',Sparkles]] },
  { title: 'TOOLS', items: [['Shell','/tools/shell',Terminal],['SFTP Files','/tools/sftp',FolderOpen]] },
  { title: 'MANAGEMENT', items: [['Users','/users',Users],['Settings','/settings',Settings]] },
];

export default function Layout() {
  useEffect(()=>{applyAppearance();return watchSystemTheme();},[]);
  const [collapsed, setCollapsed] = useState(()=>localStorage.getItem('homecloud_sidebar')==='collapsed');
  useEffect(()=>{const changed=()=>setCollapsed(localStorage.getItem('homecloud_sidebar')==='collapsed');window.addEventListener('homecloud-sidebar',changed);return()=>window.removeEventListener('homecloud-sidebar',changed);},[]);
  useEffect(()=>{localStorage.setItem('homecloud_sidebar',collapsed?'collapsed':'expanded');},[collapsed]);
  const [mobile, setMobile] = useState(()=>window.matchMedia('(max-width: 800px)').matches);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef=useRef<HTMLElement>(null);
  const toggleRef=useRef<HTMLButtonElement>(null);
  const closeMenu=()=>{setMenuOpen(false);toggleRef.current?.focus();};
  useEffect(()=>{
    const query=window.matchMedia('(max-width: 800px)');
    const change=()=>{setMobile(query.matches);setMenuOpen(false);};
    query.addEventListener('change',change);
    return ()=>query.removeEventListener('change',change);
  },[]);
  const [profileOpen,setProfileOpen]=useState(false);
  const profileRef=useRef<HTMLDivElement>(null);
  const location = useLocation();
  const {data:session}=useApi<any>('/auth/me',null);
  const {data:configuration}=useApi<any>('/settings',null);
  useEffect(()=>{if(configuration?.settings)configureRefresh(configuration.settings.refresh);},[configuration?.settings?.refresh]);
  useEffect(()=>{const close=(event:MouseEvent)=>{if(!profileRef.current?.contains(event.target as Node))setProfileOpen(false)};const key=(event:KeyboardEvent)=>{if(event.key==='Escape')setProfileOpen(false)};document.addEventListener('mousedown',close);document.addEventListener('keydown',key);return()=>{document.removeEventListener('mousedown',close);document.removeEventListener('keydown',key)}},[]);
  useEffect(()=>{if(menuOpen)toggleRef.current?.focus();setMenuOpen(false);setProfileOpen(false);},[location.pathname]);
  useEffect(()=>{
    if(!mobile||!menuOpen)return;
    const previous=document.body.style.overflow;
    document.body.style.overflow='hidden';
    const controls=()=>Array.from(menuRef.current?.querySelectorAll<HTMLElement>('a,button')||[]);
    controls()[0]?.focus();
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();closeMenu();}
      if(event.key==='Tab'){
        const items=controls(),first=items[0],last=items[items.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    };
    document.addEventListener('keydown',key);
    return ()=>{document.body.style.overflow=previous;document.removeEventListener('keydown',key);};
  },[mobile,menuOpen]);
  const showLabels=mobile||!collapsed;
  const signOut=async()=>{try{await api('/account/logout',{method:'POST',body:'{}'});clearTokens();window.location.assign('/')}catch(e:any){window.alert(e.message||'Sign-out could not be confirmed. Retry when connected.')}};
  return <div className="app-shell">
    {mobile&&menuOpen&&<button className="nav-backdrop" aria-label="Close navigation" onClick={closeMenu}/>}
    <aside id="primary-navigation" ref={menuRef} className={`sidebar${!mobile&&collapsed?' collapsed':''}${mobile&&menuOpen?' mobile-open':''}`} inert={mobile&&!menuOpen} role={mobile&&menuOpen?'dialog':undefined} aria-modal={mobile&&menuOpen?true:undefined} aria-label="Main navigation">
      <div className="brand"><div className="brand-icon"><img className="homecloud-product-logo" src="/assets/iclusters-512.png" alt=""/></div>{showLabels && <b title={configuration?.settings?.siteName}>{configuration?.settings?.siteName||'i-Clusters'}</b>}{mobile&&<button className="icon-btn nav-close" aria-label="Close navigation" onClick={closeMenu}><X size={20}/></button>}</div>
      <nav className="nav-scroll" aria-label="Pages">
        {sections.map(sec => <div className="nav-section" key={sec.title}>
          {showLabels && <div className="nav-title">{sec.title}</div>}
          {sec.items.filter(([,path]:any)=>canAccessPage(path,session?.user?.role)).map(([label,path,Icon]: any) => <NavLink key={path} to={path} end={path === '/'} className={({isActive}) => `nav-item ${isActive?'active':''}`}>
            {path==='/proxmox'||path==='/docker'?<BrandIcon brand={path.slice(1)} size={18}/>:<PageIcon name={pageIconForPath(path)} size={20}/>}{showLabels && <span>{label}</span>}
          </NavLink>)}
        </div>)}
      </nav>
    </aside>
    <div className="main-shell" inert={mobile&&menuOpen}>
      <header className="topbar">
        <button ref={toggleRef} className="icon-btn nav-toggle" aria-label={mobile?(menuOpen?'Close navigation':'Open navigation'):(collapsed?'Expand navigation':'Collapse navigation')} aria-controls="primary-navigation" aria-expanded={mobile?menuOpen:!collapsed} onClick={()=>mobile?setMenuOpen(v=>!v):setCollapsed(v=>!v)}><Menu size={19}/></button>
        <div className="top-actions"><HeaderNotifications/>{session?.user?.role==='owner' && <UpdateButton/>}<div className="profile-menu" ref={profileRef}><button className="profile-trigger" aria-haspopup="menu" aria-expanded={profileOpen} onClick={()=>setProfileOpen(v=>!v)}><span className="profile"><b>{session?.user?.name||'Signed in'}</b><span>{session?.user?.role||''}</span></span><ChevronDown size={15}/></button>{profileOpen&&<div className="profile-dropdown" role="menu"><button role="menuitem" onClick={signOut}><LogOut size={15}/>Sign out</button></div>}</div></div>
      </header>
      <main className="content" key={location.pathname}><Outlet/></main>
    </div>
  </div>
}
