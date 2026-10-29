import assert from 'node:assert/strict';
const origin='https://localhost:6002';
async function read(path,type){
 const response=await fetch(new URL(path,origin),{redirect:'error',signal:AbortSignal.timeout(15000)});
 assert.equal(response.status,200,`${path} must be readable without authentication`);
 assert.match(response.headers.get('content-type')||'',type,`${path} must have the correct content type`);
 const data=Buffer.from(await response.arrayBuffer());assert.ok(data.length>0&&data.length<1000000);return data;
}
const manifest=JSON.parse((await read('/manifest.webmanifest',/application\/(?:manifest\+json|json|octet-stream)/)).toString());
assert.equal(manifest.display,'standalone');assert.ok(manifest.icons.length>=2);
for(const icon of [...manifest.icons,{src:'/assets/iclusters-180.png',sizes:'180x180'}]){
 const url=new URL(icon.src,origin);assert.equal(url.origin,origin);
 const png=await read(url.pathname,/image\/png/);
 assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 const [width,height]=icon.sizes.split('x').map(Number);assert.equal(png.readUInt32BE(16),width);assert.equal(png.readUInt32BE(20),height);
}
const worker=await read('/sw.js',/(?:application|text)\/javascript/);assert.match(worker.toString(),/addEventListener\('fetch'/);
console.log('Mobile manifest, all install icons and service worker are publicly readable.');
