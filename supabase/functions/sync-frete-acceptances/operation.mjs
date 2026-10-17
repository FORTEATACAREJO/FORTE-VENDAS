// External records stay separate from local identities and never grant access.
export function mergeOperation(state,snapshot){
 if(!Array.isArray(snapshot.cargas)||!Array.isArray(snapshot.viagens)||!Array.isArray(snapshot.usuarios))throw Error('Operação incompleta. Dados anteriores preservados.');
 const previous=state.freteOperacao;
 if(previous&&JSON.stringify({...previous,consultadoEm:null})===JSON.stringify({...snapshot,consultadoEm:null}))snapshot=previous;
 return {...state,freteOperacao:snapshot,cargas:(state.cargas||[]).map(c=>{
  const matches=snapshot.viagens.filter(t=>t.numero_pedido_fornecedor&&t.numero_pedido_fornecedor===c.numeroPedidoFornecedor&&(state.motoristas||[]).some(m=>m.id===c.motoristaId&&m.freteMotoristaId===t.motorista_id&&m.freteVeiculoId===t.veiculo_id));
  const trip=matches.find(t=>t.id===c.freteViagemId)||(matches.length===1?matches[0]:null);
  return trip?{...c,freteViagemId:trip.id,freteCargaId:trip.carga_id,freteAndamento:trip.status,fretePagamentoStatus:trip.pagamento_status}:c.freteViagemId?{...c,freteViagemId:null,freteCargaId:null,freteAndamento:null,fretePagamentoStatus:null}:c;
 })};
}
export function paymentCandidates(state){
 return (state.cargas||[]).filter(c=>c.status!=='CANCELADA'&&c.modalidadeFrete!=='CIF'&&c.numeroPedidoFornecedor&&c.motoristaId).flatMap(c=>{
 const doc=(state.documentos||[]).find(d=>d.cargaId===c.id&&d.categoria==='COMPROVANTE FRETE'&&d.validationStatus==='VALIDADO'&&d.validadoFinanceiroPor&&d.storagePath);
 return doc&&doc.hash&&c.freteComprovanteHash!==doc.hash?[{cargaId:c.id,hash:doc.hash}]:[];
 });
}
