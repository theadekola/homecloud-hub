export function dashboardLink(input:string){
 try{const url=new URL(input);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!['','/'].includes(url.pathname))return '';return url.origin+'/?install=1'}catch{return ''}
}
export function nextDeviceAddress(gateway:string,peers:any[]=[]){
 const parts=gateway?.split('/')[0].split('.');if(parts?.length!==4)return '';
 const used=new Set([gateway.split('/')[0],...peers.map(p=>p.address?.split('/')[0])]);
 for(let i=2;i<255;i++){const ip=parts.slice(0,3).join('.')+'.'+i;if(!used.has(ip))return ip+'/32'}return '';
}
export function gatewayState(node:any){
 if(!node||node.status!=='current')return {label:'Status unavailable',ready:false};
 return node.report?.vpn?.status==='configured'?{label:'Gateway ready',ready:true}:{label:'Not configured',ready:false};
}
