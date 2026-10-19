export const routeKey=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
export function findFreightRate(rates,origin,destination,selected){
 const matches=(rates||[]).filter(r=>r.ativa!==false&&(selected?r.id===selected:routeKey(r.origem)===routeKey(origin)&&routeKey(r.destino)===routeKey(destination)));
 return matches.length===1?matches[0]:null;
}
export function resolveFreightRate(value,tariff){
 const blank=value===null||value===undefined||typeof value==='string'&&!value.trim();
 if(!blank&&!['number','string'].includes(typeof value))throw Error('Informe um valor de frete válido.');
 if(blank&&!tariff)throw Error('Informe o valor combinado ou cadastre uma sugestão para esta rota na tabela de frete.');
 const amount=Number(blank?tariff.valor_por_t:value);
 if(!Number.isFinite(amount)||amount<0||amount>9999999999.99)throw Error('Informe um valor de frete válido.');
 return {valor:Math.round((amount+Number.EPSILON)*100)/100,fonte:blank?'TABELA':'COMBINADO',tarifaId:blank?tariff.id:null};
}
