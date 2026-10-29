import QRCode from 'qrcode';
import {useMemo} from 'react';
export default function AccessQR({value,label}:{value:string;label:string}){
 const qr=useMemo(()=>{try{return QRCode.create(value,{errorCorrectionLevel:'M'})}catch{return null}},[value]);
 if(!qr)return <p role="alert">Could not create the QR code. Use the address below.</p>;
 const {size,data}=qr.modules;let path='';
 for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(data[y*size+x])path+=`M${x+4} ${y+4}h1v1h-1z`;
 return <svg className="access-qr" role="img" aria-label={label} viewBox={`0 0 ${size+8} ${size+8}`} shapeRendering="crispEdges"><rect width={size+8} height={size+8} fill="#fff"/><path d={path} fill="#07101c"/></svg>;
}
