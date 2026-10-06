import {test,expect} from '@playwright/test';
const user={id:'11111111-1111-4111-8111-111111111111',aud:'authenticated',role:'authenticated',email:'fixture@example.invalid',app_metadata:{},user_metadata:{},created_at:'2026-10-01T00:00:00Z'};
const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const token=()=>`${encode({alg:'HS256',typ:'JWT'})}.${encode({sub:user.id,aud:'authenticated',role:'authenticated',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600})}.Zml4dHVyZS1zaWduYXR1cmU`;
test('Carga Direta: venda e compra com cadastros simulados e contatos preenchidos',async({page},info)=>{
 const calls=[];const data={cargas:[],compras:[],vendas:[],motoristas:[],fretes:[],motoristasDisponiveis:[],clientes:[{id:'c',nome:'Razão Social de Teste',nomeFantasia:'Loja de Teste',email:'cliente@example.invalid',whatsapp:'34999999999',endereco:'Rua de Teste',vendedorResponsavelId:'v',condicaoPagamento:'14 DIAS'}],fornecedores:[{id:'f',nome:'Fornecedor de Teste',email:'fornecedor@example.invalid',whatsapp:'34988888888',origem:'Arcos',condicaoPagamento:'14 DIAS'}],produtos:[{id:'p',nome:'Cimento de Teste',pesoKg:50,precoTabela:30}],vendedores:[{id:'v',nome:'Vendedor de Teste'}],locais:[{id:'l',nome:'Arcos'}],destinos:[{id:'d',nome:'Galpão de Teste'}],condicoesPagamento:['14 DIAS'],precosClientes:[{clienteId:'c',produtoId:'p',precoFinal:28}],custosFornecedor:[{id:'cf',fornecedorId:'f',produtoId:'p',condicaoPagamento:'14 DIAS',custoUnitario:22}]};
 await page.route('https://*.supabase.co/**',async route=>{
  const p=new URL(route.request().url()).pathname,b=route.request().postDataJSON?.()||{};
  const reply=json=>route.fulfill({json,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'}});
  if(route.request().method()==='OPTIONS')return reply({});
  if(p.endsWith('/auth/v1/user'))return reply(user);
  if(p.endsWith('/access-standard'))return reply(b.action==='LOGIN'?{access_token:token(),refresh_token:'fixture-refresh'}:{allowed:true,status:'APROVADO',cpf:'52998224725',isAdmin:false});
  if(p.endsWith('/mobile-carga-direta')){
   calls.push(b);
   if(b.acao==='LISTAR')return reply(data);
   if(b.acao==='CRIAR_VENDA'){data.vendas.push({id:'s',numeroVenda:'VENDA-TESTE',...b,cliente:'Loja de Teste',produto:'Cimento de Teste',status:'PENDENTE'});return reply({id:'s'});}
   if(b.acao==='CRIAR_PEDIDO'){data.compras.push({id:'b',numero:'COMPRA-TESTE',...b,fornecedor:'Fornecedor de Teste',produto:'Cimento de Teste',totalCompra:Number(b.qtd)*Number(b.precoCompra),status:'AGUARDANDO ENVIO'});return reply({id:'b'});}
   return route.fulfill({status:400,json:{error:'Ação não prevista no teste'}});
  }
  if(p.endsWith('/forte-notifications'))return reply({count:0,items:[]});
  return route.fulfill({status:400,json:{error:'Requisição bloqueada pelo ambiente de teste'}});
 });
 await page.goto('https://forte-carga-direta.onrender.com/');
 const gate=page.locator('.forte-access');await gate.locator('input[name="cpf"]').fill('52998224725');await gate.locator('input[name="password"]').fill('123456');await gate.getByRole('button',{name:'ENTRAR',exact:true}).click();
 await expect(page.getByRole('heading',{name:'PEDIDO DE VENDA AO CLIENTE'})).toBeVisible();
 await page.getByLabel(/^CLIENTE — NOME FANTASIA/).selectOption('c');await page.getByLabel(/^PRODUTO/).selectOption('p');
 await expect(page.getByLabel(/^VENDEDOR RESPONSÁVEL/)).toHaveValue('v');await expect(page.getByLabel(/^E-MAIL DO CLIENTE/)).toHaveValue('cliente@example.invalid');await expect(page.getByLabel(/^WHATSAPP DO CLIENTE/)).toHaveValue('34999999999');await expect(page.getByLabel(/^PREÇO DE VENDA UNITÁRIO/)).toHaveValue('28');
 await page.getByLabel(/^QUANTIDADE$/).fill('800');await page.getByLabel(/^FORMA DE PAGAMENTO/).selectOption('BOLETO');await page.getByLabel(/^PALLETS$/).selectOption('SEM PALLETS');
 await expect(page.locator('body')).toContainText('5.600,00');await page.getByRole('button',{name:'SALVAR PEDIDO DE VENDA',exact:true}).click();await expect(page.getByRole('status')).toContainText('Pedido de venda salvo');
 expect(calls.find(x=>x.acao==='CRIAR_VENDA')).toMatchObject({clienteId:'c',email:'cliente@example.invalid',whatsapp:'34999999999',fretePorTon:'140',formaPagamento:'BOLETO'});
 await page.getByRole('button',{name:'COMPRA AO FORNECEDOR',exact:true}).click();await page.getByLabel(/^FORNECEDOR$/).selectOption('f');await page.getByLabel(/^PRODUTO/).selectOption('p');await page.getByLabel(/^QUANTIDADE$/).fill('800');
 await expect(page.getByLabel(/^PREÇO DE COMPRA UNITÁRIO/)).toHaveValue('22');await expect(page.getByLabel(/^E-MAIL PARA PEDIDOS/)).toHaveValue('fornecedor@example.invalid');await expect(page.getByLabel(/^WHATSAPP DO FORNECEDOR/)).toHaveValue('34988888888');
 await page.getByLabel(/^DESTINO \/ LOCAL DE ENTREGA/).selectOption('Galpão de Teste');await page.getByLabel(/^PALLETS$/).selectOption('SEM PALLETS');await page.getByRole('button',{name:'SALVAR PEDIDO DE COMPRA',exact:true}).click();await expect(page.getByRole('status')).toContainText('Pedido salvo');
 expect(calls.find(x=>x.acao==='CRIAR_PEDIDO')).toMatchObject({fornecedorId:'f',email:'fornecedor@example.invalid',whatsapp:'34988888888',precoCompra:'22'});
 await expect(page.getByRole('link',{name:'ABRIR WHATSAPP'})).toHaveAttribute('href',/^https:\/\/wa.me\/5534988888888\?text=/);await expect(page.getByRole('link',{name:'ABRIR E-MAIL'})).toHaveAttribute('href',/^mailto:fornecedor@example.invalid\?/);
 await info.attach('compra-com-contatos',{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
});
