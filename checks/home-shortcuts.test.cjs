const {test}=require('node:test');
const assert=require('node:assert/strict');
const {build}=require('esbuild');
const {JSDOM}=require('jsdom');

const harness=build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import Home from './apps/web/src/HomeCompactV47.jsx';import{workspaceNavigation}from'./apps/web/src/workspace-navigation.mjs';const can=(screen,action)=>window.role==='full'||(window.role==='reader'&&action!=='editar');createRoot(document.getElementById('root')).render(<Home navigation={workspaceNavigation(()=>window.role!=='none',can)} canSell={window.role==='full'} canBuy={window.role==='full'} canAccess={can} unread={127} data={{vendas:[{status:'PENDENTE'},{status:'CONCLUÍDA'},{status:'CANCELADA'}],cargas:[]}} onNavigate={id=>window.events.push(id)} onSale={()=>window.events.push('nova-venda')} onPurchase={()=>window.events.push('nova-compra')} onBudget={()=>window.events.push('orcamento')} onLoad={()=>window.events.push('planejamento')}/>);`,resolveDir:process.cwd(),loader:'jsx'},bundle:true,write:false,jsx:'automatic',format:'iife',outfile:'home-harness.js'});

async function fixture(role){
 const result=await harness;
 const dom=new JSDOM('<div id="root"></div>',{url:'https://fixture.test',runScripts:'outside-only'});
 dom.window.role=role;dom.window.events=[];
 dom.window.eval(result.outputFiles.find(x=>x.path.endsWith('.js')).text);
 for(let i=0;i<100&&!dom.window.document.querySelector('.home-shortcuts');i++)await new Promise(r=>setTimeout(r,5));
 assert(dom.window.document.querySelector('.home-shortcuts'));
 return dom;
}

test('home shortcuts open each workflow and distinguish Central Forte from WhatsApp',async()=>{
 const dom=await fixture('full');const d=dom.window.document;
 try{
  const central=d.querySelector('.home-shortcuts a');
  assert.equal(central.href,'https://site-forte-atacarejo.onrender.com/central.html');
  const shortcuts=[...d.querySelectorAll('.home-shortcuts button')];
  assert.deepEqual(shortcuts.map(x=>x.querySelector('b').textContent),['WhatsApp','Venda balcão','Novo orçamento','Nova venda','Nova compra','Nova carga','Pallets']);
  assert.equal(d.querySelector('.home-unread').textContent,'99+');
  assert.equal(d.querySelector('.home-unread').getAttribute('aria-label'),'127 mensagens não lidas');
  assert.equal(dom.window.events.length,0);
  for(const button of shortcuts)button.click();
  assert.deepEqual(Array.from(dom.window.events),['whatsapp','balcao','orcamento','nova-venda','nova-compra','planejamento','paletes']);
  const panels=[...d.querySelectorAll('.home-panel-links button')];for(const button of panels)button.click();
  assert.deepEqual(Array.from(dom.window.events).slice(-4),['painelUnicoVendas','painelCompras','paletes','painelCargas']);
  assert.equal(d.querySelector('.home-summary strong').textContent,'1');
  d.querySelector('.home-summary button').click();assert.equal(dom.window.events.at(-1),'painelUnicoVendas');
 }finally{dom.window.close();}
});

test('read-only and unapproved users do not gain creation shortcuts or panel summaries',async()=>{
 for(const role of ['reader','none']){
  const dom=await fixture(role);const d=dom.window.document;
  try{
   assert.deepEqual([...d.querySelectorAll('.home-shortcuts button b')].map(x=>x.textContent),role==='reader'?['WhatsApp','Pallets']:[]);
   assert.equal(d.querySelectorAll('.home-panel-links button').length,role==='reader'?4:0);
   assert.equal(d.querySelectorAll('.home-summary button').length,role==='reader'?2:0);
   assert.equal(d.querySelectorAll('.home-shortcuts a').length,1);
  }finally{dom.window.close();}
 }
});
