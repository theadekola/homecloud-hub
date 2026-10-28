import {mkdirSync} from 'node:fs';
/** Read-only browser audit using fixture APIs. Install Playwright + Chromium to run:
 * node scripts/audit-layout.mjs
 * PLAYWRIGHT_MODULE and CHROMIUM_EXECUTABLE may point to an existing test runtime.
 */
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../',import.meta.url));
const now=new Date().toISOString();
const guests=Array.from({length:8},(_,i)=>({id:100+i,vmid:100+i,name:['Control-VM','HomeCloud','Mssql-Server','my-app-App'][i%4],node:'node01',type:i===7?'lxc':'qemu',status:'running',cpu:i+1,memory:1024**3,memoryMax:4*1024**3,disk:10*1024**3,diskMax:32*1024**3,uptime:50000}));
const nodes=[{id:'node01',name:'node01',node:'node01',status:'online',cpu:5,memoryPercent:71,uptime:100000,ip:'192.0.2.10'}];
const sample={
 sampledAt:now,nodes,hosts:nodes,guests,vms:guests.filter(g=>g.type==='qemu'),lxc:guests.filter(g=>g.type==='lxc'),
 host:{hostname:'control-vm',version:'27.0.0',memory:4*1024**3},
 cluster:{name:'Homelab',url:'https://192.0.2.10:8006'},
 storage:[{id:'local',name:'local',node:'node01',status:'online',usage:28}],resources:guests,
 services:[{name:'Proxmox',provider:'proxmox',status:'reachable'},{name:'Docker',provider:'docker',status:'reachable'}],
 metrics:Array.from({length:24},(_,i)=>({time:new Date(Date.now()-(23-i)*3600000).toISOString(),cpu:5+i%4,memory:71})),
 containers:[{id:'c1',name:'zabbix-postgres',image:'postgres:16',status:'running',cpu:2,memory:128*1024**2,ports:[],networks:[]}],
 images:[{id:'image1',tags:['postgres:16'],size:1024**3}],
 ...Object.fromEntries(['errors','alerts','networks','volumes','pools','datasets','disks','shares','interfaces','devices','routes','dns','rules','history','jobs','points','tasks','logs','users','connections','notifications','destinations','schedules','policies'].map(k=>[k,[]]))
};
function fixture(path){
 if(path==='/auth/me')return {user:{id:'owner',name:'Layout Review',role:process.env.LAYOUT_ROLE||'owner'}};
 if(path==='/header-notifications')return {attentionCount:1,updateCount:1,criticalCount:0,attention:[{id:'update',kind:'update',title:'Docker image update available',message:'control-vm / zabbix-postgres · postgres:16 has a new registry image',severity:'info',link:'/docker?tab=Updates'}]};
 if(path==='/docker/updates')return {rows:[],settings:{enabled:true,intervalHours:6}};
 if(path==='/account/sessions')return {sessions:[]};
 if(path==='/account/security')return {mfaEnabled:false,recoveryCodesRemaining:0};
 if(path==='/security')return {password:{minimumCharacters:12,maximumBytes:72},roles:['owner','admin','operator','viewer'],twoFactor:true};
 if(path==='/storage/shares')return {...sample,resources:[{id:'share-1',resourceId:'1',name:'Backups',protocol:'SMB',provider:'truenas',path:'/mnt/pool/backups',enabled:true}]};
 if(path==='/storage/disks')return {...sample,resources:[{id:'disk-1',name:'/dev/sda',provider:'proxmox',node:'node01',type:'ssd',size:100*1024**3,health:'PASSED'}]};
 if(path==='/storage/performance')return {...sample,sources:[],series:[],pools:[],datasetIO:[],shareThroughput:[]};
 if(path==='/updates')return process.env.LAYOUT_UPDATE_NOTICE?{configured:true,enabled:process.env.LAYOUT_UPDATE_NOTICE!=='stale',available:true,latest:'fixture-new-release',state:process.env.LAYOUT_UPDATE_NOTICE==='stale'?'unavailable':'ready',message:process.env.LAYOUT_UPDATE_NOTICE==='stale'?'The updater has not reported a recent check.':'A new update is available.'}:{enabled:false,available:false};
 if(path==='/settings')return {settings:{refresh:30,siteName:'i-Clusters'},system:{},security:{},notifications:{},connections:[]};
 if(path==='/backups')return {...sample,archiveInventory:{configured:true,complete:true}};
 if(path==='/docker/hosts')return {hosts:[{id:'docker-fixture',name:'control-vm',online:true}]};
 if(path==='/users')return {users:[{id:'owner',name:'Layout Review',email:'review@example.test',role:'owner',status:'active'}]};
 if(path==='/ssh/connections')return {};
 if(path==='/ssh/fingerprint')return {host:'192.0.2.100',fingerprint:'SHA256:'+'a'.repeat(43)};
 return sample;
}
const routes=['/','/proxmox','/docker','/storage','/network','/backups','/monitoring','/alerts','/ai','/users','/settings','/tools/sftp','/tools/shell'];
for(const [page,tabs] of Object.entries({
 proxmox:['Nodes','Virtual Machines','LXC Containers','Storage','Tasks & Logs'],
 docker:['Images','Volumes','Networks','Compose Stacks','Events','Updates'],
 storage:['Disks','Datasets / Volumes','Snapshots','Shares','Performance'],
 network:['Interfaces','Devices','Routing','DNS','Traffic Analysis'],
 backups:['Restore Points','Schedules','Retention Policies','Destinations','Reports'],
 alerts:['Alert History','Alert Rules'],users:['Audit Logs'],
 settings:['System','Security','Connections','Appearance','About']
}))for(const tab of tabs)routes.push(`/${page}?tab=${encodeURIComponent(tab)}`);
const selectedRoutes=process.env.LAYOUT_ROUTES?.split(',')||routes;
const widths=(process.env.LAYOUT_WIDTHS||'1280,768,390').split(',').map(Number);
const checkRefresh=process.env.LAYOUT_CHECK_REFRESH==='1';let readCount=0,refreshControls=0;
const failures=[],server=await createServer({root,server:{host:'127.0.0.1',port:0}});
let browser;
try{
 await server.listen();const base=server.resolvedUrls.local[0];
 browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage();
 await page.addInitScript(()=>{localStorage.setItem('iclusters_access_token','layout-fixture');localStorage.setItem('iclusters_last_activity',String(Date.now()));});
 await page.route('**/api/**',async route=>{
  readCount++;if(checkRefresh)await new Promise(resolve=>setTimeout(resolve,150));
  const path=new URL(route.request().url()).pathname.replace('/api','');
  // The audit must never reach an actual provider or perform a management write.
  if(route.request().method()!=='GET'&&path!=='/ssh/fingerprint'&&!(checkRefresh&&path==='/docker/updates/check'))failures.push(`Unexpected write: ${path}`);
  return route.fulfill({json:fixture(path)});
 });
 let errors=[];page.on('pageerror',e=>errors.push(e.stack||e.message));
 for(const width of widths){
  await page.setViewportSize({width,height:1000});
  for(const route of selectedRoutes){
   errors=[];await page.goto(base.replace(/\/$/,'')+route);await page.locator('.content h1,.content h2').first().waitFor({timeout:15000}).catch(async()=>{throw Error(`Page did not render: ${route}; ${errors.join('; ')}; ${(await page.locator('body').innerText()).slice(0,300)}`)});await page.waitForTimeout(350);
   const problems=await page.evaluate(()=>{
    const issues=[];
    if(document.documentElement.scrollWidth>innerWidth+1)issues.push('Page has horizontal overflow');
    const scrollContainer=e=>{for(let p=e.parentElement;p&&p!==document.body;p=p.parentElement){const c=getComputedStyle(p);if(/auto|scroll|hidden|clip/.test(c.overflowX))return true;}return false;};
    for(const e of document.querySelectorAll('.content .btn,.content select,.content input,.modal .btn')){
     const r=e.getBoundingClientRect();
     if(r.width&&r.right>innerWidth+1&&!scrollContainer(e))issues.push(`Control is outside viewport: ${e.textContent.slice(0,50)||e.getAttribute('aria-label')}`);
    }
    // A label may wrap at spaces, but ordinary words must not break vertically.
    for(const e of document.querySelectorAll('.health-line>span,.quick-grid .btn>span')){
     for(const node of e.childNodes){if(node.nodeType!==Node.TEXT_NODE)continue;
      for(const word of node.textContent.matchAll(/\S+/g)){const range=document.createRange();range.setStart(node,word.index);range.setEnd(node,word.index+word[0].length);if(new Set([...range.getClientRects()].map(r=>Math.round(r.top))).size>1)issues.push(`Broken word: ${word[0]}`);}
     }
    }
    return issues;
   });
   failures.push(...[...errors,...problems].map(p=>`${width}px ${route}: ${p}`));
   if(process.env.LAYOUT_UPDATE_NOTICE){
    const notice=page.locator('.software-update-notice');
    if(process.env.LAYOUT_ROLE&&process.env.LAYOUT_ROLE!=='owner')assert.equal(await notice.count(),0,'Update prompts are owner-only');
    else{assert.ok(await notice.isVisible(),`${route}: persistent software update prompt is visible`);assert.match(await notice.innerText(),/Software update available/);assert.equal(await notice.getByRole('link').getAttribute('href'),'/settings?tab=About');if(process.env.LAYOUT_UPDATE_NOTICE==='stale')assert.equal(await notice.getAttribute('role'),'alert');}
   }
   if(process.env.LAYOUT_CHECK_COMPACT==='1'){
    const compact=await page.evaluate(()=>{
     const issues=[];
     if(location.pathname==='/'){
      if(document.body.textContent.includes('Alerts & Updates'))issues.push('Removed overview panel is still present');
      if(innerWidth>=1440){const cards=[...document.querySelectorAll('.overview-primary-row>.card')].map(e=>e.getBoundingClientRect());if(cards.length===2&&Math.abs(cards[0].top-cards[1].top)>2)issues.push('Primary widgets are not in the same row');const tiles=[...document.querySelectorAll('.overview-primary-row .resource-tile')].map(e=>e.getBoundingClientRect().top);if(new Set(tiles.map(Math.round)).size>1)issues.push('Resource metrics do not share a desktop row');}
     }
     if(location.pathname==='/docker'){
      if(document.querySelector('.docker-host-picker'))issues.push('Separate host picker panel is still present');
      const picker=document.querySelector('.docker-host-selector.compact'),header=picker?.closest('.page-header,.volume-header,.vm-toolbar');
      if(!header)issues.push('Host selector is outside the page heading');
      else if(innerWidth>=1440){const heading=header.querySelector('h1,h2'),a=heading?.getBoundingClientRect(),b=picker.getBoundingClientRect();if(a&&Math.min(a.bottom,b.bottom)<=Math.max(a.top,b.top))issues.push('Host selector wraps away from the desktop title');}
      if(new URLSearchParams(location.search).get('tab')==='Updates'&&!document.querySelector('.docker-updates .page-header .refresh-button'))issues.push('Update check button is outside the header');
     }
     return issues;
    });failures.push(...compact.map(p=>`${width}px ${route}: ${p}`));
   }
   if(process.env.LAYOUT_SCREENSHOTS){mkdirSync(process.env.LAYOUT_SCREENSHOTS,{recursive:true});await page.screenshot({path:`${process.env.LAYOUT_SCREENSHOTS}/${width}-${route.replace(/[^a-z0-9]/gi,'_')}.png`,fullPage:true});}

   if(checkRefresh){
    const buttons=page.locator('button.refresh-button:visible');
    for(let index=0;index<await buttons.count();index++){
     const button=buttons.nth(index),label=(await button.getAttribute('aria-label'))||await button.innerText();
     if(!/Refresh|Scan Disks|Recheck Connections|Check for Updates/i.test(label)||!await button.isEnabled())continue;
     const before=readCount;await button.click();
     assert.equal(await button.getAttribute('data-refreshing'),'true',`${route}: ${label} should show progress`);
     const glyph=button.locator('.lucide-refresh-cw,.lucide-refresh-ccw').first();
     assert.notEqual(await glyph.evaluate(e=>getComputedStyle(e).animationName),'none',`${route}: ${label} should spin`);
     await page.waitForFunction(()=>!document.querySelector('button.refresh-button[aria-busy="true"]'),{},{timeout:10000});
     assert.ok(readCount>before,`${route}: ${label} should request fresh data`);refreshControls++;
    }
   }

  }
  if(process.env.LAYOUT_UPDATE_NOTICE==='available'&&!process.env.LAYOUT_ROLE){
   await page.goto(base);await page.locator('.software-update-notice').waitFor();
   await page.waitForTimeout(5500);
   assert.ok(await page.getByRole('status',{name:'Software update available',exact:true}).isVisible(),'Update prompt persists beyond the old five-second toast');
   assert.equal(await page.locator('.topbar .update-message').count(),0,'Header toast must not obscure the persistent prompt');
  }
  await page.goto(base);await page.getByRole('button',{name:'Add Widget'}).click();
  await page.getByRole('dialog').waitFor();
  assert.ok(await page.getByRole('button',{name:'Close dialog',exact:true}).isVisible());
  await page.getByRole('button',{name:'Close dialog',exact:true}).click();
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('iclusters-ssh-approval',{detail:{target:'docker:11111111-1111-4111-8111-111111111111',path:'/docker/updates/image/install',dockerHost:'11111111-1111-4111-8111-111111111111:node',method:'POST',body:{},resolve(){},reject(){}}})));
  await page.getByLabel('SSH username',{exact:true}).waitFor();
  assert.ok(await page.getByLabel('SSH / sudo password',{exact:true}).isVisible());
  await page.getByRole('button',{name:'Close dialog',exact:true}).click();
 }
 console.log(`Reviewed ${selectedRoutes.length*widths.length} page/section layouts and ${widths.length*2} dialogs.`);
 assert.deepEqual(failures,[]);
 console.log('No page overflow, escaped controls, broken dashboard words or runtime errors.');if(checkRefresh)console.log(`Verified ${refreshControls} refresh controls request data and visibly rotate.`);
}finally{await browser?.close();await server.close();}
