const digits=v=>String(v||'').replace(/\D/g,'');
export function phone(v){let n=digits(v);if(n.length===10||n.length===11)n='55'+n;return /^\d{12,15}$/.test(n)?n:'';}
export function purchaseSnapshot(o){return JSON.stringify({id:o.id,numero:o.numero,modalidadeCompra:o.modalidadeCompra,motoristaSnapshot:o.motoristaSnapshot,fornecedorSnapshot:o.fornecedorSnapshot,liberacaoPalletsFornecedor:o.liberacaoPalletsFornecedor,fornecedorId:o.fornecedorId,unidadeId:o.unidadeId,motoristaId:o.motoristaId,placas:o.placas,itens:o.itens,origem:o.origem,destino:o.destino,pagamento:o.pagamento,modalidadeFrete:o.modalidadeFrete,regraPallets:o.regraPallets,palletQuantidade:o.palletQuantidade});}
export function itemsText(rows){return rows.map(v=>`${v.qtd} ${v.unidadeMedida||'sacos'} de ${v.produto}`).join('; ');}
export function queueCustomer(s,rows,kind,event,at,previous){
 const first=rows[0];if(!first)return;
 const customer=(s.clientes||[]).find(c=>c.id===first.clienteId);
 const to=phone(customer?.whatsapp||customer?.telefone||first.clienteWhatsapp);
 const descriptions=itemsText(rows),reference=first.numeroVenda||first.grupoPedidoId||first.id;
 const message=kind==='AJUSTE'?`FORTE ATACAREJO — Pedido ${reference}. Seu pedido de ${previous} foi ajustado para ${descriptions} para efeito de carregamento.`:kind==='CARREGAMENTO'?`FORTE ATACAREJO — Pedido ${reference}. Seu pedido de ${descriptions} está em carregamento.`:kind==='ENTREGA'?`FORTE ATACAREJO — Pedido ${reference}. Você confirma ter recebido ${descriptions}?`: `FORTE ATACAREJO — Pedido ${reference}. Seu pedido de ${descriptions} foi registrado com sucesso.`;
 const key=event+':'+(first.grupoPedidoId||first.id)+':'+kind;
 s.comunicacoes??=[];if(s.comunicacoes.some(j=>j.key===key))return;
 // No prices, totals, rates or payment conditions are copied into customer messages.
 s.comunicacoes.push({id:key,key,kind,audience:'CLIENTE',canal:'WHATSAPP',to,clienteId:first.clienteId,cliente:first.cliente,vendaIds:rows.map(v=>v.id),cargaId:first.cargaId||'',message,items:rows.map(v=>({produtoId:v.produtoId,produto:v.produto,qtd:v.qtd})),reference,replyToken:kind==='ENTREGA'?event+':'+first.id:null,state:to&&customer?.whatsappAutorizado===true?'QUEUED':'BLOCKED',reason:!to?'WHATSAPP NÃO CADASTRADO':customer?.whatsappAutorizado!==true?'AUTORIZAÇÃO DO CLIENTE PENDENTE':'',createdAt:at});
}
export function queueLoading(s,c,event,at){const groups=new Map();for(const v of s.vendas||[]){if(!(c.vendaIds||[]).includes(v.id))continue;const k=v.grupoPedidoId||v.id;groups.set(k,[...(groups.get(k)||[]),v]);}for(const rows of groups.values())queueCustomer(s,rows,'CARREGAMENTO',event,at);}
export function linkedReturn(s,{providerId,contextId,from,text,at}){
 if((s.retornosFornecedor||[]).some(r=>r.providerId===providerId))return false;
 const jobs=(s.comunicacoes||[]).filter(j=>j.audience==='FORNECEDOR'&&j.canal==='WHATSAPP'&&j.providerId===contextId&&phone(j.to)===phone(from)&&['SENT','DELIVERED','READ'].includes(j.state));
 const r={providerId,contextId,from:phone(from),text:String(text||'').slice(0,12000),receivedAt:at,state:'CONFERIR',reason:'RETORNO SEM VÍNCULO INEQUÍVOCO'};
 if(jobs.length===1){const j=jobs[0],o=(s.comprasFornecedor||[]).find(o=>o.id===j.compraFornecedorId);r.compraFornecedorId=o?.id;r.cargaId=o?.cargaId;
  const matches=[...r.text.matchAll(/(?:pedido\s*(?:n[ºo.]?\s*)?[:#-]?\s*)([0-9][0-9A-Za-z/-]{1,39})/gi)].map(m=>m[1]);
  const unique=[...new Set(matches)];
  const c=(s.cargas||[]).find(c=>c.id===o?.cargaId);
  if(!/cancelad|cancelamento|n[aã]o\s+(?:[ée]|foi|confirm)/i.test(r.text)&&o&&c&&!c.finalizadaEm&&unique.length===1&&!o.numeroPedidoFornecedor&&!(s.cargas||[]).some(x=>x.id!==c.id&&x.fornecedorId===o.fornecedorId&&x.numeroPedidoFornecedor===unique[0])){
   o.numeroPedidoFornecedor=unique[0];o.status='AGUARDANDO NOTAS FISCAIS';o.evidenciaRetorno=providerId;o.confirmadoEm=at;o.confirmadoPor='RETORNO WHATSAPP VINCULADO';c.numeroPedidoFornecedor=unique[0];c.fase=o.status;r.state='VINCULADO';r.reason='RESPOSTA AO ENVIO ORIGINAL';
  }else r.reason='CONFIRA O NÚMERO OFICIAL DO FORNECEDOR';
 }
 s.retornosFornecedor=[...(s.retornosFornecedor||[]),r];return true;
}
export function deliveryReply(s,{id,from,contextId,payload,at}){
 const matches=(s.comunicacoes||[]).filter(j=>j.kind==='ENTREGA'&&j.providerId===contextId&&phone(j.to)===phone(from)&&['SENT','DELIVERED','READ'].includes(j.state)&&(payload===j.replyToken+':SIM'||payload===j.replyToken+':NAO'));
 if(matches.length!==1)return false;const j=matches[0];if(j.reply)return false;
 j.reply={providerId:id,from:phone(from),answer:payload.endsWith(':SIM')?'SIM':'NÃO',receivedAt:at,items:structuredClone(j.items),reference:j.reference,cargaId:j.cargaId};
 s.auditoria=[...(s.auditoria||[]),{id,acao:'CONFIRMAÇÃO DE ENTREGA WHATSAPP',dataHora:at,detalhe:j.id+' — '+j.reply.answer,usuario:'CLIENTE'}];return true;
}
