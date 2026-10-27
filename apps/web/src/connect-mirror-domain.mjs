// Pure validation. Mirrored evidence never calls fiscal, inventory or finance workflows.
export const MATRIX='49832961000151';
export function fail(message,status=400){return Object.assign(new Error(message),{status});}
const text=(v,max=160)=>{if(typeof v!=='string'||!v.trim()||v.length>max)throw fail('Campo obrigatório inválido.');return v.trim();};
const array=v=>v==null?[]:Array.isArray(v)?v:[v];
const amount=(v,positive=false)=>{const s=String(v??'');if(!/^\d{1,12}(\.\d{1,10})?$/.test(s)||!Number.isFinite(Number(s))||(positive&&Number(s)<=0))throw fail('Quantidade ou valor inválido.');return s;};
export function validKey(key){if(!/^\d{44}$/.test(key))return false;let sum=0,w=2;for(let i=42;i>=0;i--){sum+=Number(key[i])*w;w=w===9?2:w+1;}const d=11-sum%11;return Number(key[43])===(d>=10?0:d);}
function iso(value){const s=text(value,40);if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(s)||!Number.isFinite(Date.parse(s)))throw fail('Informe data/hora com fuso.');return new Date(s).toISOString();}
function keyOf(value){const s=String(value||'');if(!validKey(s))throw fail('Chave de NF-e inválida.');return s;}
export function fiscalRecord(xml,parse){
 if(typeof xml!=='string'||new TextEncoder().encode(xml).length>350000||/<!DOCTYPE|<!ENTITY/i.test(xml))throw fail('XML fora do limite ou com declaração não permitida.');
 let x;try{x=parse(xml);}catch{throw fail('XML malformado.');}
 const p=x.nfeProc;
 if(p){
  const n=p.NFe?.infNFe,prot=p.protNFe?.infProt;if(!n||Array.isArray(n)||!prot||Array.isArray(prot))throw fail('Exporte o XML processado completo, com protocolo.');
  const key=keyOf(String(n['@_Id']||'').replace(/^NFe/,''));
  if(String(prot.chNFe)!==key||String(prot.tpAmb)!=='1'||String(n.ide?.tpAmb)!=='1'||!['100','150'].includes(String(prot.cStat))||!/^\d{15}$/.test(String(prot.nProt)))throw fail('XML não contém autorização de produção compatível.');
  const issuer=String(n.emit?.CNPJ||''),recipient=String(n.dest?.CNPJ||'');if(key.slice(6,20)!==issuer||![issuer,recipient].includes(MATRIX))throw fail('Documento não pertence à matriz.');
  const model=String(n.ide?.mod||'');if(!['55','65'].includes(model)||key.slice(20,22)!==model)throw fail('Modelo fiscal incompatível.');
  const direction=issuer===MATRIX?(String(n.ide.tpNF)==='0'?'ENTRADA_PROPRIA':'SAIDA'):'ENTRADA_FORNECEDOR';
  const items=array(n.det).map(d=>({line:text(String(d['@_nItem']),8),code:text(String(d.prod?.cProd||'')),description:text(String(d.prod?.xProd||''),256),unit:text(String(d.prod?.uCom||''),8),quantity:amount(d.prod?.qCom,true),unitPrice:amount(d.prod?.vUnCom),total:amount(d.prod?.vProd),ncm:String(d.prod?.NCM||''),cfop:String(d.prod?.CFOP||''),taxes:d.imposto||{}}));
  if(!items.length||items.length>500)throw fail('Quantidade de itens fora do limite.');
  return {sourceId:`NFE:${key}`,entityId:key,kind:'NFE',occurredAt:iso(n.ide.dhEmi),payload:{cnpj:MATRIX,key,issuer,recipient,direction,model,number:String(n.ide.nNF),series:String(n.ide.serie),status:'AUTORIZACAO_INFORMADA_NO_XML',total:amount(n.total?.ICMSTot?.vNF),protocol:String(prot.nProt),customer:String(n.dest?.xNome||''),items,signatureVerified:false,stockEffect:'NAO_APURADO',xml}};
 }
 const ev=x.procEventoNFe;if(ev){
  const req=ev.evento?.infEvento,ret=ev.retEvento?.infEvento;if(!req||!ret||Array.isArray(req)||Array.isArray(ret))throw fail('Exporte um evento processado por arquivo.');
  const key=keyOf(String(req.chNFe||'')),type=String(req.tpEvento||''),seq=String(req.nSeqEvento||'');
  if(!['110111','110110'].includes(type)||!/^[1-9]\d?$/.test(seq)||String(req.tpAmb)!=='1'||String(ret.tpAmb)!=='1'||String(ret.chNFe)!==key||String(ret.tpEvento)!==type||String(ret.nSeqEvento)!==seq||!['135','155'].includes(String(ret.cStat))||!/^\d{15}$/.test(String(ret.nProt)))throw fail('Evento não contém retorno aceito compatível.');
  // Supplier events may arrive before the invoice; pending linkage never changes stock.
  return {sourceId:`EVENT:${key}:${type}:${seq}`,entityId:key,kind:type==='110111'?'CANCELAMENTO':'CCE',occurredAt:iso(ret.dhRegEvento||req.dhEvento),payload:{cnpj:MATRIX,key,eventType:type,sequence:seq,status:'EVENTO_ACEITO_INFORMADO_NO_XML',protocol:String(ret.nProt),issuer:String(req.CNPJ||''),reason:String(req.detEvento?.xJust||req.detEvento?.xCorrecao||''),signatureVerified:false,stockEffect:'NAO_APURADO',xml}};
 }
 throw fail('Use nfeProc ou procEventoNFe completos. Resumos e DANFE não substituem XML.');
}
export function saleRecord(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw fail('Venda inválida.');
 const system=text(input.sourceSystem,60),company=text(input.sourceCompany,80),id=text(input.saleId,100),updatedAt=iso(input.updatedAt),status=text(input.status,40);
 if(!['ABERTA','CONCLUIDA','CANCELADA','DEVOLVIDA'].includes(status))throw fail('Situação de venda não mapeada.');
 const items=array(input.items).map(i=>({line:text(String(i.line),20),code:text(String(i.code||'')),description:text(String(i.description||''),256),unit:text(String(i.unit||''),10),quantity:amount(i.quantity,true),unitPrice:amount(i.unitPrice),total:amount(i.total)}));
 if(!items.length||items.length>500||new Set(items.map(i=>i.line)).size!==items.length)throw fail('Itens ausentes, repetidos ou em excesso.');
 const sourceId=`SALE:${encodeURIComponent(system)}:${encodeURIComponent(company)}:${encodeURIComponent(id)}`;
 if(sourceId.length>500)throw fail('Identificador muito longo.');
 return {sourceId,entityId:sourceId,kind:'VENDA',occurredAt:updatedAt,payload:{sourceSystem:system,sourceCompany:company,saleId:id,updatedAt,status,date:iso(input.date),customer:text(input.customer,256),total:amount(input.total),items,group:'MATRIZ_FILIAL_CONJUNTAS',stockEffect:'NAO_APURADO'}};
}
export function projectRecords(records){
 // Arrival order does not decide business state. History remains immutable.
 const invoices=new Map(),events=new Map(),sales=new Map();
 for(const r of records){const p=r.payload;if(r.kind==='NFE'){const old=invoices.get(r.entity_id);if(old&&old.content_hash!==r.content_hash){old.conflict=true;continue;}invoices.set(r.entity_id,{...r});}
 else if(r.kind==='CANCELAMENTO'){const old=events.get(r.entity_id);if(!old||r.occurred_at>old.occurred_at)events.set(r.entity_id,r);}
 else if(r.kind==='VENDA'){const old=sales.get(r.entity_id);if(!old||r.occurred_at>old.occurred_at)sales.set(r.entity_id,{...r});else if(r.occurred_at===old.occurred_at&&r.content_hash!==old.content_hash)old.conflict=true;}}
 return {invoices:[...invoices.values()].map(r=>({...r,cancelled:events.has(r.entity_id)})),sales:[...sales.values()],pendingEvents:[...events.values()].filter(e=>!invoices.has(e.entity_id))};
}
