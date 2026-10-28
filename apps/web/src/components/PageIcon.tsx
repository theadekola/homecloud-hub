import {pageIconImages} from '../bundled-icon-images';
import {useState} from 'react';
import {LayoutDashboard,Database,Network,HardDriveDownload,Activity,Bell,Sparkles,Terminal,FolderOpen,Users,Settings} from 'lucide-react';

export const pageIcons={dashboard:LayoutDashboard,storage:Database,network:Network,backups:HardDriveDownload,monitoring:Activity,alerts:Bell,assistant:Sparkles,shell:Terminal,files:FolderOpen,users:Users,settings:Settings};
export type PageIconName=keyof typeof pageIcons;
const paths:Record<string,PageIconName>={'/':'dashboard','/storage':'storage','/network':'network','/backups':'backups','/monitoring':'monitoring','/alerts':'alerts','/ai':'assistant','/tools/shell':'shell','/tools/sftp':'files','/users':'users','/settings':'settings'};
export function pageIconForPath(path:string):PageIconName{return Object.hasOwn(paths,path)?paths[path]:'dashboard'}
export function pageIconForTitle(title:string):PageIconName{
 if(/network|interface|routing|firewall|dns|traffic|device/i.test(title))return 'network';
 if(/storage|disk|dataset|volume|share|snapshot/i.test(title))return 'storage';
 if(/backup|restore|retention|schedule|destination|report/i.test(title))return 'backups';
 if(/alert|notification/i.test(title))return 'alerts';
 if(/monitor|performance|provider job/i.test(title))return 'monitoring';
 if(/assistant|\bai\b/i.test(title))return 'assistant';
 if(/sftp|files/i.test(title))return 'files';
 if(/shell|terminal/i.test(title))return 'shell';
 if(/user|audit|session/i.test(title))return 'users';
 if(/setting|security|appearance|integration|about|connection/i.test(title))return 'settings';
 return 'dashboard';
}
// Decorative beside a visible heading or link label. No user-provided image URLs.
export default function PageIcon({name,size=24,className=''}:{name:PageIconName;size?:number;className?:string}){
 const [failed,setFailed]=useState(''),key=Object.hasOwn(pageIcons,name)?name:'dashboard',Fallback=pageIcons[key],dimension=Number.isFinite(size)?Math.max(12,Math.min(48,size)):24,src=pageIconImages[key];
 return <span className={`page-image-icon ${className}`} data-page-icon={key} aria-hidden="true" style={{width:dimension,height:dimension}}>{failed===src?<Fallback size={dimension}/>:<img src={src} width={dimension} height={dimension} alt="" draggable={false} decoding="async" onError={()=>setFailed(src)}/>}</span>;
}
