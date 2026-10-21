const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
const pallet=v=>/\b(?:PALLE?TS?|PALETES?)\b/.test(norm(v));
const unit=v=>/^(UN|UND|UNID|UNIDADE|UNIDADES|PC|PCS|PECA|PECAS|PAL|PALLET|PALLETS|PALETE|PALETES)$/.test(norm(v).trim());
// Detection only: neither an XML nor a PDF can post stock without human review.
export function classifyPalletDocument(doc,filename='',subject='',pdfText=''){
 const items=(doc.items||[]).filter(i=>pallet(i.description));
 const candidate=items.length>0||pallet(filename+' '+subject+' '+pdfText);
 if(!candidate)return{candidate:false};
 const quantities=items.map(i=>Number(i.quantity));
 const reliable=doc.kind==='XML_NFE'&&items.length>0&&items.every((i,n)=>unit(i.unit)&&Number.isSafeInteger(quantities[n])&&quantities[n]>0);
 const quantity=reliable?quantities.reduce((a,b)=>a+b,0):null;
 return{candidate:true,quantity:Number.isSafeInteger(quantity)&&quantity>0?quantity:null,requires_manual_review:true,reason:reliable?'CONFERIR_XML_E_DESTINACOES':'QUANTIDADE_OU_DOCUMENTO_EXIGE_CONFERENCIA',items:items.map(i=>({description:i.description,unit:i.unit,quantity:i.quantity}))};
}
