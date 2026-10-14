export function installationConsoleUrl(clusterUrl:string|undefined,vm:{id:string;node:string;name?:string}|undefined){
 if(!clusterUrl||!vm?.id||!vm.node)return null;
 try{const url=new URL(clusterUrl);if(!['https:','http:'].includes(url.protocol))return null;
 url.searchParams.set('console','kvm');url.searchParams.set('novnc','1');url.searchParams.set('vmid',vm.id);url.searchParams.set('vmname',vm.name||vm.id);url.searchParams.set('node',vm.node);return url.toString();}catch{return null;}
}
