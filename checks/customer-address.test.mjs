import test from 'node:test';
import assert from 'node:assert/strict';
import {customerAddressError,normalizeCustomerAddress,companyAddressPatch,consultarCnpj,mergeMissingCustomerDetails} from '../apps/web/src/customer-address.js';
const valid={documento:'03698525000130',cep:'38550026',uf:'MG'};
test('cadastro rejeita documento inválido, CEP ausente/zerado e UF ausente/inexistente para CPF e CNPJ',()=>{
 assert.equal(customerAddressError(valid),'');
 assert.equal(customerAddressError({...valid,documento:'52998224725'}),'');
 for(const row of [{...valid,documento:'11111111111'},{...valid,cep:''},{...valid,cep:'00000000'},{...valid,cep:'1234'},{...valid,uf:''},{...valid,uf:'XX'}])assert.notEqual(customerAddressError(row),'');
 assert.deepEqual(normalizeCustomerAddress({documento:'03.698.525/0001-30',cep:'38550-026',uf:' mg '}),valid);
});
test('consulta CNPJ rejeita troca de identidade e preserva campos ausentes no retorno',()=>{
 assert.throws(()=>companyAddressPatch({cnpj:'08777750000186'},valid.documento));
 const p=companyAddressPatch({cnpj:valid.documento,razao_social:'Empresa',cep:'38550-026',uf:'MG'},valid.documento);
 assert.equal(p.cep,'38550026');assert.equal(p.uf,'MG');assert.equal('logradouro' in p,false);
});
test('CPF e consulta sem consentimento nunca são enviados ao fornecedor externo',async()=>{
 let calls=0;const fetchImpl=async()=>{calls++;throw Error('não deveria consultar');};
 await assert.rejects(consultarCnpj('52998224725',{consent:true,fetchImpl}));
 await assert.rejects(consultarCnpj(valid.documento,{fetchImpl}));assert.equal(calls,0);
});
test('falha externa mantém cadastro bloqueado e resposta de outro CNPJ não é aceita',async()=>{
 await assert.rejects(consultarCnpj(valid.documento,{consent:true,fetchImpl:async()=>({ok:false})}));
 await assert.rejects(consultarCnpj(valid.documento,{consent:true,fetchImpl:async()=>({ok:true,json:async()=>({cnpj:'08777750000186'})})}));
});

test('consulta de CNPJ completa somente campos vazios e preserva dados verificados',()=>{
 const prior={documento:valid.documento,nome:'NOME CONFERIDO',logradouro:'RUA CONFERIDA',telefone:'34999998888',email:'operacao@empresa.example',cep:'',inscricaoEstadual:''};
 const incoming={documento:valid.documento,nome:'NOME API',logradouro:'RUA API',telefone:'3411111111',email:'api@empresa.example',cep:'38550026',inscricaoEstadual:'123456789',consultadoEm:'2026-10-21T12:00:00Z'};
 const next=mergeMissingCustomerDetails(prior,incoming);
 assert.equal(next.nome,prior.nome);
 assert.equal(next.logradouro,prior.logradouro);
 assert.equal(next.telefone,prior.telefone);
 assert.equal(next.email,prior.email);
 assert.equal(next.cep,'38550026');
 assert.equal(next.inscricaoEstadual,'123456789');
 assert.equal(next.consultadoEm,incoming.consultadoEm);
 assert.equal(prior.cep,'');
 assert.throws(()=>mergeMissingCustomerDetails(prior,{documento:'08777750000186',logradouro:'RUA ERRADA'}));
});
