import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const sources=[['vendas','apps/web/src/access-standard.js'],['patio','apps/patio/access-standard.js'],['fiscal','../FORTEFISCAL/src/access-standard.js'],['frete','../FORTE-FRETE/access-standard.js'],['financeiro','../FORTE-FINANCEIRO/src/access-standard.js'],['venda-externa','../FORTE-VENDA-EXTERNA/src/access-standard.js'],['carga-direta','../FORTE-CARGA-DIRETA/src/access-standard.js'],['site','../SITE-FORTE-ATACAREJO/access-standard.js']];
let browser;
test.before(async()=>{browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--no-sandbox']})});
test.after(async()=>{await browser?.close()});
for(const [app,path] of sources)test(app+': CPF pontuado, último CPF, sessão restaurada e saída explícita',async()=>{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const actualPath=path;
 const ui=fs.readFileSync(actualPath,'utf8');
 const notifications=fs.readFileSync(new URL('./forte-notifications.js','file://'+process.cwd()+'/'+actualPath),'utf8');
 await page.route('**/*',r=>{const pathname=new URL(r.request().url()).pathname;return r.fulfill({contentType:pathname.endsWith('.js')?'text/javascript':'text/html',body:pathname==='/access-standard.js'?ui:pathname==='/forte-notifications.js'?notifications:'<html><body><main id="content" hidden>OPERAÇÃO</main></body></html>'})});
 await page.goto('https://example.invalid/');
 async function mount(){await page.evaluate(async({app,ui})=>{
  const module=await import('/access-standard.js');
  window.mock={failLogin:true,calls:[],signedOut:0,status:{allowed:true,status:'APROVADO',cpf:'52998224725',isAdmin:false}};
  let session=JSON.parse(localStorage.getItem('test-session')||'null'),listeners=new Set();
  const client={functions:{invoke:async(name,{body})=>{
   if(name==='forte-notifications')return {data:{allowed:true,count:0,items:[]}};
   mock.calls.push(body);
   if(body.action==='LOGIN'){if(mock.failLogin)return {error:{context:new Response(JSON.stringify({error:'CPF ou senha inválidos.'}),{status:401})}};return {data:{access_token:'access',refresh_token:'refresh'}}}
   if(body.action==='SET_PASSWORD'){mock.status.changing=false;return {data:{access_token:'access-new',refresh_token:'refresh-new'}};}
   return {data:mock.status};
  }},auth:{getSession:async()=>({data:{session}}),setSession:async tokens=>{session={user:{id:'user'},...tokens};localStorage.setItem('test-session',JSON.stringify(session));listeners.forEach(fn=>fn('SIGNED_IN'));return {error:null}},signOut:async()=>{session=null;mock.signedOut++;localStorage.removeItem('test-session');listeners.forEach(fn=>fn('SIGNED_OUT'))},onAuthStateChange:fn=>{listeners.add(fn);return {data:{subscription:{unsubscribe(){listeners.delete(fn)}}}};}
  }};
  window.testClient=client;window.controller=module.startAccess({client,app,content:document.getElementById('content')});
 },{app,ui})}
 await mount();
 await page.locator('input[name=cpf]').fill('529.982.247-25');
 await page.locator('input[name=password]').fill('123456');
 await page.getByRole('button',{name:'ENTRAR',exact:true}).click();
 await page.getByRole('status').filter({hasText:'CPF ou senha inválidos.'}).waitFor();
 assert.equal(await page.evaluate(()=>mock.calls.find(x=>x.action==='LOGIN').cpf),'52998224725');
 assert.equal(await page.evaluate(app=>localStorage.getItem('forte:remembered-cpf:'+app),app),'52998224725');
 assert.equal(await page.getByRole('button',{name:'ENTRAR',exact:true}).isEnabled(),true);
 await page.evaluate(()=>{mock.failLogin=false;mock.status.changing=true});
 await page.getByRole('button',{name:'ENTRAR',exact:true}).click();
 await page.getByRole('heading',{name:'Criar nova senha'}).waitFor();
 assert.equal(await page.locator('#content').isVisible(),false);
 await page.locator('input[name=password]').fill('654321');
 await page.locator('input[name=confirm]').fill('654321');
 await page.getByRole('button',{name:'SALVAR NOVA SENHA'}).click();
 await page.locator('#content').waitFor({state:'visible'});
 assert.equal(await page.evaluate(()=>mock.signedOut),0);
 await page.reload();await mount();
 await page.locator('#content').waitFor({state:'visible'});
 assert.equal(await page.evaluate(()=>mock.calls.some(x=>x.action==='LOGIN')),false);
 await page.evaluate(()=>testClient.auth.signOut());
 await page.getByRole('button',{name:'ENTRAR',exact:true}).waitFor();
 assert.equal(await page.locator('#content').isVisible(),false);
 assert.equal(await page.locator('input[name=cpf]').inputValue(),'52998224725');
 assert.deepEqual(errors,[],app+' sem erros de execução');
 await page.close();
});
test('timeout libera a tentativa sem apagar a sessão',async()=>{
 const {accessTimeout}=await import('../../apps/web/src/access-standard.js');
 await assert.rejects(accessTimeout(new Promise(()=>{}),5),/sua sessão não foi encerrada/);
 assert.equal(await accessTimeout(Promise.resolve('ok'),5),'ok');
});
