import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const ui=fs.readFileSync(new URL('../../apps/web/src/access-standard.js',import.meta.url),'utf8');let browser;
test.before(async()=>browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox']}));
test.after(async()=>browser?.close());
const apps=['vendas','financeiro','venda-externa','carga-direta','patio','site','frete','fiscal'];
async function setup(app,{session=null,status=null,recovery=false}={}){
const page=await browser.newPage({viewport:{width:390,height:844}});
await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<html lang="pt-BR"><body><main id="protected">DADOS OPERACIONAIS</main></body></html>'}));
await page.goto('https://example.invalid/'+(recovery?'?recovery=1':''));
await page.evaluate(async({ui,app,session,status})=>{
window.mock={session,status:status||{allowed:false,status:'PENDENTE',isAdmin:false,changing:false,notifications:[{message:'Cadastro enviado para análise.'}]},calls:[],allowed:0};
const client={functions:{invoke:async(name,{body})=>{window.mock.calls.push({name,body});if(name==='recover-password-email')return {data:{message:'Se os dados corresponderem, enviaremos o link.'}};if(body.action==='REGISTER')return {data:{status:'PENDENTE',message:'Cadastro enviado para análise. Aguarde aprovação do admin ou master.'}};if(body.action==='LOGIN')return {data:{access_token:'mock',refresh_token:'mock'}};if(body.action==='SET_PASSWORD')return {data:{message:'Senha alterada. Entre novamente.'}};if(body.action==='QUEUE')return {data:{pending:[{id:'request1',user_id:'other',app,nome:'Usuário Simulado',cpf:'52998224725',whatsapp:'5534999998888',data_nascimento:'1990-01-15',created_at:'2026-10-04T18:00:00Z'}],units:[{establishment_id:'unit1',establishments:{code:'MATRIZ_MG'}}],message:'1 usuário aguardando análise.'}};if(body.action==='REVIEW')return {data:{message:'Decisão registrada.'}};return {data:window.mock.status}}},auth:{getSession:async()=>({data:{session:window.mock.session}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),setSession:async()=>{window.mock.session={user:{id:'user'}};return {error:null}},signOut:async()=>{window.mock.session=null;return {error:null}}}};
const module=await import('data:text/javascript;base64,'+btoa(unescape(encodeURIComponent(ui))));window.controller=module.startAccess({client,app,content:document.getElementById('protected'),onAllowed:()=>window.mock.allowed++});
},{ui,app,session,status});return page;
}
for(const app of apps)test(app+' cadastro, espera, aprovação e recuperação ficam no próprio aplicativo',async()=>{
const page=await setup(app);
await page.getByRole('heading',{name:'Primeiro cadastro'}).waitFor();
assert.equal(await page.locator('#protected').isVisible(),false);
assert.equal(await page.locator('input[name=email]').getAttribute('required'),null);
await page.locator('input[name=cpf]').fill('529.982.247-25');await page.locator('input[name=nome]').fill('Usuário de Teste');await page.locator('input[name=whatsapp]').fill('34999998888');await page.locator('input[name=data_nascimento]').fill('1990-01-15');await page.locator('input[name=password]').fill('1234567');await page.locator('input[name=confirm]').fill('1234567');
await page.getByRole('button',{name:'ENVIAR PARA ANÁLISE',exact:true}).click();await page.getByRole('heading',{name:'Entrar com CPF'}).waitFor();assert.equal(await page.locator('#protected').isVisible(),false);
assert.equal(await page.evaluate(()=>window.mock.calls.some(x=>x.body.action==='REGISTER'&&x.body.email==='')),true);
await page.locator('input[name=cpf]').fill('52998224725');await page.locator('input[name=password]').fill('1234567');await page.getByRole('button',{name:'ENTRAR',exact:true}).click();await page.getByRole('heading',{name:'Aguardando análise'}).waitFor();assert.equal(await page.evaluate(()=>window.mock.allowed),0);
await page.evaluate(async()=>{window.mock.status.allowed=true;window.mock.status.status='APROVADO';await window.controller.check()});assert.equal(await page.locator('#protected').isVisible(),true);assert.equal(await page.evaluate(()=>window.mock.allowed),1);
await page.evaluate(async()=>{window.mock.session=null;await window.controller.check()});await page.getByRole('button',{name:'ESQUECI MINHA SENHA'}).click();await page.locator('input[name=cpf]').fill('52998224725');await page.locator('input[name=contact]').fill('34999998888');await page.getByRole('button',{name:'ENVIAR LINK DE RECUPERAÇÃO'}).click();assert.equal(await page.evaluate(()=>window.mock.calls.at(-1).name),'recover-password-email');assert.equal(await page.url(),'https://example.invalid/');await page.close();
});
test('Recuperação exige salvar senha antes de mostrar dados e aceita sete números',async()=>{
const page=await setup('fiscal',{session:{user:{id:'user'}},status:{allowed:true,status:'APROVADO',isAdmin:true},recovery:true});await page.getByRole('heading',{name:'Criar nova senha'}).waitFor();assert.equal(await page.locator('#protected').isVisible(),false);await page.locator('input[name=password]').fill('1234567');await page.locator('input[name=confirm]').fill('1234567');await page.getByRole('button',{name:'SALVAR NOVA SENHA'}).click();await page.getByRole('heading',{name:'Entrar com CPF'}).waitFor();assert.equal(await page.evaluate(()=>window.mock.allowed),0);assert.equal(await page.locator('#protected').isVisible(),false);await page.close();
});
test('Admin recebe aviso e vê dados da análise; aprovação Fiscal inclui unidade',async()=>{
const page=await setup('fiscal',{session:{user:{id:'admin'}},status:{allowed:true,status:'APROVADO',isAdmin:true,changing:false}});await page.getByRole('button',{name:'CADASTROS • 1 AGUARDANDO ANÁLISE'}).waitFor();await page.getByRole('button',{name:'CADASTROS • 1 AGUARDANDO ANÁLISE'}).click();await page.getByRole('heading',{name:'Cadastros aguardando análise'}).waitFor();await page.locator('.fa-unit').selectOption('unit1');await page.getByRole('button',{name:'APROVAR ACESSO'}).click();assert.equal(await page.evaluate(()=>window.mock.calls.some(x=>x.body.action==='REVIEW'&&x.body.unit==='unit1'&&x.body.decision==='APROVADO')),true);await page.close();
});

