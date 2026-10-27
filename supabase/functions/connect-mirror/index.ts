import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import {XMLParser,XMLValidator} from 'npm:fast-xml-parser@5.9.3';
import {fiscalRecord,saleRecord,fail,MATRIX,pageCursor} from './domain.mjs';
import {MODE} from './mode.mjs';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info, x-connect-device, x-connect-token','Content-Type':'application/json','Cache-Control':'no-store'};
const digest=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,'0')).join('');
const parse=(xml:string)=>{if(XMLValidator.validate(xml)!==true)throw Error('XML inválido');return new XMLParser({ignoreAttributes:false,removeNSPrefix:true,parseTagValue:false,parseAttributeValue:false,processEntities:false}).parse(xml);};
async function bodyOf(req:Request){
 const reader=req.body?.getReader();if(!reader)throw fail('Corpo ausente.');const chunks=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>700000){await reader.cancel();throw fail('Arquivo maior que o limite.',413);}chunks.push(value);}
 const bytes=new Uint8Array(size);let p=0;for(const c of chunks){bytes.set(c,p);p+=c.length;}try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw fail('JSON inválido.');}
}
Deno.serve(async(req)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 try{
  if(req.method!=='POST')throw fail('Use POST.',405);
  const url=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}}),b=await bodyOf(req);
  if(b.action==='INGEST'){
   const id=req.headers.get('x-connect-device')||'',token=req.headers.get('x-connect-token')||'';
   if(!/^[0-9a-f-]{36}$/.test(id)||!/^cmt_[0-9a-f]{64}$/.test(token))throw fail('Dispositivo não autorizado.',401);
   const hash=await digest(token),found=await admin.from('connect_mirror_devices').select('*').eq('id',id).eq('token_hash',hash).eq('mode',MODE).is('revoked_at',null).gt('expires_at',new Date().toISOString()).maybeSingle();
   if(found.error||!found.data)throw fail('Dispositivo revogado, expirado ou inválido.',401);const device=found.data;
   const profile=MODE==='FISCAL_XML'?await admin.from('profiles').select('active,role,must_change_password').eq('id',device.owner_id).single():await admin.from('fc_perfis').select('ativo,perfil,status_aprovacao,trocar_senha,empresa_id').eq('user_id',device.owner_id).single();
   const p=profile.data;
   if(profile.error||!p||(MODE==='FISCAL_XML'?(!p.active||p.role!=='MASTER'||p.must_change_password):(!p.ativo||p.perfil!=='MASTER'||p.status_aprovacao!=='APROVADO'||p.trocar_senha||p.empresa_id!==device.tenant_id)))throw fail('Responsável pelo dispositivo sem acesso ativo.',403);
   const record=MODE==='FISCAL_XML'?fiscalRecord(b.xml,parse):saleRecord(b.sale);
   if(record.kind==='CANCELAMENTO'||record.kind==='CCE'){
    if(record.payload.issuer!==record.entityId.slice(6,20))throw fail('Emitente do evento incompatível.');
    if(record.entityId.slice(6,20)!==MATRIX){const invoice=await admin.from('connect_mirror_records').select('id').eq('tenant_id',device.tenant_id).eq('kind','NFE').eq('entity_id',record.entityId).limit(1);if(invoice.error||!invoice.data?.length)throw fail('Evento de fornecedor aguarda XML da nota destinada à matriz.',409);}
   }
   const contentHash=await digest(JSON.stringify(record.payload));
   const saved=await admin.from('connect_mirror_records').insert({tenant_id:device.tenant_id,device_id:device.id,mode:MODE,source_id:record.sourceId,entity_id:record.entityId,kind:record.kind,occurred_at:record.occurredAt,content_hash:contentHash,payload:record.payload});
   if(saved.error&&saved.error.code!=='23505')throw fail('Não foi possível persistir o espelhamento.',503);
   await admin.from('connect_mirror_devices').update({last_seen_at:new Date().toISOString()}).eq('id',id);
   return Response.json({ok:true,sourceId:record.sourceId,contentHash,replayed:!!saved.error,mirrorOnly:true,stockPosted:false,financialPosted:false},{headers:cors});
  }
  // Pair, revoke and list require a live, module-approved Master session.
  const auth=req.headers.get('Authorization')||'';if(!auth.startsWith('Bearer '))throw fail('Entre como Master.',401);
  const client=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
  const user=await client.auth.getUser();if(user.error||!user.data.user)throw fail('Sessão inválida.',401);
  const permission=await client.rpc('access_current_module',{p_app:MODE==='FISCAL_XML'?'fiscal':'vendas'});if(permission.error||!permission.data?.allowed)throw fail('Módulo não autorizado.',403);
  let tenant;
  if(MODE==='FISCAL_XML'){
   const master=await client.rpc('current_user_is_master');if(master.error||master.data!==true)throw fail('Somente Master.',403);
   const unit=await client.from('establishments').select('id,cnpj').eq('code','MATRIZ_MG').eq('active',true).single();if(unit.error||unit.data?.cnpj.replace(/\D/g,'')!==MATRIX)throw fail('Matriz não autorizada.',403);tenant=unit.data.id;
  }else{
   const profile=await client.from('fc_perfis').select('empresa_id,perfil,ativo,status_aprovacao,trocar_senha').eq('user_id',user.data.user.id).single();
   const p=profile.data;if(profile.error||!p?.ativo||permission.data.role!=='MASTER'||p.status_aprovacao!=='APROVADO'||p.trocar_senha)throw fail('Somente Master aprovado.',403);tenant=p.empresa_id;
  }
  if(b.action==='PAIR'){
   const name=String(b.name||'').trim();if(!name||name.length>100)throw fail('Informe o nome do computador.');
   const bytes=crypto.getRandomValues(new Uint8Array(32)),token='cmt_'+Array.from(bytes).map(v=>v.toString(16).padStart(2,'0')).join('');
   const out=await admin.from('connect_mirror_devices').insert({tenant_id:tenant,owner_id:user.data.user.id,mode:MODE,name,token_hash:await digest(token)}).select('id,expires_at').single();if(out.error)throw fail('Não foi possível cadastrar o computador.',503);
   return Response.json({config:{version:1,mode:MODE,endpoint:`${url}/functions/v1/connect-mirror`,device_id:out.data.id,token,expires_at:out.data.expires_at,folders:[],interval_seconds:60,sales:{delimiter:';',encoding:'utf-8-sig',decimal:',',source_system:'CONNECT',columns:{sourceCompany:'empresa',saleId:'venda',updatedAt:'atualizado_em',date:'data_venda',status:'situacao',customer:'cliente',total:'total_venda',line:'item',code:'codigo',description:'produto',unit:'unidade',quantity:'quantidade',unitPrice:'preco_unitario',itemTotal:'total_item'},statuses:{ABERTA:'ABERTA',CONCLUIDA:'CONCLUIDA',CANCELADA:'CANCELADA',DEVOLVIDA:'DEVOLVIDA'}}},mirrorOnly:true},{headers:cors});
  }
  if(b.action==='REVOKE'){
   if(!/^[0-9a-f-]{36}$/.test(String(b.deviceId||'')))throw fail('Dispositivo inválido.');
   const out=await admin.from('connect_mirror_devices').update({revoked_at:new Date().toISOString()}).eq('id',b.deviceId).eq('tenant_id',tenant).eq('mode',MODE).select('id');if(out.error||out.data?.length!==1)throw fail('Computador não encontrado.',404);return Response.json({ok:true},{headers:cors});
  }
  if(b.action==='LIST'){
   const cursor=String(b.before||'');if(cursor&&!/^\d{4}-\d\d-\d\dT/.test(cursor))throw fail('Página inválida.');
   // A stable compound pagination cursor avoids dropping rows with equal timestamps.
   let q=admin.from('connect_mirror_records').select('id,source_id,entity_id,kind,occurred_at,received_at,content_hash,payload').eq('tenant_id',tenant).eq('mode',MODE).order('received_at',{ascending:false}).order('id',{ascending:false}).limit(20);
   if(cursor)q=q.or(pageCursor(cursor,b.beforeId));
   const [rows,devices]=await Promise.all([q,admin.from('connect_mirror_devices').select('id,name,created_at,expires_at,revoked_at,last_seen_at').eq('tenant_id',tenant).eq('mode',MODE).order('created_at',{ascending:false}).limit(100)]);
   if(rows.error||devices.error)throw fail('Consulta indisponível.',503);return Response.json({mode:MODE,records:rows.data,devices:devices.data,hasMore:rows.data.length===20,mirrorOnly:true},{headers:cors});
  }
  throw fail('Ação inválida.');
 }catch(e){return Response.json({error:e.status?e.message:'Espelhamento indisponível. Tente novamente.',mirrorOnly:true},{status:e.status||503,headers:cors});}
});
