import {httpsEndpoint} from './notification-channels.js';
import {messageText,messageHeading,colorHex,statusMarker} from './notification-message.js';
import {request} from './connectors.js';
const cut=(v,n)=>String(v||'').slice(0,n),plain=text=>({type:'plain_text',text:cut(text,2900)});
export function adapterRequest(channel,text,env,n){
 let url,body,headers={'Content-Type':'application/json'},ca='';
 const message=n?messageText(n):text,title=n?messageHeading(n):'i-Clusters notification',details=n?.details||text,source=n?.source||'i-Clusters';
 if(channel==='slack'){
  url=httpsEndpoint(env.SLACK_WEBHOOK_URL);if(!['hooks.slack.com','hooks.slack-gov.com'].includes(url.hostname)||!url.pathname.startsWith('/services/'))throw Error('Use a Slack incoming webhook');
  body={text:cut(message,4000).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),parse:'none',link_names:false,attachments:[{color:n?colorHex(n):'#3b82f6',blocks:[{type:'header',text:plain(cut(title,150))},{type:'section',text:plain(`Source: ${source}\n${details}`)},{type:'context',elements:[plain(n?.time||'i-Clusters')]}]}]};
 }else if(channel==='teams'){
  url=httpsEndpoint(env.TEAMS_WEBHOOK_URL);if(!['.logic.azure.com','.environment.api.powerplatform.com','.webhook.office.com'].some(s=>url.hostname.endsWith(s)))throw Error('Use a Microsoft Teams Workflows webhook');
  body={type:'message',attachments:[{contentType:'application/vnd.microsoft.card.adaptive',contentUrl:null,content:{$schema:'http://adaptivecards.io/schemas/adaptive-card.json',type:'AdaptiveCard',version:'1.2',body:[{type:'TextBlock',text:title,weight:'Bolder',size:'Medium',color:n?.event==='resolved'?'Good':({critical:'Attention',warning:'Warning',info:'Accent',unknown:'Default'}[n?.severity]||'Accent'),wrap:true},{type:'FactSet',facts:[{title:'Source',value:source},{title:'Event',value:n?.event||'test'},{title:'Severity',value:n?.severity||'info'}]},{type:'TextBlock',text:details,wrap:true},{type:'TextBlock',text:n?.time||'Time not reported',wrap:true,isSubtle:true}]}}]};
 }else if(channel==='pushover'){
  url=new URL('https://api.pushover.net/1/messages.json');body={token:env.PUSHOVER_APP_TOKEN,user:env.PUSHOVER_USER_KEY,title:cut(title,250),message:cut(message,1024),priority:n?.event==='resolved'?-1:n?.severity==='critical'?1:0,...(env.PUSHOVER_DEVICE?{device:env.PUSHOVER_DEVICE}:{})};
 }else if(channel==='gotify'){
  url=httpsEndpoint(env.GOTIFY_URL.replace(/\/$/,'')+'/message');headers['X-Gotify-Key']=env.GOTIFY_APP_TOKEN;ca=env.GOTIFY_CA_PEM;body={title:cut(title,250),message:cut(message,4000),priority:n?.event==='resolved'?2:n?.severity==='critical'?8:5};
 }else if(channel==='webhook'){
  url=httpsEndpoint(env.WEBHOOK_URL);if(env.WEBHOOK_BEARER_TOKEN)headers.Authorization=`Bearer ${env.WEBHOOK_BEARER_TOKEN}`;ca=env.WEBHOOK_CA_PEM;body={application:'i-Clusters',title,source,details,event:n?.event||'test',severity:n?.severity||'info',timestamp:n?.time||null,message,...(n?{card:{title:n.title,source,details,status:n.event==='resolved'?'Recovered':n.severity.toUpperCase(),color:colorHex(n),marker:statusMarker(n),timestamp:n.time}}:{})};
 }else if(channel==='ifttt'){
  url=new URL(`https://maker.ifttt.com/trigger/${encodeURIComponent(env.IFTTT_EVENT)}/with/key/${encodeURIComponent(env.IFTTT_WEBHOOK_KEY)}`);body={value1:cut(title,250),value2:cut(source,500),value3:cut(`${details}\n${n?.time||''}`,3000)};
 }else throw Error('Unsupported notification channel');
 return {url,body,headers,ca};
}
export async function sendAdapter(channel,text,{env,notification,fetcher=fetch,tlsRequest=request}){
 const {url,body,headers,ca}=adapterRequest(channel,text,env,notification),options={method:'POST',headers,body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(15000),timeoutMs:15000};
 const result=ca?await tlsRequest(url,options,{ca,rejectUnauthorized:true}):await fetcher(url,options);
 if(!result.ok)throw Object.assign(Error('Notification service rejected delivery'),{providerStatus:result.status});
 if(channel==='pushover'&&(await result.json()).status!==1)throw Error('Pushover rejected delivery');
 if(channel==='slack'&&(await result.text()).trim()!=='ok')throw Error('Slack rejected delivery');
}
