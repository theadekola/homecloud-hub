import {pve} from './connectors.js';
import {encode,httpError} from './infrastructure.js';
import {storageInventory} from './storage.js';
const n=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
export function performancePoint(input){const r={...input,memused:input.memused??input.mem,memtotal:input.memtotal??input.maxmem};const ratio=(v)=>n(v)==null?null:v*100;return {time:n(r.time)==null?null:r.time*1000,cpu:ratio(r.cpu),iowait:ratio(r.iowait),memoryUsed:n(r.memused),memoryTotal:n(r.memtotal),memoryPercent:n(r.memused)!=null&&r.memtotal>0?r.memused/r.memtotal*100:null,swapUsed:n(r.swapused),swapTotal:n(r.swaptotal),netIn:n(r.netin),netOut:n(r.netout),diskRead:n(r.diskread),diskWrite:n(r.diskwrite),load:n(r.loadavg)};}
export async function storagePerformance({enabled=false,source,timeframe='day',query=pve,inventory=storageInventory}={}){
 if(!['hour','day','week','month','year'].includes(timeframe))throw httpError('Unsupported time range');
 const result={sources:[],selected:null,series:[],current:null,pools:[],errors:[],timeframe,sampledAt:new Date().toISOString()};if(!enabled)return result;
 try{const resources=await query('/cluster/resources');result.sources=resources.filter(r=>['node','qemu','lxc'].includes(r.type)).map(r=>({id:r.type==='node'?`node:${r.node}`:`${r.type}:${r.node}:${r.vmid}`,type:r.type,node:r.node,vmid:r.vmid??null,name:r.name||r.node||String(r.vmid),status:r.status}));}catch(e){result.errors.push(`Sources: ${e.message}`)}
 result.selected=source?result.sources.find(s=>s.id===source):result.sources.find(s=>s.type==='node'&&s.status==='online')||result.sources[0];if(source&&!result.selected)throw httpError('Performance source not found',404);
 const s=result.selected;if(s){const base=`/nodes/${encode(s.node)}${s.type==='node'?'':`/${s.type}/${s.vmid}`}`;await Promise.all([ (async()=>{try{result.series=(await query(`${base}/rrddata?timeframe=${timeframe}&cf=AVERAGE`)).map(performancePoint).filter(r=>r.time!=null).sort((a,b)=>a.time-b.time)}catch(e){result.errors.push(`History: ${e.message}`)}})(),(async()=>{try{result.current=await query(s.type==='node'?`${base}/status`:`${base}/status/current`)}catch(e){result.errors.push(`Current status: ${e.message}`)}})()]);}
 try{const pools=await inventory();result.pools=pools.resources.filter(p=>!s||p.node===s.node);result.errors.push(...pools.errors)}catch(e){result.errors.push(`Pool usage: ${e.message}`)}return result;
}
