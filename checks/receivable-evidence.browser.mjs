import {chromium} from '../qa/node_modules/playwright/index.mjs';
import {build} from '../qa/node_modules/esbuild/lib/main.js';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),parser=require('@babel/parser');
const code=await fs.readFile('apps/web/src/App.jsx','utf8');
const node=parser.parse(code,{sourceType:'module',plugins:['jsx']}).program.body.find(n=>n.type==='FunctionDeclaration'&&n.id?.name==='RecebiveisItau');
assert(node,'Componente de recebíveis não encontrado');
const source=`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {storeReceivableFile,appendReceiptEvidence} from './apps/web/src/receivable-evidence.js';import {parseMoneyInput} from './apps/web/src/financial.js';import {customerName} from './apps/web/src/customer-name.js';
let serial=0;const uid=p=>p+'-'+(++serial),nowISO=()=>new Date().toISOString(),money=v=>'R$ '+v;const getAuthContext=()=>({profile:{empresa_id:'empresa-1'}});const Field=({label,children})=><label>{label}{children}</label>;
const stored=new Set();window.uploadCalls=[];window.failUpload=false;window.signedPaths=[];const supabase={storage:{from:bucket=>({upload:async(path,file)=>{window.uploadCalls.push({bucket,path,size:file.size});if(window.failUpload)return {error:{statusCode:403}};const repeated=stored.has(path);stored.add(path);return {error:repeated?{statusCode:409}:null}},createSignedUrl:async(path)=>{window.signedPaths.push(path);return {data:{signedUrl:'https://fixture.test/document'}}}})}};
${code.slice(node.start,node.end)}
function Fixture(){const [data,setData]=useState({vendas:[{id:'venda-1',numeroVenda:'VEN-TESTE',cliente:'CLIENTE SINTÉTICO'}],contasReceber:[{id:'titulo-1',vendaId:'venda-1',valor:1000,saldoAberto:1000,status:'ABERTO'}],boletosClientes:[],comprovantesClientes:[]});window.fixtureState=data;return <RecebiveisItau data={data} onChange={setData}/>;}createRoot(document.getElementById('root')).render(<Fixture/>);`;
const output=await build({stdin:{contents:source,sourcefile:'receivable-fixture.jsx',resolveDir:process.cwd(),loader:'jsx'},bundle:true,jsx:'automatic',write:false,format:'iife'});
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--no-sandbox']});
try {
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const page=await browser.newPage({viewport});const errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('dialog',async dialog=>dialog.type()==='prompt'?dialog.accept('400,00'):dialog.dismiss());
  await page.route('https://fixture.test/**',route=>route.fulfill({contentType:'text/html',body:'<html lang="pt-BR"><head><meta name="viewport" content="width=device-width"></head><body><div id="root"></div></body></html>'}));
  await page.goto('https://fixture.test');await page.addScriptTag({content:output.outputFiles[0].text});
  await page.getByLabel('VENDA',{exact:true}).selectOption('venda-1');
  const input=page.getByLabel('ANEXAR COMPROVANTE DE PAGAMENTO DO CLIENTE',{exact:true});
  const file={name:'comprovante-teste.pdf',mimeType:'application/pdf',buffer:Buffer.from('somente evidência sintética')};
  await input.setInputFiles(file);await page.getByText('R$ 400 • PENDENTE DE CONFERÊNCIA',{exact:true}).waitFor();
  let state=await page.evaluate(()=>window.fixtureState);assert.equal(state.contasReceber[0].saldoAberto,1000);assert.equal(state.contasReceber[0].status,'ABERTO');assert.equal(state.comprovantesClientes.length,1);assert(state.comprovantesClientes[0].storagePath);
  await input.setInputFiles(file);await page.waitForFunction(()=>window.uploadCalls.length===2);state=await page.evaluate(()=>window.fixtureState);assert.equal(state.comprovantesClientes.length,1);
  await page.evaluate(()=>window.failUpload=true);await input.setInputFiles({...file,buffer:Buffer.from('falha de upload sintética')});await page.waitForFunction(()=>window.uploadCalls.length===3);state=await page.evaluate(()=>window.fixtureState);assert.equal(state.comprovantesClientes.length,1);assert.equal(state.contasReceber[0].saldoAberto,1000);
  assert.deepEqual(errors,[]);await fs.mkdir('/tmp/itau-qa',{recursive:true});await page.screenshot({path:'/tmp/itau-qa/comprovante-pendente-'+viewport.width+'.png',fullPage:true});console.log('PASS: comprovante pendente, arquivo persistido, duplicidade e falha de upload — '+viewport.width);await page.close();
 }
}finally{await browser.close();}
