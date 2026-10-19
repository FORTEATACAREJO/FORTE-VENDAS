const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
const list=(s,k)=>s[k]||[];
const fail=m=>{throw Error(m)};
const required=(v,label)=>String(v??'').trim()||fail('Informe '+label+'.');
const positive=(v,label)=>Number.isFinite(Number(v))&&Number(v)>0?Number(v):fail('Confira '+label+'.');
const admin=p=>['MASTER','ADMINISTRADOR'].includes(p.perfil);
export const terminalSale=v=>!!(v.excluidaEm||/^(CANCELAD[AO]|REPROVAD[AO]|ENTREGUE|CONCLUID[AO]|FINALIZAD[AO])$/.test(norm(v.status)));
export const allocatedInvoice=n=>!!(n.incorporadaEm||n.destinadaEm||n.destinacao&&n.destinacao!=='AGUARDANDO DESTINAÇÃO'||/INCORPORADA|FINALIZADA|DISTRIBUIÇÃO DIRETA/.test(n.status||''));
export function selectedSales(s,ids){
 if(!Array.isArray(ids)||!ids.length||ids.length>500)fail('Selecione as vendas.');
 const rows=list(s,'vendas').filter(v=>ids.includes(v.id)||ids.includes(v.grupoPedidoId));
 if(ids.some(id=>!rows.some(v=>v.id===id||v.grupoPedidoId===id))||!rows.length||rows.some(terminalSale))fail('Venda indisponível para carregamento.');
 return rows;
}
function editable(s,rows){
 const ids=rows.map(v=>v.id),groups=rows.map(v=>v.grupoPedidoId).filter(Boolean);
 if(list(s,'comunicacoes').some(j=>j.state==='SENDING'&&j.vendaIds?.some(id=>ids.includes(id))))fail('Aguarde a conclusão do envio antes de alterar a venda.');
 if(rows.some(v=>terminalSale(v)||v.cargaId||v.nf||v.numeroNF||v.numeroNotaFiscal||v.chaveNfe||v.nfeId)||list(s,'boletosClientes').some(t=>(ids.includes(t.vendaId)||groups.includes(t.vendaId))&&(t.nossoNumero||t.idCobranca))||list(s,'contasReceber').some(t=>(ids.includes(t.vendaId)||groups.includes(t.vendaId))&&(t.idCobranca||t.nossoNumero||Number(t.valorRecebido)>0)))fail('Venda com carga, documento fiscal ou cobrança exige revisão antes de alterar ou excluir.');
}
export function linkSales(s,c,ids){
 if(c.finalizadaEm||c.status==='CANCELADA')fail('Carga indisponível.');
 const rows=selectedSales(s,ids);if(rows.some(v=>v.cargaId&&v.cargaId!==c.id))fail('Venda vinculada a outra carga.');
 const future=[...new Set([...(c.vendaIds||[]),...rows.map(v=>v.id)])];
 const allocated=list(s,'vendas').filter(v=>future.includes(v.id)&&!terminalSale(v));
 if(allocated.some(v=>!(c.itens||[]).some(i=>i.produtoId===v.produtoId)))fail('Produto da venda não consta na carga.');
 for(const i of c.itens||[]){if(allocated.filter(v=>v.produtoId===i.produtoId).reduce((a,v)=>a+Number(v.qtd),0)>Number(i.qtd))fail('Quantidade de venda maior que a quantidade deste produto na carga.');}
 c.vendaIds=future;c.qtdSemDestino=Number(c.qtd||0)-allocated.reduce((a,v)=>a+Number(v.qtd),0);
 rows.forEach(v=>Object.assign(v,{cargaId:c.id,destinoPainel:'CARGA DIRETA'}));for(const d of list(s,'documentos'))if(d.vendaId&&rows.some(v=>d.vendaId===v.id||d.vendaId===v.grupoPedidoId))d.cargaId=c.id;return rows;
}
function invoiceItems(s,n,mapping){
 if(!n.produtos?.length||!Array.isArray(mapping)||mapping.length!==n.produtos.length)fail('Confira o vínculo de todos os produtos da nota.');
 return n.produtos.map((item,index)=>{
  const map=mapping.find(m=>m.index===index),p=list(s,'produtos').find(p=>p.id===map?.produtoId&&p.ativo!==false);
  if(!p||p.revenda===false||/USO|CONSUMO|IMOBILIZADO/.test(norm(p.finalidade||p.classificacao||p.destinacao||'REVENDA')))fail('Selecione o produto de revenda correspondente a cada item da nota.');
  const qtd=positive(item.quantidade,'quantidade da NF');if(!Number.isSafeInteger(qtd))fail('Converta e confira a unidade da NF antes da incorporação.');
  // Quantity is never silently converted between tons, pallets and sacks.
  const fiscal=norm(item.unidade||item.unidadeComercial||item.unidadeMedida),unit=norm(p.unidadeMedida||p.unidadeVenda||p.unidade||'');
  const family=u=>/^(SC|SAC|SACO|SACOS|SACA|SACAS|SACO\/SACA)$/.test(u)?'SC':/^(UN|UNID|UNIDADE|UNIDADES)$/.test(u)?'UN':u;
  if(fiscal&&(!unit||family(fiscal)!==family(unit)))fail('Unidade da NF diferente do cadastro. Confira a conversão antes de destinar.');
  const pesoKg=qtd*positive(p.pesoKg,'peso cadastrado do produto');const cost=Number(item.valorUnitario||0);if(!Number.isFinite(cost)||cost<0)fail('Custo da NF inválido.');
  return {produtoId:p.id,produto:p.nome,marca:p.marca,qtd,pesoKg,custoUnitario:cost,total:Math.round(qtd*cost*100)/100,unidadeMedida:unit||fiscal};
 });
}
export function sheetAction(s,b,p,{id,at}){
 if(b.action==='EXTERNAL_REJECT'){
  if(!admin(p)&&p.permissoes?.aprovarVendasExternas!==true)fail('Sem permissão para reprovar vendas externas.');
  const v=list(s,'vendasExternas').find(v=>v.id===b.vendaId)||fail('Proposta não localizada.');
  if(v.vendaInternaId||v.status!=='AGUARDANDO APROVAÇÃO')fail('Proposta já analisada ou em atendimento.');
  Object.assign(v,{status:'REPROVADA',motivoReprovacao:required(b.motivo,'motivo da reprovação'),analisadaEm:at,analisadaPor:p.user_id});return {id:v.id};
 }
 if(b.action==='SALE_CANCEL'){
  if(!admin(p))fail('Somente administrador pode excluir a venda.');const rows=selectedSales(s,[b.vendaId]);editable(s,rows);
  const motivo=required(b.motivo,'motivo da exclusão');for(const v of rows)Object.assign(v,{status:'CANCELADA',excluidaEm:at,excluidaPor:p.user_id,motivoExclusao:motivo});
  for(const j of list(s,'comunicacoes').filter(j=>j.vendaIds?.some(id=>rows.some(v=>v.id===id))&&['QUEUED','BLOCKED','FAILED'].includes(j.state)))Object.assign(j,{state:'CANCELLED',reason:'VENDA EXCLUÍDA PELO ADMINISTRADOR'});
  return {id:b.vendaId,warning:'Venda retirada da operação. Histórico e anexos preservados.'};
 }
 if(b.action==='SALE_EDIT'){
  const rows=selectedSales(s,[b.vendaId]);editable(s,rows);const motivo=required(b.motivo,'motivo da edição');
  if(!Array.isArray(b.itens)||b.itens.length!==rows.length||new Set(b.itens.map(i=>i.id)).size!==rows.length)fail('Confira todos os itens da venda.');
  const before=structuredClone(rows);
  for(const v of rows){const patch=b.itens.find(i=>i.id===v.id)||fail('Item não localizado.');const qtd=positive(patch.qtd,'quantidade'),price=positive(patch.precoUnitario,'preço');if(!Number.isSafeInteger(qtd))fail('Quantidade deve ser inteira.');if(price!==Number(v.precoUnitario)&&!admin(p)&&p.permissoes?.editarPreco!==true)fail('Sem permissão para alterar preço.');const product=list(s,'produtos').find(x=>x.id===v.produtoId)||fail('Produto não localizado.');const weight=qtd*positive(product.pesoKg,'peso');Object.assign(v,{qtd,precoUnitario:price,pesoKg:weight,destino:required(b.destino,'endereço ou obra'),totalVenda:Math.round(qtd*price*100)/100,freteValor:Math.round(weight/1000*Number(v.fretePorTon||0)*100)/100});v.totalGeral=Math.round((v.totalVenda+(v.freteIncluso?0:v.freteValor))*100)/100;v.edicoes=[...(v.edicoes||[]),{id,at,actor:p.user_id,motivo,antes:before.find(x=>x.id===v.id)}];}
  // A higher order value must still fit the customer's actual available credit.
  if(rows.some(v=>['BOLETO','A PRAZO'].includes(v.formaPagamento))){const client=list(s,'clientes').find(c=>c.id===rows[0].clienteId)||fail('Cliente não localizado.');const receivables=list(s,'contasReceber').filter(t=>t.clienteId===client.id&&!/LIQUIDADO|PAGO|RECEBIDO/.test(norm(t.status)));const used=receivables.reduce((a,t)=>a+Number(t.saldoAberto??t.valor??0),0)+list(s,'vendas').filter(v=>v.clienteId===client.id&&!terminalSale(v)&&['BOLETO','A PRAZO'].includes(v.formaPagamento)&&!receivables.some(t=>t.vendaId===v.id||t.vendaId===v.grupoPedidoId)).reduce((a,v)=>a+Number(v.totalGeral||v.totalVenda||0),0);if(used>Number(client.limiteCredito||0))fail('Pedido excede o crédito disponível do cliente.');}
  return {id:b.vendaId};
 }
 if(b.action==='SALES_LINK'){
  const c=list(s,'cargas').find(c=>c.id===b.cargaId)||fail('Carga não localizada.');linkSales(s,c,b.vendaIds);return {cargaId:c.id};
 }
 if(['INVOICE_ALLOCATE','INVOICE_STOCK'].includes(b.action)){
  const n=list(s,'notasFiscais').find(n=>n.id===b.notaId)||fail('Nota não localizada.');
  if(allocatedInvoice(n)||list(s,'notasFiscais').some(x=>x.id!==n.id&&n.chave&&x.chave===n.chave&&allocatedInvoice(x))||list(s,'estoqueMov').some(m=>m.notaFiscalId===n.id||n.chave&&m.chaveNfe===n.chave))fail('Nota já destinada ou incorporada. Entrada duplicada bloqueada.');
  if(/CANCELAD|DENEGAD/.test(norm(n.status)))fail('Nota cancelada ou denegada.');
  const itens=invoiceItems(s,n,b.mapeamento),unit=list(s,'unidades').find(u=>u.id===b.unidadeId&&u.ativo!==false)||fail('Selecione a unidade de destino.');
  let cargaId=n.cargaId||b.cargaId||'',c=list(s,'cargas').find(c=>c.id===cargaId);
  if(cargaId&&!c)fail('Carga não localizada.');if(c?.finalizadaEm||c?.status==='CANCELADA')fail('Carga indisponível.');
  if(b.action==='INVOICE_STOCK'){
   if(!admin(p)&&p.permissoes?.incorporarEstoque!==true)fail('Sem permissão para incorporar estoque.');
   if(c&&(c.destinoTipo==='VENDA DIRETA'||c.vendaIds?.length||c.estoqueConsolidado||list(s,'estoqueMov').some(m=>m.cargaId===c.id&&String(m.tipo).startsWith('ENTRADA'))))fail('Carga já destinada ou incorporada.');
   s.estoqueMov=[...list(s,'estoqueMov'),...itens.map((i,index)=>({id:id+'-stock-'+index,notaFiscalId:n.id,cargaId,produtoId:i.produtoId,produto:i.produto,marca:i.marca,unidade:'FORTE ATACAREJO — ESTOQUE ÚNICO',destinoOperacional:unit.nome,tipo:'ENTRADA - NF BANCO DE NOTAS',qtd:i.qtd,quantidade:i.qtd,custoUnitario:i.custoUnitario,referencia:'NF '+n.numero,numeroNotaFiscal:n.numero,chaveNfe:n.chave,data:at.slice(0,10),dataHora:at,usuario:p.nome}))];
   Object.assign(n,{destinacao:'FORTE ATACAREJO',siglaDestino:'G',incorporadaEm:at,incorporadaPor:p.user_id,unidadeEstoque:unit.nome,status:'INCORPORADA AO ESTOQUE'});
   if(c)Object.assign(c,{estoqueConsolidado:true,destinoTipo:'GALPÃO',destinoEstoque:unit.nome});
  }else{
   const rows=selectedSales(s,b.vendaIds),linked=[...new Set(rows.map(v=>v.cargaId).filter(Boolean))];
   if(linked.length>1||linked.length===1&&cargaId&&linked[0]!==cargaId)fail('As vendas pertencem a cargas diferentes.');
   cargaId=cargaId||linked[0]||'';c=list(s,'cargas').find(x=>x.id===cargaId);
   if(cargaId&&!c)fail('Carga não localizada.');if(c?.finalizadaEm||c?.status==='CANCELADA'||c?.estoqueConsolidado)fail('Carga indisponível ou incorporada ao estoque.');
   const future=[...new Set([...(c?.vendaIds||[]),...rows.map(v=>v.id)])],all=selectedSales(s,future),qty=new Map();
   for(const i of itens)qty.set(i.produtoId,(qty.get(i.produtoId)||0)+i.qtd);
   for(const [product,count] of qty){if(all.filter(v=>v.produtoId===product).reduce((a,v)=>a+Number(v.qtd),0)!==count)fail('A soma das vendas deve corresponder à quantidade de cada produto na nota.');}
   if(all.some(v=>!qty.has(v.produtoId)))fail('Produto das vendas não consta na nota.');
   if(c){if(c.notaFiscalId&&c.notaFiscalId!==n.id||c.numeroNotaFiscal&&String(c.numeroNotaFiscal)!==String(n.numero))fail('A carga já tem outra nota fiscal.');for(const [product,count] of qty){if((c.itens||[]).filter(i=>i.produtoId===product).reduce((a,i)=>a+Number(i.qtd),0)!==count)fail('Nota diferente das quantidades da carga. Confira o fornecedor.');}if((c.itens||[]).some(i=>!qty.has(i.produtoId)))fail('A nota não cobre todos os produtos da carga.');}
   else{if(!b.fornecedorId)fail('Selecione o fornecedor da nota.');if(typeof b.palletAplica!=='boolean')fail('Confirme se a nota contém pallets.');const palletQty=b.palletAplica?positive(b.quantidadePaletes,'quantidade de pallets'):0;if(!Number.isSafeInteger(palletQty))fail('Quantidade de pallets deve ser inteira.');if(!['FOB','CIF'].includes(b.modalidadeFrete))fail('Selecione FOB ou CIF.');c={id:id+'-carga',codigo:'NF-'+(n.numero||id.slice(0,8))+'-'+id.slice(-6),itens,qtd:itens.reduce((a,i)=>a+i.qtd,0),pesoKg:itens.reduce((a,i)=>a+i.pesoKg,0),fornecedor:n.emitente,fornecedorId:b.fornecedorId||'',unidadeId:unit.id,unidade:unit.nome,origem:n.emitente||'',destino:'Clientes das vendas vinculadas',destinoTipo:'VENDA DIRETA',modalidadeFrete:b.modalidadeFrete,regraPallets:b.palletAplica?'Com pallets':'Sem pallets',palletQuantidade:palletQty,nfPalletsAplica:b.palletAplica,numeroPedidoFornecedor:(n.pedidos||[])[0]||'',status:'VERMELHO',fase:'NF VINCULADA — CONFERIR CARREGAMENTO',criadaEm:at,vendaIds:[]};s.cargas=[...list(s,'cargas'),c];}
   if(b.fornecedorId){const f=list(s,'fornecedores').find(f=>f.id===b.fornecedorId&&f.ativo!==false)||fail('Fornecedor não localizado.');if(c.fornecedorId&&c.fornecedorId!==f.id)fail('Fornecedor diferente da carga.');const digits=v=>String(v||'').replace(/\D/g,'');if(n.emitenteCnpj&&f.cnpj&&digits(n.emitenteCnpj)!==digits(f.cnpj))fail('CNPJ do fornecedor diferente da NF.');Object.assign(c,{fornecedorId:f.id,fornecedor:f.nome});}
   linkSales(s,c,b.vendaIds);cargaId=c.id;Object.assign(c,{destinoTipo:'VENDA DIRETA',notaFiscalId:n.id,numeroNotaFiscal:n.numero,dataNotaFiscal:n.emissao,valorNotaFiscal:n.valorNf});
   Object.assign(n,{destinacao:'CARGA DIRETA',siglaDestino:'D',status:'VINCULADA ÀS VENDAS',vendaIds:c.vendaIds});
   for(const v of all)Object.assign(v,{notaFiscalId:n.id,numeroNotaFiscal:n.numero,chaveNfe:n.chave||''});
  }
  Object.assign(n,{cargaId,destinadaEm:at,destinadaPor:p.user_id,mapeamentoProdutos:structuredClone(b.mapeamento)});
  const references=new Map([[n.documentoXmlId,'XML NF'],[n.danfeDocumentoId,'PDF NF']].filter(([ref])=>ref));
  for(const d of list(s,'documentos'))if(d.notaFiscalPrincipalId===n.id||references.has(d.id)||references.has(d.fileId)){d.cargaId=cargaId;d.notaFiscalPrincipalId=n.id;if(references.has(d.id)||references.has(d.fileId))d.categoria=references.get(d.id)||references.get(d.fileId);d.validationStatus||='RECEBIDO';}
  return {notaId:n.id,cargaId,warning:b.action==='INVOICE_STOCK'?'Nota incorporada ao estoque. Confira os pallets separadamente, quando houver.':'Vendas agrupadas no dossiê da carga. Documentos aguardam conferência.'};
 }
 return null;
}
