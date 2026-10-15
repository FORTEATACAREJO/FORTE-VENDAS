import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {JSDOM}=require(process.env.FORTE_QA_JSDOM || 'jsdom');
const source=await readFile(new URL('../apps/web/src/integration-vault.js',import.meta.url),'utf8');
const {renderIntegrationVault,installVaultButton}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('vault keeps stored values out of the DOM and clears newly submitted secrets',async()=>{
  const dom=new JSDOM('<div id="host"></div>',{url:'https://forte-vendas.onrender.com'});
  globalThis.document=dom.window.document;
  globalThis.FormData=dom.window.FormData;
  const host=document.querySelector('#host'),calls=[];
  const entry={id:'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',provider:'whatsapp',reference:'token_producao',label:'<img src=x onerror=alert(1)>',version:1,updated_at:new Date().toISOString(),archived:false};
  const client={functions:{invoke:async(name,{body})=>{calls.push(body);assert.equal(name,'integration-vault');return {data:body.action==='LIST'?{entries:[entry],audit:[]}:{saved:true}};}}};
  await renderIntegrationVault({client,host,app:'vendas',onClose(){}});
  assert.equal(host.querySelector('img'),null);
  assert.equal(host.querySelector('[name=secret]').type,'password');
  host.querySelector('[data-vault-edit]').click();
  assert.equal(host.querySelector('[name=secret]').value,'');
  host.querySelector('[name=secret]').value='SENTINEL-SECRET-ONLY-IN-REQUEST';
  await host.querySelector('form').onsubmit({preventDefault(){}});
  assert.equal(calls.find(x=>x.action==='SAVE').secret,'SENTINEL-SECRET-ONLY-IN-REQUEST');
  assert.equal(calls.find(x=>x.action==='SAVE').version,1);
  assert.equal(host.querySelector('[name=secret]').value,'');
  assert.equal(host.textContent.includes('SENTINEL-SECRET'),false);
  assert.equal(dom.window.localStorage.length,0);
  host.querySelector('[data-vault-toggle]').click();await tick();await tick();
  assert.equal(calls.filter(x=>x.action==='ARCHIVE').length,1);
  assert.equal(calls.some(x=>['SEND','REVEAL','EXPORT'].includes(x.action)),false);
  host.querySelector('[data-vault-close]').click();assert.equal(host.innerHTML,'');
});
test('failed saves clear the typed secret and do not leak backend errors',async()=>{
  const dom=new JSDOM('<div id="host"></div>');globalThis.document=dom.window.document;
  const host=document.querySelector('#host');
  const client={functions:{invoke:async(_, {body})=>body.action==='LIST'?{data:{entries:[],audit:[]}}:{error:new Error('SECRET-MUST-NOT-LEAK')}}};
  await renderIntegrationVault({client,host,app:'frete'});
  host.querySelector('[name=reference]').value='token_test';host.querySelector('[name=label]').value='Teste';host.querySelector('[name=secret]').value='SECRET-MUST-NOT-LEAK';
  await host.querySelector('form').onsubmit({preventDefault(){}});
  assert.equal(host.querySelector('[name=secret]').value,'');assert.equal(host.textContent.includes('SECRET-MUST-NOT-LEAK'),false);
});
test('non-Master sessions never receive the vault toolbar button',async()=>{
  const dom=new JSDOM('<div id="toolbar"><section></section></div>');globalThis.document=dom.window.document;
  const adminBox=document.querySelector('#toolbar');
  installVaultButton({client:{functions:{invoke:async()=>({error:new Error('Forbidden')})}},adminBox,onOpen(){}});
  await tick();assert.equal(adminBox.querySelector('button').hidden,true);
});
