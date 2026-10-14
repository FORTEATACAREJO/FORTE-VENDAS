const {chromium} = require('playwright');
const {build} = require('esbuild');
const {readFileSync} = require('node:fs');
const {resolve} = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  // Mount the real customer form, with all provider responses intercepted locally.
  const source = readFileSync('apps/web/src/App.jsx','utf8') + `
    import {createRoot} from 'react-dom/client';
    createRoot(document.getElementById('root')).render(<CadModal type="clientes"
      data={{clientes:[],produtos:[]}} search="" setSearch={()=>{}}
      onChange={()=>{}} onClose={()=>{}} isAdmin={true}/>);`;
  const bundle = await build({stdin:{contents:source,resolveDir:resolve('apps/web/src'),loader:'jsx'},
    bundle:true,write:false,loader:{'.css':'empty'},format:'iife',jsx:'automatic',define:{'import.meta.env':'{}','process.env.NODE_ENV':'"test"'}});
  const browser = await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || chromium.executablePath(),args:['--no-sandbox']});
  try {
    const page = await browser.newPage();
    const requests = [];
    let slow = false;
    await page.route('https://brasilapi.com.br/**',async route => {
      const cnpj = route.request().url().split('/').pop();
      requests.push(cnpj);
      if(slow) await new Promise(r=>setTimeout(r,1100));
      await route.fulfill({json:{cnpj,razao_social:'EMPRESA TESTE',cep:'38550026',uf:'MG',
        logradouro:'RUA TESTE',numero:'10',municipio:'MONTE CARMELO'}});
    });
    await page.route('https://fixture.test/**',route=>route.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));
    await page.goto('https://fixture.test');
    await page.addScriptTag({content:bundle.outputFiles[0].text});
    await page.getByRole('button',{name:'+ NOVO',exact:true}).click();
    const document = page.getByLabel('CPF/CNPJ',{exact:true});
    await document.fill('52998224725');
    await page.waitForTimeout(900);
    assert.equal(requests.length,0,'CPF must never reach provider');
    await document.fill('03.698.525/0001-30');
    await page.waitForFunction(()=>document.querySelector('[role="status"]')?.textContent.includes('DADOS PREENCHIDOS'));
    assert.deepEqual(requests,['03698525000130']);
    assert.equal(await page.getByLabel('CEP',{exact:true}).inputValue(),'38550026');
    assert.equal(await page.getByLabel('UF',{exact:true}).inputValue(),'MG');
    await page.waitForTimeout(900);
    assert.equal(requests.length,1,'normalization must not repeat lookup');
    await page.getByLabel('CEP',{exact:true}).fill('');
    slow = true;
    await page.getByRole('button',{name:'BUSCAR DADOS PELO CNPJ',exact:true}).click();
    await document.fill('52998224725');
    await page.waitForTimeout(1400);
    assert.equal(await page.getByLabel('CEP',{exact:true}).inputValue(),'','stale response must not fill new identity');
    console.log('PASS: automatic CNPJ fill, no CPF lookup, no duplicate request, stale response ignored');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
