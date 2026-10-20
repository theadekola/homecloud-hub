import {writeDurableJson,readDurableJson} from './durable-json.js';
import {upgradeBrandSettings} from './product-brand.js';
import {retireProviders} from './retired-providers.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const directory=process.env.DATA_DIR||path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../runtime');
fs.mkdirSync(directory,{recursive:true});
const file=path.join(directory,'live-state.json');
const defaults={schema:3,settings:{siteName:'i-Clusters',description:'Your infrastructure, connected.',refresh:30},rules:[],alerts:[],metrics:[]};
let state=structuredClone(defaults);
if(fs.existsSync(file)){
  const saved=readDurableJson(file);
  if(saved.schema===3)state={...state,...saved};
}
const prior=JSON.stringify(state);upgradeBrandSettings(state.settings);retireProviders(state);if(JSON.stringify(state)!==prior)save();
export function get(){return state;}
export function save(){writeDurableJson(file,state);}
export function mutate(fn){const previous=state;state=structuredClone(state);try{fn(state);save();return state;}catch(error){state=previous;throw error;}}
