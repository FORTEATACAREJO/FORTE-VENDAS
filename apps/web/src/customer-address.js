export const CUSTOMER_UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
const digits = value => String(value ?? '').replace(/\D/g, '');
export function validCustomerDocument(value) {
 const d = digits(value);
 if (![11,14].includes(d.length) || /^(.)\1+$/.test(d)) return false;
 const weights = d.length === 11 ? [[10,9,8,7,6,5,4,3,2],[11,10,9,8,7,6,5,4,3,2]] : [[5,4,3,2,9,8,7,6,5,4,3,2],[6,5,4,3,2,9,8,7,6,5,4,3,2]];
 const check = (s,w) => { const n = [...s].reduce((a,c,i) => a + Number(c)*w[i],0)%11; return n < 2 ? 0 : 11-n; };
 return check(d.slice(0,-2),weights[0]) === Number(d.at(-2)) && check(d.slice(0,-1),weights[1]) === Number(d.at(-1));
}
export function normalizeCustomerAddress(row) {
 return {...row,documento:digits(row.documento || row.cnpj || row.cpf),cep:digits(row.cep),uf:String(row.uf || '').trim().toUpperCase()};
}
export function customerAddressError(row) {
 const r = normalizeCustomerAddress(row);
 if (!validCustomerDocument(r.documento)) return 'INFORME CPF/CNPJ VÁLIDO DO CLIENTE.';
 if (!/^\d{8}$/.test(r.cep) || r.cep === '00000000') return 'CEP OBRIGATÓRIO: INFORME 8 DÍGITOS VÁLIDOS.';
 if (!CUSTOMER_UFS.includes(r.uf)) return 'UF OBRIGATÓRIA: SELECIONE UM ESTADO VÁLIDO.';
 return '';
}
export function companyAddressPatch(company, expectedDocument) {
 const expected = digits(expectedDocument);
 if (expected.length !== 14 || !validCustomerDocument(expected) || digits(company?.cnpj) !== expected) throw Error('A CONSULTA NÃO CORRESPONDE AO CNPJ INFORMADO.');
 const upper = v => String(v || '').trim().toUpperCase();
 const street = [company.descricao_tipo_de_logradouro,company.logradouro].filter(Boolean).join(' ');
 const raw = {
  documento:expected,nome:upper(company.nome_fantasia || company.razao_social),razaoSocial:upper(company.razao_social),nomeFantasia:upper(company.nome_fantasia),
  cep:digits(company.cep),uf:upper(company.uf),logradouro:upper(street),numero:upper(company.numero),bairro:upper(company.bairro),cidade:upper(company.municipio),
  endereco:upper([street,company.numero].filter(Boolean).join(' ')),fonteCadastro:'BRASILAPI (CNPJ)',consultadoEm:new Date().toISOString(),
 };
 // An unavailable field must not erase a previously verified address.
 return Object.fromEntries(Object.entries(raw).filter(([,v]) => v !== ''));
}
export async function consultarCnpj(document, { consent = false, fetchImpl = fetch } = {}) {
 const d = digits(document);
 if (d.length !== 14 || !validCustomerDocument(d)) throw Error('INFORME UM CNPJ VÁLIDO COM 14 DÍGITOS. PARA CPF, PREENCHA O ENDEREÇO E CONSULTE O CEP.');
 if (!consent) throw Error('CONFIRME A CONSULTA DO CNPJ NA BRASILAPI.');
 const r = await fetchImpl('https://brasilapi.com.br/api/cnpj/v1/'+d,{signal:AbortSignal.timeout(12000),credentials:'omit',redirect:'error'});
 if (!r.ok) throw Error('CONSULTA CNPJ INDISPONÍVEL. PREENCHA OS DADOS OBRIGATÓRIOS; O CADASTRO NÃO SERÁ LIBERADO INCOMPLETO.');
 const company = await r.json(); companyAddressPatch(company,d); return company;
}
