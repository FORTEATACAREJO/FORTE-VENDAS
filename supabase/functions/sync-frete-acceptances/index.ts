import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.57.4';
const headers={'Access-Control-Allow-Origin':'https://forte-vendas.onrender.com','Access-Control-Allow-Headers':'authorization,apikey,x-client-info,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json'};
const bridge='https://nkynfboqwfxhhxcsrawl.supabase.co/functions/v1/vendas-frete-bridge';
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return Response.json({error:'Método inválido.'},{status:405,headers});
 try{
  const auth=req.headers.get('Authorization')||'';const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:auth}}});
  const {data:{user},error:authError}=await client.auth.getUser();if(authError||!user)return Response.json({error:'Entre novamente.'},{status:401,headers});
  const {data:p,error:profileError}=await client.from('fc_perfis').select('empresa_id,perfil,permissoes,ativo,status_aprovacao,trocar_senha').eq('user_id',user.id).single();
  if(profileError||!p?.ativo||p.status_aprovacao!=='APROVADO'||p.trocar_senha||!['MASTER','ADMINISTRADOR','OPERADOR_GERAL','VENDEDOR_INTERNO'].includes(p.perfil)||(!['MASTER','ADMINISTRADOR'].includes(p.perfil)&&p.permissoes?.vendas!==true&&p.permissoes?.['carga-direta']!==true&&p.permissoes?.['VENDAS E COMPRAS']?.editar!==true))return Response.json({error:'Acesso à integração não autorizado.'},{status:403,headers});
  const permission=await client.rpc('fc_operacao_autorizada');if(permission.error||permission.data!==true)return Response.json({error:'Aplicativo sem aprovação operacional.'},{status:403,headers});
  const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const call=async(action:string,extra:any={})=>{const r=await fetch(bridge,{method:'POST',headers:{Authorization:auth,apikey:'sb_publishable_7nIQ1MbqxonXl6cZqlP3IA_CK-gVLf9','Content-Type':'application/json'},body:JSON.stringify({action,...extra}),signal:AbortSignal.timeout(15000)});const out=await r.json();if(!r.ok||out.error)throw new Error(out.error||'Ponte Frete indisponível.');return out;};
  const remote=await call('LIST_ACCEPTANCES');const started=Date.now();let received=0;const pending=[];
  for(const event of (remote.events||[]).slice(0,10)){if(Date.now()-started>40000){pending.push(event.id);continue}try{
   const {error}=await admin.rpc('fc_receber_aceite_frete',{p_empresa:p.empresa_id,p_actor:user.id,p_evento:event.id,p_payload:event.payload});if(error)throw error;
   // A failed acknowledgement is retried; the receiver is idempotent by external event ID.
   await call('CONFIRM_ACCEPTANCE',{eventId:event.id});received++;
  }catch{pending.push(event.id)}}
  return Response.json({ok:true,received,pending,message:pending.length?'Parte das solicitações aguarda nova sincronização.':'Sincronização do lote concluída. Confira os pedidos que aguardam vínculo.'},{headers});
 }catch{return Response.json({error:'Não foi possível sincronizar as solicitações. Nenhum pedido foi inventado.'},{status:502,headers})}
});
