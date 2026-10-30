// Network only: authenticated pages, API responses and credentials are never cached.
// This self-contained screen must render even when all application assets are unreachable.
const unavailablePage = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="dark light"><meta name="theme-color" content="#0b2035"><title>i-Clusters unavailable</title>
<style>
:root{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#edf2f8;background:#071522;color-scheme:dark light;--surface:#0b2035;--muted:#b0bac9;--border:#34516b;--accent:#38bdf8;--button:#2563eb;--shadow:0 16px 50px #0003}
*{box-sizing:border-box}body{margin:0;min-height:100vh;min-height:100dvh;display:grid;place-items:center;padding:max(24px,env(safe-area-inset-top)) max(20px,env(safe-area-inset-right)) max(24px,env(safe-area-inset-bottom)) max(20px,env(safe-area-inset-left));background:radial-gradient(ellipse at 85% 0%,#123e6255,transparent 65%)}main{width:min(100%,480px);padding:clamp(24px,6vw,36px);border:1px solid var(--border);border-radius:20px;background:var(--surface);box-shadow:var(--shadow)}.brand{display:flex;align-items:center;gap:10px;font-size:21px;font-weight:700;margin-bottom:28px}.brand svg{color:var(--accent);flex:none}.signal{display:grid;place-items:center;width:56px;height:56px;border-radius:16px;background:#38bdf81a;color:var(--accent);margin-bottom:20px}h1{font-size:clamp(24px,6vw,30px);line-height:1.2;margin:0 0 14px;letter-spacing:-.02em}p,li{font-size:15px;line-height:1.6;color:var(--muted)}p{margin:12px 0}ol{padding-left:22px;margin:18px 0}li{padding-left:3px;margin:8px 0}.address{display:block;overflow-wrap:anywhere;font:500 14px/1.5 ui-monospace,SFMono-Regular,monospace;color:inherit;margin-top:6px}.server{padding:12px 14px;border:1px solid var(--border);border-radius:10px;margin:20px 0}button{width:100%;min-height:48px;border:0;border-radius:10px;padding:12px 18px;font-family:inherit;font-size:16px;font-weight:600;line-height:1.4;background:var(--button);color:#fff;cursor:pointer}button:disabled{opacity:.7;cursor:wait}button:focus-visible{outline:3px solid var(--accent);outline-offset:4px}#status{min-height:48px;font-size:13px;margin:12px 0 0}.footnote{font-size:12px;margin-top:20px}svg{display:block}
@media(prefers-color-scheme:light){:root{color:#182b43;background:#f3f6fb;--surface:#fff;--muted:#50647f;--border:#cad5e3;--accent:#1664ad;--shadow:0 12px 40px #182b4312}body{background:radial-gradient(ellipse at 85% 0%,#dceafe,transparent 65%)}.signal{background:#e6f2ff}}
</style></head><body><main aria-labelledby="title"><div class="brand"><svg width="32" height="34" viewBox="0 0 32 34" fill="none" aria-hidden="true"><path d="m16 2 14 8-14 8L2 10 16 2Zm-14 15 14 8 14-8M2 24l14 8 14-8" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>i-Clusters</div><div class="signal"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="3" y="3" width="18" height="7" rx="2"/><path d="M6 7h.01M3 16h5m4-3 9 9m0-9-9 9"/></svg></div><h1 id="title">Unable to reach i-Clusters</h1><p>Your installation is currently unreachable. This can happen if the network is disconnected or the server is restarting.</p><div class="server"><span>Installation address</span><span id="address" class="address"></span></div><ol><li>Connect to your home network or VPN, then try again.</li><li>If you are already connected, check that the i-Clusters server is running and its address is reachable.</li></ol><button id="retry" type="button">Try again</button><p id="status" role="status" aria-live="polite">Checking again automatically while this page is open.</p><p class="footnote">Your VPN stays managed in its own app. This screen cannot turn it on. Your dashboard data is not stored offline.</p></main>
<script>
(function(){
 const button=document.getElementById('retry'),status=document.getElementById('status');
 document.getElementById('address').textContent=location.host;
 let busy=false,timer,controller,stopped=false;
 function schedule(){clearTimeout(timer);if(!stopped&&!document.hidden)timer=setTimeout(check,5000);}
 async function check(){
  if(busy||stopped||document.hidden)return;
  busy=true;clearTimeout(timer);button.disabled=true;button.textContent='Checking connection…';status.textContent='Checking your i-Clusters server…';
  controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),6000);
  try{
   const response=await fetch('/api/health',{cache:'no-store',credentials:'omit',signal:controller.signal});
   const data=response.ok?await response.json():null;
   if(stopped)return;
   if(response.ok&&data&&data.ok===true){status.textContent='Connection restored. Opening i-Clusters…';location.reload();return;}
   status.textContent='The server is not ready yet. Check its status, or try again shortly.';
  }catch{if(!stopped)status.textContent='Still unable to connect. Check your network or VPN and the installation address.';}
  finally{clearTimeout(timeout);busy=false;button.disabled=false;button.textContent='Try again';schedule();}
 }
 button.addEventListener('click',check);
 window.addEventListener('online',check);
 document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(timer);}else check();});
 window.addEventListener('pagehide',()=>{stopped=true;clearTimeout(timer);if(controller)controller.abort();});
 window.addEventListener('pageshow',()=>{stopped=false;schedule();});
 schedule();
})();
</script></body></html>`;
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
 if(event.request.mode!=='navigate')return;
 event.respondWith(fetch(event.request).then(response=>response.status>=500?offlineResponse():response).catch(offlineResponse));
});
function offlineResponse(){return new Response(unavailablePage,{status:503,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});}
