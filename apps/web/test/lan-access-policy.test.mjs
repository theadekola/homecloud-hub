import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
test('LAN editor requires fresh consent, preserves loaded grants and disables with an empty policy',async()=>{
 const directory=fs.mkdtempSync(fileURLToPath(new URL('../node_modules/lan-ui-',import.meta.url)));
 const result=await build({entryPoints:[fileURLToPath(new URL('../src/components/LanAccessPolicy.tsx',import.meta.url))],bundle:true,format:'esm',platform:'node',packages:'external',jsx:'automatic',write:false});
 const output=path.join(directory,'policy.mjs');fs.writeFileSync(output,result.outputFiles[0].text);
 const {default:Component}=await import(pathToFileURL(output));const dom=new JSDOM('<div id="root"></div>');
 const prior={window:globalThis.window,document:globalThis.document,IS_REACT_ACT_ENVIRONMENT:globalThis.IS_REACT_ACT_ENVIRONMENT};globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const container=document.getElementById('root'),root=createRoot(container),calls=[];
 const rule={publicKey:'A'.repeat(43)+'=',destination:'192.168.20.10/32',protocol:'tcp',port:8006,interface:'vmbr0',nat:false};
 const props={vpn:{peers:[{publicKey:rule.publicKey,address:'10.77.0.2/32'}],lan:{rules:[rule],clientNetworks:['192.168.1.0/24']}},disabled:false,apply:async body=>calls.push(body)};
 const click=async el=>act(async()=>el.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true})));
 const button=text=>[...container.querySelectorAll('button')].find(b=>b.textContent===text);
 try{
  await act(async()=>root.render(React.createElement(Component,props)));
  assert.equal(button('Apply LAN Service Policy').disabled,true);
  await click(button('Apply LAN Service Policy'));assert.equal(calls.length,0);
  await click(container.querySelector('input[type=checkbox]'));
  await click(button('Apply LAN Service Policy'));assert.deepEqual(calls[0],{authorized:true,rules:[rule],clientNetworks:['192.168.1.0/24']});
  await click(button('Add Service Grant'));assert.equal(button('Apply LAN Service Policy').disabled,true);
  await click(container.querySelector('input[type=checkbox]'));await click(button('Disable LAN Access'));assert.deepEqual(calls.at(-1),{authorized:true,rules:[],clientNetworks:[]});
  await act(async()=>root.render(React.createElement(Component,{...props,disabled:true})));
  assert.equal(button('Apply LAN Service Policy').disabled,true);assert.equal(button('Disable LAN Access').disabled,true);
 }finally{await act(async()=>root.unmount());dom.window.close();Object.assign(globalThis,prior);fs.rmSync(directory,{recursive:true,force:true})}
});
