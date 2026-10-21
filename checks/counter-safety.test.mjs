import {test} from 'node:test';import assert from 'node:assert/strict';
import {counterDraftKey,readCounterDraft,counterCancellationBlock} from '../apps/web/src/counter-draft.js';
test('rascunhos são separados por empresa, usuário e unidade; não importa chave legada',()=>{
 const user={id:'a',empresaId:'one'},key=counterDraftKey(user,'GO');
 assert.notEqual(key,counterDraftKey({...user,id:'b'},'GO'));assert.notEqual(key,counterDraftKey({...user,empresaId:'two'},'GO'));assert.notEqual(key,counterDraftKey(user,'MG'));assert.equal(counterDraftKey({},'GO'),null);
 const values=new Map([['forte-vendas-balcao-itens-rascunho-v628','[{"produtoId":"segredo"}]'],[key,'[{"produtoId":"proprio"}]']]);const storage={getItem:k=>values.get(k)};
 assert.deepEqual(readCounterDraft(storage,counterDraftKey({...user,id:'b'},'GO')),[]);assert.equal(readCounterDraft(storage,key)[0].produtoId,'proprio');
});
test('cancelamento exige procedimento próprio para nota, título, comprovante, entrega ou pallet e bloqueia repetição',()=>{
 const sale={id:'s1',numeroVenda:'VB0001',status:'CONCLUÍDA'};assert.equal(counterCancellationBlock({},sale),'');
 for(const key of ['notasFiscais','documentos','contasPagar','contasReceber','boletosClientes','comprovantesClientes','fretesBalcao','patioSaidas'])assert(counterCancellationBlock({[key]:[{vendaId:'s1'}]},sale));
 assert(counterCancellationBlock({palletClientes:[{documento:'VB0001 • ORC01'}]},sale));assert(counterCancellationBlock({}, {...sale,nfEmitida:true}));assert(counterCancellationBlock({}, {...sale,status:'CANCELADA'}));
});
