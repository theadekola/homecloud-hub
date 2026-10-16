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
 truenas:{name:'TrueNAS',fields:[field('TRUENAS_URL','HTTPS endpoint','url'),field('TRUENAS_API_KEY','API key','password'),field('TRUENAS_API_MODE','API protocol','select',true,{options:['current','legacy']}),field('TRUENAS_CA_PEM','Trusted CA certificate (PEM)','textarea',false)]},
 ai:{name:'AI Assistant',fields:[field('OPENAI_API_KEY','OpenAI API key','password'),field('OPENAI_MODEL','Model','text',true,{defaultValue:'gpt-5-mini'})]}
};
const invalid=message=>{throw Object.assign(Error(message),{status:400})};
function schemaFor(id){const schema=Object.hasOwn(configurationSchemas,id)&&configurationSchemas[id];if(!schema)invalid('Unsupported configuration service');return schema;}
export function validateConfiguration(id,input,previous={}){
 const schema=schemaFor(id);if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!schema.fields.some(f=>f.key===k)))invalid('Choose valid configuration fields');
 const values={};for(const f of schema.fields){let v=input[f.key];if(v===null&&f.type==='password'&&!f.required)v='';else if(v===undefined||f.type==='password'&&v==='')v=previous[f.key]??'';if(typeof v!=='string'||v.length>(f.type==='textarea'?65536:4096)||v.includes('\0')||(f.type!=='textarea'&&/[\r\n]/.test(v)))invalid(`Enter a valid ${f.label}`);if(f.type!=='password')v=v.trim();if(!v&&f.required)invalid(`${f.label} is required`);if(f.type==='select'&&!f.options.includes(v))invalid(`Choose a valid ${f.label}`);if(f.type==='textarea'&&v){if(v.includes('PRIVATE KEY'))invalid('Upload only a CA certificate, never a private key');try{new X509Certificate(v)}catch{invalid('Enter a valid PEM CA certificate')}}values[f.key]=v;}
 if(id==='discord'){let u;try{u=new URL(values.DISCORD_WEBHOOK_URL)}catch{invalid('Enter a Discord HTTPS webhook URL')}if(u.protocol!=='https:'||u.hostname!=='discord.com'||u.port||u.username||u.password||u.search||u.hash||!/^\/api(?:\/v\d+)?\/webhooks\/\d+\/[A-Za-z0-9_-]+$/.test(u.pathname))invalid('Enter a Discord HTTPS webhook URL');}
 if(id==='telegram'&&(!/^\d+:[A-Za-z0-9_-]+$/.test(values.TELEGRAM_BOT_TOKEN)||!/^(-?\d+|@[A-Za-z0-9_]+)$/.test(values.TELEGRAM_CHAT_ID)))invalid('Enter a valid Telegram bot token and chat ID');
 if(id==='email'){if(!/^[a-zA-Z0-9.:-]+$/.test(values.SMTP_HOST))invalid('Enter an SMTP hostname without a scheme or path');const p=Number(values.SMTP_PORT);if(!Number.isInteger(p)||p<1||p>65535)invalid('SMTP port must be between 1 and 65535');if(Boolean(values.SMTP_USER)!==Boolean(values.SMTP_PASSWORD))invalid('SMTP username and password must both be set, or both empty');for(const key of ['NOTIFICATION_EMAIL_FROM','NOTIFICATION_EMAIL_TO'])if(!/^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/.test(values[key]))invalid('Enter one valid sender and recipient email address');}
 for(const key of ['TRUENAS_URL'])if(values[key]){let u;try{u=new URL(values[key])}catch{invalid('Enter a valid HTTPS endpoint')}if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/')invalid('Use an HTTPS origin without credentials, paths or query strings');values[key]=u.origin;}
 if(id==='ai'&&(!/^[A-Za-z0-9._:-]{1,150}$/.test(values.OPENAI_MODEL)||/\s/.test(values.OPENAI_API_KEY)))invalid('Enter a valid model and API key');
 return values;
}
export function createConfigurationStore(directory,secret=()=>process.env.JWT_SECRET){
 removeRetiredConfigurations(directory);
 const stores=new Map();const store=id=>{schemaFor(id);if(!stores.has(id))stores.set(id,createClusterStore(path.join(directory,`${id}.json`),secret,value=>value));return stores.get(id)};
 const resolve=(id,env=process.env)=>{const saved=store(id).read();if(saved?.disabled)return {};return saved?.values||Object.fromEntries(schemaFor(id).fields.map(f=>[f.key,env[f.key]??(f.defaultValue??(f.key==='SMTP_PORT'?'587':f.type==='select'?'current':''))]))};
 const publicConfig=(id,env=process.env)=>{const schema=schemaFor(id),values=resolve(id,env),saved=store(id).read();return {id,name:schema.name,source:saved?'saved':'environment',disabled:!!saved?.disabled,fields:schema.fields.map(f=>({...f,value:f.type==='password'?'':values[f.key]||(f.defaultValue??(f.key==='SMTP_PORT'?'587':f.type==='select'?'current':'')),hasValue:!!values[f.key]}))}};
 return {resolve,publicConfig,save(id,input,env=process.env){const values=validateConfiguration(id,input,resolve(id,env));store(id).save({values});return publicConfig(id,env)},disable(id){store(id).save({disabled:true});return publicConfig(id)},environment(env=process.env){const result={...env};for(const id of Object.keys(configurationSchemas)){const saved=store(id).read();if(!saved)continue;for(const f of schemaFor(id).fields)result[f.key]=saved.disabled?'':saved.values[f.key]||'';}return result;}};
}
const directory=process.env.DATA_DIR||path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../runtime');
export const configurationStore=createConfigurationStore(path.join(directory,'configuration'));
export const runtimeEnvironment=()=>configurationStore.environment();
