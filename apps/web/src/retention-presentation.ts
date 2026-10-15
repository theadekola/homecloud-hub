const labels:Record<string,string>={'keep-last':'Latest backups','keep-hourly':'Hourly backups','keep-daily':'Daily backups','keep-weekly':'Weekly backups','keep-monthly':'Monthly backups','keep-yearly':'Yearly backups'};
export function retentionRule(value:any){
 if(value==null||value==='')return {text:'',items:[] as {name:string;value:string}[],valid:true,configured:false,issues:[] as string[]};
 const object=typeof value==='object'&&!Array.isArray(value),tokens=object?Object.entries(value):typeof value==='string'?value.split(',').filter(Boolean).map(s=>s.trim().split('=')):[],issues:string[]=[],items:{name:string;value:string}[]=[],parts:string[]=[],seen=new Set<string>();let positive=false;
 if(!object&&typeof value!=='string')issues.push('Unrecognized retention rule format.');
 for(const token of tokens){const [rawKey,v]=token,key=String(rawKey).trim(),raw=typeof v==='string'?v.trim():v,numeric=(typeof raw==='number'||typeof raw==='string'&&/^\d+$/.test(raw))&&Number.isSafeInteger(Number(raw))&&Number(raw)>=0;parts.push(token.length===2?`${key}=${typeof raw==='object'?JSON.stringify(raw):String(raw??'')}`:key);if(!Object.hasOwn(labels,key)||seen.has(key)||token.length!==2||!numeric){issues.push(`Review retention setting: ${key}.`);continue;}seen.add(key);positive=positive||Number(raw)>0;items.push({name:labels[key],value:`Keep ${Number(raw)}`});}
 if(!positive&&tokens.length)issues.push('At least one retention count must be positive.');
 return {text:tokens.length?parts.join(','):issues.length?JSON.stringify(value):'',items,valid:issues.length===0,configured:positive&&issues.length===0,issues};
}
export function policyMatchesArchive(policy:any,point:any){
 if(policy.provider==='truenas')return point.__snapshot===true&&!!policy.dataset&&policy.dataset===point.dataset;
 if(point.__snapshot||!policy.storage||policy.storage!==point.storage||policy.node&&policy.node!==point.node&&point.shared!==true)return false;
 const id=String(point.vmid??'');if(!/^\d+$/.test(id))return false;
 if(String(policy.exclude||'').split(/[,;\s]+/).includes(id))return false;
 if(policy.all===true||policy.all===1||policy.all==='1')return true;
 return String(policy.vmid||'').split(/[,;\s]+/).includes(id);
}
