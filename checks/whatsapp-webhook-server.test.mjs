import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
test('shared gateway verifies signatures and forwards exact bytes to both configured systems',async()=>{
 const keys=['NODE_ENV','WHATSAPP_APP_SECRET','WHATSAPP_VERIFY_TOKEN','WHATSAPP_VENDAS_WEBHOOK_ENABLED'];
 const previous=Object.fromEntries(keys.map(k=>[k,process.env[k]])),originalFetch=globalThis.fetch;
 Object.assign(process.env,{NODE_ENV:'test',WHATSAPP_APP_SECRET:'a'.repeat(32),WHATSAPP_VERIFY_TOKEN:'test-verify',WHATSAPP_VENDAS_WEBHOOK_ENABLED:'true'});
 let server;
 try{
  ({server}=await import('../whatsapp-server.mjs'));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const calls=[];globalThis.fetch=async(url,options)=>{calls.push({url,options});return new Response('ok')};
  const request=(path,method='GET',body='',headers={})=>new Promise((resolve,reject)=>{
   const req=http.request({hostname:'127.0.0.1',port:server.address().port,path,method,headers},res=>{let data='';res.on('data',c=>data+=c);res.on('end',()=>resolve({status:res.statusCode,data}))});req.on('error',reject);req.end(body);
  });
  assert.equal((await request('/health')).status,200);
  assert.equal((await request('/webhook?hub.mode=subscribe&hub.verify_token=test-verify&hub.challenge=challenge')).data,'challenge');
  assert.equal((await request('/webhook?hub.mode=subscribe&hub.verify_token=%C3%A9%C3%A9%C3%A9%C3%A9%C3%A9%C3%A9%C3%A9%C3%A9%C3%A9%C3%A9%C3%A9&hub.challenge=test')).status,403);
  const body='{"entry":[]}',signature='sha256='+crypto.createHmac('sha256',process.env.WHATSAPP_APP_SECRET).update(body).digest('hex');
  assert.equal((await request('/webhook','POST',body,{'x-hub-signature-256':'invalid'})).status,403);assert.equal(calls.length,0);
  assert.equal((await request('/webhook','POST',body,{'x-hub-signature-256':signature})).status,200);assert.equal(calls.length,2);
  assert(calls.every(c=>c.options.body.toString()===body&&c.options.headers['x-hub-signature-256']===signature));
  globalThis.fetch=async()=>new Response('failed',{status:503});assert.equal((await request('/webhook','POST',body,{'x-hub-signature-256':signature})).status,502);
 }finally{
  globalThis.fetch=originalFetch;if(server)await new Promise(resolve=>server.close(resolve));
  for(const k of keys){if(previous[k]===undefined)delete process.env[k];else process.env[k]=previous[k]}
 }
});
