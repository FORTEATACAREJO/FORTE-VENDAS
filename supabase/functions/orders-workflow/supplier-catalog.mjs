const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
const active=x=>x.ativo!==false,arr=(s,k)=>s[k]||[];
export function isResaleProduct(p) {
 const purpose=norm(p?.finalidade||p?.purpose||p?.tipoProduto||p?.classificacao||p?.destinacao||'REVENDA');
 return !!p&&active(p)&&p.revenda!==false&&!/USO|CONSUMO|IMOBILIZADO/.test(purpose);
}
export function supplierProducts(s,id) {
 const f=arr(s,'fornecedores').find(x=>x.id===id);if(!f)return [];
 const brands=(f.marcas||norm(f.nome).split(/\s*\/\s*/)).map(norm);
 return arr(s,'produtos').filter(p=>isResaleProduct(p)&&(p.fornecedorId===id||(p.fornecedorIds||[]).includes(id)||arr(s,'custosFornecedor').some(c=>active(c)&&c.fornecedorId===id&&c.produtoId===p.id)||brands.includes(norm(p.marca))));
}
