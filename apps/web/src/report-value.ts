type Reading={loading?:boolean;error?:string;data?:any};
export const reportPending=(read:Reading)=>!read.error&&!!((read.loading&&!read.data)||read.data?.refreshing);
// Missing measurements after completion must not look like an endless load.
export function reportValue<T>(value:T,read:Reading):T|string{return value==='Unknown'&&reportPending(read)?'Loading…':value;}
