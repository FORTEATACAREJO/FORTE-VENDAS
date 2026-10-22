export const buyerCnpj=unit=>String(unit?.cnpj||'').replace(/\D/g,'');
export function supplierBuyerCode(supplier,unit){
 if(!supplier||!unit)return '';
 const key=buyerCnpj(unit);
 if(supplier.codigosPorCnpj&&typeof supplier.codigosPorCnpj==='object')return String(supplier.codigosPorCnpj[key]||'').trim();
 return supplier.codigoCnpj===key?String(supplier.codigoCliente||supplier.codigoForte||'').trim():'';
}
export function requireSupplierBuyerCode(supplier,unit){
 const code=supplierBuyerCode(supplier,unit);
 if(!buyerCnpj(unit)||!code)throw Error('Código do fornecedor pendente para '+(unit?.nome||'a unidade compradora')+'. Complete o código deste CNPJ no cadastro do fornecedor antes de enviar.');
 return code;
}
