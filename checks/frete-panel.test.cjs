const {test}=require('node:test'),assert=require('node:assert/strict');
const {build}=require('esbuild');
const {JSDOM}=require('jsdom');
test('panel reports the actual acknowledgement after binding an order',async t=>{
  const code=await build({stdin:{contents:"import React from 'react';import{createRoot}from'react-dom/client';import Panel from './apps/web/src/FreteRequestsPanel.jsx';createRoot(document.getElementById('root')).render(<Panel data={{motoristas:[{id:'driver-local',freteMotoristaId:'driver',freteVeiculoId:'vehicle'}],cargas:[{id:'order',codigo:'DEMO',motoristaId:'driver-local',numeroPedidoFornecedor:'123',ordemRevisadaEm:'date'}]}}/>);",resolveDir:process.cwd(),loader:'jsx'},bundle:true,write:false,format:'iife',jsx:'automatic',plugins:[{name:'fixture',setup(b){b.onResolve({filter:/^\.\/supabase$/},()=>({path:'mock',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const supabase=window.fixtureClient;'}));}}]});
  for(const [name,response,confirmed] of [
    ['server error',{data:{error:'unavailable'}},false],
    ['old response without acknowledgement',{data:{ok:true,pending:[]}},false],
    ['different batch',{data:{ok:true,confirmedEvents:['other']}},false],
    ['matching event',{data:{ok:true,confirmedEvents:['event']}},true],
  ])await t.test(name,async()=>{
    const dom=new JSDOM('<div id="root"></div>',{url:'https://fixture.test',runScripts:'outside-only'}),w=dom.window;
    const originalInterval=w.setInterval;w.setInterval=()=>0;
    let calls=0,linked=0,selectedFields='';
    w.fixtureClient={functions:{invoke:async()=>++calls===1?{data:{ok:true,message:'Ready'}}:response},
      rpc:async name=>{if(name==='fc_vincular_pedido_frete')linked++;return {data:{estado:{}}}},
      from:()=>({select(fields){selectedFields=fields;return this},order(){return this},limit:async()=>({data:[{id:'request',frete_evento_id:'event',payload:{motorista:{id:'driver'},veiculo:{id:'vehicle'}}}]})})};
    const wait=async fn=>{for(let i=0;i<50;i++){if(fn())return;await new Promise(r=>setTimeout(r,5))}assert.fail('Panel did not settle')};
    try{
      w.eval(code.outputFiles[0].text);await wait(()=>w.document.querySelector('select'));
      const select=w.document.querySelector('select');select.value='order';select.dispatchEvent(new w.Event('change',{bubbles:true}));
      await wait(()=>!Array.from(w.document.querySelectorAll('button')).find(b=>b.textContent.includes('VINCULAR E DEVOLVER')).disabled);
      Array.from(w.document.querySelectorAll('button')).find(b=>b.textContent.includes('VINCULAR E DEVOLVER')).click();
      await wait(()=>w.document.querySelector('[role=status]').textContent.startsWith('Pedido vinculado'));
      assert.equal(linked,1);assert.match(selectedFields,/frete_evento_id/);
      assert.equal(w.document.querySelector('[role=status]').textContent,confirmed?'Pedido vinculado e retorno confirmado no Frete.':'Pedido vinculado. O retorno ao Frete aguarda nova sincronização.');
    }finally{w.setInterval=originalInterval;w.close()}
  });
});
