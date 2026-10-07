import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export function validateCluster(input) {
 const invalid=message=>{throw Object.assign(new Error(message),{status:400});};
 const name=String(input.name||'').trim(),host=String(input.host||'').trim(),tokenId=String(input.tokenId||'').trim();
 if(!name||name.length>100)invalid('Cluster name is required (maximum 100 characters).');
 if(!/^[a-zA-Z0-9.-]+$/.test(host)&&!/^\[[a-fA-F0-9:]+\]$/.test(host))invalid('Enter a hostname or IP address without a URL, path or port.');
 const port=Number(input.port??8006);if(!Number.isInteger(port)||port<1||port>65535)invalid('Port must be between 1 and 65535.');
 if(!/^[^\s=!]+@[^\s=!]+![^\s=!]+$/.test(tokenId))invalid('API token ID must use user@realm!token-name.');
 if(typeof input.tokenSecret!=='string'||!input.tokenSecret||input.tokenSecret.length>4096||/[\r\n]/.test(input.tokenSecret))invalid('A valid API token secret is required.');
 if(typeof input.verifyTls!=='boolean')invalid('SSL verification must be true or false.');
 const ca=String(input.ca||'').trim();if(ca&&(ca.length>65536||!ca.includes('-----BEGIN CERTIFICATE-----')||ca.includes('PRIVATE KEY')))invalid('Enter a PEM CA certificate, not a private key.');
 return {name,host,port,tokenId,tokenSecret:input.tokenSecret,verifyTls:input.verifyTls,ca,url:`https://${host}:${port}`};
}
export function createClusterStore(file,secret=()=>process.env.JWT_SECRET) {
 const key=()=>{const value=secret();if(!value||value.length<32)throw new Error('JWT_SECRET must be at least 32 characters to protect saved connections.');return crypto.createHash('sha256').update(value).digest();};
 const read=()=>{
  if(!fs.existsSync(file))return null;
  const value=JSON.parse(fs.readFileSync(file,'utf8'));
  const decipher=crypto.createDecipheriv('aes-256-gcm',key(),Buffer.from(value.iv,'base64'));
  decipher.setAuthTag(Buffer.from(value.tag,'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.data,'base64')),decipher.final()]).toString());
 };
 return {read,save(input){
  const config=validateCluster(input),iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key(),iv);
  const data=Buffer.concat([cipher.update(JSON.stringify(config)),cipher.final()]);
  fs.mkdirSync(path.dirname(file),{recursive:true});const temporary=`${file}.tmp`;
  fs.writeFileSync(temporary,JSON.stringify({schema:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')}),{mode:0o600});
  fs.chmodSync(temporary,0o600);fs.renameSync(temporary,file);return config;
 },remove(){if(fs.existsSync(file))fs.unlinkSync(file);}};
}
const directory=process.env.DATA_DIR||path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../runtime');
export const clusterStore=createClusterStore(path.join(directory,'proxmox-connection.json'));
export function clusterConfig(){return clusterStore.read()||{name:'Environment cluster',url:process.env.PROXMOX_URL?.replace(/\/$/,''),tokenId:process.env.PROXMOX_TOKEN_ID,tokenSecret:process.env.PROXMOX_TOKEN_SECRET,verifyTls:process.env.PROXMOX_VERIFY_TLS!=='false'};}
export function publicCluster(config){if(!config?.url)return null;const url=new URL(config.url);return {name:config.name,host:url.hostname,port:Number(url.port||443),tokenId:config.tokenId,verifyTls:config.verifyTls,hasCa:!!config.ca,source:clusterStore.read()?'saved':'environment'};}
