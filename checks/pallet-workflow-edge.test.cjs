const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{transformSync}=require('esbuild');
const user='00000000-0000-4000-8000-000000000099',company='00000000-0000-4000-8000-000000000001',note='00000000-0000-4000-8000-000000000010';
function fixture({authenticated=true,allowed=true}={}){
 let handler;const calls=[],queries=[];
 const db={auth:{getUser:async()=>authenticated?{data:{user:{id:user}}}:{error:Error('invalid'),data:{user:null}}},from(table){queries.push(table);const q={select:()=>q,eq:()=>q,single:async()=>({data:{empresa_id:company,ativo:true,status_aprovacao:'APROVADO',trocar_senha:false}})};return q;},rpc:async(name,args)=>{calls.push({name,args});return{data:name==='access_current_module'?{allowed}:name==='fc_pallet_documentos'?{fontes:[{filename:'NF.xml',path:company+'/hash'}],alocacoes:[],auditoria:[]}:{ok:true}};},storage:{from:bucket=>({createSignedUrl:async(path,ttl)=>{calls.push({bucket,path,ttl});return{data:{signedUrl:'https://signed.invalid/file'}};}})}};
 const ctx={module:{exports:{}},exports:{},require:path=>path.includes('intake.mjs')?require('../supabase/functions/gmail-central/intake.mjs'):{createClient:()=>db},Deno:{serve:f=>handler=f,env:{get:()=>''}},Response,Request};ctx.exports=ctx.module.exports;
 vm.runInNewContext(transformSync(fs.readFileSync('supabase/functions/pallet-workflow/index.ts','utf8'),{loader:'ts',format:'cjs'}).code,ctx);
 return{calls,queries,async call(body,origin='https://forte-vendas.onrender.com'){const r=await handler(new Request('https://fixture',{method:'POST',headers:{origin,authorization:'Bearer fixture','content-type':'application/json'},body:JSON.stringify(body)}));return{status:r.status,body:await r.json()};}};
}
test('pallet API checks origin, session and active module before business operations',async()=>{
 assert.equal((await fixture().call({},'https://other.invalid')).status,403);const f=fixture({authenticated:false});assert.equal((await f.call({action:'LIST'})).status,401);assert.equal(f.queries.length,0);
 const blocked=fixture({allowed:false});assert.equal((await blocked.call({action:'LIST'})).status,403);assert.equal(blocked.calls.filter(c=>c.name?.startsWith('fc_pallet_')).length,0);
});
test('company and actor always come from authenticated identity, never supplied payload',async()=>{
 const f=fixture();assert.equal((await f.call({action:'SAVE',id:note,revision:0,empresa_id:'foreign',actor:'forged',data:{quantidade:30,alocacoes:[]}})).status,200);
 const saved=f.calls.find(c=>c.name==='fc_pallet_salvar');assert.equal(saved.args.p_empresa,company);assert.equal(saved.args.p_actor,user);assert.equal(saved.args.p_nota,note);
 assert.equal((await f.call({action:'INTEGRATE',id:note,revision:1,requestId:'invalid'})).status,400);
});
test('private attachments are signed only after company-scoped document lookup, with short expiry',async()=>{
 const f=fixture(),r=await f.call({action:'DETAILS',id:note});assert.equal(r.status,200);assert.equal(f.calls.find(c=>c.name==='fc_pallet_documentos').args.p_empresa,company);const signed=f.calls.find(c=>c.bucket);assert.equal(signed.ttl,300);assert.equal(signed.bucket,'forte-gmail-central');assert.equal('path' in r.body.fontes[0],false);
});

test('confirmed note validates issuer CNPJ before saving',async()=>{
 const f=fixture();const invalid=await f.call({action:'SAVE',id:note,revision:0,data:{conferida:true,emitente_cnpj:'11111111111111'}});assert.equal(invalid.status,400);assert.equal(f.calls.filter(c=>c.name==='fc_pallet_salvar').length,0);
 const valid=await f.call({action:'SAVE',id:note,revision:0,data:{conferida:true,emitente_cnpj:'04.252.011/0001-10'}});assert.equal(valid.status,200);assert.equal(f.calls.filter(c=>c.name==='fc_pallet_salvar').length,1);
});
