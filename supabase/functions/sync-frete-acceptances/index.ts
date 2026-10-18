import {mergeOperation,mergeAcceptedLoads,paymentCandidates} from './operation.mjs';
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
  const driverSync=await fetch(Deno.env.get('SUPABASE_URL')+'/functions/v1/sync-frete-drivers',{method:'POST',headers:{Authorization:auth,apikey:Deno.env.get('SUPABASE_ANON_KEY')!,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(25000)});
  if(!driverSync.ok)throw Error('Não foi possível sincronizar os cadastros de motoristas.');
  const snapshot=await call('OPERATION_SNAPSHOT');
  for(let attempt=0;attempt<3;attempt++){
   const {data:row,error}=await admin.from('fc_app_state').select('estado,versao').eq('empresa_id',p.empresa_id).single();if(error)throw error;
   const next=mergeOperation(row.estado,snapshot);if(JSON.stringify(next)===JSON.stringify(row.estado))break;
   const saved=await admin.from('fc_app_state').update({estado:next,versao:row.versao+1}).eq('empresa_id',p.empresa_id).eq('versao',row.versao).select('versao').maybeSingle();if(saved.error)throw saved.error;if(saved.data)break;if(attempt===2)throw Error('Outra atualização ocorreu. Tente novamente.');
  }
  const remote=await call('LIST_ACCEPTANCES');const started=Date.now();let received=0;const pending=[],confirmedEvents=[];
  for(const event of (remote.events||[]).slice(0,10)){if(Date.now()-started>40000){pending.push(event.id);continue}try{
   const {error}=await admin.rpc('fc_receber_aceite_frete',{p_empresa:p.empresa_id,p_actor:user.id,p_evento:event.id,p_payload:event.payload});if(error)throw error;
   // A failed acknowledgement is retried; the receiver is idempotent by external event ID.
   await call('CONFIRM_ACCEPTANCE',{eventId:event.id});confirmedEvents.push(event.id);received++;
  }catch{pending.push(event.id)}}
  const receipts=await admin.from('fc_frete_solicitacoes').select('*').eq('empresa_id',p.empresa_id);if(receipts.error)throw receipts.error;
  for(let attempt=0;attempt<3;attempt++){
   const {data:row,error}=await admin.from('fc_app_state').select('estado,versao').eq('empresa_id',p.empresa_id).single();if(error)throw error;
   const next=mergeAcceptedLoads(row.estado,receipts.data||[]);if(JSON.stringify(next)===JSON.stringify(row.estado))break;
   const saved=await admin.from('fc_app_state').update({estado:next,versao:row.versao+1}).eq('empresa_id',p.empresa_id).eq('versao',row.versao).select('versao').maybeSingle();if(saved.error)throw saved.error;if(saved.data)break;if(attempt===2)throw Error('Atualização concorrente. Sincronize novamente.');
  }
  const paymentPending=[];
  const {data:paymentRow,error:paymentError}=await admin.from('fc_app_state').select('estado,versao').eq('empresa_id',p.empresa_id).single();if(paymentError)throw paymentError;
  let paymentAttempts=0;
  for(const item of paymentCandidates(paymentRow.estado)){
   if(paymentAttempts++>=3){paymentPending.push(item.cargaId);continue;}
   if(Date.now()-started>40000){paymentPending.push(item.cargaId);continue;}
   try{const receipt=await call('SYNC_PAYMENT',{cargaId:item.cargaId});if(receipt.comprovanteHash!==item.hash)throw Error('Comprovante alterado. Aguardando nova sincronização.');
    for(let attempt=0;attempt<3;attempt++){
     const {data:current,error}=await admin.from('fc_app_state').select('estado,versao').eq('empresa_id',p.empresa_id).single();if(error)throw error;
     const saved=await admin.from('fc_app_state').update({estado:{...current.estado,cargas:current.estado.cargas.map(c=>c.id===item.cargaId?{...c,freteComprovanteHash:item.hash}:c)},versao:current.versao+1}).eq('empresa_id',p.empresa_id).eq('versao',current.versao).select('versao').maybeSingle();if(saved.error)throw saved.error;if(saved.data)break;if(attempt===2)throw Error('Sincronização pendente.');
    }
   }catch{paymentPending.push(item.cargaId);}
  }
  return Response.json({ok:true,received,confirmedEvents,pending,paymentPending,message:pending.length||paymentPending.length?'Parte das solicitações aguarda nova sincronização.':'Sincronização do lote concluída. Confira os pedidos que aguardam vínculo.'},{headers});
 }catch{return Response.json({error:'Não foi possível sincronizar as solicitações. Nenhum pedido foi inventado.'},{status:502,headers})}
});
