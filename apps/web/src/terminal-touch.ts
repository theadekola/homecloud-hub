import type {Terminal} from '@xterm/xterm';

// Use xterm's buffer coordinates and selection API so Copy reads the highlight.
export function attachTerminalTouchSelection(element:HTMLElement,terminal:Terminal,onSelected:()=>void=()=>{}){
 let timer:ReturnType<typeof setTimeout>|undefined;
 let start:{x:number;y:number;id:number}|undefined,anchor:{column:number;row:number}|undefined;
 let selecting=false;
 const clear=()=>{clearTimeout(timer);timer=undefined;};
 const cellAt=(x:number,y:number)=>{
  const screen=element.querySelector('.xterm-screen');if(!screen)return;
  const rect=screen.getBoundingClientRect();if(!rect.width||!rect.height)return;
  return {column:Math.max(0,Math.min(terminal.cols-1,Math.floor((x-rect.left)*terminal.cols/rect.width))),row:terminal.buffer.active.viewportY+Math.max(0,Math.min(terminal.rows-1,Math.floor((y-rect.top)*terminal.rows/rect.height)))};
 };
 const begin=(event:TouchEvent)=>{
  clear();start=undefined;anchor=undefined;selecting=false;
  if(event.touches.length!==1)return;
  const touch=event.touches[0];start={x:touch.clientX,y:touch.clientY,id:touch.identifier};
  timer=setTimeout(()=>{
   if(!start)return;
   const cell=cellAt(start.x,start.y);if(!cell)return;
   const line=terminal.buffer.active.getLine(cell.row);if(!line)return;
   // Wide characters occupy a leading cell plus an empty continuation cell.
   let left=cell.column,right=cell.column;
   if(line.getCell(left)?.getWidth()===0&&left>0)left--;
   const text=(column:number)=>line.getCell(column)?.getChars()||' ';
   if(text(left).trim()){
    while(left>0&&(line.getCell(left-1)?.getWidth()===0||text(left-1).trim()))left--;
    while(right+1<terminal.cols&&(line.getCell(right+1)?.getWidth()===0||text(right+1).trim()))right++;
   }
   anchor={column:left,row:cell.row};selecting=true;terminal.blur();
   terminal.select(left,cell.row,right-left+1);onSelected();
  },3000);
 };
 const move=(event:TouchEvent)=>{
  if(!start)return;
  if(event.touches.length!==1){clear();start=undefined;selecting=false;return;}
  const touch=Array.from(event.touches).find(t=>t.identifier===start!.id);if(!touch)return;
  if(!selecting){if(Math.hypot(touch.clientX-start.x,touch.clientY-start.y)>10){clear();start=undefined;}return;}
  event.preventDefault();event.stopImmediatePropagation();
  const cell=cellAt(touch.clientX,touch.clientY);if(!cell||!anchor)return;
  const a=anchor.row*terminal.cols+anchor.column,b=cell.row*terminal.cols+cell.column;
  const first=Math.min(a,b);terminal.select(first%terminal.cols,Math.floor(first/terminal.cols),Math.abs(b-a)+1);
 };
 const end=(event:TouchEvent)=>{clear();if(selecting){event.preventDefault();event.stopImmediatePropagation();}start=undefined;selecting=false;};
 const cancel=()=>{clear();start=undefined;selecting=false;};
 const menu=(event:Event)=>{if(start||selecting)event.preventDefault();};
 element.addEventListener('touchstart',begin,{capture:true,passive:true});
 element.addEventListener('touchmove',move,{capture:true,passive:false});
 element.addEventListener('touchend',end,{capture:true,passive:false});
 element.addEventListener('touchcancel',cancel,true);
 element.addEventListener('contextmenu',menu);
 element.addEventListener('scroll',cancel,true);
 document.addEventListener('visibilitychange',cancel);
 return ()=>{cancel();element.removeEventListener('touchstart',begin,true);element.removeEventListener('touchmove',move,true);element.removeEventListener('touchend',end,true);element.removeEventListener('touchcancel',cancel,true);element.removeEventListener('contextmenu',menu);element.removeEventListener('scroll',cancel,true);document.removeEventListener('visibilitychange',cancel);};
}
