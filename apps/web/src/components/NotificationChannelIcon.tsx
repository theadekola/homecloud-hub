import {Slack,Users,Bell,Radio,Webhook,Zap} from 'lucide-react';
import BrandIcon from './BrandIcon';
export default function NotificationChannelIcon({channel,size=22}:{channel:string;size?:number}){const Icon=({slack:Slack,teams:Users,pushover:Bell,gotify:Radio,webhook:Webhook,ifttt:Zap} as any)[channel];return Icon?<Icon size={size} aria-hidden="true"/>:<BrandIcon brand={channel} fallback="mail" size={size}/>;}
