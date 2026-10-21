import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import {freightCatalog} from './projection.mjs';
const origin='https://forte-frete.onrender.com',company='49832961-0000-4000-8000-000000000001';
Deno.serve(async req=>{
 const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store',Vary:'Origin'};
 const reply=(data:unknown,status=200)=>Response.json(data,{headers,status});
 if(req.headers.get('origin')!==origin)return reply({error:'Origem não autorizada.'},403);
 if(req.method==='OPTIONS')return new Response(null,{headers,status:204});
 if(req.method!=='POST')return reply({error:'Use POST.'},405);
 try{
  const auth=req.headers.get('authorization')||'';
  const frete=createClient('https://nkynfboqwfxhhxcsrawl.supabase.co','sb_publishable_7nIQ1MbqxonXl6cZqlP3IA_CK-gVLf9',{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
  const user=await frete.auth.getUser();if(user.error||!user.data.user)return reply({error:'Entre no Forte Frete.'},401);
  const [profile,grant]=await Promise.all([frete.from('usuarios_app').select('perfil,ativo,status_aprovacao,trocar_senha').eq('user_id',user.data.user.id).single(),frete.rpc('access_current_module',{p_app:'frete'})]);
  if(profile.error||!profile.data?.ativo||profile.data.status_aprovacao!=='APROVADO'||profile.data.trocar_senha||grant.error||grant.data?.allowed!==true||!['MASTER','ADMINISTRADOR'].includes(grant.data.role))return reply({error:'Catálogo disponível somente à administração aprovada do Frete.'},403);
  const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  const state=await db.from('fc_app_state').select('estado,versao').eq('empresa_id',company).single();
  if(state.error||!state.data)return reply({error:'Cadastros indisponíveis. Atualize os dados no Forte Vendas.'},503);
  return reply({...freightCatalog(state.data.estado),versao:String(state.data.versao),origem:'FORTE VENDAS'});
 }catch{return reply({error:'Não foi possível consultar os cadastros. Tente novamente.'},503);}
});
