// A document is evidence to review; it is never a bank settlement.
const BUCKET = 'forte-vendas-dossies';
const MAX_BYTES = 10 * 1024 * 1024;
const MIME = new Set(['application/pdf','image/jpeg','image/png','image/webp','text/plain','application/octet-stream']);
export async function storeReceivableFile({client,empresaId,file,kind,saleId}) {
  if(!client || !empresaId)throw new Error('Entre no sistema e confirme a conexão antes de anexar.');
  if(!/^[a-zA-Z0-9_-]+$/.test(String(empresaId)) || !/^[a-zA-Z0-9_-]+$/.test(String(saleId)))throw new Error('Identificação da empresa ou venda inválida.');
  if(!['boleto','comprovante','cnab'].includes(kind))throw new Error('Tipo de documento inválido.');
  if(!file || !(file.size>0) || file.size>MAX_BYTES || !MIME.has(file.type || 'application/octet-stream'))throw new Error('Use PDF, imagem ou arquivo de retorno de até 10 MB.');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');
  const storagePath=`${empresaId}/recebiveis/${kind}/${saleId}/${hash}`;
  const {error}=await client.storage.from(BUCKET).upload(storagePath,file,{upsert:false,contentType:file.type||'application/octet-stream'});
  if(error && !['409','Duplicate'].includes(String(error.statusCode||error.error||'')))throw new Error('Não foi possível guardar o documento na nuvem. Tente novamente.');
  return {arquivo:file.name,tamanho:file.size,mime:file.type||'application/octet-stream',sha256:hash,storageBucket:BUCKET,storagePath};
}
export function appendReceiptEvidence(state,record) {
  if(!record.vendaId || !record.storagePath || !Number.isFinite(record.valor) || record.valor<=0)throw new Error('Comprovante incompleto ou valor inválido.');
  const receipts=state.comprovantesClientes||[];
  if(receipts.some(x=>x.vendaId===record.vendaId && x.storagePath===record.storagePath))return state;
  return {...state,comprovantesClientes:[...receipts,{...record,status:'PENDENTE DE CONFERÊNCIA',origem:'DOCUMENTO DO CLIENTE',baixaAutomatica:false}]};
}
