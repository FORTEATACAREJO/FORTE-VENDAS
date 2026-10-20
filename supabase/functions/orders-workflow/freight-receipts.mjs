const fail=m=>{throw Error(m)};
export function freightReceipt(state,cargaId,documentoId){
 const load=(state.cargas||[]).find(c=>c.id===cargaId&&c.status!=='CANCELADA')||fail('Carga não localizada.');
 if(load.modalidadeFrete==='CIF')fail('CIF não possui comprovante de frete separado.');
 if(documentoId&&load.comprovanteFreteDocumentoId&&documentoId!==load.comprovanteFreteDocumentoId)fail('O comprovante foi substituído. Distribua o arquivo atual da carga.');
 documentoId=documentoId||load.comprovanteFreteDocumentoId;
 const document=(state.documentos||[]).find(d=>d.cargaId===load.id&&d.categoria==='COMPROVANTE FRETE'&&(!documentoId||d.id===documentoId)&&d.validationStatus==='VALIDADO'&&d.validadoFinanceiroPor&&d.storagePath&&d.hash)||fail('Valide o comprovante de frete antes de distribuir.');
 if(!load.numeroPedidoFornecedor||!load.motoristaId)fail('Vincule o pedido oficial e o motorista antes de distribuir.');
 return {load,document};
}
export function linkFreightReceipt(state,load,document,at){
 load.comprovanteFreteDocumentoId=document.id;
 load.comprovanteFreteHash=document.hash;
 document.motoristaId=load.motoristaId;document.numeroPedidoFornecedor=load.numeroPedidoFornecedor;
 for(const n of state.notasFiscais||[])if(n.cargaId===load.id||load.notaFiscalId&&n.id===load.notaFiscalId)n.comprovanteFreteDocumentoId=document.id;
 for(const v of state.vendas||[])if(v.cargaId===load.id||(load.vendaIds||[]).includes(v.id))v.comprovanteFreteDocumentoId=document.id;
 // Link the existing freight payable only; never create a payable or mark it settled here.
 for(const title of state.contasPagar||[])if((title.cargaId===load.id||title.carga===load.id||title.carga===load.codigo)&&/FRETE/i.test([title.tipo,title.categoria,title.titulo,title.origem].join(' ')))Object.assign(title,{comprovanteDocumentoId:document.id,comprovanteNome:document.filename,comprovanteFreteHash:document.hash});
 load.freteComprovanteSync={status:'PENDENTE',documentoId:document.id,hash:document.hash,pedido:load.numeroPedidoFornecedor,motoristaId:load.motoristaId,at,tentativas:0};
}
export function receiptSyncResult(state,body,{at}){
 const {load,document}=freightReceipt(state,body.cargaId,body.documentoId);
 if(body.internalHash!==document.hash||body.internalPedido!==load.numeroPedidoFornecedor||body.internalMotorista!==load.motoristaId)fail('Vínculo do comprovante mudou durante a sincronização. Atualize e tente novamente.');
 load.freteComprovanteSync={...load.freteComprovanteSync,status:body.internalOk?'DISTRIBUÍDO':'PENDENTE',documentoId:document.id,hash:document.hash,pedido:load.numeroPedidoFornecedor,motoristaId:load.motoristaId,at,tentativas:(load.freteComprovanteSync?.tentativas||0)+1,erro:body.internalOk?'':String(body.internalError||'Não foi possível confirmar a distribuição.').slice(0,500)};
 return {cargaId:load.id,documentoId:document.id,distribuido:!!body.internalOk};
}
