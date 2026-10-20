import {requireCapacity} from './capacity.mjs';
import {phone} from './communications.mjs';
export function driverOrderSnapshot(c){return {id:c.id,codigo:c.codigo,numeroPedidoFornecedor:c.numeroPedidoFornecedor,fornecedor:c.fornecedor,unidade:c.unidade,origem:c.localCarregamento||c.origem,destino:c.destino,dataCarregamento:c.dataCarregamento,motoristaId:c.motoristaId,motorista:c.motorista,placas:c.placas,pesoKg:c.pesoKg,regraPallets:c.regraPallets,palletQuantidade:c.palletQuantidade,justificativaPallets:c.justificativaPallets,liberacaoPalletsFornecedor:c.liberacaoPalletsFornecedor,motoristaSnapshot:Object.fromEntries(['cpf','cnhNumero','rntrc'].map(k=>[k,c.motoristaSnapshot?.[k]])),itens:(c.itens||[]).map(i=>({produto:i.produto,qtd:i.qtd,pesoKg:i.pesoKg}))};}
export function driverDispatchCheck(s,j){
 const c=(s.cargas||[]).find(c=>c.id===j.cargaId),m=(s.motoristas||[]).find(m=>m.id===c?.motoristaId&&m.ativo!==false);
 if(!c||c.status==='CANCELADA'||c.finalizadaEm||!c.ordemRevisadaEm||!c.numeroPedidoFornecedor)throw Error('Ordem indisponível. Confira e grave a ordem antes de enviar.');
 if(!m||/PENDENTE|ANALISE|ANÁLISE|RECUSADO|CONFERENCIA|AGUARDANDO|PRE_CADASTRO|REPROVADO|INATIVO/.test(String(m.statusCadastro||'').toUpperCase()))throw Error('Motorista aguarda aprovação.');
 if(String(c.regraPallets||'').startsWith('Solicitar')&&!c.liberacaoPalletsFornecedor?.evidencia)throw Error('Liberação de pallets pendente.');
 requireCapacity(m,c.pesoKg,c.confirmacaoCapacidade?.snapshot);
 if(j.snapshot!==JSON.stringify(driverOrderSnapshot(c))||j.to!==phone(m.whatsapp||m.telefone)||JSON.stringify(c.placas)!==JSON.stringify([m.placa1,m.placa2,m.placa3,m.placa4].filter(Boolean)))throw Error('Ordem, motorista ou WhatsApp alterado. Prepare novamente o envio.');
 return c;
}
export function queueDriverOrder(s,c,at,event){
 const m=(s.motoristas||[]).find(m=>m.id===c.motoristaId),to=phone(m?.whatsapp||m?.telefone);if(!to)throw Error('Cadastre o WhatsApp do motorista com DDD.');
 const order=driverOrderSnapshot(c),snapshot=JSON.stringify(order);s.comunicacoes??=[];
 const prior=s.comunicacoes.find(j=>j.audience==='MOTORISTA'&&j.cargaId===c.id&&j.snapshot===snapshot&&j.to===to&&j.state!=='CANCELLED');if(prior){driverDispatchCheck(s,prior);return prior;}
 const key=c.id+':ORDEM_MOTORISTA:'+event;
 const j={id:key,key,kind:'ORDEM_MOTORISTA',audience:'MOTORISTA',canal:'WHATSAPP',to,motoristaId:c.motoristaId,cargaId:c.id,reference:c.numeroPedidoFornecedor,snapshot,order,items:order.itens,message:'FORTE ATACAREJO — Ordem de carregamento. Pedido do fornecedor '+c.numeroPedidoFornecedor+'. Retirada: '+order.origem+'. Destino: '+c.destino+'. Placas: '+c.placas.join(' / ')+'.',state:'QUEUED',createdAt:at};driverDispatchCheck(s,j);s.comunicacoes.push(j);return j;
}
export function recordDriverDispatch(s,j,at){if(j.audience!=='MOTORISTA')return;const c=driverDispatchCheck(s,j);Object.assign(c,{ordemMotoristaEnviada:true,ordemEnviadaEm:at,ordemCanal:'WHATSAPP BUSINESS',ordemDestinatario:j.to,ordemMensagemId:j.providerId,fase:'ORDEM ENVIADA — AGUARDANDO ENTREGA WHATSAPP'});}
