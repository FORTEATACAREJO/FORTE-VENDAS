const {test}=require('node:test'),assert=require('node:assert/strict');
const {build}=require('esbuild'),{JSDOM}=require('jsdom');
test('capacity dialog: No never sends; Yes sends the exact acknowledgement; full load skips dialog',async()=>{
 const source=`import React,{useState} from 'react';import{createRoot}from'react-dom/client';import Orders from './apps/web/src/OrdersWorkspace.jsx';
 const driver={id:'m',nome:'Motorista',placa1:'TESTE01',capacidadeMaximaKg:40000};
 const order={id:'o',numero:'PEDIDO-TESTE',fornecedorId:'f',fornecedor:'CSN',motoristaId:'m',motorista:driver.nome,placas:[driver.placa1],pesoKg:38000,itens:[{produtoId:'p',produto:'Cimento',qtd:760}],status:'RASCUNHO'};
 function Harness(){const [data,setData]=useState({motoristas:[driver],comprasFornecedor:[order],fornecedores:[{id:'f',nome:'CSN'}],cargas:[],produtos:[]});window.makeFull=()=>setData(d=>({...d,comprasFornecedor:d.comprasFornecedor.map(o=>({...o,pesoKg:40000}))}));return <Orders data={data} currentUser={{}} onCommit={async b=>{window.calls.push(b);return {};}}/>;}createRoot(document.getElementById('root')).render(<Harness/>);`;
 const code=await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'jsx'},bundle:true,write:false,format:'iife',jsx:'automatic',outfile:'harness.js',plugins:[{name:'fixture',setup(b){b.onResolve({filter:/^\.\/supabase$/},()=>({path:'mock',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const supabase=null;export const getAuthContext=()=>null;'}));}}]});
 const dom=new JSDOM('<div id="root"></div>',{url:'https://fixture.test',runScripts:'outside-only'}),w=dom.window;
 const wait=async fn=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,5));}assert.fail('UI did not settle');};
 const button=text=>Array.from(w.document.querySelectorAll('button')).find(b=>b.textContent===text);
 try{w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;w.calls=[];w.eval(code.outputFiles.find(f=>f.path.endsWith('.js')).text);await wait(()=>button('◉ Ver espelho do pedido'));button('◉ Ver espelho do pedido').click();await wait(()=>button('Conferi este pedido'));button('Conferi este pedido').click();await wait(()=>button('Enviar pelo e-mail'));
  button('Enviar pelo e-mail').click();await wait(()=>w.document.querySelector('[role=alertdialog]'));assert.match(w.document.querySelector('[role=alertdialog]').textContent,/38.000 kg.*40.000 kg.*2.000 kg/);assert.equal(w.document.activeElement.textContent,'Não');button('Não').click();await wait(()=>!w.document.querySelector('[role=alertdialog]'));assert.equal(w.calls.filter(b=>b.action==='SUPPLIER_SEND').length,0);
  button('Enviar pelo e-mail').click();await wait(()=>button('Sim'));button('Sim').click();await wait(()=>w.calls.some(b=>b.action==='SUPPLIER_SEND'));const sent=w.calls.find(b=>b.action==='SUPPLIER_SEND');assert.deepEqual(JSON.parse(sent.capacityConfirmation),['m','',['TESTE01','','',''],40000,38000]);
  await wait(()=>!w.document.querySelector('[role=alertdialog]'));w.makeFull();await new Promise(r=>setTimeout(r,20));button('Enviar pelo e-mail').click();await wait(()=>w.calls.filter(b=>b.action==='SUPPLIER_SEND').length===2);assert.equal(w.document.querySelector('[role=alertdialog]'),null);assert.equal(w.calls.filter(b=>b.action==='SUPPLIER_SEND')[1].capacityConfirmation,undefined);
 }finally{w.close();}
});
