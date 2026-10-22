import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router-dom';
import {build} from 'esbuild';
const directory=fs.mkdtempSync(fileURLToPath(new URL('../node_modules/provider-jobs-',import.meta.url)));
const built=await build({entryPoints:[fileURLToPath(new URL('../src/components/ProviderJobs.tsx',import.meta.url))],bundle:true,format:'esm',platform:'node',packages:'external',jsx:'automatic',loader:{'.css':'empty'},write:false,plugins:[{name:'fixture',setup(b){b.onResolve({filter:/\/hooks$/},()=>({path:'hooks',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const useApi=()=>globalThis.__jobsFixture;'}));}}]});
const output=path.join(directory,'component.mjs');fs.writeFileSync(output,built.outputFiles[0].text);const {default:ProviderJobs}=await import(pathToFileURL(output));
const render=fixture=>{globalThis.__jobsFixture=fixture;return renderToStaticMarkup(React.createElement(MemoryRouter,null,React.createElement(ProviderJobs)))};
try{
 test('pending and failed provider reports cannot present unknown task counts as zero',()=>{
  const pending=render({loading:true});assert.doesNotMatch(pending,/0 tasks reported|No TrueNAS jobs reported/);
  const failed=render({error:'Connection unavailable'});assert.match(failed,/Provider report unavailable/);assert.doesNotMatch(failed,/0 tasks reported|No TrueNAS jobs reported/);
 });
 test('provider completeness distinguishes failed, unconfigured and successfully empty inventories',()=>{
  const partial=render({data:{proxmox:[],truenas:[],providerInventory:{proxmox:{configured:true,complete:false},truenas:{configured:false,complete:false}}}});assert.match(partial,/Provider report unavailable/);assert.match(partial,/Provider not configured/);assert.doesNotMatch(partial,/0 tasks reported|No TrueNAS jobs reported/);
  const empty=render({data:{proxmox:[],truenas:[],providerInventory:{proxmox:{configured:true,complete:true},truenas:{configured:true,complete:true}}}});assert.match(empty,/0 tasks reported/);assert.match(empty,/No TrueNAS jobs reported/);
 });
 test('refresh keeps the last completed task count explicitly identified',()=>{
  const html=render({loading:true,data:{proxmox:[{id:'one'}],truenas:[],providerInventory:{proxmox:{configured:true,complete:true},truenas:{configured:true,complete:true}}}});assert.match(html,/1 tasks reported/);assert.match(html,/showing the previous response/);
 });
}finally{delete globalThis.__jobsFixture;fs.rmSync(directory,{recursive:true,force:true})}
