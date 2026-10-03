// Inputs accept Brazilian currency and decimal-point values without silently
// turning 100.50 into 10050. Stored/calculated amounts use rounded cents.
export const roundMoney = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export function parseMoneyInput(value) {
  if (typeof value === "number") return Number.isFinite(value) ? roundMoney(value) : NaN;
  if (typeof value !== "string") return NaN;
  const text = value.trim();
  let normalized;
  if (/^-?(?:\d+|\d{1,3}(?:\.\d{3})+),\d{1,2}$/.test(text)) normalized = text.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d+(?:\.\d{1,2})?$/.test(text)) normalized = text;
  else if (/^-?\d{1,3}(?:\.\d{3})+$/.test(text)) normalized = text.replace(/\./g, "");
  else return NaN;
  const number = Number(normalized);
  return Number.isFinite(number) && Number.isSafeInteger(Math.round(number * 100)) ? roundMoney(number) : NaN;
}

export function isClosedTitle(title) {
  const status = String(title?.status || "").trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return /^(?:PAGO|PAGA|LIQUIDADO|LIQUIDADA|RECEBIDO|RECEBIDA|CONCILIADO|CONCILIADA|CREDITADO|CREDITADA|CANCELADO|CANCELADA)(?:\b|\/)/.test(status);
}

export function titleOpenAmount(title, direction = "receber") {
  if (isClosedTitle(title)) return 0;
  const received = Number(direction === "pagar" ? title.valorPago || 0 : title.valorRecebido || 0);
  const amount = title.saldoAberto != null ? Number(title.saldoAberto) : Number(title.valor || 0) - received;
  return Number.isFinite(amount) ? roundMoney(Math.max(0, amount)) : 0;
}

export function customerCreditAvailable(credit) {
  if (["UTILIZADO", "CANCELADO", "CANCELADA"].includes(String(credit.status || "").toUpperCase())) return 0;
  const amount = Number(credit.saldo ?? credit.valor ?? 0);
  return Number.isFinite(amount) ? roundMoney(Math.max(0, amount)) : 0;
}

export function cashPayments(sale) {
  // Partial sales can include old credit and generate change as new credit.
  // Only the new receipt belongs to today's cash/payment-method conference.
  if (sale.origemVendaParcial === "VALOR RECEBIDO") return [{forma:sale.pagamento || "NÃO INFORMADO", valor:roundMoney(sale.valorRecebido || 0)}];
  return sale.pagamentos?.length ? sale.pagamentos : [{forma:sale.pagamento || "NÃO INFORMADO", valor:roundMoney(sale.total || 0)}];
}

export function cashAmountByMethod(methods) {
  return roundMoney(Object.entries(methods).filter(([name]) => ["DINHEIRO", "A VISTA", "À VISTA"].includes(name.trim().toUpperCase())).reduce((sum, [, value]) => sum + Number(value || 0), 0));
}

export function creditCreatedBySale(credit, sale) {
  if (credit.vendaId) return credit.vendaId === sale.id;
  return String(credit.origem || "").trim() === `SALDO VENDA PARCIAL ${sale.numeroVenda || sale.id}`;
}

export function undoSaleCredits(credits, sale) {
  const generated = credits.filter(credit => creditCreatedBySale(credit, sale));
  if (generated.some(credit => customerCreditAvailable(credit) < roundMoney(credit.valor || 0))) throw new Error("ESTORNO BLOQUEADO: O CRÉDITO GERADO NESTA VENDA JÁ FOI UTILIZADO. ESTORNE PRIMEIRO A UTILIZAÇÃO.");
  const uses = sale.creditosUtilizados || [];
  if (Math.abs(uses.reduce((sum, use) => sum + Number(use.valor || 0), 0) - Number(sale.creditoUsado || 0)) > 0.009) throw new Error("ESTORNO BLOQUEADO: A UTILIZAÇÃO DO CRÉDITO NÃO POSSUI DETALHAMENTO PARA DEVOLUÇÃO SEGURA. CONFIRA O HISTÓRICO.");
  for (const use of uses) {
    const credit = credits.find(item => item.id === use.creditoId);
    if (!credit || Number(credit.saldo ?? credit.valor ?? 0) + Number(use.valor) > Number(credit.valor) + 0.009) throw new Error("ESTORNO BLOQUEADO: O SALDO DO CRÉDITO NÃO PERMITE ESTA DEVOLUÇÃO.");
  }
  return credits.filter(credit => !creditCreatedBySale(credit, sale)).map(credit => {
    const restore = uses.filter(use => use.creditoId === credit.id).reduce((sum, use) => sum + Number(use.valor), 0);
    return restore ? {...credit, saldo:roundMoney(Number(credit.saldo ?? credit.valor ?? 0) + restore), status:"DISPONÍVEL", ultimaUtilizacaoEstornadaVenda:sale.numeroVenda || sale.id} : credit;
  });
}
