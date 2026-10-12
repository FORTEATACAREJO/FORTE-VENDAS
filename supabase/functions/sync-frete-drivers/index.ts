import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.57.4';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Content-Type':'application/json'};
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers});
 try{
  if(req.method!=='POST')return Response.json({error:'Método inválido.'},{status:405,headers});
  const url=Deno.env.get('SUPABASE_URL')!,auth=req.headers.get('Authorization')||'';
  const caller=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:auth}}});
  const {data:{user},error}=await caller.auth.getUser();if(error||!user)return Response.json({error:'Entre no sistema.'},{status:401,headers});
  const {data:p,error:pe}=await caller.from('fc_perfis').select('empresa_id,ativo,status_aprovacao,trocar_senha').eq('user_id',user.id).single();
  if(pe||!p.ativo||p.status_aprovacao!=='APROVADO'||p.trocar_senha)return Response.json({error:'Acesso não aprovado.'},{status:403,headers});
  const response=await fetch('https://nkynfboqwfxhhxcsrawl.supabase.co/functions/v1/driver-directory',{method:'POST',headers:{Authorization:auth,apikey:'sb_publishable_7nIQ1MbqxonXl6cZqlP3IA_CK-gVLf9','Content-Type':'application/json'},body:JSON.stringify({source:'vendas'}),signal:AbortSignal.timeout(20000)});
  const remote=await response.json();if(!response.ok||!Array.isArray(remote.motoristas))throw Error(remote.error||'Não foi possível consultar o Forte Frete.');
  const admin=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  for(let attempt=0;attempt<3;attempt++){
   const {data:row,error}=await admin.from('fc_app_state').select('estado,versao').eq('empresa_id',p.empresa_id).single();if(error)throw error;
   const current=row.estado.motoristas||[],ids=new Set(remote.motoristas.map(m=>m.id));
   const drivers=[...remote.motoristas,...current.filter(m=>!ids.has(m.id)).map(m=>({...m,ativo:false,origemCadastro:'FORTE FRETE',statusCadastro:'INATIVO'}))];
   if(JSON.stringify(current)===JSON.stringify(drivers))return Response.json({ok:true,count:remote.motoristas.length,versao:row.versao},{headers});
   const result=await admin.from('fc_app_state').update({estado:{...row.estado,motoristas:drivers},versao:row.versao+1}).eq('empresa_id',p.empresa_id).eq('versao',row.versao).select('versao').maybeSingle();
   if(result.error)throw result.error;
   if(result.data)return Response.json({ok:true,count:remote.motoristas.length,versao:result.data.versao},{headers});
  }
  throw Error('A base foi atualizada. Tente sincronizar novamente.');
 }catch(e){return Response.json({error:e.message||'Sincronização indisponível.'},{status:400,headers});}
});