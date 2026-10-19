import {terminalSale,allocatedInvoice} from '../../../supabase/functions/orders-workflow/operation-sheet.mjs';
export {allocatedInvoice};
export function operationRows(data){
 const groups=new Map(),loads=data.cargas||[];
 for(const sale of data.vendas||[]){const load=loads.find(c=>c.id===sale.cargaId),id=load?'load:'+load.id:'sale:'+(sale.grupoPedidoId||sale.id);if(!groups.has(id))groups.set(id,{id,source:'vendas',load,sales:[]});groups.get(id).sales.push(sale);}
 for(const load of loads)if(!groups.has('load:'+load.id))groups.set('load:'+load.id,{id:'load:'+load.id,source:'vendas',load,sales:[]});
 for(const ext of data.vendasExternas||[])if(!ext.vendaInternaId)groups.set('ext:'+ext.id,{id:'ext:'+ext.id,source:'externas',external:ext,sales:[]});
 return [...groups.values()].map(row=>({...row,history:row.external?terminalSale(row.external):row.load?.status==='CANCELADA'||row.sales.length>0&&row.sales.every(terminalSale)&&(!row.load||!!row.load.finalizadaEm)||!row.sales.length&&!!row.load?.finalizadaEm})).sort((a,b)=>String(b.external?.criadoEm||b.load?.criadaEm||b.sales[0]?.criadoEm||'').localeCompare(String(a.external?.criadoEm||a.load?.criadaEm||a.sales[0]?.criadoEm||'')));
}
export function purchaseSeed(data,ids){
 const rows=(data.vendas||[]).filter(v=>ids.includes(v.id));const items=new Map();for(const v of rows){const old=items.get(v.produtoId);items.set(v.produtoId,{marca:v.marca,produtoId:v.produtoId,qtd:Number(v.qtd)+(old?.qtd||0)});}return {destinoTipo:'VENDA DIRETA',destino:[...new Set(rows.map(v=>v.destino||v.cliente).filter(Boolean))].join(' / '),itens:[...items.values()]};
}
