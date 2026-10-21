const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{build}=require('esbuild'),{JSDOM}=require('jsdom');
test('four areas cover every original commercial screen once, preserving IDs and filtering permissions',async()=>{
 const nav=await import('../apps/web/src/operations-navigation.mjs');const source=fs.readFileSync('apps/web/src/App.jsx','utf8');const groups=vm.runInNewContext('('+source.match(/const MODULE_GROUPS = ([\s\S]*?);\nconst PERFIS/)[1]+')');const old=Array.from(groups.find(g=>g.id==='vendas').modules),all=nav.SALES_AREAS.flatMap(nav.areaScreens).map(([id])=>id);
 assert.equal(new Set(all).size,old.length+1);assert.deepEqual([...all].sort(),[...old,'paletes'].sort());assert.equal(nav.visibleSalesAreas(()=>true).length,4);assert.equal(nav.visibleSalesAreas(()=>false).length,0);
 const one=nav.visibleSalesAreas(id=>id==='planejamento');assert.equal(one.length,1);assert.equal(one[0].entry,'planejamento');assert.equal(nav.salesBottomTab('ordensCarregamento'),'painelCargas');assert.equal(nav.salesBottomTab('painelCompras'),'painelCompras');assert.equal(nav.salesBottomTab('diretas'),'painelUnicoVendas');assert.equal(nav.salesBottomTab('financeiro'),'financeiro');
});
test('work panels navigate without duplicate direct-load panel and collapse legacy tools',async()=>{
 const source=`import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{OperationsMenu,OperationContextNav}from'./apps/web/src/OperationsNavigation.jsx';function Harness(){const[screen,setScreen]=useState('group:vendas');return <><OperationsMenu canAccess={id=>!window.denied.includes(id)} onNavigate={id=>{window.destinations.push(id);setScreen(id)}}/><OperationContextNav screen={screen} canAccess={id=>!window.denied.includes(id)} onNavigate={id=>{window.destinations.push(id);setScreen(id)}}/></>};createRoot(document.getElementById('root')).render(<Harness/>);`;
 const code=await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'jsx'},bundle:true,write:false,format:'iife',jsx:'automatic',outfile:'harness.js'});
 const dom=new JSDOM('<div id="root"></div>',{url:'https://fixture.test',runScripts:'outside-only'}),w=dom.window;
 const wait=async fn=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,5));}assert.fail('Navigation did not settle');};
 try{w.destinations=[];w.denied=[];w.eval(code.outputFiles.find(f=>f.path.endsWith('.js')).text);await wait(()=>w.document.querySelectorAll('.operations-menu>button').length===4);
 const entries=[...w.document.querySelectorAll('.operations-menu>button')];assert.deepEqual(entries.map(e=>e.querySelector('strong').textContent),['VENDAS','COMPRAS','PALLETS','CARGAS']);
 entries[3].click();await wait(()=>w.document.querySelector('.operations-context details'));assert.equal(w.destinations[0],'painelCargas');const details=w.document.querySelector('.operations-context details');assert.equal(details.open,false);details.open=true;
 const order=[...details.querySelectorAll('button')].find(b=>b.textContent==='Ordem de carregamento');order.click();await wait(()=>w.destinations.at(-1)==='ordensCarregamento');
 entries[0].click();await wait(()=>w.destinations.at(-1)==='painelUnicoVendas');assert.equal(w.document.querySelectorAll('.operations-sales-tabs button').length,4);
 const tools=w.document.querySelector('.operations-context details');assert(tools.textContent.includes('Vendas externas'));assert(![...entries].some(b=>b.textContent.includes('CARGA DIRETA')));
 }finally{w.close();}
});
