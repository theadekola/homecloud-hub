import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'ai-providers-'));process.env.JWT_SECRET='a'.repeat(64);
const {aiProviders}=await import('../src/ai-providers.js'),{queryAI,listAIModels}=await import('../src/ai.js'),{validateConfiguration,createConfigurationStore}=await import('../src/runtime-configuration.js');
test.after(()=>fs.rmSync(process.env.DATA_DIR,{recursive:true,force:true}));
for(const [id,provider] of Object.entries(aiProviders)){
 test(`${provider.label} uses its own fixed endpoint, credentials and native message format`,async()=>{
  assert.ok(provider.models.length>=2,'Each provider offers multiple initial model choices');
  const previous=globalThis.fetch,calls=[],config=validateConfiguration('ai',{AI_PROVIDER:id,OPENAI_API_KEY:'provider-secret'});
  globalThis.fetch=async(url,options)=>{calls.push({url,options,body:JSON.parse(options.body)});return new Response(JSON.stringify(id==='anthropic'?{content:[{type:'thinking',thinking:'private'},{type:'text',text:'Answer'}]}:id==='gemini'?{candidates:[{content:{parts:[{thought:true,text:'private'},{text:'Answer'}]}}]}:id==='openai'?{output:[{content:[{type:'output_text',text:'Answer'}]}]}:{choices:[{message:{content:'Answer'}}]}))};
  try{assert.equal(await queryAI(config,'measured input',true),'Answer');const {url,options,body}=calls[0];assert.ok(url.startsWith(provider.base));assert.equal(options.redirect,'error');assert.equal(options.method,'POST');assert.ok(!url.includes('provider-secret'));
   if(id==='anthropic'){assert.ok(url.endsWith('/messages'));assert.equal(options.headers['x-api-key'],'provider-secret');assert.equal(options.headers.Authorization,undefined);assert.ok(body.system.includes('cannot execute actions'));assert.equal(body.max_tokens,1024);}
   else if(id==='gemini'){assert.ok(url.endsWith(':generateContent'));assert.equal(options.headers['x-goog-api-key'],'provider-secret');assert.equal(options.headers.Authorization,undefined);assert.equal(body.contents[0].parts[0].text,'measured input');assert.equal(body.generationConfig.maxOutputTokens,1024);}
   else{assert.equal(options.headers.Authorization,'Bearer provider-secret');if(id!=='openai'){assert.ok(url.endsWith('/chat/completions'));assert.equal(body.max_tokens,1024);assert.equal(body.store,undefined);assert.equal(body.max_completion_tokens,undefined);}}
   assert.equal(config.OPENAI_MODEL,provider.defaultModel);assert.equal(config.OPENAI_API_TYPE,provider.types[0]);assert.equal(body.tools,undefined);
  }finally{globalThis.fetch=previous}
 });
 test(`${provider.label} discovers matching text models without exposing secrets`,async()=>{
  const previous=globalThis.fetch;globalThis.fetch=async(url,options)=>{assert.ok(url.startsWith(provider.base));assert.equal(options.method,'GET');return new Response(JSON.stringify(id==='gemini'?{models:[{name:'models/gemini-listed',supportedGenerationMethods:['generateContent']},{name:'models/embed-only',supportedGenerationMethods:['embedContent']}]}:{data:[{id:id==='openai'?'gpt-listed':id+'/listed',capabilities:{completion_chat:true}},{id:'whisper-audio'},{id:'model-disabled',active:false},{id:'https://malicious.test'},{id:null}]}))};
  try{assert.deepEqual(await listAIModels({AI_PROVIDER:id,OPENAI_API_KEY:'provider-secret'}),[id==='gemini'?'gemini-listed':id==='openai'?'gpt-listed':id+'/listed']);}finally{globalThis.fetch=previous}
 });
}
test('changing provider cannot reuse a saved credential or another provider API type',()=>{
 const previous={AI_PROVIDER:'openai',OPENAI_API_KEY:'openai-only',OPENAI_MODEL:'gpt-model',OPENAI_API_TYPE:'responses'};
 assert.throws(()=>validateConfiguration('ai',{AI_PROVIDER:'anthropic'},previous),/API key/);
 assert.throws(()=>validateConfiguration('ai',{AI_PROVIDER:'anthropic',OPENAI_API_KEY:'claude-only',OPENAI_API_TYPE:'responses'},previous),/API type/);
 const changed=validateConfiguration('ai',{AI_PROVIDER:'anthropic',OPENAI_API_KEY:'claude-only'},previous);assert.equal(changed.OPENAI_API_KEY,'claude-only');assert.equal(changed.OPENAI_API_TYPE,'messages');assert.equal(changed.OPENAI_MODEL,aiProviders.anthropic.defaultModel);
 assert.equal(validateConfiguration('ai',{OPENAI_MODEL:'gpt-other'},previous).OPENAI_API_KEY,'openai-only');
});
test('selected provider survives encrypted saves and environment configuration',()=>{
 const store=createConfigurationStore(path.join(process.env.DATA_DIR,'configuration'),()=>process.env.JWT_SECRET);
 store.save('ai',{AI_PROVIDER:'gemini',OPENAI_API_KEY:'google-only'});const publicConfig=store.publicConfig('ai');assert.equal(publicConfig.providers.gemini.label,'Google Gemini');assert.equal(publicConfig.fields.find(f=>f.key==='AI_PROVIDER').value,'gemini');assert.equal(store.resolve('ai').OPENAI_API_TYPE,'generate-content');assert.ok(!JSON.stringify(publicConfig).includes('google-only'));assert.ok(!fs.readFileSync(path.join(process.env.DATA_DIR,'configuration/ai.json'),'utf8').includes('google-only'));
 const envStore=createConfigurationStore(path.join(process.env.DATA_DIR,'environment'),()=>process.env.JWT_SECRET),config=envStore.resolve('ai',{AI_PROVIDER:'mistral',OPENAI_API_KEY:'mistral-only'});assert.equal(config.OPENAI_MODEL,aiProviders.mistral.defaultModel);assert.equal(config.OPENAI_API_TYPE,'chat-completions');
});
test('unsupported providers and invalid model paths cannot initiate external requests',async()=>{
 const previous=globalThis.fetch;globalThis.fetch=()=>assert.fail('Invalid settings must fail before a request');try{
  for(const provider of ['https://malicious.test','__proto__','unknown'])await assert.rejects(()=>queryAI({AI_PROVIDER:provider,OPENAI_API_KEY:'secret'},'x'),/supported AI provider/);
  for(const model of ['https://malicious.test','../models','space model'])assert.throws(()=>validateConfiguration('ai',{OPENAI_API_KEY:'secret',OPENAI_MODEL:model}),/valid model/);
  assert.throws(()=>validateConfiguration('ai',{OPENAI_API_KEY:'secret',AI_BASE_URL:'https://malicious.test'}),/valid configuration fields/);
 }finally{globalThis.fetch=previous}
});
test('provider failures are actionable without reflecting upstream bodies or credentials',async()=>{
 const previous=globalThis.fetch;try{for(const id of Object.keys(aiProviders)){globalThis.fetch=async()=>new Response(JSON.stringify({error:{message:'provider-secret https://secret.example'}}),{status:403});await assert.rejects(()=>queryAI({AI_PROVIDER:id,OPENAI_API_KEY:'provider-secret'},'x'),error=>error.aiError&&error.message.includes(aiProviders[id].label)&&!error.message.includes('provider-secret')&&!error.message.includes('secret.example'));}}finally{globalThis.fetch=previous}
});
for(const id of ['anthropic','gemini'])test(`${id} follows opaque model cursors and rejects pagination loops`,async()=>{
 const previous=globalThis.fetch;let calls=0;
 const row=n=>id==='gemini'?{name:`models/gemini-${n}`,supportedGenerationMethods:['generateContent']}:{id:`claude-${n}`};
 globalThis.fetch=async url=>{calls++;if(calls===2)assert.ok(url.includes(encodeURIComponent('opaque /?&')));return Response.json(id==='gemini'?{models:[row(calls)],...(calls===1?{nextPageToken:'opaque /?&'}:{})}:{data:[row(calls)],has_more:calls===1,last_id:'opaque /?&'});};
 try{assert.equal((await listAIModels({AI_PROVIDER:id,OPENAI_API_KEY:'fixture'})).length,2);calls=0;globalThis.fetch=async()=>Response.json(id==='gemini'?{models:[row(1)],nextPageToken:'repeat'}:{data:[row(1)],has_more:true,last_id:'repeat'});await assert.rejects(()=>listAIModels({AI_PROVIDER:id,OPENAI_API_KEY:'fixture'}),/pagination/);}finally{globalThis.fetch=previous;}
});
