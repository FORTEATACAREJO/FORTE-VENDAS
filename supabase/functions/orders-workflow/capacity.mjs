import {purchaseSnapshot} from './communications.mjs';
// The acknowledgement belongs to one driver, vehicle, weight and current capacity.
export function capacityCheck(driver, weight) {
 const kg=Number(weight),max=Number(driver?.capacidadeMaximaKg||driver?.capacidadeAlvoKg);
 if(!driver)throw Error('Selecione o motorista/conjunto antes de enviar.');
 if(!Number.isFinite(max)||max<=0)throw Error('Cadastre a capacidade do conjunto.');
 if(!Number.isFinite(kg)||kg<=0)throw Error('Confira o peso da carga.');
 if(kg>max)throw Error('Peso acima da capacidade do conjunto. Reduza a quantidade ou selecione outro conjunto.');
 const snapshot=JSON.stringify([driver.id,driver.freteVeiculoId||'',[driver.placa1,driver.placa2||'',driver.placa3||'',driver.placa4||''],max,kg]);
 return {weight:kg,max,remaining:max-kg,underfilled:kg<max,snapshot};
}
export function requireCapacity(driver,weight,confirmation) {
 const check=capacityCheck(driver,weight);
 if(check.underfilled&&confirmation!==check.snapshot)throw Error('A capacidade do conjunto não está completamente utilizada. Confirme Sim ou Não para continuar.');
 return check;
}
export function capacityMessage(check) {
 const kg=n=>n.toLocaleString('pt-BR')+' kg';
 return `A capacidade do conjunto não está completamente utilizada. Carga: ${kg(check.weight)}. Capacidade: ${kg(check.max)}. Faltam ${kg(check.remaining)} para completar. Deseja continuar?`;
}
export function workflowCapacityCheck(state,body) {
 let driverId=body.motoristaId,weight;
 const orders=state.comprasFornecedor||[],loads=state.cargas||[];
 if(['SUPPLIER_SEND','SUPPLIER_RECEIPT','SUPPLIER_EXTERNAL_SEND'].includes(body.action)){
  const order=orders.find(o=>o.id===body.id);if(!order)return null;
  driverId=order.motoristaId;weight=order.pesoKg;
 }else if(body.action==='LOAD_ASSIGN'){
  const load=loads.find(c=>c.id===body.cargaId);if(!load)return null;weight=load.pesoKg;
 }else if(body.action==='LOAD_ADJUST'){
  const load=loads.find(c=>c.id===body.cargaId);if(!load)return null;
  driverId=load.motoristaId;
  weight=(body.itens||[]).reduce((sum,item)=>{const old=(load.itens||[]).find(i=>i.produtoId===item.produtoId);return sum+Number(item.qtd)*Number(old?.pesoKg)/Number(old?.qtd);},0);
 }else if(['SUPPLIER_CREATE','SUPPLIER_EDIT','LOADING_SAVE'].includes(body.action)){
  const existing=body.action==='LOADING_SAVE'?loads.find(c=>c.id===body.cargaId||c.status!=='CANCELADA'&&c.fornecedorId===body.fornecedorId&&body.numeroPedidoFornecedor&&String(c.numeroPedidoFornecedor).trim()===String(body.numeroPedidoFornecedor).trim()):null;
  weight=existing?existing.pesoKg:(body.itens||[]).reduce((sum,item)=>sum+Number(item.qtd)*Number((state.produtos||[]).find(p=>p.id===item.produtoId)?.pesoKg),0);
  if(!driverId&&body.action!=='LOADING_SAVE')return null;
 }else return null;
 return capacityCheck((state.motoristas||[]).find(m=>m.id===driverId),weight);
}
export function supplierDispatchCapacity(state,job) {
 const order=(state.comprasFornecedor||[]).find(o=>o.id===job.compraFornecedorId);
 if(!order||order.status==='CANCELADO')throw Error('Pedido indisponível.');
 const driver=(state.motoristas||[]).find(m=>m.id===order.motoristaId&&m.ativo!==false);
 const status=String(driver?.statusCadastro||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
 if(/PENDENTE|ANALISE|RECUSADO|CONFERENCIA|AGUARDANDO|PRE_CADASTRO|REPROVADO|INATIVO/.test(status))throw Error('Motorista aguarda aprovação.');
 const check=requireCapacity(driver,order.pesoKg,job.order?.confirmacaoCapacidade?.snapshot);
 if(job.snapshot!==purchaseSnapshot(order)||JSON.stringify(order.placas)!==JSON.stringify([driver.placa1,driver.placa2,driver.placa3,driver.placa4].filter(Boolean)))throw Error('Pedido/conjunto alterado após preparar envio. Confira e prepare o envio novamente.');
 return check;
}
