import {storageTabs} from './storage-navigation';

export const settingsTabs=['General','System','Security','Connections','Appearance','About'];
export function settingsCategory(raw:string){
 if(['Notifications','Integrations'].includes(raw))return 'Connections';
 if(['Advanced','Backup & Restore'].includes(raw))return 'System';
 return settingsTabs.includes(raw)?raw:'General';
}
export function settingsTitle(category:string){return category==='About'?'About i-Clusters':category==='Connections'?'Connections':`${category} Settings`;}
const sections:Record<string,{name:string;tabs?:string[]}>= {
 '/proxmox':{name:'Proxmox',tabs:['Overview','Nodes','Virtual Machines','LXC Containers','Storage','Networks','Tasks & Logs']},
 '/docker':{name:'Docker',tabs:['Containers','Images','Volumes','Networks','Compose Stacks','Events','Updates']},
 '/storage':{name:'Storage',tabs:storageTabs},
 '/network':{name:'Network',tabs:['Network Map','Interfaces','Devices','Routing','DNS','Traffic Analysis','Docker Networks']},
 '/backups':{name:'Backups',tabs:['Backup Jobs','Restore Points','Schedules','Retention Policies','Destinations','Reports','Recovery Tests']},
 '/monitoring':{name:'Monitoring',tabs:['Overview','Provider Jobs','Hardware & Diagnostics']},
 '/alerts':{name:'Alerts',tabs:['Active Alerts','Alert History','Alert Rules']},
 '/users':{name:'Users',tabs:['Accounts','Audit Logs']},
 '/settings':{name:'Settings',tabs:settingsTabs},
 '/ai':{name:'AI Assistant'},'/tools/shell':{name:'Shell'},'/tools/sftp':{name:'SFTP Files'}
};
export type PageCrumb={label:string;to?:string};
export function pageTrail(pathname:string,search:string,host?:string,role?:string):PageCrumb[]{
 const section=sections[pathname];if(!section)return [];
 const params=new URLSearchParams(search),requested=params.get('tab')||'';
 let tab=section.tabs?(section.tabs.includes(requested)?requested:section.tabs[0]):'';
 if(pathname==='/settings')tab=settingsCategory(requested);
 if(pathname==='/users'&&['operator','auditor'].includes(role||''))tab='Audit Logs';
 if(pathname==='/proxmox'){if(params.get('action')==='Create VM')tab='Virtual Machines';if(params.get('action')==='Create CT')tab='LXC Containers';}
 const trail:PageCrumb[]=[{label:section.name,to:tab?pathname:undefined}];
 if(pathname==='/docker'&&host)trail.push({label:host,to:'/docker'});
 if(tab)trail.push({label:tab});
 if(pathname==='/settings'&&tab==='Connections'){
  const nested:Record<string,string>={connected:'Connected',setup:'Needs Setup',notifications:'Notifications',remote:'Remote Access'};
  const sub=nested[params.get('section')||'']||(requested==='Notifications'?'Notifications':'Connected');
  trail[trail.length-1].to='/settings?tab=Connections';trail.push({label:sub});
 }
 return trail;
}
