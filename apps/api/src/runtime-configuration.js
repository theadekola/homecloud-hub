import {notificationIds,filterKey,httpsEndpoint} from './notification-channels.js';
import {removeRetiredConfigurations} from './retired-providers.js';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {X509Certificate} from 'node:crypto';
import {createClusterStore} from './cluster-config.js';
const field=(key,label,type='text',required=true,extra={})=>({key,label,type,required,...extra});
export const configurationSchemas={
 discord:{name:'Discord',fields:[field('DISCORD_WEBHOOK_URL','Webhook URL','password')]},
 telegram:{name:'Telegram',fields:[field('TELEGRAM_BOT_TOKEN','Bot token','password'),field('TELEGRAM_CHAT_ID','Chat ID')]},
 email:{name:'Email (SMTP)',fields:[field('SMTP_HOST','SMTP hostname'),field('SMTP_PORT','SMTP port','number'),field('SMTP_USER','SMTP username','text',false),field('SMTP_PASSWORD','SMTP password','password',false),field('NOTIFICATION_EMAIL_FROM','Sender email','email'),field('NOTIFICATION_EMAIL_TO','Recipient email','email'),field('SMTP_CA_PEM','Trusted CA certificate (PEM)','textarea',false)]},
 truenas:{name:'TrueNAS',fields:[field('TRUENAS_URL','HTTPS endpoint','url'),field('TRUENAS_API_KEY','API key','password'),field('TRUENAS_API_MODE','API protocol','select',true,{options:['current','legacy'],defaultValue:'current'}),field('TRUENAS_VERIFY_TLS','Verify server certificate','select',true,{options:['false','true'],defaultValue:'false',advanced:true}),field('TRUENAS_CA_PEM','Trusted CA certificate (PEM)','textarea',false,{advanced:true})]},
 ai:{name:'AI Assistant',fields:[field('OPENAI_API_TYPE','OpenAI API type','select',true,{options:['responses','chat-completions'],defaultValue:'responses'}),field('OPENAI_API_KEY','OpenAI API key','password'),field('OPENAI_MODEL','Model','text',true,{defaultValue:'gpt-5-mini'})]}
};
Object.assign(configurationSchemas,{
 slack:{name:'Slack',fields:[field('SLACK_WEBHOOK_URL','Slack incoming webhook URL','password')]},
 teams:{name:'Microsoft Teams',fields:[field('TEAMS_WEBHOOK_URL','Teams Workflows webhook URL','password')]},
 pushover:{name:'Pushover',fields:[field('PUSHOVER_APP_TOKEN','Application token','password'),field('PUSHOVER_USER_KEY','User or group key','password'),field('PUSHOVER_DEVICE','Device name','text',false)]},
 gotify:{name:'Gotify',fields:[field('GOTIFY_URL','Gotify HTTPS URL','url'),field('GOTIFY_APP_TOKEN','Application token','password'),field('GOTIFY_CA_PEM','Trusted CA certificate (PEM)','textarea',false)]},
 webhook:{name:'Custom Webhook',fields:[field('WEBHOOK_URL','Webhook HTTPS URL','password'),field('WEBHOOK_BEARER_TOKEN','Bearer token','password',false),field('WEBHOOK_CA_PEM','Trusted CA certificate (PEM)','textarea',false)]},
 ifttt:{name:'IFTTT',fields:[field('IFTTT_EVENT','Event name'),field('IFTTT_WEBHOOK_KEY','Webhooks key','password')]}
});
for(const id of notificationIds)configurationSchemas[id].fields.push(field(filterKey(id),'Send notifications for','multiselect',true,{options:['all','critical','warning','info','resolved','unknown'],defaultValue:'all'}));
const invalid=message=>{throw Object.assign(Error(message),{status:400})};
function schemaFor(id){const schema=Object.hasOwn(configurationSchemas,id)&&configurationSchemas[id];if(!schema)invalid('Unsupported configuration service');return schema;}
export function validateConfiguration(id,input,previous={}){
 const schema=schemaFor(id);if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!schema.fields.some(f=>f.key===k)))invalid('Choose valid configuration fields');
 if(id==='truenas'&&input.TRUENAS_VERIFY_TLS===undefined&&previous.TRUENAS_VERIFY_TLS===undefined&&(previous.TRUENAS_CA_PEM||previous.TRUENAS_TLS_CA))previous={...previous,TRUENAS_VERIFY_TLS:'true'};
 const values={};for(const f of schema.fields){let v=input[f.key];if(v===null&&f.type==='password'&&!f.required)v='';else if(v===undefined||f.type==='password'&&v==='')v=previous[f.key]??f.defaultValue??'';if(typeof v!=='string'||v.length>(f.type==='textarea'?65536:4096)||v.includes('\0')||(f.type!=='textarea'&&/[\r\n]/.test(v)))invalid(`Enter a valid ${f.label}`);if(f.type!=='password')v=v.trim();if(f.key==='TRUENAS_API_MODE'&&v==='jsonrpc')v='current';if(!v&&f.required)invalid(`${f.label} is required`);if(f.type==='select'&&!f.options.includes(v))invalid(`Choose a valid ${f.label}`);if(f.type==='multiselect'){const selected=v.split(',');if(selected.some(k=>!f.options.includes(k))||new Set(selected).size!==selected.length||(selected.includes('all')&&selected.length!==1))invalid(`Choose at least one valid ${f.label} option`);v=f.options.filter(k=>selected.includes(k)).join(',');}if(f.type==='textarea'&&v){if(v.includes('PRIVATE KEY'))invalid('Upload only a CA certificate, never a private key');try{new X509Certificate(v)}catch{invalid('Enter a valid PEM CA certificate')}}values[f.key]=v;}
 if(id==='discord'){let u;try{u=new URL(values.DISCORD_WEBHOOK_URL)}catch{invalid('Enter a Discord HTTPS webhook URL')}if(u.protocol!=='https:'||u.hostname!=='discord.com'||u.port||u.username||u.password||u.search||u.hash||!/^\/api(?:\/v\d+)?\/webhooks\/\d+\/[A-Za-z0-9_-]+$/.test(u.pathname))invalid('Enter a Discord HTTPS webhook URL');}
 if(id==='telegram'&&(!/^\d+:[A-Za-z0-9_-]+$/.test(values.TELEGRAM_BOT_TOKEN)||!/^(-?\d+|@[A-Za-z0-9_]+)$/.test(values.TELEGRAM_CHAT_ID)))invalid('Enter a valid Telegram bot token and chat ID');
 if(id==='email'){if(!/^[a-zA-Z0-9.:-]+$/.test(values.SMTP_HOST))invalid('Enter an SMTP hostname without a scheme or path');const p=Number(values.SMTP_PORT);if(!Number.isInteger(p)||p<1||p>65535)invalid('SMTP port must be between 1 and 65535');if(Boolean(values.SMTP_USER)!==Boolean(values.SMTP_PASSWORD))invalid('SMTP username and password must both be set, or both empty');for(const key of ['NOTIFICATION_EMAIL_FROM','NOTIFICATION_EMAIL_TO'])if(!/^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/.test(values[key]))invalid('Enter one valid sender and recipient email address');}
 for(const key of ['TRUENAS_URL'])if(values[key]){let u;try{u=new URL(values[key])}catch{invalid('Enter a valid HTTPS endpoint')}if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/')invalid('Use an HTTPS origin without credentials, paths or query strings');values[key]=u.origin;}
 for(const key of ['SLACK_WEBHOOK_URL','TEAMS_WEBHOOK_URL','GOTIFY_URL','WEBHOOK_URL'])if(values[key]){let url;try{url=httpsEndpoint(values[key])}catch{invalid('Enter a valid HTTPS endpoint without embedded credentials or a fragment')}
  if(key==='SLACK_WEBHOOK_URL'&&(!['hooks.slack.com','hooks.slack-gov.com'].includes(url.hostname)||!/^\/services\/[A-Za-z0-9_/-]+$/.test(url.pathname)||url.search||url.port))invalid('Enter a Slack incoming webhook URL');
  if(key==='TEAMS_WEBHOOK_URL'&&!['.logic.azure.com','.environment.api.powerplatform.com','.webhook.office.com'].some(s=>url.hostname.endsWith(s)))invalid('Enter a Microsoft Teams Workflows webhook URL');
  if(key==='GOTIFY_URL'&&url.search)invalid('Use a Gotify base URL without a query string');
 }
 if(id==='pushover'&&['PUSHOVER_APP_TOKEN','PUSHOVER_USER_KEY'].some(k=>! /^[A-Za-z0-9]{30}$/.test(values[k])))invalid('Enter valid 30-character Pushover keys');
 if(id==='ifttt'&&(!/^[A-Za-z0-9_-]{1,100}$/.test(values.IFTTT_EVENT)||! /^[A-Za-z0-9_-]{1,200}$/.test(values.IFTTT_WEBHOOK_KEY)))invalid('Enter a valid IFTTT event name and Webhooks key');
 if(id==='ai'&&(!/^[A-Za-z0-9._:-]{1,150}$/.test(values.OPENAI_MODEL)||/\s/.test(values.OPENAI_API_KEY)))invalid('Enter a valid model and API key');
 return values;
}
export function createConfigurationStore(directory,secret=()=>process.env.JWT_SECRET){
 removeRetiredConfigurations(directory);
 const stores=new Map();const store=id=>{schemaFor(id);if(!stores.has(id))stores.set(id,createClusterStore(path.join(directory,`${id}.json`),secret,value=>value));return stores.get(id)};
 const resolve=(id,env=process.env)=>{const saved=store(id).read();if(saved?.disabled)return {};const values=saved?.values||Object.fromEntries(schemaFor(id).fields.map(f=>[f.key,env[f.key]??(f.key==='TRUENAS_VERIFY_TLS'&&(env.TRUENAS_CA_PEM||env.TRUENAS_TLS_CA)?'true':f.defaultValue??(f.key==='SMTP_PORT'?'587':f.type==='select'?'current':''))]));return id==='truenas'?{...values,TRUENAS_API_MODE:values.TRUENAS_API_MODE==='jsonrpc'?'current':values.TRUENAS_API_MODE,TRUENAS_VERIFY_TLS:values.TRUENAS_VERIFY_TLS??(values.TRUENAS_CA_PEM||env.TRUENAS_TLS_CA?'true':'false')}:values};
 const publicConfig=(id,env=process.env)=>{const schema=schemaFor(id),values=resolve(id,env),saved=store(id).read();return {id,name:schema.name,source:saved?'saved':'environment',disabled:!!saved?.disabled,fields:schema.fields.map(f=>({...f,value:f.type==='password'?'':values[f.key]||(f.defaultValue??(f.key==='SMTP_PORT'?'587':f.type==='select'?'current':'')),hasValue:!!values[f.key]}))}};
 return {resolve,publicConfig,save(id,input,env=process.env){const values=validateConfiguration(id,input,resolve(id,env));store(id).save({values});return publicConfig(id,env)},disable(id){store(id).save({disabled:true});return publicConfig(id)},environment(env=process.env){const result={...env};for(const id of Object.keys(configurationSchemas)){const saved=store(id).read();if(!saved)continue;const values=resolve(id,env);for(const f of schemaFor(id).fields)result[f.key]=saved.disabled?'':values[f.key]||'';}return result;}};
}
const directory=process.env.DATA_DIR||path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../runtime');
export const configurationStore=createConfigurationStore(path.join(directory,'configuration'));
export const runtimeEnvironment=()=>configurationStore.environment();
