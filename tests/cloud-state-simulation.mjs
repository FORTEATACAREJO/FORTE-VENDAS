import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCloudStateStore} from '../apps/web/src/cloud-state.js';
function fixture(initial={estado:{n:0},versao:4}){
 const calls=[],errors=[];let loaded=initial, behavior;
 const client={from(){return {select(){return this},eq(){return this},async maybeSingle(){if(loaded instanceof Error)throw loaded;return {data:loaded,error:null}}}},async rpc(name,args){calls.push(structuredClone(args));if(behavior)return behavior(name,args);return {data:{estado:args.p_estado,versao:args.p_versao===null?1:args.p_versao+1}}}};
 const store=createCloudStateStore(client,()=>({profile:{empresa_id:'TEST'}}),(error,state)=>errors.push({error,state}));
 return {store,calls,errors,setLoaded(v){loaded=v},setBehavior(v){behavior=v}};
}
test('serializa gravações simultâneas usando as versões recebidas',async()=>{const f=fixture();await f.store.load();const a=f.store.save({n:1}),b=f.store.save({n:2});await Promise.all([a,b]);assert.deepEqual(f.calls.map(x=>x.p_versao),[4,5]);});
test('copia a intenção antes da gravação assíncrona',async()=>{const f=fixture();await f.store.load();const x={n:1};const p=f.store.save(x);x.n=9;await p;assert.equal(f.calls[0].p_estado.n,1);});
test('estado idêntico não gera gravação',async()=>{const f=fixture();await f.store.load();await f.store.save({n:0});assert.equal(f.calls.length,0);});
test('conflito preserva intenção e bloqueia novas gravações sem repetir',async()=>{const f=fixture();await f.store.load();f.setBehavior(()=>({error:{code:'40001',message:'conflict'}}));await assert.rejects(f.store.save({n:1}),/Outra pessoa/);await assert.rejects(f.store.save({n:2}),/Atualize/);assert.equal(f.calls.length,1);assert.deepEqual(f.errors.at(-1).state,{n:1});});
test('erro lançado pela conexão também preserva e bloqueia',async()=>{const f=fixture();await f.store.load();f.setBehavior(()=>{throw new Error('Failed to fetch')});await assert.rejects(f.store.save({n:1}),/conexão/);assert.deepEqual(f.errors.at(-1).state,{n:1});await assert.rejects(f.store.save({n:2}),/Atualize/);assert.equal(f.calls.length,1);});
test('permissão negada não altera versão aceita',async()=>{const f=fixture();await f.store.load();f.setBehavior(()=>({error:{message:'permission denied'}}));await assert.rejects(f.store.save({n:1}),/sessão/);assert.equal(f.calls[0].p_versao,4);});
test('recarregamento permite recuperar após conflito',async()=>{const f=fixture();await f.store.load();f.setBehavior(()=>({error:{code:'40001'}}));await assert.rejects(f.store.save({n:1}));f.setLoaded({estado:{n:5},versao:8});await f.store.load();f.setBehavior(null);await f.store.save({n:6});assert.equal(f.calls.at(-1).p_versao,8);});
test('criação inicial usa versão nula e exige recibo 1',async()=>{const f=fixture(null);assert.equal(await f.store.load(),null);await f.store.save({n:1});assert.equal(f.calls[0].p_versao,null);});
test('gravação antes da leitura é rejeitada sem RPC',async()=>{const f=fixture();await assert.rejects(f.store.save({n:1}),/carregamento/);assert.equal(f.calls.length,0);});
test('recibo incorreto impede anunciar gravação',async()=>{const f=fixture();await f.store.load();f.setBehavior(()=>({data:{estado:{n:1},versao:88}}));await assert.rejects(f.store.save({n:1}),/confirmar/);assert.deepEqual(f.errors.at(-1).state,{n:1});});
test('recebe e copia o estado canônico do servidor',async()=>{const f=fixture();await f.store.load();f.setBehavior(()=>({data:{estado:{n:1,conferido:true},versao:5}}));const saved=await f.store.save({n:1});saved.n=99;await f.store.save({n:1,conferido:true});assert.equal(f.calls.length,1);});
test('versão fora da precisão segura é rejeitada',async()=>{const f=fixture({estado:{n:0},versao:'9007199254740993'});await assert.rejects(f.store.load(),/Versão/);});
test('erro de carregamento lançado bloqueia a gravação',async()=>{const f=fixture(new Error('network unavailable'));await assert.rejects(f.store.load(),/conexão/);await assert.rejects(f.store.save({n:1}),/Atualize/);assert.equal(f.calls.length,0);});
