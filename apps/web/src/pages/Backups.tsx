import {useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {useApi} from '../hooks';
import ProxmoxBackups from './ProxmoxBackups';
export default function Backups(){
 const session=useApi<any>('/auth/me',null),navigate=useNavigate(),[hours,setHours]=useState('24');
 return <div className="backups-overview"><div className="backup-overview-nav"><span className="muted small">Backups › Overview</span><select aria-label="Backup reporting period" value={hours} onChange={e=>setHours(e.target.value)}><option value="24">Last 24 hours</option><option value="168">Last 7 days</option><option value="720">Last 30 days</option></select></div><ProxmoxBackups role={session.data?.user?.role} hours={hours} onTasks={()=>navigate('/proxmox?tab=Tasks%20%26%20Logs')} onStorage={()=>navigate('/storage')}/></div>;
}
