const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const {mergeOperation,mergeAcceptedLoads,paymentCandidates}=require('../supabase/functions/sync-frete-acceptances/operation.mjs');
const source=stripTypeScriptTypes(fs.readFileSync('supabase/functions/sync-frete-acceptances/index.ts','utf8')).replace(/^import .*;\n/gm,'');

function fixture({failed=[],count=2,authenticated=true}={}){
  const acknowledged=[],received=[];
  const snapshot={cargas:[],viagens:[],usuarios:[]};
  const state={cargas:[],freteOperacao:snapshot};
  const profile={empresa_id:'company',perfil:'MASTER',ativo:true,status_aprovacao:'APROVADO',trocar_senha:false};
  const ctx={mergeOperation,mergeAcceptedLoads,paymentCandidates,Request,Response,AbortSignal,JSON,Date,Error,
    Deno:{env:{get:()=> 'https://vendas.test'},serve:fn=>ctx.handler=fn},
    createClient:()=>({auth:{getUser:async()=>({data:{user:authenticated?{id:'user'}:null}})},
      rpc:async(name,args)=>{if(name==='fc_receber_aceite_frete')received.push(args.p_evento);return {data:true}},
      from:table=>({select(){return this},eq(){return this},then(resolve){return Promise.resolve({data:[]}).then(resolve)},single:async()=>({data:table==='fc_perfis'?profile:{estado:state,versao:1}})})}),
    fetch:async(url,options)=>{
      if(url.endsWith('/sync-frete-drivers'))return Response.json({ok:true});
      const body=JSON.parse(options.body);
      if(body.action==='OPERATION_SNAPSHOT')return Response.json(snapshot);
      if(body.action==='LIST_ACCEPTANCES')return Response.json({events:Array.from({length:count},(_,i)=>({id:'event-'+i,payload:{}}))});
      assert.equal(body.action,'CONFIRM_ACCEPTANCE');
      if(failed.includes(body.eventId))return Response.json({error:'Retry acknowledgement'},{status:502});
      acknowledged.push(body.eventId);return Response.json({ok:true});
    }};
  vm.createContext(ctx);vm.runInContext(source,ctx);
  return {received,acknowledged,call:async()=>{
    const r=await ctx.handler(new Request('https://test/',{method:'POST',headers:{Authorization:'Bearer fixture'},body:'{}'}));
    return {status:r.status,body:await r.json()};
  }};
}
test('only events acknowledged by Frete are returned as confirmed',async()=>{
  const f=fixture({failed:['event-1']});const r=await f.call();
  assert.equal(r.status,200);assert.deepEqual(f.received,['event-0','event-1']);
  assert.deepEqual(r.body.confirmedEvents,['event-0']);assert.deepEqual(r.body.pending,['event-1']);
  assert.equal(r.body.received,1);
});
test('events outside the bounded batch never receive an invented confirmation',async()=>{
  const f=fixture({count:11}),r=await f.call();
  assert.equal(r.body.confirmedEvents.length,10);assert(!r.body.confirmedEvents.includes('event-10'));
  assert.deepEqual(r.body.confirmedEvents,f.acknowledged);
});
test('unauthenticated calls cannot receive or acknowledge an event',async()=>{
  const f=fixture({authenticated:false}),r=await f.call();assert.equal(r.status,401);
  assert.deepEqual(f.received,[]);assert.deepEqual(f.acknowledged,[]);
});
