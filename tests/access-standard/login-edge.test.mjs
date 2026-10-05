import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {webcrypto} from 'node:crypto';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{transformSync}=require(process.env.ESBUILD_MODULE||'esbuild');
const projects=[['vendas','gtwecfyffjszghnvtlzr','supabase/functions/access-standard/index.ts'],['fiscal','xmfpvvmvdkepmnvtdoio','../FORTEFISCAL/supabase/functions/access-standard/index.ts'],['frete','nkynfboqwfxhhxcsrawl','../FORTE-FRETE/supabase/functions/access-standard/index.ts']];
for(const [app,id,path] of projects)test(app+': servidor normaliza CPF e preserva validação de senha e origem',async()=>{
 const source=fs.readFileSync(fs.existsSync(path)?path:'supabase/functions/access-standard/index.ts','utf8');
 let handler;const seen=[];
 const builder=()=>{const q={select(){return q},eq(k,v){if(k==='cpf')seen.push(v);return q},limit(){return Promise.resolve({data:[{id:'fixture',user_id:'fixture'}]})},insert(){return Promise.resolve({error:null})}};return q};
 const createClient=()=>({from:builder,auth:{admin:{getUserById:async()=>({data:{user:{email:'test@example.invalid'}}})},signInWithPassword:async body=>body.password==='123456'?{data:{session:{access_token:'test-access',refresh_token:'test-refresh'},user:{id:'fixture'}}}:{error:{message:'invalid'}}}});
 const ctx={module:{exports:{}},exports:{},require:()=>({createClient}),Deno:{env:{get:k=>k==='SUPABASE_URL'?`https://${id}.supabase.co`:'fixture-key'},serve:fn=>handler=fn},crypto:webcrypto,TextEncoder,Response,Request,console};ctx.exports=ctx.module.exports;
 vm.runInNewContext(transformSync(source,{loader:'ts',format:'cjs'}).code,ctx);
 const call=(cpf,password='123456',origin=`https://forte-${app}.onrender.com`)=>handler(new Request('https://example.invalid',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({action:'LOGIN',cpf,password})}));
 for(const cpf of ['529.982.247-25','52998224725']){const r=await call(cpf);assert.equal(r.status,200);assert.equal((await r.json()).access_token,'test-access');assert.equal(seen.at(-1),'52998224725')}
 assert.equal((await call('52998224725','wrong')).status,401);
 assert.equal((await call('123')).status,400);
 assert.equal((await call('52998224725','123456','https://untrusted.invalid')).status,403);
});
