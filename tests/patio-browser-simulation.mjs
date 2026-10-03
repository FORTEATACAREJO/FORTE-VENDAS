// Run with PLAYWRIGHT_MODULE pointing to an installed Playwright package, or install playwright.
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=new URL('../apps/patio/',import.meta.url);
const html=await readFile(new URL('index.html',base),'utf8');
const script=await readFile(new URL('app.js',base),'utf8');
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined,args:process.env.PLAYWRIGHT_CHROMIUM_ARGS?JSON.parse(process.env.PLAYWRIGHT_CHROMIUM_ARGS):['--no-sandbox']});
const page=await browser.newPage();
const fixture={caixas:[{id:'CX',data:'2026-10-03',unidade:'ESTOQUE ÚNICO',operador:'SIMULADO'}],caixaId:'CX',totalProdutos:2,pendentes:2,divergencias:0,desatualizados:0,liberado:false,itens:[{produtoId:'A',produto:'<img src=x onerror="window.injetado=true">',marca:'SIM',unidade:'SC',total:5,bloqueado:2,disponivel:3,base:'BASE-A',contagem:null,diferenca:null,atual:false},{produtoId:'B',produto:'SEM MOVIMENTO',marca:'SIM',unidade:'SC',total:0,bloqueado:0,disponivel:0,base:'BASE-B',contagem:null,diferenca:null,atual:false}]};
await page.route('http://patio.test/**',async route=>{const path=new URL(route.request().url()).pathname;if(path==='/')await route.fulfill({contentType:'text/html',body:html.replace('<script type="module" src="/access.js"></script>','')});else if(path==='/app.js')await route.fulfill({contentType:'application/javascript',body:script});else await route.fulfill({status:404,body:''});});
await page.goto('http://patio.test/');
await page.evaluate(async fixture=>{
 document.getElementById('protected-content').hidden=false;
 window.calls=[];window.state=fixture;window.fail=false;window.delay=false;
 window.patio=await import('/app.js');
 window.client={async rpc(name,args){window.calls.push({name,args});if(window.delay)await new Promise(r=>window.resume=r);if(window.fail)return {error:{message:'Estoque ou orçamento mudou. Atualize e conte novamente.'}};
 if(name==='fc_patio_status')return {data:args.p_caixa?structuredClone(window.state):{caixas:window.state.caixas}};
 const item=window.state.itens.find(x=>x.produtoId===args.p_produto);item.contagem=args.p_contagem;item.diferenca=item.disponivel-item.contagem;item.atual=true;item.conferente='OPERADOR SIMULADO';item.gravadoEm='2026-10-03T12:00:00Z';window.state.pendentes=window.state.itens.filter(x=>x.contagem==null).length;window.state.divergencias=window.state.itens.filter(x=>x.contagem!=null&&x.diferenca!==0).length;window.state.liberado=window.state.pendentes===0&&window.state.divergencias===0;return {data:structuredClone(window.state)};
 }};await window.patio.startPatio(window.client);
},fixture);
await page.selectOption('#caixa','CX');await page.waitForSelector('#contagem-0');
try {
await test('Catálogo completo, zero sem movimento e nome escapado',async()=>{assert.equal(await page.locator('#produtos article').count(),2);assert.equal(await page.locator('#produtos img').count(),0);assert.equal(await page.evaluate(()=>window.injetado),undefined);assert.equal(await page.locator('#contagem-1').inputValue(),'');});
await test('Campo vazio, negativo e mais de seis casas não enviam contagem',async()=>{for(const value of ['','-1','0.1234567','Infinity']){await page.fill('#contagem-0',value);await page.click('[data-gravar="0"]');assert.match(await page.locator('#patio-status').innerText(),/Informe a quantidade/);}assert.equal(await page.evaluate(()=>calls.filter(x=>x.name==='fc_patio_contar').length),0);});
await test('Diferença bloqueia; zero explícito é salvo e última contagem reaparece',async()=>{await page.fill('#contagem-0','2');await page.click('[data-gravar="0"]');await page.waitForFunction(()=>window.state.itens[0].contagem===2);await page.fill('#contagem-1','0');await page.click('[data-gravar="1"]');await page.waitForFunction(()=>window.state.pendentes===0);assert.match(await page.locator('#patio-status').innerText(),/1 diferença/);await page.click('#atualizar');await page.waitForFunction(()=>!document.getElementById('atualizar').disabled);assert.equal(await page.locator('#contagem-1').inputValue(),'0');});
await test('Recontagem certa libera somente após salvar ambos os produtos',async()=>{await page.fill('#contagem-0','3');await page.click('[data-gravar="0"]');await page.waitForFunction(()=>window.state.liberado);assert.match(await page.locator('#patio-status').innerText(),/TODOS OS PRODUTOS CONFERIDOS/);assert.deepEqual(await page.evaluate(()=>calls.filter(x=>x.name==='fc_patio_contar').at(-1).args),{p_caixa:'CX',p_produto:'A',p_contagem:3,p_base:'BASE-A'});});
await test('Gravação em andamento trava seleção e atualização',async()=>{await page.evaluate(()=>window.delay=true);await page.fill('#contagem-0','3');await page.click('[data-gravar="0"]');assert.equal(await page.locator('#caixa').isDisabled(),true);assert.equal(await page.locator('#atualizar').isDisabled(),true);assert.equal(await page.locator('#finalizar').isDisabled(),true);await page.evaluate(()=>{window.delay=false;window.resume()});await page.waitForFunction(()=>!document.getElementById('caixa').disabled);});
await test('Base alterada informa erro sem substituir contagem por sucesso',async()=>{await page.evaluate(()=>window.fail=true);await page.fill('#contagem-0','9');await page.click('[data-gravar="0"]');await page.waitForFunction(()=>document.getElementById('patio-status').textContent.includes('mudou'));assert.equal(await page.evaluate(()=>window.state.itens[0].contagem),3);await page.evaluate(()=>window.fail=false);});
await test('Fim da sessão limpa produtos e ignora retorno atrasado',async()=>{await page.evaluate(()=>window.delay=true);await page.click('#atualizar');await page.evaluate(()=>window.patio.stopPatio());await page.evaluate(()=>{window.delay=false;window.resume()});assert.equal(await page.locator('#produtos article').count(),0);});
} finally {await browser.close();}
