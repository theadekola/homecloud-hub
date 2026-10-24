type Reading={loading?:boolean;error?:string;data?:any};
export const reportPending=(read:Reading)=>!read.error&&!!((read.loading&&!read.data)||read.data?.refreshing);
// Missing measurements after completion must not look like an endless load.
export function reportValue<T>(value:T,read:Reading):T|string{return value==='Unknown'&&reportPending(read)?'Loading…':value;}

/** Headline cards must not present cached failures or unverified empty inventories as measurements. */
export function summaryValue<T>(value:T,read:Reading):T|string{
 if(read.error)return 'Unknown';
 if(!read.data)return reportPending(read)?'Loading…':'Unknown';
 const sampled=Date.parse(read.data.sampledAt);
 if(Number.isFinite(sampled)&&Date.now()-sampled>180000)return 'Stale';
 if(value==null||typeof value==='number'&&!Number.isFinite(value))return 'Unknown';
 const partial=!!read.data.errors?.length||read.data.coverage?.complete===false||read.data.summary?.complete===false;
 if(value===0&&partial)return reportPending(read)?'Loading…':'Unknown';
 return partial&&typeof value==='number'?`${value} reported`:reportValue(value,read);
}
