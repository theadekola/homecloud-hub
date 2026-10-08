import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createClusterStore} from './cluster-config.js';
export function validateDocker(input){
 const fail=m=>{throw Object.assign(new Error(m),{status:400})};
 let url;try{url=new URL(input.url)}catch{fail('Enter the Docker HTTPS endpoint.');}
 if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)fail('Use https://hostname:2376 without credentials or a path.');
 const ca=String(input.ca||'').trim(),cert=String(input.cert||'').trim(),key=String(input.key||'').trim();
 for(const [name,value] of [['CA',ca],['Client certificate',cert]])if(value&&(value.length>65536||!value.includes('-----BEGIN CERTIFICATE-----')||value.includes('PRIVATE KEY')))fail(name+' must be a PEM certificate.');
 if(!cert||!key||key.length>65536||!key.includes('PRIVATE KEY-----'))fail('A PEM client certificate and private key are required.');
 return {url:url.origin,ca,cert,key};
}
const directory=process.env.DATA_DIR||path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../runtime');
export const dockerStore=createClusterStore(path.join(directory,'docker-connection.json'),()=>process.env.JWT_SECRET,validateDocker);
export function dockerConfig(){return dockerStore.read()||{url:process.env.DOCKER_API_URL?.replace(/\/$/,''),environment:true};}
export function publicDocker(){const c=dockerConfig();return c.url?{url:c.url,hasCa:!!c.ca,hasClientCertificate:!!c.cert,source:c.environment?'environment':'saved'}:null;}
export function dockerTlsConfig(c){if(!c.environment)return {ca:c.ca||undefined,cert:c.cert,key:c.key,rejectUnauthorized:true};const read=n=>process.env[n]?fs.readFileSync(process.env[n]):undefined;if(Boolean(process.env.DOCKER_TLS_CERT)!==Boolean(process.env.DOCKER_TLS_KEY))throw new Error('Docker TLS certificate and key must be configured together');return {ca:read('DOCKER_TLS_CA'),cert:read('DOCKER_TLS_CERT'),key:read('DOCKER_TLS_KEY')};}
