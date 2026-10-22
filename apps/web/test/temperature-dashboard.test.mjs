import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router-dom';
import {build} from 'esbuild';
const directory=fs.mkdtempSync(fileURLToPath(new URL('../node_modules/thermal-ui-',import.meta.url)));
const built=await build({entryPoints:[fileURLToPath(new URL('../src/components/TemperatureSummary.tsx',import.meta.url))],bundle:true,format:'esm',platform:'node',packages:'external',jsx:'automatic',loader:{'.css':'empty'},write:false,plugins:[{name:'fixture',setup(b){b.onResolve({filter:/\/hooks$/},()=>({path:'hooks',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const useApi=()=>globalThis.__temperatureFixture;'}));}}]});
const output=path.join(directory,'component.mjs');fs.writeFileSync(output,built.outputFiles[0].text);const {default:Temperature}=await import(pathToFileURL(output));
const render=fixture=>{globalThis.__temperatureFixture=fixture;return renderToStaticMarkup(React.createElement(MemoryRouter,null,React.createElement(Temperature)))};
try{
 test('temperature gauges retain high readings, use Celsius scales and include disk measurements',()=>{
  const html=render({data:{nodes:[{id:'one',name:'node01',status:'current',report:{temperatures:[{name:'Dell sensor',celsius:126},{name:'CPU',celsius:47}],disks:[{name:'sda',celsius:0}]}}]}});
  assert.match(html,/126 °C maximum/);assert.match(html,/Scale 0 to 140 °C/);assert.match(html,/80 °C warning marker/);assert.match(html,/High reading/);assert.match(html,/0 °C/);assert.match(html,/sda/);assert.doesNotMatch(html,/>[^<]*%/);
 });
 test('stale reports cannot display previous temperatures as live measurements',()=>{
  const html=render({data:{nodes:[{id:'one',name:'node01',status:'stale',report:{temperatures:[{name:'CPU',celsius:126}]}}]}});
  assert.match(html,/current temperature unavailable/);assert.match(html,/stale/);assert.doesNotMatch(html,/126/);assert.doesNotMatch(html,/High reading/);
 });
 test('missing and failed measurements show availability instead of a zero temperature',()=>{
  const empty=render({data:{nodes:[{id:'one',name:'node01',status:'current',report:{temperatures:[{name:'CPU',celsius:null}]}}]}});
  assert.match(empty,/Unavailable/);assert.match(empty,/No supported temperature measurements/);assert.doesNotMatch(empty,/0 °C maximum/);
  const failed=render({error:'Connection unavailable'});assert.match(failed,/role="alert"/);assert.match(failed,/Temperature measurements unavailable/);
 });
 test('CPU maximum stays distinct from an unlabelled 126 degree Dell reading and explicit faults',()=>{
  const html=render({data:{nodes:[{id:'one',name:'node01',status:'current',report:{temperatures:[{name:'dell_smm / temp8_input',driver:'dell_smm',celsius:126,rawMilliCelsius:126000,source:'/sys/class/hwmon/hwmon1/temp8_input'},{name:'coretemp / Package id 0',driver:'coretemp',celsius:62},{name:'Faulty',celsius:180,fault:true}]}}]}});
  assert.match(html,/126 °C maximum/);assert.match(html,/CPU package\/core maximum: 62 °C/);assert.match(html,/126000 millidegrees Celsius/);assert.match(html,/Unlabelled sensor/);assert.match(html,/Fault reported; excluded/);assert.doesNotMatch(html,/180 °C maximum/);
 });
}finally{delete globalThis.__temperatureFixture;fs.rmSync(directory,{recursive:true,force:true})}
