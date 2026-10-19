const rounded = amount => Math.round((amount + Number.EPSILON) * 100) / 100;
export function openTitleAmount(title) {
  const status=String(title.status||"").trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  if(/^(?:PAGO|PAGA|LIQUIDADO|LIQUIDADA|RECEBIDO|RECEBIDA|CONCILIADO|CONCILIADA|CREDITADO|CREDITADA|CANCELADO|CANCELADA)(?:\b|\/)/.test(status))return 0;
  const amount=Number(title.saldo??title.valor??0);
  return Number.isFinite(amount)?rounded(Math.max(0,amount)):0;
}
export function financialSummary(data) {
  const pagar=(data.pagar||[]).filter(title=>openTitleAmount(title)>0);
  const receber=(data.receber||[]).filter(title=>openTitleAmount(title)>0);
  return {pagar,receber,totalPagar:rounded(pagar.reduce((sum,title)=>sum+openTitleAmount(title),0)),totalReceber:rounded(receber.reduce((sum,title)=>sum+openTitleAmount(title),0))};
}
