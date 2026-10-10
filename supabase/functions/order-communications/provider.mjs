export function templatePayload(job,name,documentId){
 if(!name)throw new Error('MODELO APROVADO NÃO CONFIGURADO: '+job.kind);
 const components=[];
 if(documentId)components.push({type:'header',parameters:[{type:'document',document:{id:documentId,filename:job.reference+'.pdf'}}]});
 components.push({type:'body',parameters:[{type:'text',text:job.reference},{type:'text',text:job.kind==='FORNECEDOR'?job.reference:job.items.map(i=>i.qtd+' de '+i.produto).join('; ')}]});
 if(job.kind==='ENTREGA')for(const [index,answer] of ['SIM','NAO'].entries())components.push({type:'button',sub_type:'quick_reply',index:String(index),parameters:[{type:'payload',payload:job.replyToken+':'+answer}]});
 return {messaging_product:'whatsapp',to:job.to,type:'template',template:{name,language:{code:'pt_BR'},components}};
}
export async function validSignature(raw,signature,secret){
 if(!secret||!/^sha256=[a-f0-9]{64}$/.test(signature||''))return false;
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 const bytes=Uint8Array.from(signature.slice(7).match(/../g).map(x=>parseInt(x,16)));
 return crypto.subtle.verify('HMAC',key,bytes,new TextEncoder().encode(raw));
}
export function applyStatuses(state,statuses){
 for(const status of statuses||[]){const jobs=(state.comunicacoes||[]).filter(j=>j.providerId===status.id);for(const j of jobs){j.providerEvents??=[];if(j.providerEvents.some(e=>e.status===status.status&&e.timestamp===status.timestamp))continue;j.providerEvents.push({status:status.status,timestamp:status.timestamp});const rank={SENDING:0,SENT:1,DELIVERED:2,READ:3},next={sent:'SENT',delivered:'DELIVERED',read:'READ',failed:'FAILED'}[status.status];if(next==='FAILED'&&!['DELIVERED','READ'].includes(j.state)){j.state='FAILED';j.reason='PROVEDOR INFORMOU FALHA';}else if(next&&rank[next]>=(rank[j.state]??-1))j.state=next;}}
}
