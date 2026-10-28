import RecoveryTests from '../components/RecoveryTests';
import {useState,useEffect} from 'react';
import {useSearchParams} from 'react-router-dom';
import {useApi} from '../hooks';
import {Tabs} from '../components/UI';
import ProxmoxBackups from './ProxmoxBackups';
import Restore from './Restore';
import Retention from './Retention';
import Schedules from './Schedules';
import Destinations from './BackupDestinations';
import Reports from './BackupReports';
const tabs=['Backup Jobs','Restore Points','Schedules','Retention Policies','Destinations','Reports','Recovery Tests'];
export default function Backups(){
 const session=useApi<any>('/auth/me',null),[hours,setHours]=useState('24'),[params,setParams]=useSearchParams();
 useEffect(()=>{if(params.get('action')==='Run Backup'&&params.get('tab')&&params.get('tab')!=='Backup Jobs'){const next=new URLSearchParams(params);next.set('tab','Backup Jobs');setParams(next,{replace:true})}},[params.get('action'),params.get('tab')]);
 const selectTab=(tab:string)=>{const next=new URLSearchParams(params);next.set('tab',tab);next.delete('action');setParams(next)};
 const tab=tabs.includes(params.get('tab')||'')?params.get('tab')!:'Backup Jobs';
 return <div className="backups-overview backup-hub"><div className="backup-overview-nav">{!['Restore Points','Schedules','Retention Policies','Destinations','Reports'].includes(tab)&&<select aria-label="Backup reporting period" value={hours} onChange={e=>setHours(e.target.value)}><option value="24">Last 24 hours</option><option value="168">Last 7 days</option><option value="720">Last 30 days</option></select>}</div>{tab==='Backup Jobs'?<ProxmoxBackups navigation={<Tabs items={tabs} active={tab} onChange={t=>selectTab(t)}/>} role={session.data?.user?.role} hours={hours} onTasks={()=>selectTab('Reports')} onStorage={()=>selectTab('Destinations')}/>:tab==='Restore Points'?<Restore navigation={<Tabs items={tabs} active={tab} onChange={t=>selectTab(t)}/>}/>:tab==='Schedules'?<Schedules navigation={<Tabs items={tabs} active={tab} onChange={t=>selectTab(t)}/>}/>:tab==='Retention Policies'?<Retention navigation={<Tabs items={tabs} active={tab} onChange={t=>selectTab(t)}/>}/>:tab==='Recovery Tests'?<><Tabs items={tabs} active={tab} onChange={t=>selectTab(t)}/>{['owner','admin'].includes(session.data?.user?.role)?<RecoveryTests/>:<p>Administrator access is required for recovery tests.</p>}</>:tab==='Destinations'?<Destinations navigation={<Tabs items={tabs} active={tab} onChange={t=>selectTab(t)}/>}/>:<Reports hours={hours} setHours={setHours} navigation={<Tabs items={tabs} active={tab} onChange={t=>selectTab(t)}/>}/>}</div>;
}
