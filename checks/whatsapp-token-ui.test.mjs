import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
test('Master sees only token and failed save clears it without leaking provider details',async()=>{
 const dom=new JSDOM('<main></main>',{url:'https://forte-vendas.onrender.com'});
 const previous=Object.fromEntries(['document','location','FormData'].map(k=>[k,globalThis[k]]));
 Object.assign(globalThis,{document:dom.window.document,location:dom.window.location,FormData:dom.window.FormData});
 const calls=[],token='simulated-ui-token-'.repeat(3);
 const client={functions:{invoke:async(name,{body})=>{
  calls.push(body);
  if(body.action==='LIST')return {data:{invites:[],can_configure:true}};
  if(body.action==='CAPABILITIES')return {data:{business_credentials:false}};
  if(body.action==='CONFIGURE')return {error:{}};
  throw Error('Unexpected operation');
 }}};
 try{
  const source=await readFile(new URL('../apps/web/src/user-invites.js',import.meta.url),'utf8');
  const {renderUserInvites}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  const host=document.querySelector('main');await renderUserInvites({client,host,app:'vendas'});
  const form=host.querySelector('#uiConfigForm');assert.equal(host.querySelector('#uiConfig').hidden,false);
  assert.deepEqual([...form.querySelectorAll('input')].map(i=>[i.name,i.type]),[['token','password']]);
  form.elements.token.value=token;await form.onsubmit({preventDefault(){}});
  assert.deepEqual(calls.find(c=>c.action==='CONFIGURE'),{app:'vendas',action:'CONFIGURE',token});
  assert.equal(form.elements.token.value,'');assert(!host.textContent.includes(token));
  assert.equal(form.querySelector('button').disabled,false);
 }finally{Object.assign(globalThis,previous);dom.window.close()}
});
