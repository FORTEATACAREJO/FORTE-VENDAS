import {validCnpj} from '../gmail-central/intake.mjs';
import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
const origin='https://forte-vendas.onrender.com';
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
Deno.serve(async req=>{
 const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store',Vary:'Origin'};
 const reply=(body:unknown,status=200)=>Response.json(body,{status,headers});
 if(req.headers.get('origin')!==origin)return reply({error:'Origem não autorizada.'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply({error:'Use POST.'},405);
 try{
  const authorization=req.headers.get('authorization')||'',url=Deno.env.get('SUPABASE_URL')!;
  const client=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
  const user=await client.auth.getUser();if(user.error||!user.data.user)return reply({error:'Entre novamente no sistema.'},401);
  const ok=(r:any)=>{if(r.error)throw r.error;return r.data;};
  const p=ok(await client.from('fc_perfis').select('empresa_id,ativo,status_aprovacao,trocar_senha').eq('user_id',user.data.user.id).single());
  const module=ok(await client.rpc('access_current_module',{p_app:'vendas'}));
  if(!p.ativo||p.status_aprovacao!=='APROVADO'||p.trocar_senha||module.allowed!==true)return reply({error:'Acesso operacional não autorizado.'},403);
  const db=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  const b=await req.json(),args={p_empresa:p.empresa_id,p_actor:user.data.user.id};
  if(b.action==='FIND')return reply({notas:ok(await db.rpc('fc_pallet_localizar',{...args,p_busca:String(b.query||'').trim()}))});
  if(b.action==='LIST')return reply(ok(await db.rpc('fc_pallet_painel',{...args,p_historico:b.history===true,p_offset:Number.isSafeInteger(b.offset)?b.offset:0})));
  if(b.action==='MOVEMENT'){
   if(!uuid(b.requestId))throw Error('Identificador da movimentação inválido.');
   return reply(ok(await db.rpc('fc_pallet_movimentar',{...args,p_request:b.requestId,p_data:b.data})));
  }
  if(!uuid(b.id))throw Error('Identificador da NF inválido.');
  if(b.action==='DETAILS'){
   const data=ok(await db.rpc('fc_pallet_documentos',{...args,p_nota:b.id}));
   const fontes=[];for(const file of data.fontes){const r=ok(await db.storage.from('forte-gmail-central').createSignedUrl(file.path,300));const {path,...rest}=file;fontes.push({...rest,url:r.signedUrl});}
   return reply({...data,fontes});
  }
  if(b.action==='SAVE'){
   if(!Number.isSafeInteger(b.revision)||!b.data||Array.isArray(b.data)||typeof b.data!=='object'||JSON.stringify(b.data).length>100000)throw Error('Dados ou revisão inválidos.');
   if(b.data.conferida===true&&!validCnpj(b.data.emitente_cnpj))throw Error('CNPJ do emitente inválido. Confira o documento e o cadastro.');
   return reply(ok(await db.rpc('fc_pallet_salvar',{...args,p_nota:b.id,p_revision:b.revision,p_data:b.data})));
  }
  if(!uuid(b.requestId))throw Error('Identificador da operação inválido.');
  if(b.action==='INTEGRATE')return reply(ok(await db.rpc('fc_pallet_integrar',{...args,p_nota:b.id,p_revision:b.revision,p_request:b.requestId})));
  if(b.action==='MERGE'){if(!uuid(b.target))throw Error('Selecione a NF de destino.');return reply(ok(await db.rpc('fc_pallet_juntar_documento',{...args,p_origem:b.id,p_destino:b.target,p_request:b.requestId,p_motivo:String(b.reason||'').slice(0,2000)})));}
  if(b.action==='REVERSE')return reply(ok(await db.rpc('fc_pallet_reverter',{...args,p_nota:b.id,p_request:b.requestId,p_motivo:String(b.reason||'').slice(0,2000)})));
  return reply({error:'Ação inválida.'},400);
 }catch(e){return reply({error:(e as any)?.code==='23505'?'Esta NF já está cadastrada. Localize a nota existente e vincule o documento a ela.':e instanceof Error?e.message:(e as any)?.message||'Não foi possível concluir.'},(e as any)?.code==='42501'?403:(e as any)?.code==='40001'?409:400);}
});
