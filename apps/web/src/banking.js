export const BANK_EVENT_STATUS = {
  PAGO: "PAGAMENTO IDENTIFICADO",
  LIQUIDADO: "LIQUIDADO / CONCILIADO",
  CREDITADO: "LIQUIDADO / CONCILIADO",
  PARCIAL: "PARCIALMENTE PAGO",
  VENCIDO: "VENCIDO",
  BAIXADO: "BAIXADO SEM PAGAMENTO",
  CANCELADO: "BAIXADO SEM PAGAMENTO",
  REJEITADO: "REJEITADO",
};

export function normalizeBankEventStatus(value = "") {
  const key = String(value).trim().toUpperCase().replace(/[^A-Z]/g, "");
  if (key.includes("LIQUID") || key.includes("CREDIT")) return BANK_EVENT_STATUS.LIQUIDADO;
  if (key.includes("PARCIAL")) return BANK_EVENT_STATUS.PARCIAL;
  if (key.includes("PAGO") || key.includes("PAGAMENTO")) return BANK_EVENT_STATUS.PAGO;
  if (key.includes("VENC")) return BANK_EVENT_STATUS.VENCIDO;
  if (key.includes("BAIX") || key.includes("CANCEL")) return BANK_EVENT_STATUS.BAIXADO;
  if (key.includes("REJEIT")) return BANK_EVENT_STATUS.REJEITADO;
  return "PENDENTE";
}

export function eventQuitsReceivable(status) {
  return normalizeBankEventStatus(status) === BANK_EVENT_STATUS.LIQUIDADO;
}

export function connectionMissingFields(connection) {
  const required = [
    ["convênio", connection?.convenio],
    ["Client ID", connection?.clientId],
    ["URL da API", connection?.apiBaseUrl],
    ["segredo no servidor", connection?.secretConfigurado],
    ["certificado no servidor", connection?.certificadoConfigurado],
  ];
  return required.filter(([, value]) => !value).map(([label]) => label);
}
