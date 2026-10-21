import {chromium} from '../qa/node_modules/playwright/index.mjs';
import {build} from 'esbuild';
import assert from 'node:assert/strict';
const source = `
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Balcao} from './apps/web/src/App.jsx';
const fixture = {
 unidades:[{id:'u',nome:'FILIAL - CALDAS NOVAS/GO'}],
 clientes:[{id:'c',nome:'CLIENTE FICTÍCIO',uf:'GO',cidade:'CALDAS NOVAS'}],
 produtos:[{id:'p',nome:'CIMENTO CP II 50KG',marca:'CIPLAN',ativo:true,finalidade:'REVENDA',palletQtd:40,precoTabela:38,precoMinimo:30,pesoKg:50}],
 pagamentos:[{id:'pay',descricao:'A VISTA',entraCaixa:true,geraContasReceber:false}],
 motoristas:[],vendasBalcao:[],caixasBalcao:[],contasPagar:[],contasReceber:[],precosClientes:[],fretesVendaBalcao:[],fretesBalcao:[],palletClientes:[],auditoria:[],creditosClientes:[],
 estoqueMov:[{id:'stock',produtoId:'p',unidade:'FILIAL - CALDAS NOVAS/GO',tipo:'ENTRADA - COMPRA/NF',quantidade:100,custoUnitario:25,data:'2026-10-21'}],
 settings:{nextOrcamentoSeq:1,nextVendaSeq:1}
};
function Harness(){
 const [data,setData]=useState(fixture);
 window.state=()=>data;
 return <Balcao data={data} onChange={setData}
   onOpenBoleto={()=>window.messages.push('BOLETO_ABERTO')}
   onCommit={async calculate=>{
     window.commits++;
     const newState=calculate(data);
     if(window.failCommit)throw Error('Falha simulada do Supabase');
     await new Promise(resolve=>setTimeout(resolve,80));
     setData(newState);
     window.saved=newState;
     return newState;
   }}
   currentUser={{nome:'Operador de teste',master:true}}/>;
}
createRoot(document.getElementById('root')).render(<Harness/>);
`;
const bundle=await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'jsx'},bundle:true,write:false,jsx:'automatic',format:'iife',outfile:'balcao-smoke.js'});
const css=bundle.outputFiles.find(f=>f.path.endsWith('.css'))?.text || '';
const js=bundle.outputFiles.find(f=>f.path.endsWith('.js'))?.text;
assert(js,'Bundle do balcão não gerado');
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--no-sandbox']});
try{
 for(const width of [390,1280]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://balcao.fixture/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width,initial-scale=1"><body><main id="root"></main></body></html>'}));
  await page.goto('https://balcao.fixture');
  await page.evaluate(()=>{window.messages=[];window.commits=0;window.failCommit=true;window.alert=t=>window.messages.push(t);window.confirm=()=>true;});
  if(css)await page.addStyleTag({content:css});
  await page.addScriptTag({content:js});
  const button=name=>page.getByRole('button',{name,exact:true});
  await button('ABRIR CAIXA').waitFor();
  await button('ABRIR CAIXA').click();
  await page.waitForFunction(()=>window.messages.some(x=>x.includes('NENHUMA ABERTURA FOI CONFIRMADA')));
  assert.equal(await page.evaluate(()=>window.state().caixasBalcao.length),0);
  await page.evaluate(()=>window.failCommit=false);
  await button('ABRIR CAIXA').click();
  await page.waitForFunction(()=>window.state().caixasBalcao.length===1);
  assert((await page.evaluate(()=>window.messages)).some(s=>s.includes('CONFIRMADO NA NUVEM')));
  await page.locator('#balcao-produto-select').selectOption('p');
  await page.getByPlaceholder('DIGITE E PRESSIONE ENTER').fill('2');
  await button('+ ADICIONAR ITEM').click();
  await page.waitForFunction(()=>window.localStorage.getItem('forte-vendas-balcao-itens-rascunho-v628')?.includes('CIMENTO CP II'));
  await button('CONFIRMAR ITENS').click();
  await button('EXCLUIR RASCUNHO').click();
  assert.equal(await page.evaluate(()=>window.state().vendasBalcao.length),0);
  assert([null,'[]'].includes(await page.evaluate(()=>window.localStorage.getItem('forte-vendas-balcao-itens-rascunho-v628'))));
  await button('+ NOVO ORÇAMENTO').click();
  await page.getByRole('button',{name:'EMITIR / ALTERAR BOLETO',exact:true}).click();
  assert((await page.evaluate(()=>window.messages)).includes('BOLETO_ABERTO'));
  assert.deepEqual(errors,[]);
  console.log('PASS balcao: caixa com erro e retry, botoes de item, rascunho, orcamento, boleto, sem pageerror '+width);
  await page.close();
 }
}finally{await browser.close()}
