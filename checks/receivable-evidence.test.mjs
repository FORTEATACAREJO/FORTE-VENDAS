import test from 'node:test';
import assert from 'node:assert/strict';
import {storeReceivableFile,appendReceiptEvidence} from '../apps/web/src/receivable-evidence.js';
const file=new File(['evidência sintética'],'comprovante.pdf',{type:'application/pdf'});
const fixture=(error=null)=>{const calls=[];return {calls,client:{storage:{from:bucket=>({upload:async(path,file,options)=>{calls.push({bucket,path,file,options});return {error};}})}}};};
test('arquivo é persistido com hash e empresa, sem sobrescrever outro anexo',async()=>{
 const f=fixture();const doc=await storeReceivableFile({client:f.client,empresaId:'empresa-1',saleId:'venda-1',kind:'comprovante',file});
 assert.match(doc.storagePath,/^empresa-1\/recebiveis\/comprovante\/venda-1\/[a-f0-9]{64}$/);assert.equal(f.calls[0].options.upsert,false);assert.equal(f.calls[0].file,file);assert.equal(doc.arquivo,file.name);
});
test('envio repetido encontra o mesmo documento e não o substitui',async()=>{
 const f=fixture({statusCode:409});const args={client:f.client,empresaId:'empresa-1',saleId:'venda-1',kind:'comprovante',file};assert.equal((await storeReceivableFile(args)).storagePath,(await storeReceivableFile(args)).storagePath);
});
test('anexo não altera títulos, pagamentos, saldos nem caixa',()=>{
 const state={contasReceber:[{id:'t',valor:100,saldoAberto:100,status:'ABERTO'}],caixasBalcao:[{id:'cx'}],pagamentos:[]};const copy=structuredClone(state);
 const next=appendReceiptEvidence(state,{id:'doc',vendaId:'v',storagePath:'empresa/doc',valor:100,status:'LIQUIDADO'});
 assert.deepEqual(state,copy);assert.equal(next.contasReceber,state.contasReceber);assert.equal(next.caixasBalcao,state.caixasBalcao);assert.equal(next.pagamentos,state.pagamentos);assert.equal(next.comprovantesClientes[0].status,'PENDENTE DE CONFERÊNCIA');assert.equal(next.comprovantesClientes[0].baixaAutomatica,false);
});
test('duplicidade é por documento e venda, sem duplicar evidência',()=>{
 const doc={id:'d',vendaId:'v',storagePath:'empresa/doc',valor:100};const first=appendReceiptEvidence({},doc);assert.equal(appendReceiptEvidence(first,doc),first);
});
test('falha de rede ou permissão não anuncia documento guardado',async()=>{
 const f=fixture({statusCode:403});await assert.rejects(storeReceivableFile({client:f.client,empresaId:'empresa-1',saleId:'venda-1',kind:'boleto',file}),/guardar o documento/);
});
test('empresa, venda, arquivo, tamanho e valor inválidos são bloqueados',async()=>{
 const f=fixture();for(const bad of [{empresaId:null},{saleId:'../outra'},{kind:'outro'},{file:new File([],'vazio.pdf',{type:'application/pdf'})},{file:{size:11*1024*1024,type:'application/pdf'}},{file:new File(['x'],'x.html',{type:'text/html'})}])await assert.rejects(storeReceivableFile({client:f.client,empresaId:'empresa-1',saleId:'venda-1',kind:'boleto',file,...bad}));assert.equal(f.calls.length,0);
 for(const valor of [NaN,Infinity,-1,0])assert.throws(()=>appendReceiptEvidence({},{vendaId:'v',storagePath:'doc',valor}));
});
