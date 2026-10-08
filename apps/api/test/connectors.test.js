import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

test('Docker connector handles pulls, port mappings, conflicts and log frames',async()=>{
  let created,buildBody;
  const server=http.createServer(async(req,res)=>{
    if(req.url==='/containers/json?all=1')return res.end(JSON.stringify([{Id:'container',Names:['/app'],State:'exited',Mounts:[{Type:'volume',Name:'app_data',Destination:'/data',RW:true}]}]));
    if(req.url==='/images/json'||req.url==='/networks')return res.end('[]');
    if(req.url==='/info')return res.end('{"Name":"docker-test"}');
    if(req.url==='/volumes')return res.end(JSON.stringify({Volumes:[{Name:'app_data',Driver:'local',Mountpoint:'/volumes/app_data',CreatedAt:'2026-01-01T00:00:00Z',Labels:{backup:'true'},Options:{type:'none'}}]}));
    if(req.url.startsWith('/build?')){const chunks=[];for await(const chunk of req)chunks.push(chunk);buildBody=Buffer.concat(chunks);assert.equal(req.headers['content-type'],'application/x-tar');if(req.url.includes('broken'))return res.end('{"error":"Build failed"}\n');return res.end('{"stream":"Built"}\n');}
    if(req.url.startsWith('/images/create'))return res.end('{"status":"Pulling"}\n{"status":"Done"}\n');
    if(req.url.startsWith('/containers/create')){
      let body='';for await(const chunk of req)body+=chunk;
      assert.equal(req.headers['transfer-encoding'],undefined);assert.equal(Number(req.headers['content-length']),Buffer.byteLength(body));created=JSON.parse(body);res.setHeader('Content-Type','application/json');return res.end('{"Id":"test"}');
    }
    if(req.url.includes('/logs?')){
      const message=Buffer.from('hello\n');const header=Buffer.alloc(8);header[0]=1;header.writeUInt32BE(message.length,4);return res.end(Buffer.concat([header,message]));
    }
    if(req.url.includes('/stop')){res.statusCode=409;return res.end('conflict');}
    res.statusCode=204;res.end();
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  process.env.DOCKER_API_URL=`http://127.0.0.1:${server.address().port}`;
  try{
    const connector=await import('../src/connectors.js');
    const inventory=await connector.dockerSnapshot();
    assert.equal(inventory.volumes[0].created,'2026-01-01T00:00:00Z');
    assert.equal(inventory.volumes[0].labels.backup,'true');
    assert.equal(inventory.containers[0].mounts[0].Destination,'/data');
    const result=await connector.dockerCreateContainer({name:'test',image:'nginx',ports:'8080:80'});
    assert.equal(result.Id,'test');
    await connector.dockerBuildImage({tag:'test:latest',dockerfile:'FROM scratch\n'});
    assert.equal(buildBody.subarray(0,10).toString(),'Dockerfile');
    assert.equal(buildBody.subarray(512,525).toString(),'FROM scratch\n');
    assert.equal(buildBody.length%512,0);
    await assert.rejects(connector.dockerBuildImage({tag:'broken',dockerfile:'FROM missing'}),/Build failed/);
    await assert.rejects(connector.dockerBuildImage({tag:'',dockerfile:'FROM scratch'}),/required/);
    assert.deepEqual(created.HostConfig.PortBindings['80/tcp'],[{HostPort:'8080'}]);
    assert.equal(await connector.dockerLogs('test'),'hello\n');
    await assert.rejects(connector.dockerAction('test','stop'),/409/);
    await assert.rejects(connector.dockerCreateContainer({name:'test',image:'nginx',ports:'70000:80'}),/Ports/);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
