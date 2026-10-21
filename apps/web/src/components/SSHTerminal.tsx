import {attachTerminalTouchSelection} from '../terminal-touch';
import {readShellOutput,shellInputQueue} from '../shell-stream';
import {useShellPresence,useSSHSession} from '../ssh-session';
import {fullscreenTerminal,copyTerminalSelection} from '../ssh-transfer';
import {useEffect,useRef,useState} from 'react';
import {Terminal} from '@xterm/xterm';
import {FitAddon} from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import {api} from '../api';
import {Modal,ConnectionSuccess} from './UI';
import {Eye,EyeOff,Maximize,Copy,ClipboardPaste,TextSelect,Terminal as TerminalIcon} from 'lucide-react';
import {SSHLogin} from './SSHAccess';
export default function SSHTerminal({target,host,sessionId,onDisconnect,active=true,name}:{target:string;host?:string;sessionId?:string;active?:boolean;name?:string;onDisconnect?:()=>void}){
 const [id,setId]=useState(sessionId||''),[error,setError]=useState(''),ref=useRef<HTMLDivElement>(null),terminalRef=useRef<Terminal|null>(null),fitRef=useRef<FitAddon|null>(null),shellRef=useRef<HTMLDivElement>(null);
 const [clipboard,setClipboard]=useState<null|'actions'|'copy'|'paste'>(null),[clipboardText,setClipboardText]=useState(''),[clipboardBusy,setClipboardBusy]=useState(false),[notice,setNotice]=useState(''),[canPaste,setCanPaste]=useState(false);
 const clipboardField=useRef<HTMLTextAreaElement>(null),activeRef=useRef(active),clipboardGeneration=useRef(0),clipboardActions=useRef({copy:()=>{},paste:()=>{}});activeRef.current=active;
 const current=(terminal:Terminal,generation:number)=>activeRef.current&&terminalRef.current===terminal&&clipboardGeneration.current===generation;
 const copy=async()=>{const terminal=terminalRef.current;if(!terminal||!activeRef.current||clipboardBusy)return;const text=terminal.getSelection();if(!text){setNotice('Select terminal text first, or use Select All.');return;}const generation=clipboardGeneration.current;setClipboardBusy(true);setNotice('');try{await copyTerminalSelection(text);if(current(terminal,generation)){setClipboard(null);setNotice('Terminal text copied.')}}catch{if(current(terminal,generation)){setClipboardText(text);setClipboard('copy')}}finally{setClipboardBusy(false)}};
 const paste=async()=>{const terminal=terminalRef.current;if(!terminal||!activeRef.current||terminal.options.disableStdin||clipboardBusy)return;const generation=clipboardGeneration.current;setClipboardBusy(true);setNotice('');try{if(!navigator.clipboard?.readText)throw Error('Clipboard unavailable');const text=await navigator.clipboard.readText();if(current(terminal,generation)&&!terminal.options.disableStdin){terminal.paste(text);setClipboard(null);terminal.focus();}}catch{if(current(terminal,generation)&&!terminal.options.disableStdin){setClipboardText('');setClipboard('paste')}}finally{setClipboardBusy(false)}};
 const selectAll=()=>{terminalRef.current?.selectAll();};
 clipboardActions.current={copy:()=>{void copy()},paste:()=>{void paste()}};
 useEffect(()=>{clipboardGeneration.current++;setClipboard(null);setClipboardText('');setNotice('');},[active,id]);
 useEffect(()=>{if(clipboard==='copy'){clipboardField.current?.focus();clipboardField.current?.select()}else if(clipboard==='paste')clipboardField.current?.focus()},[clipboard]);
 useSSHSession(id);
 useShellPresence(id);
 useEffect(()=>{
  if(!id||!ref.current)return;
  const terminal=new Terminal({fontSize:13,theme:{background:'#07111d'},cursorBlink:true}),fit=new FitAddon(),controller=new AbortController();
  terminalRef.current=terminal;setCanPaste(true);fitRef.current=fit;terminal.loadAddon(fit);terminal.open(ref.current);fit.fit();
  terminal.attachCustomKeyEventHandler?.(event=>{
   if(event.type!=='keydown'||!activeRef.current||event.altKey)return true;
   const key=event.key.toLowerCase(),shortcut=event.ctrlKey&&event.shiftKey||event.metaKey&&!event.ctrlKey;
   if(shortcut&&(key==='v'||key==='c'&&!!terminal.getSelection())){event.preventDefault();key==='c'?clipboardActions.current.copy():clipboardActions.current.paste();return false}return true;
  });
  const releaseTouchSelection=attachTerminalTouchSelection(ref.current,terminal);
  let resizeFrame=0;
  let stopped=false,closed=false,inputFailed=false,timer:ReturnType<typeof setTimeout>|undefined,failures=0,lastSize='';
  const queue=shellInputQueue(chunk=>api(`/ssh/session/${id}`,{method:'POST',body:JSON.stringify({input:chunk}),signal:controller.signal}),error=>{if(stopped)return;inputFailed=true;setCanPaste(false);terminal.options.disableStdin=true;setError(`${error.message}. Reconnect before typing again; input was not retried.`)});
  const resize=()=>{if(!ref.current?.offsetWidth||!ref.current?.offsetHeight||stopped)return;const dimensions=fit.proposeDimensions();if(!dimensions||dimensions.cols<2||dimensions.rows<1)return;if(terminal.cols!==dimensions.cols||terminal.rows!==dimensions.rows)terminal.resize(dimensions.cols,dimensions.rows);const size=`${terminal.cols}:${terminal.rows}`;if(size===lastSize)return;lastSize=size;api(`/ssh/session/${id}`,{method:'POST',body:JSON.stringify({cols:terminal.cols,rows:terminal.rows}),signal:controller.signal}).catch(()=>{});};
  const observer=new ResizeObserver(()=>{if(resizeFrame)cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(resize)});observer.observe(ref.current);
  const input=terminal.onData(text=>queue.push(text));
  const stream=async()=>{
   try{
    const response=await api<Response>(`/ssh/session/${id}/output`,{signal:controller.signal},undefined,true);
    if(stopped)return;
    failures=0;if(!inputFailed)setError('');
    await readShellOutput(response,frame=>{if(stopped)return;terminal.write(frame.output);if(frame.closed){closed=true;setCanPaste(false);queue.stop();terminal.options.disableStdin=true;terminal.write('\r\n[SSH session closed]');}});
   }catch(error:any){if(stopped)return;setError(error.message);if([401,403,404].includes(error.status)){queue.stop();setCanPaste(false);terminal.options.disableStdin=true;return;}failures++;}
   if(!stopped&&!closed)timer=setTimeout(stream,failures?Math.min(30000,1000*2**Math.min(failures,5)):0);
  };
  void stream();resize();
  return()=>{stopped=true;releaseTouchSelection();queue.stop();controller.abort();clearTimeout(timer);observer.disconnect();if(resizeFrame)cancelAnimationFrame(resizeFrame);input.dispose();terminal.dispose();terminalRef.current=null;fitRef.current=null;};
 },[id]);
 useEffect(()=>{if(active&&id){requestAnimationFrame(()=>{fitRef.current?.fit();terminalRef.current?.focus()})}},[active,id]);
 return <div ref={shellRef} className="ssh-shell">{!id?<SSHLogin target={target} host={host} onConnected={r=>setId(r.id)}/>:<><div className="shell-session-toolbar"><div className="shell-session-heading"><TerminalIcon size={21}/><span><b>{name||target}</b><small>{target} · SSH</small></span></div><div className="header-actions"><button type="button" className="btn secondary shell-clipboard-button" disabled={!active||clipboardBusy} onMouseDown={e=>e.preventDefault()} onClick={copy} title="Copy selected text (Ctrl+Shift+C or Cmd+C)"><Copy size={16}/>Copy</button><button type="button" className="btn secondary shell-clipboard-button" disabled={!active||!canPaste||clipboardBusy} onClick={paste} title="Paste text (Ctrl+Shift+V or Cmd+V)"><ClipboardPaste size={16}/>Paste</button><button type="button" className="btn secondary shell-clipboard-button" disabled={!active||clipboardBusy} onMouseDown={e=>e.preventDefault()} onClick={selectAll}><TextSelect size={16}/>Select All</button><button className="icon-btn" aria-label="Fullscreen terminal" onClick={async()=>{try{await fullscreenTerminal(shellRef.current)}catch(e:any){setError(e.message||'Fullscreen unavailable')}}}><Maximize size={16}/></button><button className="btn secondary" onClick={()=>{setId('');onDisconnect?.()}}>Disconnect</button></div></div><div ref={ref} className="ssh-terminal" onContextMenu={event=>{if(event.defaultPrevented||!active||(event.target as HTMLElement).closest('.terminal-selection'))return;event.preventDefault();setClipboard('actions')}}/><small className="shell-clipboard-help">Select text with your mouse, or hold on mobile. Copy: Ctrl+Shift+C / Cmd+C. Paste: Ctrl+Shift+V / Cmd+V.</small></>}{notice&&<p role="status" className="shell-clipboard-notice">{notice}</p>}{error&&<p className="error">{error}</p>}<Modal open={!!clipboard&&active} title={clipboard==='copy'?'Copy Terminal Text':clipboard==='paste'?'Paste into Terminal':'Terminal Text Actions'} onClose={()=>{setClipboard(null);setClipboardText('')}}>{clipboard==='actions'?<div className="configuration-actions"><button type="button" className="btn secondary" disabled={clipboardBusy} onClick={copy}>Copy</button><button type="button" className="btn secondary" disabled={!canPaste||clipboardBusy} onClick={paste}>Paste</button><button type="button" className="btn secondary" onClick={()=>{selectAll();setClipboard(null)}}>Select All</button><p>Select terminal text first to copy a portion of the output.</p></div>:<form className="shell-clipboard-form" onSubmit={event=>{event.preventDefault();const terminal=terminalRef.current;if(clipboard!=='paste'||!active||!terminal||terminal.options.disableStdin)return;terminal.paste(clipboardText);setClipboardText('');setClipboard(null);terminal.focus()}}><p>{clipboard==='copy'?'Clipboard access is blocked. Copy the selected text below with your keyboard or mobile text menu.':'Clipboard access is blocked. Paste your text below, then choose Insert into Terminal.'}</p><label>{clipboard==='copy'?'Selected terminal text':'Text to paste'}<textarea ref={clipboardField} aria-label={clipboard==='copy'?'Selected terminal text':'Text to paste'} value={clipboardText} readOnly={clipboard==='copy'} onChange={event=>setClipboardText(event.target.value)} rows={8} spellCheck={false}/></label>{clipboard==='paste'&&<button className="btn primary" disabled={!clipboardText||!canPaste}>Insert into Terminal</button>}</form>}</Modal></div>;
}
