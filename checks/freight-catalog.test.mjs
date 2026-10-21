import {test} from 'node:test';
import assert from 'node:assert/strict';
import {freightCatalog} from '../supabase/functions/frete-catalog/projection.mjs';
test('Frete receives only operational catalog fields, with original IDs and supplier-product relations',()=>{
 const state={fornecedores:[{id:'f',nome:'Fornecedor fictício',senha:'private',cnpj:'private',whatsapp:'private',limiteCredito:999},{id:'inactive',nome:'Inativo',ativo:false}],locais:[{id:'l',nome:'Expedição fictícia',fornecedorId:'f'}],produtos:[{id:'p',nome:'Produto fictício',marca:'Teste',pesoKg:25,unidade:'UN',fornecedorId:'f',precoTabela:999,senha:'private'},{id:'internal',nome:'Uso interno',fornecedorId:'f',revenda:false}]};
 const result=freightCatalog(state);assert.equal(result.fornecedores.length,1);assert.equal(result.produtos.length,1);assert.equal(result.produtos[0].pesoKg,25);assert.equal(result.produtos[0].fornecedores[0],'f');assert.equal(result.fornecedores[0].locais[0],'l');for(const value of ['senha','cnpj','whatsapp','limiteCredito','precoTabela','private'])assert(!JSON.stringify(result).includes(value));
});
