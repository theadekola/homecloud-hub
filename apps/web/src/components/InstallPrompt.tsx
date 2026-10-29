import {useEffect,useState} from 'react';
import {Download,Share2,X} from 'lucide-react';
import './install-prompt.css';
type InstallEvent=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>};
export default function InstallPrompt(){
 const [prompt,setPrompt]=useState<InstallEvent|null>(null),[installed,setInstalled]=useState(false),[dismissed,setDismissed]=useState(false),[error,setError]=useState('');
 const ios=/iPhone|iPad|iPod/.test(navigator.userAgent)||navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1;
 const mobile=ios||/Android/.test(navigator.userAgent),requested=new URLSearchParams(window.location.search).get('install')==='1';
 const standalone=window.matchMedia('(display-mode: standalone)').matches||(navigator as any).standalone===true;
 useEffect(()=>{const offer=(e:Event)=>{e.preventDefault();setPrompt(e as InstallEvent)},done=()=>{setInstalled(true);setPrompt(null)};window.addEventListener('beforeinstallprompt',offer);window.addEventListener('appinstalled',done);return()=>{window.removeEventListener('beforeinstallprompt',offer);window.removeEventListener('appinstalled',done)}},[]);
 if(dismissed||installed||standalone||!prompt&&!(requested&&mobile))return null;
 const install=async()=>{if(!prompt)return;const event=prompt;setPrompt(null);try{await event.prompt();const result=await event.userChoice;if(result.outcome==='accepted')setInstalled(true);else setDismissed(true)}catch{setError('Use your browser menu to install i-Clusters or add it to your Home Screen.')}};
 return <aside className="install-prompt" aria-label="Install i-Clusters"><img src="/assets/iclusters-192.png" alt=""/><div><strong>{ios?'Add i-Clusters to your Home Screen':'Install i-Clusters'}</strong><p>{ios?'In Safari, tap Share → Add to Home Screen → Add. Keep Open as Web App enabled when shown.':prompt?'Open your dashboard directly from your Home Screen.':'Use your browser menu: Install app or Add to Home screen. Installation needs a trusted HTTPS connection.'}</p>{error&&<p role="alert">{error}</p>}</div>{prompt&&!ios&&<button className="btn primary" onClick={install}><Download size={18}/>Install i-Clusters</button>}{ios&&<Share2 aria-hidden="true"/>}<button className="icon-btn" aria-label="Dismiss installation prompt" onClick={()=>setDismissed(true)}><X size={18}/></button></aside>;
}
