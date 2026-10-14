import crypto from 'node:crypto';
import https from 'node:https';
import {boletoCode} from './supabase/functions/gmail-central/intake.mjs';

export const BANK_URL='https://api.gateway.itau.com.br/cash_management/v2/boletos';
const SUPABASE_URL='https://gtwecfyffjszghnvtlzr.supabase.co';
const PUBLIC_KEY='sb_publishable_RP8g0VoZdWh8e9R7Nb9mYw_GSXjSuD3';
export const error=(message,status=400,code='BILLING_VALIDATION')=>Object.assign(new Error(message),{publicMessage:message,status,code});
const digits=x=>String(x??'').replace(/\D/g,'');
const text=(x,max)=>String(x??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9 ]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const cents=x=>{const n=Number(x);if(!Number.isFinite(n)||n<=0||Math.abs(n*100-Math.round(n*100))>0.000001)throw error('Valor do boleto inválido.');return Math.round(n*100);};
export const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function validDocument(value){
 const d=digits(value);if(![11,14].includes(d.length)||/^(.)\1+$/.test(d))return false;
 const calc=(s,w)=>{const n=[...s].reduce((a,c,i)=>a+Number(c)*w[i],0)%11;return n<2?0:11-n;};
 const weights=d.length===11?[[10,9,8,7,6,5,4,3,2],[11,10,9,8,7,6,5,4,3,2]]:[[5,4,3,2,9,8,7,6,5,4,3,2],[6,5,4,3,2,9,8,7,6,5,4,3,2]];
 return calc(d.slice(0,-2),weights[0])===Number(d.at(-2))&&calc(d.slice(0,-1),weights[1])===Number(d.at(-1));
}
function date(value){const d=String(value||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||!Number.isFinite(Date.parse(d+'T12:00:00Z'))||new Date(d+'T12:00:00Z').toISOString().slice(0,10)!==d)throw error('Data de vencimento inválida.');return d;}
const percent=n=>{n=Number(n);if(!Number.isFinite(n)||n<0||n>99.99)throw error('Juros ou multa inválidos.');return String(Math.round(n*100000)).padStart(12,'0');};
export function sourceBill(state,id){
 const bill=(state.boletosClientes||[]).find(b=>b.id===id);
 if(!bill)throw error('Prepare e salve os títulos da venda antes de validar no Itaú.');
 const source=bill.canal==='VENDA BALCÃO'?'vendasBalcao':'vendas';
 const sales=(state[source]||[]).filter(v=>(bill.vendaIds||[bill.vendaId]).includes(v.id)||v.id===bill.vendaId||(v.grupoPedidoId&&v.grupoPedidoId===bill.vendaId));
 if(!sales.length||sales.some(v=>v.status==='CANCELADA')||(source==='vendasBalcao'&&sales.some(v=>v.status!=='CONCLUÍDA')))throw error('Venda inválida ou não concluída.');
 const clientId=bill.clienteId||sales[0].clienteId;
 if(sales.some(v=>v.clienteId!==clientId))throw error('Os itens da venda não pertencem ao mesmo cliente.');
 const customer=(state.clientes||[]).find(c=>c.id===clientId);if(!customer)throw error('Cliente da venda não localizado.');
 const total=sales.reduce((a,v)=>a+cents(v.totalGeral||v.totalVenda||v.total||v.valorTotal||v.valor||Number(v.qtd||0)*Number(v.precoUnitario||0)),0);
 const titles=(state.boletosClientes||[]).filter(b=>b.vendaId===bill.vendaId&&b.status!=='CANCELADO');
 if(titles.reduce((a,b)=>a+cents(b.valor),0)!==total)throw error('A soma das parcelas precisa corresponder ao total da venda.');
 if(!Number.isInteger(Number(bill.parcela))||bill.parcela<1||bill.parcela>36)throw error('Parcela inválida.');
 return {bill,customer};
}
export function buildPayload(bill,customer,ourNumber,mode='validacao'){
 if(!['validacao','efetivacao'].includes(mode))throw error('Etapa de cobrança inválida.');
 const document=digits(customer.documento||customer.cnpj||customer.cpf);
 if(!validDocument(document))throw error('Confira o CPF/CNPJ do cliente antes de emitir.');
 const name=text(customer.razaoSocial||customer.nome,50);
 const address={nome_logradouro:text(customer.endereco||customer.logradouro,100),nome_bairro:text(customer.bairro,15),nome_cidade:text(customer.cidade,20),sigla_UF:text(customer.uf,2),numero_CEP:digits(customer.cep)};
 if(!name||!address.nome_logradouro||!address.nome_bairro||!address.nome_cidade||!['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].includes(address.sigla_UF)||address.numero_CEP.length!==8)throw error('Complete nome, endereço, bairro, cidade, UF e CEP do cliente.');
 if(!/^\d{8}$/.test(String(ourNumber)))throw error('Nosso número inválido.');
 const due=date(bill.vencimento);if(due<today())throw error('Informe um vencimento a partir de hoje.');
 const pessoa={nome_pessoa:name,tipo_pessoa:{codigo_tipo_pessoa:document.length===14?'J':'F',[document.length===14?'numero_cadastro_nacional_pessoa_juridica':'numero_cadastro_pessoa_fisica']:document}};
 const juros=Number(bill.jurosMes||0),multa=Number(bill.multa||0);percent(juros);percent(multa);
 return {etapa_processo_boleto:mode,codigo_canal_operacao:'API',beneficiario:{id_beneficiario:'434300988616'},dado_boleto:{descricao_instrumento_cobranca:'boleto',tipo_boleto:'a vista',forma_envio:'impressao',codigo_carteira:'109',codigo_tipo_vencimento:3,codigo_especie:'01',codigo_aceite:'N',data_emissao:today(),pagamento_parcial:false,pagador:{pessoa,endereco:address},dados_individuais_boleto:[{numero_nosso_numero:String(ourNumber),data_vencimento:due,valor_titulo:(cents(bill.valor)/100).toFixed(2),texto_seu_numero:text(bill.numeroVenda,10),texto_uso_beneficiario:text(bill.id,25)}],juros:juros?{codigo_tipo_juros:'90',quantidade_dias_juros:1,percentual_juros:percent(juros)}:{codigo_tipo_juros:'05'},multa:multa?{codigo_tipo_multa:'02',quantidade_dias_multa:1,percentual_multa:percent(multa)}:{codigo_tipo_multa:'03'},recebimento_divergente:{codigo_tipo_autorizacao:1}}};
}
export function normalizeReceipt(body,payload){
 const data=body?.data,individual=data?.dado_boleto?.dados_individuais_boleto;
 if(!data||!Array.isArray(individual)||individual.length!==1)throw error('Retorno do banco incompleto. Consulte a cobrança antes de repetir.',502,'BANK_RESULT_UNKNOWN');
 const b=individual[0],expected=payload.dado_boleto.dados_individuais_boleto[0],parsed=boletoCode(b.numero_linha_digitavel);
 if(!parsed.valid||parsed.bank!=='341'||parsed.barcode!==digits(b.codigo_barras)||parsed.amount_cents!==cents(expected.valor_titulo)||digits(b.numero_nosso_numero).padStart(8,'0')!==expected.numero_nosso_numero||b.data_vencimento!==expected.data_vencimento||data.etapa_processo_boleto?.toLowerCase()!==payload.etapa_processo_boleto||data.beneficiario?.id_beneficiario!==payload.beneficiario.id_beneficiario||data.dado_boleto.codigo_carteira!=='109')throw error('Retorno do Itaú divergente do título. Consulte a cobrança antes de repetir.',502,'BANK_RESULT_UNKNOWN');
 if(payload.etapa_processo_boleto==='efetivacao'&&!data.id_boleto)throw error('Itaú não confirmou o identificador da cobrança.',502,'BANK_RESULT_UNKNOWN');
 return {idCobranca:data.id_boleto||null,nossoNumero:expected.numero_nosso_numero,linhaDigitavel:parsed.line,codigoBarras:parsed.barcode,valor:Number(expected.valor_titulo),vencimento:expected.data_vencimento,carteira:'109',etapa:payload.etapa_processo_boleto,status:payload.etapa_processo_boleto==='efetivacao'?'REGISTRADO':'VALIDADO — SEM REGISTRO',confirmadoEm:new Date().toISOString()};
}
export function bankRequest(payload,accessToken,config=process.env){return new Promise((resolve,reject)=>{
 const body=JSON.stringify(payload),correlationId=crypto.randomUUID();
 const r=https.request(BANK_URL,{method:'POST',cert:config.ITAU_CERTIFICATE?.replaceAll('\\n','\n'),key:config.ITAU_PRIVATE_KEY?.replaceAll('\\n','\n'),minVersion:'TLSv1.2',headers:{Authorization:'Bearer '+accessToken,'x-itau-apikey':config.ITAU_CLIENT_ID?.trim(),'x-itau-correlationID':correlationId,'x-itau-flowID':crypto.randomUUID(),'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},response=>{
  let raw='';response.setEncoding('utf8');response.on('data',chunk=>{raw+=chunk;if(raw.length>1000000)response.destroy(error('Retorno do banco excedeu o limite.',502,'BANK_RESULT_UNKNOWN'));});response.on('error',reject);
  response.on('end',()=>{
   if(![200,201].includes(response.statusCode)){
    let fields=[];
    try{const detail=JSON.parse(raw);fields=(detail.campos||detail.errors||detail.erros||detail.data?.campos||[]).map(x=>x.campo||x.field||x.path).filter(x=>typeof x==='string'&&/^[A-Za-z_][A-Za-z0-9_.\[\]]{0,100}$/.test(x)).slice(0,10);}catch{}
    // Expose field names only, never bank-returned values, documents or credentials.
    return reject(error(`Itaú retornou HTTP ${response.statusCode}${fields.length?'; campos: '+fields.join(', '):''}. Confira os dados e consulte a cobrança antes de repetir.`,502,'BANK_RESULT_UNKNOWN'));
   }
   try{resolve({...normalizeReceipt(JSON.parse(raw),payload),correlationId});}catch(e){reject(e.publicMessage?e:error('Retorno do banco ilegível; consulte antes de repetir.',502,'BANK_RESULT_UNKNOWN'));}
  });
 });r.setTimeout(25000,()=>r.destroy(error('Itaú não respondeu. Consulte a cobrança antes de repetir.',504,'BANK_RESULT_UNKNOWN')));r.on('error',reject);r.end(body);
});}
export function allowProfile(p){return p?.ativo===true&&p.status_aprovacao==='APROVADO'&&!p.trocar_senha&&(['MASTER','ADMINISTRADOR'].includes(p.perfil)||(['OPERADOR_GERAL','VENDEDOR_INTERNO'].includes(p.perfil)&&(p.permissoes?.['COBRANÇAS ITAÚ']?.editar===true)));}
export async function collectionsRequest(req,input,requestToken){
 const authorization=String(req.headers.authorization||'');if(!/^Bearer [A-Za-z0-9._-]+$/.test(authorization))throw error('Entre no Forte Vendas.',401,'AUTH_REQUIRED');
 const headers={apikey:PUBLIC_KEY,Authorization:authorization,'Content-Type':'application/json'};
 async function cloud(route,body){const r=await fetch(SUPABASE_URL+route,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});if(!r.ok)throw error('Não foi possível confirmar os dados da cobrança no servidor.',r.status===401?401:409,'BILLING_STATE');return r.json();}
 const user=await cloud('/auth/v1/user');if(!user.id)throw error('Sessão inválida.',401,'AUTH_REQUIRED');
 const profiles=await cloud('/rest/v1/fc_perfis?select=*&user_id=eq.'+encodeURIComponent(user.id));const profile=profiles[0];if(!allowProfile(profile))throw error('Seu perfil não tem permissão de emissão Itaú.',403,'BILLING_FORBIDDEN');
 // An isolated validation fixture never creates a sale, a title or a number reservation.
 // Its bank stage, amount and payer are server-controlled, regardless of client input.
 if(input.action==='TEST_VALIDATE'){
  const bill={id:'TESTE-INTEGRACAO',numeroVenda:'TESTE',valor:10,vencimento:today(),jurosMes:0,multa:0};
  const customer={nome:'SECULUS CONSTRUTORA LTDA',documento:'03698525000130',endereco:'RUA ARTHUR BERNARDES 455',bairro:'CENTRO',cidade:'COROMANDEL',uf:'MG',cep:'38550026'};
  const payload=buildPayload(bill,customer,'00000001','validacao');
  const token=await requestToken();
  return {ok:true,registered:false,test:true,receipt:await bankRequest(payload,token.access_token)};
 }
 if(!['VALIDATE','REGISTER','STATUS'].includes(input.action)||typeof input.boletoId!=='string'||input.boletoId.length>100)throw error('Operação de cobrança inválida.');
 if(input.action==='STATUS')return cloud('/rest/v1/fc_itau_ledger?select=receipt,status,boleto_id&boleto_id=eq.'+encodeURIComponent(input.boletoId)+'&empresa_id=eq.'+profile.empresa_id);
 const rows=await cloud('/rest/v1/fc_app_state?select=estado,versao&empresa_id=eq.'+profile.empresa_id);if(!rows[0]?.estado)throw error('Atualize a base antes de emitir.');
 const {bill,customer}=sourceBill(rows[0].estado,input.boletoId);
 // The validation route cannot be turned into registration by a client-supplied payload.
 if(input.action==='VALIDATE'){
  const payload=buildPayload(bill,customer,'00000001');const token=await requestToken();return {ok:true,registered:false,receipt:await bankRequest(payload,token.access_token)};
 }
 if(process.env.ITAU_EMISSION_ENABLED!=='true')throw error('Emissão definitiva ainda não liberada. Primeiro conclua o teste de validação e a conferência da numeração.',409,'EMISSION_NOT_ENABLED');
 // Validate all fields before reserving a durable, globally unique number.
 buildPayload(bill,customer,'00000001','efetivacao');
 const reservation=await cloud('/rest/v1/rpc/fc_itau_reserve',{p_boleto_id:bill.id,p_versao:rows[0].versao});
 if(!reservation.new)return {ok:true,registered:reservation.status==='REGISTRADO',receipt:reservation.receipt,pending:reservation.status!=='REGISTRADO'};
 const payload=buildPayload(reservation.boleto,customer,reservation.nosso_numero,'efetivacao');
 let receipt;
 try{const token=await requestToken();receipt=await bankRequest(payload,token.access_token);}catch(e){
  // A failed/unknown transport is never retried: the persistent reservation survives restarts.
  try{await cloud('/rest/v1/rpc/fc_itau_complete',{p_id:reservation.id,p_key:process.env.ITAU_SETUP_KEY,p_receipt:null});}catch{}
  throw e.publicMessage?e:error('Resultado bancário desconhecido. Consulte antes de repetir.',502,'BANK_RESULT_UNKNOWN');
 }
 try{await cloud('/rest/v1/rpc/fc_itau_complete',{p_id:reservation.id,p_key:process.env.ITAU_SETUP_KEY,p_receipt:receipt});}catch{throw error('Banco confirmou a cobrança, mas a gravação ficou pendente. Não emita novamente; confira a reserva.',409,'BANK_PERSISTENCE_PENDING');}
 return {ok:true,registered:true,receipt};
}
