export function nodeNetworkUrl(origin:string|undefined,node:string){
 if(!origin||!node)return null;
 try{const url=new URL(origin);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)return null;url.hash=`v1:0:=node%2F${encodeURIComponent(node)}:4:=network`;return url.toString()}catch{return null}
}
