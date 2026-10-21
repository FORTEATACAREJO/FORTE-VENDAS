import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceBill,buildPayload,collectionsRequest,today} from '../itau-collections.mjs';
const customer={id:'c1',nome:'Cliente de teste',documento:'08777750000186',endereco:'Rua Um 10',bairro:'Centro',cidade:'Caldas Novas',uf:'GO',cep:'75690000'};
const bill={id:'avulso-1',origem:'AVULSO',canal:'BOLETO AVULSO',clienteId:'c1',motivo:'Acerto contratual',referencia:'ACERTO1',valor:123.45,vencimento:today(),jurosMes:0,multa:0,especieCodigo:'99',parcela:1,totalParcelas:1};
const state={clientes:[customer],boletosClientes:[bill],vendas:[],vendasBalcao:[]};
test('avulso sem venda usa carteira 109, espécie diversos e valor exato',()=>{
 const before=structuredClone(state),r=sourceBill(state,bill.id),p=buildPayload(r.bill,r.customer,'00000002');
 assert.equal(p.dado_boleto.codigo_carteira,'109');assert.equal(p.dado_boleto.codigo_especie,'99');assert.equal(p.dado_boleto.dados_individuais_boleto[0].valor_titulo,'00000000000012345');assert.equal(p.dado_boleto.dados_individuais_boleto[0].texto_seu_numero,'ACERTO1');assert.deepEqual(state,before);
});
test('avulso recusa cliente ausente, motivo vazio, venda disfarçada e valor inexato',()=>{
 for(const patch of [{clienteId:'other'},{motivo:''},{vendaId:'sale'},{vendaIds:['sale']},{especieCodigo:'01'},{parcela:2},{totalParcelas:2},{valor:-1},{valor:1.001},{status:'CANCELADO'}])assert.throws(()=>sourceBill({...state,boletosClientes:[{...bill,...patch}]},bill.id));
 assert.throws(()=>sourceBill({...state,boletosClientes:[{...bill,origem:'VENDA'}]},bill.id));
});
test('criação exige sessão e autorização financeira; só grava via RPC e não chama banco',async()=>{
 await assert.rejects(collectionsRequest({headers:{}},{action:'CREATE_STANDALONE'},()=>assert.fail('bank')),{code:'AUTH_REQUIRED'});
 const original=globalThis.fetch,calls=[];let allowed=true;
 globalThis.fetch=async(url,options)=>{
  calls.push({url,body:options.body&&JSON.parse(options.body)});
  const data=url.includes('/auth/v1/user')?{id:'user'}:url.includes('/fc_perfis')?[{ativo:true,status_aprovacao:'APROVADO',perfil:'MASTER',empresa_id:'company'}]:url.includes('/access_current_module')?{allowed,role:'MASTER'}:url.includes('/fc_app_state')?[{estado:state,versao:1}]:url.includes('/fc_itau_create_standalone')?{ok:true,boletoId:'avulso-1'}:assert.fail(url);
  return {ok:true,json:async()=>data};
 };
 const input={action:'CREATE_STANDALONE',requestId:'00000000-0000-4000-8000-000000000001',...bill};
 try{
  const r=await collectionsRequest({headers:{authorization:'Bearer token'}},input,()=>assert.fail('no bank call during preparation'));
  assert.equal(r.ok,true);assert.equal(calls.filter(x=>x.url.includes('fc_itau_create_standalone')).length,1);assert.equal(calls.at(-1).body.p_valor,123.45);
  allowed=false;await assert.rejects(collectionsRequest({headers:{authorization:'Bearer token'}},input,()=>{}),{code:'BILLING_FORBIDDEN'});
 }finally{globalThis.fetch=original;}
});
