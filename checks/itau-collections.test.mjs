import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import {EventEmitter} from 'node:events';
import {buildPayload,sourceBill,validDocument,normalizeReceipt,collectionsRequest,bankRequest,allowProfile,today,BANK_URL} from '../itau-collections.mjs';
const customer={id:'c1',nome:'Cliente Teste',documento:'08777750000186',endereco:'Rua Um 10',bairro:'Centro',cidade:'Caldas Novas',uf:'GO',cep:'75690000'};
const bill={id:'b1',vendaId:'v1',clienteId:'c1',canal:'VENDA BALCÃO',numeroVenda:'VEN2026001',parcela:1,totalParcelas:1,valor:10,vencimento:today(),jurosMes:5,multa:2,status:'AGUARDANDO EMISSÃO API'};
const state={clientes:[customer],vendasBalcao:[{id:'v1',clienteId:'c1',status:'CONCLUÍDA',total:10}],boletosClientes:[bill]};
function fixture(payload){
 let bar='3419'+'0'+'1000'+'0000001000'+'1090000000100000000000000';
 assert.equal(bar.length,44);
 let sum=0,w=2;for(let i=43;i>=0;i--){if(i===4)continue;sum+=Number(bar[i])*w;w=w===9?2:w+1;}
 let dv=11-sum%11;if(dv>=10||dv===0)dv=1;bar=bar.slice(0,4)+dv+bar.slice(5);
 const mod10=s=>{let n=0,w=2;for(let i=s.length-1;i>=0;i--){let p=Number(s[i])*w;n+=Math.floor(p/10)+p%10;w=w===2?1:2;}return (10-n%10)%10;};
 const a=bar.slice(0,4)+bar.slice(19,24),b=bar.slice(24,34),c=bar.slice(34,44);
 const line=a+mod10(a)+b+mod10(b)+c+mod10(c)+bar[4]+bar.slice(5,19);
 return {data:{id_boleto:'bank1',etapa_processo_boleto:payload.etapa_processo_boleto,beneficiario:payload.beneficiario,dado_boleto:{codigo_carteira:'109',dados_individuais_boleto:[{...payload.dado_boleto.dados_individuais_boleto[0],codigo_barras:bar,numero_linha_digitavel:line}]}}};
}
test('payload usa contrato Itaú: carteira 109, valor em centavos com 17 dígitos e percentual de 12 dígitos; não envia Pix/protesto/negativação',()=>{
 const p=buildPayload(bill,customer,'00000001');assert.equal(p.etapa_processo_boleto,'validacao');assert.equal(p.beneficiario.id_beneficiario,'434300988616');assert.equal(p.dado_boleto.codigo_tipo_vencimento,3);assert.equal(p.dado_boleto.dados_individuais_boleto[0].valor_titulo,'00000000000001000');assert.equal(p.dado_boleto.juros.percentual_juros,'000000500000');assert.equal(p.dado_boleto.multa.percentual_multa,'000000200000');assert.doesNotMatch(JSON.stringify(p),/pix|protesto|negativacao/i);
});
test('dados incompletos, documento inválido, centavos inválidos, parcela e venda cancelada são bloqueados antes de consumir o banco',()=>{
 assert.equal(validDocument(customer.documento),true);assert.equal(validDocument('11111111111'),false);
 for(const c of [{...customer,cep:''},{...customer,uf:''},{...customer,documento:'12345678901'}])assert.throws(()=>buildPayload(bill,c,'00000001'));
 assert.throws(()=>buildPayload({...bill,valor:10.001},customer,'00000001'));
 assert.throws(()=>sourceBill({...state,vendasBalcao:[{...state.vendasBalcao[0],status:'CANCELADA'}]},'b1'));
 assert.throws(()=>sourceBill({...state,boletosClientes:[{...bill,valor:9}]},'b1'));
});
test('retorno somente é confirmado com linha válida, barcode, valor, vencimento, carteira e beneficiário correspondentes',()=>{
 const p=buildPayload(bill,customer,'00000001'),r=fixture(p);assert.equal(normalizeReceipt(r,p).status,'VALIDADO — SEM REGISTRO');
 for(const change of [x=>x.data.beneficiario={id_beneficiario:'another'},x=>x.data.etapa_processo_boleto='efetivacao',x=>x.data.dado_boleto.codigo_carteira='157',x=>x.data.dado_boleto.dados_individuais_boleto[0].codigo_barras='1'.repeat(44),x=>x.data.dado_boleto.dados_individuais_boleto[0].data_vencimento='2000-01-01']){const x=structuredClone(r);change(x);assert.throws(()=>normalizeReceipt(x,p));}
 const effective=buildPayload(bill,customer,'00000001','efetivacao');assert.equal(normalizeReceipt(fixture(effective),effective).status,'REGISTRADO');
});
test('requisição bancária usa mTLS, bearer e Client ID no gateway oficial sem seguir redirecionamentos',async()=>{
 const old=https.request,p=buildPayload(bill,customer,'00000001');
 https.request=(url,options,callback)=>{assert.equal(url,BANK_URL);assert.equal(options.cert,'CERT');assert.equal(options.key,'KEY');assert.equal(options.headers['x-itau-apikey'],'CLIENT');assert.equal(options.headers.Authorization,'Bearer ACCESS');const req=new EventEmitter();req.setTimeout=()=>{};req.end=body=>{assert.deepEqual(JSON.parse(body),{data:p});const res=new EventEmitter();res.statusCode=200;res.setEncoding=()=>{};callback(res);queueMicrotask(()=>{res.emit('data',JSON.stringify(fixture(p)));res.emit('end');});};return req;};
 try{assert.equal((await bankRequest(p,'ACCESS',{ITAU_CERTIFICATE:'CERT',ITAU_PRIVATE_KEY:'KEY',ITAU_CLIENT_ID:'CLIENT'})).etapa,'validacao');}finally{https.request=old;}
});
test('acesso exige sessão real e perfil aprovado; permissão financeira genérica não libera cobrança',async()=>{
 assert.equal(allowProfile({ativo:true,status_aprovacao:'APROVADO',perfil:'MASTER'}),true);
 assert.equal(allowProfile({ativo:true,status_aprovacao:'PENDENTE',perfil:'MASTER'}),false);
 assert.equal(allowProfile({ativo:true,status_aprovacao:'APROVADO',perfil:'MOTORISTA'}),false);
 assert.equal(allowProfile({ativo:true,status_aprovacao:'APROVADO',perfil:'OPERADOR_GERAL',permissoes:{financeiro:true}}),false);
 await assert.rejects(collectionsRequest({headers:{}},{action:'REGISTER',boletoId:'b1'},()=>{}),{code:'AUTH_REQUIRED'});
});
test('registro fica bloqueado por padrão e reserva já processada nunca chama o banco novamente',async()=>{
 const oldFetch=globalThis.fetch,oldEnabled=process.env.ITAU_EMISSION_ENABLED;let tokenCalls=0;
 globalThis.fetch=async(url,options)=>{let data;if(url.includes('/auth/v1/user'))data={id:'u1'};else if(url.includes('/fc_perfis'))data=[{ativo:true,status_aprovacao:'APROVADO',perfil:'MASTER',empresa_id:'e1'}];else if(url.includes('/fc_app_state'))data=[{estado:state,versao:1}];else if(url.includes('/fc_itau_reserve'))data={new:false,status:'PROCESSANDO'};else throw new Error('unexpected '+url);return {ok:true,json:async()=>data};};
 try{delete process.env.ITAU_EMISSION_ENABLED;await assert.rejects(collectionsRequest({headers:{authorization:'Bearer token'}},{action:'REGISTER',boletoId:'b1'},()=>{tokenCalls++;}),{code:'EMISSION_NOT_ENABLED'});process.env.ITAU_EMISSION_ENABLED='true';assert.equal((await collectionsRequest({headers:{authorization:'Bearer token'}},{action:'REGISTER',boletoId:'b1'},()=>{tokenCalls++;})).pending,true);assert.equal(tokenCalls,0);}finally{globalThis.fetch=oldFetch;if(oldEnabled===undefined)delete process.env.ITAU_EMISSION_ENABLED;else process.env.ITAU_EMISSION_ENABLED=oldEnabled;}
});
test('teste isolado exige autorização, força validação e não grava estado ou reserva numeração',async()=>{
 const oldFetch=globalThis.fetch,oldRequest=https.request;let calls=0;
 globalThis.fetch=async(url,options)=>{
  assert.equal(options.method,'GET');
  const data=url.includes('/auth/v1/user')?{id:'u1'}:url.includes('/fc_perfis')?[{ativo:true,status_aprovacao:'APROVADO',perfil:'MASTER',empresa_id:'e1'}]:assert.fail('Teste não pode consultar ou alterar vendas');
  return {ok:true,json:async()=>data};
 };
 https.request=(url,options,callback)=>{assert.equal(url,BANK_URL);const req=new EventEmitter();req.setTimeout=()=>{};req.end=body=>{
  const envelope=JSON.parse(body);assert.deepEqual(Object.keys(envelope),['data']);const payload=envelope.data;calls++;assert.equal(payload.etapa_processo_boleto,'validacao');assert.equal(payload.dado_boleto.codigo_carteira,'109');assert.equal(payload.dado_boleto.dados_individuais_boleto[0].valor_titulo,'00000000000001000');
  const res=new EventEmitter();res.statusCode=200;res.setEncoding=()=>{};callback(res);queueMicrotask(()=>{res.emit('data',JSON.stringify(fixture(payload)));res.emit('end');});
 };return req;};
 try{
  await assert.rejects(collectionsRequest({headers:{}},{action:'TEST_VALIDATE'},()=>{}),{code:'AUTH_REQUIRED'});
  const result=await collectionsRequest({headers:{authorization:'Bearer token'}},{action:'TEST_VALIDATE',etapa:'efetivacao',valor:99999},async()=>({access_token:'TEST'}));
  assert.equal(result.test,true);assert.equal(result.registered,false);assert.equal(result.receipt.etapa,'validacao');assert.equal(calls,1);
 }finally{globalThis.fetch=oldFetch;https.request=oldRequest;}
});
test('recusa bancária informa campos sem expor valores ou mensagens sensíveis',async()=>{
 const old=https.request,p=buildPayload(bill,customer,'00000001');
 https.request=(url,options,callback)=>{const req=new EventEmitter();req.setTimeout=()=>{};req.end=()=>{const res=new EventEmitter();res.statusCode=400;res.setEncoding=()=>{};callback(res);queueMicrotask(()=>{res.emit('data',JSON.stringify({mensagem:'SECRET-TOKEN',campos:[{campo:'dado_boleto.valor',valor:'PRIVATE-DOCUMENT'},{campo:'malicious SECRET-TOKEN'}]}));res.emit('end');});};return req;};
 try{await assert.rejects(bankRequest(p,'ACCESS',{}),e=>{assert.match(e.publicMessage,/dado_boleto.valor/);assert.doesNotMatch(e.publicMessage,/SECRET|PRIVATE|malicious/);return true;});}finally{https.request=old;}
});
