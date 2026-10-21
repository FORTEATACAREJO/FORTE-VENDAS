import {supplierProducts} from '../orders-workflow/supplier-catalog.mjs';
export function freightCatalog(state){
 const suppliers=(state.fornecedores||[]).filter(x=>x.ativo!==false);
 const locations=(state.locais||[]).filter(x=>x.ativo!==false);
 return {
  fornecedores:suppliers.map(f=>({id:String(f.id),nome:String(f.nome||f.razaoSocial||''),locais:locations.filter(l=>String(l.fornecedorId||l.fornecedor_id||'')===String(f.id)).map(l=>String(l.id))})),
  locais:locations.map(l=>({id:String(l.id),nome:String(l.nome||''),fornecedorId:String(l.fornecedorId||l.fornecedor_id||''),cidade:String(l.cidade||''),uf:String(l.uf||''),ibge:String(l.codigoIbge||l.ibge||'')})),
  produtos:(state.produtos||[]).filter(p=>p.ativo!==false).map(p=>({id:String(p.id),nome:String(p.nome||''),marca:String(p.marca||''),unidade:String(p.unidadeVenda||p.unidade||''),pesoKg:Number(p.pesoKg)||null,fornecedores:suppliers.filter(f=>supplierProducts(state,f.id).some(item=>item.id===p.id)).map(f=>String(f.id))})).filter(p=>p.fornecedores.length)
 };
}
