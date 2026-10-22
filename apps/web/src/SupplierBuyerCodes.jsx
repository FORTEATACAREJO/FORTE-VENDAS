import React from 'react';
import {buyerCnpj} from '../../../supabase/functions/orders-workflow/supplier-buyer-codes.mjs';
export default function SupplierBuyerCodes({supplier,units,onChange}){
 return <section className="card"><h3>Nosso código neste fornecedor — por CNPJ comprador</h3><p>Selecione a unidade no pedido. O local de carregamento não altera o CNPJ comprador.</p>{units.map(unit=><label className="field" key={unit.id}>{unit.nome} · {unit.cnpj}<input aria-label={`Código ${unit.nome}`} value={supplier.codigosPorCnpj?.[buyerCnpj(unit)]||''} onChange={e=>onChange({...supplier,codigosPorCnpj:{...(supplier.codigosPorCnpj||{}),[buyerCnpj(unit)]:e.target.value.trim()}})} placeholder="Pendente — preencher o código desta unidade"/></label>)}{supplier.codigoForte&&!Object.values(supplier.codigosPorCnpj||{}).includes(supplier.codigoForte)&&<p role="status">Código anterior a confirmar: {supplier.codigoForte}. Confira a qual CNPJ pertence antes de preencher acima.</p>}</section>;
}
