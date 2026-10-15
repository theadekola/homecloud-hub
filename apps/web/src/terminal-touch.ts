import type {Terminal} from '@xterm/xterm';
import {copyTerminalSelection} from './ssh-transfer';

export const TERMINAL_LONG_PRESS_MS=500;
export function attachTerminalTouchSelection(element:HTMLElement,terminal:Terminal){
 let disposed=false,hasRange=false;
 let timer:ReturnType<typeof setTimeout>|undefined;
 let start:{x:number;y:number;id:number}|undefined;
 let selecting=false,first=0,last=0,anchor=0,edge:''|'start'|'end'='',offsetX=0,offsetY=0;
 const overlay=document.createElement('div');overlay.className='terminal-selection';overlay.hidden=true;
 const menu=document.createElement('div');menu.className='terminal-selection-menu';menu.setAttribute('role','toolbar');menu.setAttribute('aria-label','Terminal text actions');
 const button=(label:string,action:()=>void)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',action);menu.append(b);return b;};
 const copy=button('Copy',()=>{const text=terminal.getSelection();void copyTerminalSelection(text).then(()=>{if(!disposed)copy.textContent='Copied';}).catch(()=>{if(!disposed&&!overlay.hidden)manualCopy(text);});});
 const paste=button('Paste',()=>{
  if(terminal.options.disableStdin)return;
  // Clipboard access begins in the button's user gesture, not the hold timer.
  if(!navigator.clipboard?.readText){manualPaste();return;}
  paste.disabled=true;
  void navigator.clipboard.readText().then(text=>{if(disposed||overlay.hidden||terminal.options.disableStdin)return;terminal.paste(text);terminal.clearSelection();hasRange=false;overlay.hidden=true;terminal.focus();}).catch(()=>{if(!disposed&&!overlay.hidden)manualPaste();}).finally(()=>{if(!disposed)paste.disabled=!!terminal.options.disableStdin;});
 });
 button('Select',()=>{select();});
 button('Select All',()=>{terminal.selectAll();hasRange=true;copy.disabled=false;copy.textContent='Copy';first=0;last=terminal.buffer.active.length*terminal.cols-1;position();});
 button('Done',()=>{terminal.clearSelection();overlay.hidden=true;});
 const handle=(name:string)=>{const b=document.createElement('button');b.type='button';b.className=`terminal-selection-handle ${name}`;b.dataset.selectionHandle=name;b.setAttribute('aria-label',`Drag selection ${name}`);overlay.append(b);return b;};
 function manualCopy(text:string){
  copy.textContent='Copy via keyboard';
  const form=document.createElement('form');form.className='terminal-manual-paste';form.setAttribute('aria-label','Copy terminal text');
  const field=document.createElement('textarea');field.readOnly=true;field.value=text;field.setAttribute('aria-label','Selected terminal text to copy');
  const close=document.createElement('button');close.type='button';close.textContent='Close';close.onclick=()=>{form.remove();copy.textContent='Copy';position();};
  menu.querySelector('.terminal-manual-paste')?.remove();form.append(field,close);menu.append(form);field.focus();field.select();position();
 }
 function manualPaste(){
  paste.textContent='Paste via keyboard';
  const form=document.createElement('form');form.className='terminal-manual-paste';form.setAttribute('aria-label','Paste terminal input');
  const field=document.createElement('textarea');field.setAttribute('aria-label','Text to paste into terminal');field.placeholder='Paste text here using your keyboard';
  const insert=document.createElement('button');insert.type='submit';insert.textContent='Insert';const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancel';
  cancel.onclick=()=>{form.remove();paste.textContent='Paste';position();};
  form.onsubmit=event=>{event.preventDefault();if(disposed||terminal.options.disableStdin)return;terminal.paste(field.value);terminal.clearSelection();hasRange=false;form.remove();paste.textContent='Paste';overlay.hidden=true;terminal.focus();};
  menu.querySelector('.terminal-manual-paste')?.remove();form.append(field,insert,cancel);menu.append(form);field.focus();position();
 }
 const leftHandle=handle('start'),rightHandle=handle('end');overlay.append(menu);element.append(overlay);
 const clear=()=>{clearTimeout(timer);timer=undefined;};
 const geometry=()=>{const screen=element.querySelector('.xterm-screen');if(!screen)return;const rect=screen.getBoundingClientRect();if(!rect.width||!rect.height)return;return {rect,width:rect.width/terminal.cols,height:rect.height/terminal.rows};};
 const cellAt=(x:number,y:number)=>{
  const g=geometry();if(!g)return;
  return {column:Math.max(0,Math.min(terminal.cols-1,Math.floor((x-g.rect.left)/g.width))),row:terminal.buffer.active.viewportY+Math.max(0,Math.min(terminal.rows-1,Math.floor((y-g.rect.top)/g.height)))};
 };
 function position(){
  if(overlay.hidden)return;const g=geometry();if(!g)return;
  const bounds=element.getBoundingClientRect(),view=terminal.buffer.active.viewportY;
  const place=(b:HTMLElement,index:number,end:boolean)=>{
   const row=Math.floor(index/terminal.cols)-view,column=index%terminal.cols;
   b.hidden=!hasRange||row<0||row>=terminal.rows;
   b.style.left=`${g.rect.left-bounds.left+(column+(end?1:0))*g.width}px`;
   const y=g.rect.top-bounds.top+(row+(end?1:0))*g.height;
   b.style.top=`${end?Math.min(bounds.height-18,y):Math.max(18,y)}px`;
  };
  place(leftHandle,first,false);place(rightHandle,last,true);
  const row=Math.max(0,Math.min(terminal.rows-1,Math.floor(first/terminal.cols)-view));
  menu.style.top=`${Math.max(4,g.rect.top-bounds.top+row*g.height-(menu.offsetHeight||44)-4)}px`;
 }
 const select=()=>{hasRange=true;copy.disabled=false;terminal.select(first%terminal.cols,Math.floor(first/terminal.cols),last-first+1);overlay.hidden=false;copy.textContent='Copy';position();};
 const begin=(event:TouchEvent)=>{
  clear();start=undefined;edge='';selecting=false;
  const target=event.target as HTMLElement;
  if(target.closest('.terminal-selection-menu'))return;
  if(event.touches.length!==1)return;
  const touch=event.touches[0];start={x:touch.clientX,y:touch.clientY,id:touch.identifier};
  const grabbed=target.closest<HTMLElement>('[data-selection-handle]');
  if(grabbed&&!overlay.hidden){
   edge=grabbed.dataset.selectionHandle as 'start'|'end';selecting=true;
   const g=geometry();if(g){const index=edge==='start'?first:last;offsetX=touch.clientX-(g.rect.left+(index%terminal.cols+.5)*g.width);offsetY=touch.clientY-(g.rect.top+(Math.floor(index/terminal.cols)-terminal.buffer.active.viewportY+.5)*g.height);}
   event.preventDefault();event.stopImmediatePropagation();return;
  }
  overlay.hidden=true;hasRange=false;menu.querySelector('.terminal-manual-paste')?.remove();paste.textContent='Paste';
  timer=setTimeout(()=>{
   if(!start)return;const cell=cellAt(start.x,start.y);if(!cell)return;
   const line=terminal.buffer.active.getLine(cell.row);if(!line)return;
   let left=cell.column,right=cell.column;
   if(line.getCell(left)?.getWidth()===0&&left>0)left--;
   const text=(column:number)=>line.getCell(column)?.getChars()||' ';
   if(text(left).trim()){
    while(left>0&&(line.getCell(left-1)?.getWidth()===0||text(left-1).trim()))left--;
    while(right+1<terminal.cols&&(line.getCell(right+1)?.getWidth()===0||text(right+1).trim()))right++;
   }
   first=cell.row*terminal.cols+left;last=cell.row*terminal.cols+right;anchor=first;
   selecting=true;terminal.blur();paste.disabled=!!terminal.options.disableStdin;
   if(text(left).trim())select();else{terminal.clearSelection();hasRange=false;copy.disabled=true;overlay.hidden=false;position();}
  },TERMINAL_LONG_PRESS_MS);
 };
 const move=(event:TouchEvent)=>{
  if(!start)return;
  if(event.touches.length!==1){cancel();return;}
  const touch=Array.from(event.touches).find(t=>t.identifier===start!.id);if(!touch)return;
  if(!selecting){if(Math.hypot(touch.clientX-start.x,touch.clientY-start.y)>10){clear();start=undefined;}return;}
  event.preventDefault();event.stopImmediatePropagation();
  const g=geometry();if(g&&(touch.clientY<g.rect.top||touch.clientY>g.rect.bottom))terminal.scrollLines(touch.clientY<g.rect.top?-1:1);
  const cell=cellAt(touch.clientX-(edge?offsetX:0),touch.clientY-(edge?offsetY:0));if(!cell)return;
  const index=cell.row*terminal.cols+cell.column;
  if(edge==='start')first=Math.min(index,last);
  else if(edge==='end')last=Math.max(index,first);
  else{first=Math.min(anchor,index);last=Math.max(anchor,index);}
  select();
 };
 const end=(event:TouchEvent)=>{clear();if(selecting){event.preventDefault();event.stopImmediatePropagation();}start=undefined;selecting=false;edge='';};
 function cancel(){clear();start=undefined;selecting=false;edge='';}
 const scroll=()=>{if(!selecting)cancel();position();};
 const menuEvent=(event:Event)=>{if((event.target as HTMLElement).closest('.terminal-manual-paste'))return;if(start||selecting||!overlay.hidden)event.preventDefault();};
 const key=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!overlay.hidden){terminal.clearSelection();hasRange=false;overlay.hidden=true;}};
 const selection=terminal.onSelectionChange?.(()=>{if(!terminal.hasSelection()&&hasRange){hasRange=false;overlay.hidden=true;}});
 const render=terminal.onRender?.(()=>position());
 element.addEventListener('touchstart',begin,{capture:true,passive:false});
 element.addEventListener('touchmove',move,{capture:true,passive:false});
 element.addEventListener('touchend',end,{capture:true,passive:false});
 element.addEventListener('touchcancel',cancel,true);
 element.addEventListener('contextmenu',menuEvent);
 element.addEventListener('scroll',scroll,true);
 document.addEventListener('visibilitychange',cancel);document.addEventListener('keydown',key);
 return ()=>{disposed=true;cancel();selection?.dispose();render?.dispose();overlay.remove();element.removeEventListener('touchstart',begin,true);element.removeEventListener('touchmove',move,true);element.removeEventListener('touchend',end,true);element.removeEventListener('touchcancel',cancel,true);element.removeEventListener('contextmenu',menuEvent);element.removeEventListener('scroll',scroll,true);document.removeEventListener('visibilitychange',cancel);document.removeEventListener('keydown',key);};
}
