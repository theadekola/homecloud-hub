import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
const result=await build({entryPoints:[new URL('../src/terminal-touch.ts',import.meta.url).pathname],bundle:true,format:'esm',platform:'node',write:false});
const {attachTerminalTouchSelection}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
function fixture(){
 const dom=new JSDOM('<div id="terminal"><div class="xterm-screen"></div></div>');
 const previous=globalThis.document;globalThis.document=dom.window.document;
 const element=document.getElementById('terminal');element.firstChild.getBoundingClientRect=()=>({left:0,top:0,width:200,height:100});
 const calls=[],line='root hello world    ';
 const terminal={cols:20,rows:5,buffer:{active:{viewportY:10,getLine:()=>({getCell:c=>({getChars:()=>line[c]||' ',getWidth:()=>1})})}},blur(){},select(...args){calls.push(args)}};
 const release=attachTerminalTouchSelection(element,terminal);
 const touch=(type,x=70,y=10,count=1)=>{const event=new dom.window.Event(type,{bubbles:true,cancelable:true});Object.defineProperty(event,'touches',{value:Array.from({length:count},(_,identifier)=>({identifier,clientX:x,clientY:y}))});element.dispatchEvent(event);return event;};
 return {touch,calls,element,release,close(){release();dom.window.close();if(previous===undefined)delete globalThis.document;else globalThis.document=previous}};
}
test('three second hold highlights the touched word at the scrolled buffer row and drag expands it',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=fixture();
 try{
  f.touch('touchstart');t.mock.timers.tick(2999);assert.deepEqual(f.calls,[]);
  t.mock.timers.tick(1);assert.deepEqual(f.calls,[[5,10,5]]);
  assert.equal(f.touch('touchmove',140,30).defaultPrevented,true);
  assert.deepEqual(f.calls.at(-1),[5,10,30]);
  assert.equal(f.touch('touchend').defaultPrevented,true);
 }finally{f.close()}
});
test('normal taps scrolling multitouch and cancelled holds do not select',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=fixture();
 try{
  f.touch('touchstart');assert.equal(f.touch('touchend').defaultPrevented,false);t.mock.timers.tick(3000);
  f.touch('touchstart');assert.equal(f.touch('touchmove',100,10).defaultPrevented,false);t.mock.timers.tick(3000);
  f.touch('touchstart',70,10,2);t.mock.timers.tick(3000);
  f.touch('touchstart');f.touch('touchcancel');t.mock.timers.tick(3000);
  f.touch('touchstart');f.element.dispatchEvent(new f.element.ownerDocument.defaultView.Event('scroll'));t.mock.timers.tick(3000);
  assert.deepEqual(f.calls,[]);
 }finally{f.close()}
});
test('unmount cancels pending selection',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=fixture();
 try{f.touch('touchstart');f.release();t.mock.timers.tick(3000);assert.deepEqual(f.calls,[])}finally{f.close()}
});
