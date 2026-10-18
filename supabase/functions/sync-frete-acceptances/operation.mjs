// External records stay separate from local identities and never grant access.
export function mergeOperation(state,snapshot){
 if(!Array.isArray(snapshot.cargas)||!Array.isArray(snapshot.viagens)||!Array.isArray(snapshot.usuarios))throw Error('Operação incompleta. Dados anteriores preservados.');
 const previous=state.freteOperacao;
 if(previous&&JSON.stringify({...previous,consultadoEm:null})===JSON.stringify({...snapshot,consultadoEm:null}))snapshot=previous;
 return {...state,freteOperacao:snapshot,cargas:(state.cargas||[]).map(c=>{
  const matches=snapshot.viagens.filter(t=>((t.numero_pedido_fornecedor&&t.numero_pedido_fornecedor===c.numeroPedidoFornecedor)||(c.freteEventoId&&t.id===c.freteViagemId&&t.carga_id===c.freteCargaId))&&(state.motoristas||[]).some(m=>m.id===c.motoristaId&&m.freteMotoristaId===t.motorista_id&&m.freteVeiculoId===t.veiculo_id));
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

// Only persisted, server-validated acceptance receipts may open an operational dossier.
export function mergeAcceptedLoads(state,receipts){
 let cargas=[...(state.cargas||[])],documentos=state.documentos;
 for(const r of receipts){
  const p=r.payload||{};
  const linked=r.carga_vendas_id?cargas.find(c=>c.id===r.carga_vendas_id):null;
  const provisional=cargas.find(c=>c.freteEventoId===r.frete_evento_id&&c.aguardaPedidoCadastro);
  if(linked&&provisional&&linked.id!==provisional.id&&!provisional.compraFornecedorId&&!provisional.vendaIds?.length){documentos=(documentos||[]).map(d=>d.cargaId===provisional.id?{...d,cargaId:linked.id,cargaOrigemFreteId:provisional.id}:d);cargas=cargas.filter(c=>c.id!==provisional.id);}
  let existing=cargas.find(c=>c.id===r.carga_vendas_id||c.freteEventoId===r.frete_evento_id||c.freteCargaId===r.frete_carga_id);
  if(!existing){
   const route=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s*\/\s*[a-z]{2}$/i,'').trim().toUpperCase();
   const candidates=cargas.filter(c=>!c.finalizadaEm&&c.status!=='CANCELADA'&&!c.freteEventoId&&c.pesoKg===Number(p.peso_t)*1000&&route(c.localCarregamento||c.origem)===route(p.origem)&&route(c.destino)===route(p.destino)&&(state.motoristas||[]).some(m=>m.id===c.motoristaId&&m.freteMotoristaId===r.motorista_id&&m.freteVeiculoId===r.veiculo_id)&&c.itens?.length===1&&route(c.itens[0].produto)===route(p.produto)&&Number(c.itens[0].qtd)===Number(p.quantidade));
   if(candidates.length===1)existing=candidates[0];
  }
  if(existing){const index=cargas.indexOf(existing);if(!existing.freteEventoId)cargas[index]={...existing,freteEventoId:r.frete_evento_id,freteCargaId:r.frete_carga_id,freteViagemId:r.frete_viagem_id,aceiteFrete:structuredClone(p)};continue;}
  const drivers=(state.motoristas||[]).filter(m=>m.freteMotoristaId===r.motorista_id&&m.freteVeiculoId===r.veiculo_id);
  if(drivers.length!==1)throw Error('Sincronize o conjunto do aceite antes de abrir o dossiê.');
  const m=drivers[0];
  cargas.push({id:'FRETE-'+r.frete_evento_id,codigo:'FF-'+r.frete_evento_id,aguardaPedidoCadastro:true,freteEventoId:r.frete_evento_id,freteCargaId:r.frete_carga_id,freteViagemId:r.frete_viagem_id,aceiteFrete:structuredClone(p),motoristaId:m.id,motorista:m.nome,placas:[m.placa1,m.placa2,m.placa3,m.placa4].filter(Boolean),origem:p.origem,localCarregamento:p.origem,destino:p.destino,destinoTipo:'A DEFINIR',produto:p.produto,qtd:Number(p.quantidade),pesoKg:Number(p.peso_t)*1000,fretePorTon:Number(p.frete_por_t),freteValor:Number(p.peso_t)*Number(p.frete_por_t),numeroPedidoFornecedor:'',itens:[],vendaIds:[],status:'VERMELHO',fase:'ACEITE RECEBIDO — PREPARAR PEDIDO',criadaEm:r.created_at});
 }
 return {...state,cargas,...(documentos!==state.documentos?{documentos}:{})};
}
