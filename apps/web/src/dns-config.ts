export const dnsKeys=['search','dns1','dns2','dns3'];
export function dnsConfig(row:any){return Object.fromEntries(dnsKeys.map(key=>[key,String(row?.[key]??'').trim()]));}
export function sameDnsConfig(a:any,b:any){return JSON.stringify(dnsConfig(a))===JSON.stringify(dnsConfig(b));}
