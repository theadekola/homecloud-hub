import {useState} from 'react';
import {Container,Monitor,Server,Mail,Box} from 'lucide-react';
import {brandAssets} from '../brand-assets';
import {operatingSystemIcon,serviceIcon} from '../brand-icons';
type Props={brand?:string|null;size?:number;label?:string;decorative?:boolean;fallback?:'server'|'container'|'os'|'mail'|'service';className?:string};
export default function BrandIcon({brand,size=24,label,decorative=true,fallback='service',className=''}:Props){
 const [failed,setFailed]=useState(''),asset=brand&&Object.hasOwn(brandAssets,brand)?brandAssets[brand]:null,Icon={server:Server,container:Container,os:Monitor,mail:Mail,service:Box}[fallback],dimension=Number.isFinite(size)?Math.max(8,Math.min(96,size)):24;
 return <span className={`brand-mark ${className}`} data-brand={asset?brand:'unknown'} aria-hidden={decorative?true:undefined} role={decorative?undefined:'img'} aria-label={decorative?undefined:label||asset?.name||'Unknown system'} style={{width:dimension,height:dimension}}>{asset&&failed!==asset.src?<img src={asset.src} width={dimension} height={dimension} alt="" draggable={false} decoding="async" onError={()=>setFailed(asset.src)}/>:<Icon size={dimension}/>}</span>;
}
export function OSIcon({hints,size=48,kind='vm'}:{hints:unknown[];size?:number;kind?:'vm'|'ct'}){return <BrandIcon brand={operatingSystemIcon(...hints)} size={size} fallback={kind==='ct'?'container':'os'}/>}
export function ServiceIcon({image,size=24}:{image:unknown;size?:number}){return <BrandIcon brand={serviceIcon(image)} size={size} fallback="container"/>}
