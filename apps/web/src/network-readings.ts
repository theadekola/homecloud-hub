export function networkAddress(row:any){return row?.displayAddresses?.length?row.displayAddresses.join(', '):row?.address||(!Array.isArray(row?.displayAddresses)?row?.cidr||row?.address6||row?.cidr6:null)|| (row?.liveAddressesReported?'Not assigned':'Not configured');}
export function networkMetric(row:any,field:'speed'|'rxMbps'|'txMbps'){
 const v=row?.[field];if(typeof v==='number'&&Number.isFinite(v)&&v>=0&&(field!=='speed'||v>0))return `${field==='speed'?v:v.toFixed(2)} Mbps`;
 const state:Record<string,string>={'unpaired':'Pair node','update-required':'Update connector','offline':'Connector offline','ambiguous':'Multiple connectors','stale':'Stale reading','waiting':'Waiting for report','error':'Reading unavailable'};
 if(state[row?.telemetryStatus])return state[row.telemetryStatus];
 const reason=row?.[field==='speed'?'speedReason':field==='rxMbps'?'rxReason':'txReason'];
 if(reason==='Not applicable to a virtual interface')return 'Not applicable';if(reason==='Link is down')return 'Link down';if(typeof reason==='string'&&reason.includes('sample'))return 'Collecting samples';return 'Not reported';
}
