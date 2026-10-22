import {test} from 'node:test';import assert from 'node:assert/strict';
import {supplierBuyerCode,requireSupplierBuyerCode} from '../supabase/functions/orders-workflow/supplier-buyer-codes.mjs';
import {applyWorkflow} from '../supabase/functions/orders-workflow/domain.mjs';
test('buyer CNPJ selects independent supplier codes, ignoring load origin and unconfirmed legacy code',()=>{
 const mg={id:'mg',nome:'Matriz MG',cnpj:'11.111.111/0001-91'},go={id:'go',nome:'Filial GO',cnpj:'11.111.111/0002-72'};
 const f={codigoForte:'LEGACY-GO',codigosPorCnpj:{'11111111000191':'MG-001','11111111000272':'GO-002'}};
 assert.equal(supplierBuyerCode(f,mg),'MG-001');assert.equal(supplierBuyerCode(f,go),'GO-002');
 assert.throws(()=>requireSupplierBuyerCode({...f,codigosPorCnpj:{'11111111000272':'GO-002'}},mg),/pendente.*Matriz/);
 assert.equal(supplierBuyerCode({codigoForte:'UNCERTAIN-LIZ',codigosPorCnpj:{}},go),'');
 assert.equal(supplierBuyerCode({codigoForte:'UNSCOPED'},mg),'');
});
test('the order saved for MG loading in GO keeps the MG code and buyer CNPJ in its snapshot',()=>{
 const s={settings:{},unidades:[{id:'mg',nome:'Matriz MG',cnpj:'11111111000191'}],fornecedores:[{id:'f',nome:'CSN',codigosPorCnpj:{'11111111000191':'MG-001','11111111000272':'GO-002'},condicaoPagamento:'14 DIAS'}],produtos:[{id:'p',nome:'Cimento',marca:'CSN',pesoKg:50,precoNegociado:20}],motoristas:[]};
 const p={user_id:'admin',nome:'Master',perfil:'MASTER',ativo:true,status_aprovacao:'APROVADO'};
 const out=applyWorkflow(s,{requestId:'req',action:'SUPPLIER_CREATE',unidadeId:'mg',fornecedorId:'f',itens:[{produtoId:'p',qtd:1}],origem:'Fábrica em Goiás',destino:'Obra',destinoTipo:'A DEFINIR',modalidadeFrete:'CIF',pagamento:'14 DIAS',regraPallets:'Sem pallets'},p,{id:'new',at:'2026-10-22T10:00:00Z'}).state;
 const order=out.comprasFornecedor[0];assert.equal(order.codigoFornecedor,'MG-001');assert.equal(order.cnpjComprador,'11111111000191');assert.equal(order.fornecedorSnapshot.codigoCliente,'MG-001');assert.equal(out.fornecedores[0].codigosPorCnpj['11111111000272'],'GO-002');
});
