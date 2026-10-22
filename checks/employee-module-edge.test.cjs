const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{transformSync}=require('esbuild');
test('employee endpoints honor the approved module role without expanding global permissions',async()=>{
 for(const name of ['employee-approval','invite-employee'])for(const approved of [true,false]){
 let handler;let writes=0;const profile={empresa_id:'e',perfil:'OPERADOR_GERAL',ativo:true,status_aprovacao:'APROVADO'};
 const db={auth:{getUser:async()=>({data:{user:{id:'actor'}}})},rpc:async()=>({data:{isAdmin:approved,role:approved?'MASTER':'OPERADOR_GERAL'}}),from:table=>{const q={select:()=>q,eq:()=>q,in:()=>q,single:async()=>({data:{...profile}}),maybeSingle:async()=>({data:null}),order:async()=>({data:[]}),upsert:async()=>{writes++;return{error:null}}};return q;}};
 const code=transformSync(fs.readFileSync('supabase/functions/'+name+'/index.ts','utf8').replace(/^import[^\n]+\n/,''),{loader:'ts',format:'cjs'}).code;
 vm.runInNewContext(code,{Deno:{serve:fn=>handler=fn,env:{get:()=> 'https://example.invalid'}},createClient:()=>db,Request,Response,crypto:globalThis.crypto});
 const r=await handler(new Request('https://fixture.test',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer fixture'},body:JSON.stringify(name==='employee-approval'?{action:'LIST'}:{nome:'Teste',cpf:'52998224725',whatsapp:'11999999999',perfil:'MASTER'})}));
 assert.equal(r.status,approved?200:400);assert.equal(writes,name==='invite-employee'&&approved?1:0);
 }
});
