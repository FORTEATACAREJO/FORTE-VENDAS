import React from 'react';
const quantity=value=>value==null?'—':Number(value).toLocaleString('pt-BR',{maximumFractionDigits:6});
export default function PatioReceipt({receipt}){
 if(!receipt)return <p>Este registro histórico não contém conferência do pátio.</p>;
 return <><h3>CONFERÊNCIA DO PÁTIO NO FECHAMENTO</h3><p>{receipt.liberado?'Todos os produtos conferidos e sem diferença.':'Conferência não liberada.'} Validada em {receipt.validadoEm?new Date(receipt.validadoEm).toLocaleString('pt-BR'):'—'}.</p><div className="table"><table><thead><tr><th>PRODUTO</th><th>ESTOQUE ÚNICO</th><th>BLOQUEADO</th><th>DISPONÍVEL</th><th>CONTADO</th><th>DIFERENÇA</th><th>CONFERENTE</th><th>GRAVADO EM</th></tr></thead><tbody>{(receipt.itens||[]).map(item=><tr key={item.produtoId}><td>{item.produto}</td><td>{quantity(item.total)}</td><td>{quantity(item.bloqueado)}</td><td>{quantity(item.disponivel)}</td><td>{quantity(item.contagem)}</td><td>{quantity(item.diferenca)}</td><td>{item.conferente||'—'}</td><td>{item.gravadoEm?new Date(item.gravadoEm).toLocaleString('pt-BR'):'—'}</td></tr>)}</tbody></table></div></>;
}
