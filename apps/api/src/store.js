import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const directory=process.env.DATA_DIR||path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../runtime');
fs.mkdirSync(directory,{recursive:true});
const file=path.join(directory,'live-state.json');
const defaults={schema:3,settings:{siteName:'HomeCloud Hub',description:'Homelab management',refresh:30},rules:[],alerts:[],metrics:[]};
let state=structuredClone(defaults);
if(fs.existsSync(file)){
  const saved=JSON.parse(fs.readFileSync(file,'utf8'));
  if(saved.schema===3)state={...state,...saved};
}
export function get(){return state;}
export function save(){const temporary=`${file}.tmp`;fs.writeFileSync(temporary,JSON.stringify(state,null,2));fs.renameSync(temporary,file);}
export function mutate(fn){const previous=state;state=structuredClone(state);try{fn(state);save();return state;}catch(error){state=previous;throw error;}}
