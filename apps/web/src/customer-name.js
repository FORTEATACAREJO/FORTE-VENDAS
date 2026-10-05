// Display names only: never changes customer IDs, legal names or stored records.
const clean=value=>String(value??'').trim();
const trade=c=>clean(c?.nomeFantasia)||clean(c?.nome_fantasia)||clean(c?.fantasia)||clean(c?.trade_name);
export function customerName(record,customers=[]) {
 if(!record)return '';
 if(typeof record==='string')record={cliente:record};
 const id=record.clienteId||record.customerId;
 const legal=clean(record.cliente||record.nomeCliente||record.clienteNome||record.nome||record.legal_name||record.razaoSocial);
 let customer=id?customers.find(c=>c.id===id):null;
 if(!customer&&legal){const matches=customers.filter(c=>[c.nome,c.razaoSocial,c.legal_name].some(n=>clean(n)===legal));if(matches.length===1)customer=matches[0];}
 return trade(customer)||trade(record)||legal;
}
