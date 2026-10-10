import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';

test('development server forwards API requests instead of returning the SPA',async()=>{
 const upstream=http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,path:req.url}));});
 await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));
 const previous=process.env.HOMECLOUD_DEV_API_URL;process.env.HOMECLOUD_DEV_API_URL=`http://127.0.0.1:${upstream.address().port}`;
 let vite;
 try{
  vite=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0}});
  await vite.listen();const port=vite.httpServer.address().port;
  const res=await fetch(`http://127.0.0.1:${port}/api/health?test=1`);
  assert.equal(res.status,200);assert.deepEqual(await res.json(),{ok:true,path:'/api/health?test=1'});
 }finally{await vite?.close();await new Promise(resolve=>upstream.close(resolve));if(previous===undefined)delete process.env.HOMECLOUD_DEV_API_URL;else process.env.HOMECLOUD_DEV_API_URL=previous;}
});
