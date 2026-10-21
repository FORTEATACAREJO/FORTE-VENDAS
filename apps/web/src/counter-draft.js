export function counterDraftKey(user,unit){
  const id=user?.authUserId||user?.id;
  if(!id||!unit)return null;
  return 'forte:balcao:v2:'+JSON.stringify([user.empresaId||'forte',id,unit]);
}
export function readCounterDraft(storage,key){
  if(!key)return [];
  try{const value=JSON.parse(storage.getItem(key)||'[]');return Array.isArray(value)?value:[];}catch{return [];}
}
export function counterCancellationBlock(data,sale){
  if(!sale||['CANCELADO','CANCELADA','ESTORNADA'].includes(sale.status))return 'Venda já cancelada ou não encontrada.';
  const links=row=>row.vendaId===sale.id||row.operacaoId===sale.id||row.referencia===sale.id;
  if(sale.chaveNfe||sale.chaveNFe||sale.nfeId||sale.nfceId||sale.notaFiscalId||sale.fiscalDocumentId||sale.nfEmitida||sale.fiscalStatus==='AUTHORIZED')return 'Venda com documento fiscal: use o procedimento fiscal de cancelamento/devolução.';
  if(['notasFiscais','documentos','contasPagar','contasReceber','boletosClientes','comprovantesClientes','comprovantesBalcao','fretesBalcao','patioSaidas'].some(key=>(data[key]||[]).some(links))||(data.palletClientes||[]).some(row=>row.vendaId===sale.id||String(row.documento||'').includes(sale.numeroVenda||sale.id)))return 'Venda com documento, título, entrega ou pallet vinculado: confira o estorno no módulo responsável antes de cancelar.';
  return '';
}
