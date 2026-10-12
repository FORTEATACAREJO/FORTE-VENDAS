const norm = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const brandIdentity = value => norm(value) === 'CIPLAM' ? 'CIPLAN' : norm(value);
export const documentIdentity = row => String(row.documento || row.cpfCnpj || row.cnpjCpf || row.cpf || row.cnpj || '').replace(/\D/g, '');
export function productSpec(description, brand) {
 let name = String(description || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
 for (const [roman, number] of [['III', 3], ['IV', 4], ['II', 2], ['V', 5], ['I', 1]]) name = name.replace(new RegExp(`CP[\\s./_-]*${roman}`, 'g'), `CP${number}`);
 name = norm(name.replace(/\d+(?:[.,]\d+)?\s*KG/g, ' '));
 const canonicalBrand = brandIdentity(brand); if (canonicalBrand) name = name.split(canonicalBrand).join('');
 const match = name.match(/CP([1-5])([EFZ]?)(\d{2})/);
 if (match) return `CP${match[1]}${match[2]}${match[3]}${name.includes('RS') ? 'RS' : ''}`;
 if (name.includes('CP5') && name.includes('ARI')) return `CP5ARI${name.includes('RS') ? 'RS' : ''}`;
 return name;
}
export function productIdentityKeys(row) {
 const brand = brandIdentity(row.marca || row.brand);
 const weight = Number(row.pesoKg || 0);
 const keys = [`${brand}|S|${productSpec(row.nomeExatoContador || row.nome, brand)}|${weight}`];
 const gtin = String(row.gtin || '').replace(/\D/g, '');
 if ([8,12,13,14].includes(gtin.length)) keys.push(`${brand}|G|${gtin}`);
 return keys;
}
export function registryConflict(type, row, list, editingId) {
 if (!['clientes','fornecedores','usuarios','funcionarios','produtos'].includes(type)) return '';
 const others = list.filter(x => String(x.id) !== String(editingId));
 if (type === 'produtos') {
  if ((!editingId || editingId === 'new') && !brandIdentity(row.marca || row.brand)) return 'INFORME A MARCA DO PRODUTO.';
  const keys = productIdentityKeys(row);
  const duplicate = others.find(x => productIdentityKeys(x).some(k => keys.includes(k)));
  return duplicate ? `PRODUTO DUPLICADO DA MESMA MARCA: ${duplicate.nome}. UTILIZE O CADASTRO EXISTENTE.` : '';
 }
 const doc = documentIdentity(row);
 if ((!editingId || editingId === 'new') && !doc) return 'INFORME CPF/CNPJ PARA CADASTRAR.';
 const duplicate = others.find(x => (doc && documentIdentity(x) === doc) || (type === 'fornecedores' && brandIdentity(x.nome) === brandIdentity(row.nome)));
 return duplicate ? `CPF/CNPJ OU FORNECEDOR JÁ CADASTRADO: ${duplicate.nome}. UTILIZE O CADASTRO EXISTENTE.` : '';
}
