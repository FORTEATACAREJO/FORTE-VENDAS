export async function loadFinancialData(client) {
  const [titles,cash,bills,batches]=await Promise.all([
    client.rpc('fc_financeiro_titulos'),
    client.from('fc_caixa_fechamentos').select('id,data,status,saldo_inicial,saldo_contado,diferenca,fechado_em,total_vendas,unidade,operador,snapshot').order('data',{ascending:false}).limit(100),
    client.from('pre_conferencia_boletos').select('id,fornecedor,nf,vencimento,valor,status,divergencias').order('criado_em',{ascending:false}).limit(100),
    client.from('pagamentos_itau_lotes').select('id,total,status,protocolo_bancario,enviado_em,confirmado_em').order('criado_em',{ascending:false}).limit(50),
  ]);
  const failed=[titles,cash,bills,batches].find(result=>result.error);
  if(failed)throw new Error('Não foi possível atualizar o Financeiro: '+failed.error.message);
  const sorted=(titles.data||[]).sort((a,b)=>String(a.vencimento||'9999').localeCompare(String(b.vencimento||'9999')));
  return {pagar:sorted.filter(x=>x.tipo==='PAGAR'),receber:sorted.filter(x=>x.tipo==='RECEBER'),caixas:cash.data||[],boletos:bills.data||[],lotes:batches.data||[]};
}
