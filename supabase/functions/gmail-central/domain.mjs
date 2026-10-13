export const CENTRAL_EMAIL='fiscalforteatacarejo@gmail.com';
export function partsOf(payload,out=[]){if(payload?.filename)out.push(payload);for(const p of payload?.parts||[])partsOf(p,out);return out;}
export function decodeBytes(data){return Uint8Array.from(atob(String(data).replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));}
export function describeDocument(filename,subject='',xml=null){
 const s=(filename+' '+subject).toLowerCase();
 // XML identity takes priority over words such as "pagamento" in the subject.
 const kind=/\.xml$/i.test(filename)?'XML_NFE':/comprovante.*frete|frete.*pagamento|recibo.*frete/.test(s)?'COMPROVANTE_FRETE':/boleto|cobran[çc]a/.test(s)?'BOLETO':/danfe|nota fiscal|nf-e|nfe/.test(s)?'DANFE':'DOCUMENTO';
 const n=xml?.nfeProc?.NFe?.infNFe||xml?.NFe?.infNFe;
 const key=String(n?.['@_Id']||'').replace(/^NFe/,'');
 const cnpj=String(n?.dest?.CNPJ||'').replace(/\D/g,'');
 const refs=[...new Set((Array.isArray(n?.det)?n.det:n?.det?[n.det]:[]).map(d=>String(d.prod?.xPed||'').trim()).filter(Boolean))];
 return {kind,cnpj:/^\d{14}$/.test(cnpj)?cnpj:null,nfe_key:/^\d{44}$/.test(key)?key:null,order_reference:refs.length===1?refs[0]:null,destinations:kind==='XML_NFE'||kind==='DANFE'?['vendas','fiscal']:kind==='COMPROVANTE_FRETE'?['vendas','frete']:['vendas']};
}
export function historyMessages(result){return [...new Set((result.history||[]).flatMap(h=>(h.messagesAdded||[]).map(x=>x.message?.id)).filter(Boolean))];}
