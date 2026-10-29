// Network only: authenticated pages, API responses and credentials are never cached.
self.addEventListener('install',()=>{});
self.addEventListener('fetch',event=>{
 if(event.request.mode!=='navigate')return;
 event.respondWith(fetch(event.request).catch(()=>new Response('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>i-Clusters unavailable</title><body><h1>Connect to your network</h1><p>Connect to your home network or VPN, then reload i-Clusters.</p><button onclick="location.reload()">Try again</button></body></html>',{status:503,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}})));
});
