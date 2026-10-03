const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const defaultOrigin='https://forte-frete.onrender.com';
async function edge(name,body,state={}){
 const writes=[];let handler;const env={SUPABASE_URL:'https://example.invalid',SUPABASE_SERVICE_ROLE_KEY:'test-secret',SUPABASE_ANON_KEY:'test-public'};
 class Query{
  constructor(table){this.table=table;this.action='select'}
  select(){return this}eq(){return this}limit(){return this}lt(){return this}in(){return this}
  insert(payload){this.action='insert';this.payload=payload;return this}update(payload){this.action='update';this.payload=payload;return this}delete(){this.action='delete';return this}
  single(){return this}maybeSingle(){return this}
  then(resolve,reject){
   if(this.action!=='select')writes.push({table:this.table,action:this.action,payload:this.payload});
   let data=null,error=null;
   if(['usuarios_app','fc_perfis','profiles'].includes(this.table)&&this.action==='select')data=name==='register-driver-invite'?null:state.account||{user_id:'test-user',perfil:'MOTORISTA',ativo:true,status_aprovacao:'APROVADO',email:'driver@example.invalid',whatsapp:'5534999990001'};
   if(name==='login-cpf'&&['usuarios_app','fc_perfis','profiles'].includes(this.table))data=[{id:'test-user',...data}];
   if(this.table==='motoristas'&&this.action==='select')data={status_cadastro:'pre_cadastro'};
   if(this.action==='update')data=[{id:'test-record',user_id:'test-user'}];
   if(state.failProfile&&this.table==='usuarios_app'&&this.action==='insert')error={code:'FAIL'};
   return Promise.resolve({data,error}).then(resolve,reject);
  }
 }
 const client={from:table=>new Query(table),auth:{
  getUser:async()=>({data:{user:{id:'test-user'}},error:null}),
  signInWithPassword:async()=>{writes.push({auth:'login'});return {data:{session:{access_token:'test-access',refresh_token:'test-refresh'}},error:null}},
  resetPasswordForEmail:async()=>{writes.push({auth:'email_recovery'});return {error:null}},
  admin:{createUser:async payload=>{writes.push({auth:'create',payload});return {data:{user:{id:'new-user'}},error:null}},deleteUser:async id=>writes.push({auth:'delete',id}),getUserById:async()=>({data:{user:{email:'driver@example.invalid'}},error:null}),updateUserById:async(id,payload)=>{writes.push({auth:'password_update',payload});return {error:null}}}
 }};
 let code=fs.readFileSync(state.source || 'forte-frete/supabase/functions/'+name+'/index.ts','utf8').replace(/^import[^\n]+\n/,'');
 code=stripTypeScriptTypes(code,{mode:'transform'});
 vm.runInNewContext(code,{createClient:()=>client,Deno:{serve:fn=>handler=fn,env:{get:k=>env[k]}},Response,Request,crypto:globalThis.crypto,TextEncoder,Uint8Array,Uint32Array,AbortSignal,console:{error(){}}});
 const response=await handler(new Request('https://example.invalid',{method:'POST',headers:{origin:state.origin||defaultOrigin,authorization:'Bearer test-session','content-type':'application/json'},body:JSON.stringify(body)}));
 return {status:response.status,data:await response.json(),writes};
}

module.exports={edge};
