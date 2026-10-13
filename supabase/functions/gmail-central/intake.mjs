// Pure review rules. These rules never write stock, accounting entries or payments.
export const digits=v=>String(v??'').replace(/\D/g,'');
const arr=v=>v==null?[]:Array.isArray(v)?v:[v];
const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
export function cents(v){const s=String(v??'');if(!/^\d+(?:\.\d{1,2})?$/.test(s))return null;const [a,b='']=s.split('.');const n=Number(a)*100+Number(b.padEnd(2,'0'));return Number.isSafeInteger(n)?n:null;}
export function validKey(v){const k=digits(v);if(k.length!==44)return false;let sum=0,w=2;for(let i=42;i>=0;i--){sum+=Number(k[i])*w;w=w===9?2:w+1;}const d=11-sum%11;return Number(k[43])===(d>=10?0:d);}
export function validCnpj(v){const k=digits(v);if(k.length!==14||/^(.)\1+$/.test(k))return false;for(let len=12;len<=13;len++){let sum=0,w=len-7;for(let i=0;i<len;i++){sum+=Number(k[i])*w;if(--w<2)w=9;}const r=sum%11;if(Number(k[len])!==(r<2?0:11-r))return false;}return true;}
export function parseNfe(xml,recipientCnpjs=[]){
 const p=xml?.nfeProc,n=p?.NFe?.infNFe||xml?.NFe?.infNFe;if(!n?.ide||!n?.emit||!n?.dest||!n.det)throw Error('XML_NAO_E_NFE');
 const key=String(n['@_Id']||'').replace(/^NFe/,''),issuer=digits(n.emit.CNPJ),recipient=digits(n.dest.CNPJ),ide=n.ide,t=n.total?.ICMSTot||{},protocol=p?.protNFe?.infProt;
 const issues=['ASSINATURA_XML_A_VALIDAR','SEFAZ_A_CONSULTAR','TRIBUTOS_E_TOTAL_A_CONFERIR'];
 if(!validKey(key))issues.push('CHAVE_INVALIDA');
 if(!validCnpj(issuer)||!validCnpj(recipient))issues.push('CNPJ_INVALIDO');
 if(!recipientCnpjs.includes(recipient))issues.push('CNPJ_DESTINATARIO_NAO_CADASTRADO');
 if(String(ide.mod)!=='55'||key.slice(6,20)!==issuer||key.slice(20,22)!=='55'||key.slice(22,25)!==String(ide.serie).padStart(3,'0')||key.slice(25,34)!==String(ide.nNF).padStart(9,'0')||key.slice(2,6)!==String(ide.dhEmi||ide.dEmi).replace(/-/g,'').slice(2,6))issues.push('IDENTIDADE_XML_DIVERGENTE');
 if(String(protocol?.cStat)!=='100'||protocol?.chNFe!==key)issues.push('PROTOCOLO_AUTORIZACAO_DIVERGENTE');
 const items=arr(n.det).map(d=>{const x=d.prod||{},mass=String(x.xProd||'').match(/(\d+(?:[.,]\d+)?)\s*KG\b/i);return {code:x.cProd,description:x.xProd,ncm:x.NCM,cfop:x.CFOP,unit:x.uCom,quantity:Number(x.qCom),unit_price:x.vUnCom,total_cents:cents(x.vProd),nominal_kg:mass&&/^(SC|SACO|UN)$/i.test(x.uCom)?Number(mass[1].replace(',','.'))*Number(x.qCom):null,taxes:d.imposto||{},order_reference:x.xPed||null};});
 if(items.some(i=>!Number.isFinite(i.quantity)||i.quantity<=0||!i.unit||!/^\d{8}$/.test(String(i.ncm))||!/^\d{4}$/.test(String(i.cfop))))issues.push('PRODUTOS_QUANTIDADES_OU_CODIGOS_INVALIDOS');
 const total=cents(t.vNF),productTotal=cents(t.vProd);if(total==null||items.some(x=>x.total_cents==null)||items.reduce((a,x)=>a+(x.total_cents||0),0)!==productTotal)issues.push('VALORES_PRODUTOS_DIVERGENTES');
 // NF-e total has special exceptions; flag uncertainty rather than invent a total formula.
 const volume=arr(n.transp?.vol),weightRaw=volume.map(v=>({gross:v.pesoB||null,net:v.pesoL||null,quantity:v.qVol||null,unit:v.esp||null}));
 const nominal=items.every(x=>x.nominal_kg!=null)?items.reduce((a,x)=>a+x.nominal_kg,0):null;
 if(nominal!=null&&weightRaw.some(v=>v.net!=null)&&Math.abs(volume.reduce((a,v)=>a+Number(v.pesoL||0),0)-nominal)>0.01)issues.push('PESO_XML_DIVERGENTE_DOS_PRODUTOS');
 const installments=arr(n.cobr?.dup).map(d=>({number:String(d.nDup||''),due:d.dVenc,amount_cents:cents(d.vDup)}));
 if(installments.length&&installments.reduce((a,d)=>a+(d.amount_cents||0),0)!==total)issues.push('DUPLICATAS_DIVERGENTES');
 return {kind:'XML_NFE',key,issuer_cnpj:issuer,issuer_name:n.emit.xNome,recipient_cnpj:recipient,recipient_name:n.dest.xNome,number:String(ide.nNF),series:String(ide.serie),issued_at:ide.dhEmi||ide.dEmi,total_cents:total,product_total_cents:productTotal,items,installments,weight_raw:weightRaw,nominal_kg:nominal,quantity:items.reduce((a,x)=>a+x.quantity,0),taxes:t,protocol:{status:String(protocol?.cStat||''),number:protocol?.nProt||null,checked_live:false},order_references:[...new Set(items.map(x=>x.order_reference).filter(Boolean))],issues};
}
const mod10=s=>{let sum=0,w=2;for(let i=s.length-1;i>=0;i--){const n=Number(s[i])*w;sum+=Math.floor(n/10)+n%10;w=w===2?1:2;}return (10-sum%10)%10;};
export function boletoCode(value){const l=digits(value);if(l.length!==47)return {valid:false,issues:['LINHA_DIGITAVEL_AUSENTE_OU_NAO_SUPORTADA']};const barcode=l.slice(0,4)+l[32]+l.slice(33)+l.slice(4,9)+l.slice(10,20)+l.slice(21,31);let sum=0,w=2;for(let i=43;i>=0;i--){if(i===4)continue;sum+=Number(barcode[i])*w;w=w===9?2:w+1;}let check=11-sum%11;if(check===0||check===10||check===11)check=1;const valid=mod10(l.slice(0,9))===Number(l[9])&&mod10(l.slice(10,20))===Number(l[20])&&mod10(l.slice(21,31))===Number(l[31])&&check===Number(barcode[4]);return {line:l,barcode,bank:l.slice(0,3),currency:l[3],factor:Number(l.slice(33,37)),amount_cents:Number(l.slice(37)),valid,issues:valid?[]:['DIGITOS_BOLETO_INVALIDOS']};}
export function parsePdfText(text){
 const s=String(text||''),issues=[];
 if(!s.trim())return {kind:'DOCUMENTO',issues:['PDF_SEM_TEXTO_OCR_PENDENTE']};
 const line=s.match(/\b\d{5}\.\d{5}\s+\d{5}\.\d{6}\s+\d{5}\.\d{6}\s+\d\s+\d{14}\b/)?.[0];
 if(line){const code=boletoCode(line),dates=[...s.matchAll(/\b(\d{2})[./](\d{2})[./](20\d{2})\b/g)].map(m=>`${m[3]}-${m[2]}-${m[1]}`),dateCandidates=[...new Set(dates)],due=dateCandidates.sort().at(-1)||null,amounts=[...s.matchAll(/R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/g)].map(m=>cents(m[1].replace(/\./g,'').replace(',','.'))),payer=[...s.matchAll(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g)].map(m=>digits(m[0])),beneficiary=s.match(/Benefici[aá]rio\s+(?:(?:Ag[eê]ncia|Esp[eé]cie)[^\n]*\n)?([^\n]+)/i)?.[1]?.trim(),number=s.match(/NF[-eE]*\s*(\d{1,9})\b/i)?.[1];
 if(!amounts.includes(code.amount_cents))issues.push('VALOR_BOLETO_DIVERGENTE');
 if(!due)issues.push('VENCIMENTO_A_CONFERIR');else{const factor=code.factor;const days=Math.round((Date.parse(due+'T00:00:00Z')-Date.parse('2025-02-22T00:00:00Z'))/86400000)+1000;const old=Math.round((Date.parse(due+'T00:00:00Z')-Date.parse('1997-10-07T00:00:00Z'))/86400000);if(factor!==days&&factor!==old)issues.push('FATOR_VENCIMENTO_DIVERGENTE');}
 return {kind:'BOLETO',...code,invoice_number:number?String(Number(number)):null,payer_cnpj:[...new Set(payer)].length===1?payer[0]:null,beneficiary_name:beneficiary||null,beneficiary_cnpj:null,due,issues:[...code.issues,...issues,'BENEFICIARIO_E_DADOS_BANCARIOS_A_VALIDAR']};
 }
 if(/\bDANFE\b/i.test(s)){const region=s.split(/CHAVE DE ACESSO/i)[1]?.slice(0,240)||'',candidate=region.match(/\d[\d.\s-]{42,85}/)?.[0],key=digits(candidate);return {kind:'DANFE',key:validKey(key)?key:null,issues:validKey(key)?[]:['CHAVE_DANFE_A_CONFERIR']};}
 return {kind:'DOCUMENTO',issues:['TIPO_DOCUMENTAL_A_CLASSIFICAR']};
}
export function supplierDecision(doc,sender,rules){
 const address=String(sender).match(/([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i)?.[1]?.toLowerCase()||'',domain=address.split('@')[1];
 const candidates=rules.filter(r=>r.active&&r.kinds.includes(doc.kind)&&(!doc.issuer_cnpj||r.cnpj===doc.issuer_cnpj)&&(!doc.key||r.cnpj===doc.key.slice(6,20))&&((r.senders||[]).includes(address)||(r.domains||[]).includes(domain)));
 return candidates.length===1?{allowed:true,supplier:candidates[0]}:{allowed:false,issues:['FORNECEDOR_REMETENTE_OU_TIPO_NAO_AUTORIZADO']};
}
export function matchDossier(doc,candidates,supplier){
 if(!supplier)return {key:null,issues:['FORNECEDOR_A_ANALISAR']};
 const own=candidates.filter(n=>n.issuer_cnpj===supplier.cnpj);
 if(doc.key){const n=own.find(n=>n.key===doc.key);return {key:validKey(doc.key)&&(!n||n.recipient_cnpj===doc.recipient_cnpj||doc.kind==='DANFE')?doc.key:null,issues:validKey(doc.key)?[]:['CHAVE_INVALIDA']};}
 if(doc.kind==='BOLETO'){
  const matches=own.filter(n=>doc.invoice_number===String(Number(n.number))&&doc.payer_cnpj===n.recipient_cnpj&&norm(doc.beneficiary_name)===norm(n.issuer_name)&&doc.valid&&n.installments.some(d=>d.due===doc.due&&d.amount_cents===doc.amount_cents));
  return matches.length===1?{key:matches[0].key,issues:[]}:{key:null,issues:[matches.length>1?'VINCULO_AMBIGUO':'BOLETO_SEM_CORRESPONDENCIA_VERIFICADA']};
 }
 return {key:null,issues:['DOCUMENTO_SEM_CHAVE_VERIFICADA']};
}
export function validatePush(body,config,email){if(!/^projects\/[a-z0-9-]+\/topics\/forte-gmail-central$/.test(config.topic||''))throw Error('TOPICO_NAO_CONFIGURADO');const subscription=config.topic.split('/topics/')[0]+'/subscriptions/forte-gmail-central-push';if(body.subscription!==subscription||!body.message?.messageId||!body.message?.data||body.message.data.length>16384)throw Error('PUSH_INVALIDO');const data=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(body.message.data.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))));if(data.emailAddress!==email||!/^\d{1,30}$/.test(String(data.historyId)))throw Error('PUSH_CAIXA_DIVERGENTE');return data;}
export function pushReady(c,now=Date.now()){return Boolean(c.topic&&c.push_email&&c.watch_expires&&Date.parse(c.watch_expires)>now&&c.last_push);}
