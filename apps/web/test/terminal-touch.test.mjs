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
 const terminal={cols:20,rows:5,buffer:{active:{viewportY:10,length:15,getLine:()=>({getCell:c=>({getChars:()=>line[c]||' ',getWidth:()=>1})})}},scrollLines(){},options:{disableStdin:false},paste(text){calls.push(['paste',text])},focus(){},getSelection(){return 'hello'},selectAll(){},clearSelection(){},blur(){},select(...args){calls.push(args)}};
 const release=attachTerminalTouchSelection(element,terminal);
 const touch=(type,x=70,y=10,count=1,target=element)=>{const event=new dom.window.Event(type,{bubbles:true,cancelable:true});Object.defineProperty(event,'touches',{value:Array.from({length:count},(_,identifier)=>({identifier,clientX:x,clientY:y}))});target.dispatchEvent(event);return event;};
 return {touch,calls,element,release,dom,terminal,close(){release();dom.window.close();if(previous===undefined)delete globalThis.document;else globalThis.document=previous}};
}
test('half-second hold highlights the touched word at the scrolled buffer row and drag expands it',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=fixture();
 try{
  f.touch('touchstart');t.mock.timers.tick(499);assert.deepEqual(f.calls,[]);
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

test('selection handles persist after release and adjust either boundary across lines',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=fixture();
 try{
  f.touch('touchstart');t.mock.timers.tick(500);f.touch('touchend');
  assert.equal(f.element.querySelector('.terminal-selection').hidden,false);
  const start=f.element.querySelector('[data-selection-handle=start]');
  f.touch('touchstart',50,-5,1,start);f.touch('touchmove',20,-5,1,start);f.touch('touchend',20,-5,1,start);
  assert.deepEqual(f.calls.at(-1),[2,10,8]);
  const end=f.element.querySelector('[data-selection-handle=end]');
  f.touch('touchstart',100,20,1,end);f.touch('touchmove',150,60,1,end);f.touch('touchend',150,60,1,end);
  assert.deepEqual(f.calls.at(-1),[2,10,53]);
  assert.equal(f.element.querySelector('.terminal-selection').hidden,false);
  const buttons=[...f.element.querySelectorAll('.terminal-selection-menu button')];
  buttons.find(b=>b.textContent==='Select All').click();
  buttons.find(b=>b.textContent==='Done').click();
  assert.equal(f.element.querySelector('.terminal-selection').hidden,true);
 }finally{f.close()}
});
test('floating Copy uses the selected text and keeps adjustment handles available',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=fixture();
 const previous=Object.getOwnPropertyDescriptor(globalThis,'navigator');const copied=[];
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:async text=>copied.push(text)}}});
 try{
  f.touch('touchstart');t.mock.timers.tick(500);f.touch('touchend');
  f.element.querySelector('.terminal-selection-menu button').click();
  await Promise.resolve();await Promise.resolve();await Promise.resolve();
  assert.deepEqual(copied,['hello']);
  assert.equal(f.element.querySelector('.terminal-selection-menu button').textContent,'Copied');
  assert.equal(f.element.querySelector('.terminal-selection').hidden,false);
 }finally{f.close();if(previous)Object.defineProperty(globalThis,'navigator',previous);else delete globalThis.navigator;}
});

test('blank-space hold offers Paste and Select without copying an empty selection',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=fixture();
 try{f.touch('touchstart',190,10);t.mock.timers.tick(499);assert.equal(f.element.querySelector('.terminal-selection').hidden,true);t.mock.timers.tick(1);f.touch('touchend');assert.deepEqual(f.calls,[]);const buttons=[...f.element.querySelectorAll('.terminal-selection-menu>button')];assert.deepEqual(buttons.map(b=>b.textContent),['Copy','Paste','Select','Select All','Done']);assert.equal(buttons[0].disabled,true);assert.equal(f.element.querySelector('[data-selection-handle=start]').hidden,true);buttons.find(b=>b.textContent==='Select').click();assert.equal(buttons[0].disabled,false);assert.equal(f.element.querySelector('[data-selection-handle=start]').hidden,false);}finally{f.close()}
});
test('floating Paste requests clipboard only on tap and sends exact text without adding Enter',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=fixture(),previous=Object.getOwnPropertyDescriptor(globalThis,'navigator');let reads=0;
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{readText:async()=>{reads++;return 'printf "hello"'}}}});
 try{f.touch('touchstart');t.mock.timers.tick(500);f.touch('touchend');assert.equal(reads,0);const paste=[...f.element.querySelectorAll('.terminal-selection-menu button')].find(b=>b.textContent==='Paste');paste.click();paste.click();await Promise.resolve();await Promise.resolve();await Promise.resolve();assert.equal(reads,1);assert.deepEqual(f.calls.at(-1),['paste','printf "hello"']);assert.equal(f.element.querySelector('.terminal-selection').hidden,true);}finally{f.close();if(previous)Object.defineProperty(globalThis,'navigator',previous);else delete globalThis.navigator}
});
test('denied clipboard permission offers native keyboard paste and inserts only on submit',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=fixture(),previous=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{readText:async()=>{throw Error('Permission denied')}}}});
 try{f.touch('touchstart',190,10);t.mock.timers.tick(500);f.touch('touchend');[...f.element.querySelectorAll('.terminal-selection-menu button')].find(b=>b.textContent==='Paste').click();await Promise.resolve();await Promise.resolve();await Promise.resolve();const field=f.element.querySelector('textarea');assert.ok(field);const event=new f.dom.window.Event('contextmenu',{bubbles:true,cancelable:true});field.dispatchEvent(event);assert.equal(event.defaultPrevented,false);field.value='echo sample';assert.deepEqual(f.calls,[]);field.closest('form').dispatchEvent(new f.dom.window.Event('submit',{bubbles:true,cancelable:true}));assert.deepEqual(f.calls,[['paste','echo sample']]);}finally{f.close();if(previous)Object.defineProperty(globalThis,'navigator',previous);else delete globalThis.navigator}
});
test('clipboard result cannot paste after terminal cleanup',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=fixture(),previous=Object.getOwnPropertyDescriptor(globalThis,'navigator');let resolve;
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{readText:()=>new Promise(r=>resolve=r)}}});
 try{f.touch('touchstart');t.mock.timers.tick(500);f.touch('touchend');[...f.element.querySelectorAll('.terminal-selection-menu button')].find(b=>b.textContent==='Paste').click();f.release();resolve('must not send');await Promise.resolve();await Promise.resolve();assert.ok(!f.calls.some(c=>c[0]==='paste'));}finally{f.close();if(previous)Object.defineProperty(globalThis,'navigator',previous);else delete globalThis.navigator}
});

test('closed terminals keep text selection but disable floating Paste',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=fixture();try{f.terminal.options.disableStdin=true;f.touch('touchstart');t.mock.timers.tick(500);f.touch('touchend');const paste=[...f.element.querySelectorAll('.terminal-selection-menu button')].find(b=>b.textContent==='Paste');assert.equal(paste.disabled,true);paste.click();assert.ok(!f.calls.some(c=>c[0]==='paste'));}finally{f.close()}
});

test('blocked Copy offers selected text in a readonly native-copy field without shell input',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=fixture(),previous=Object.getOwnPropertyDescriptor(globalThis,'navigator');Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:async()=>{throw Error('Blocked')}}}});
 try{f.touch('touchstart');t.mock.timers.tick(500);f.touch('touchend');f.element.querySelector('.terminal-selection-menu button').click();await Promise.resolve();await Promise.resolve();await Promise.resolve();const field=f.element.querySelector('textarea');assert.ok(field);assert.equal(field.value,'hello');assert.equal(field.readOnly,true);assert.ok(!f.calls.some(c=>c[0]==='paste'));const event=new f.dom.window.Event('contextmenu',{bubbles:true,cancelable:true});field.dispatchEvent(event);assert.equal(event.defaultPrevented,false);}finally{f.close();if(previous)Object.defineProperty(globalThis,'navigator',previous);else delete globalThis.navigator}
});
