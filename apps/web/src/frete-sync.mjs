export function orderReturnMessage(result, error, eventId) {
  if (error || result?.error || result?.ok !== true || !eventId ||
      !Array.isArray(result.confirmedEvents) || !result.confirmedEvents.includes(eventId) ||
      result.pending?.includes(eventId)) {
    return 'Pedido vinculado. O retorno ao Frete aguarda nova sincronização.';
  }
  return 'Pedido vinculado e retorno confirmado no Frete.';
}
