export const notificationIds=['discord','telegram','email','slack','teams','pushover','gotify','webhook','ifttt'];
export const channelNames={discord:'Discord',telegram:'Telegram',email:'Email (SMTP)',slack:'Slack',teams:'Microsoft Teams',pushover:'Pushover',gotify:'Gotify',webhook:'Custom Webhook',ifttt:'IFTTT'};
export const filterKey=id=>`${id.toUpperCase()}_NOTIFICATION_FILTER`;
export function channelAccepts(id,alert,event,env){const filter=env[filterKey(id)]||'all',kind=event==='resolved'?'resolved':['critical','warning','info'].includes(alert.severity)?alert.severity:'unknown';return filter==='all'||filter===kind;}
export function httpsEndpoint(value){const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.hash)throw Error('Use an HTTPS endpoint without embedded credentials or a fragment');return url;}
