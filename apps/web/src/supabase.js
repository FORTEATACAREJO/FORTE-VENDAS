import { createClient } from "@supabase/supabase-js";
import {createCloudStateStore} from './cloud-state.js';
const url=String(import.meta.env.VITE_SUPABASE_URL||"").trim(),key=String(import.meta.env.VITE_SUPABASE_ANON_KEY||"").trim();
export const supabaseConfigured=Boolean(url&&key);
export const supabase=supabaseConfigured?createClient(url,key,{auth:{persistSession:true,storage:window.localStorage,autoRefreshToken:true,detectSessionInUrl:true}}):null;
let authContext=null; export const setAuthContext=(v)=>{authContext=v}; export const getAuthContext=()=>authContext;
export function applyAuthUser(data){if(!authContext?.user||!authContext?.profile)return data;const p=authContext.profile,id=`auth-${authContext.user.id}`,perfil=String(p.perfil||"CONSULTA").toUpperCase();const u={id,authUserId:authContext.user.id,empresaId:p.empresa_id,unidadeId:p.unidade_id,nome:p.nome||authContext.user.email,login:authContext.user.email,email:authContext.user.email,perfil,ativo:p.ativo!==false,admin:["MASTER","ADMINISTRADOR"].includes(perfil),master:perfil==="MASTER",permissoes:p.permissoes||{}};return{...data,currentUserId:id,usuarios:[u,...(data.usuarios||[]).filter(x=>x.id!==id)]}}
const cloudStore=supabase?createCloudStateStore(supabase,getAuthContext,(error,state)=>{
  if(error&&state)try{localStorage.setItem('forte-cloud-alteracoes-pendentes',JSON.stringify({gravadoEm:new Date().toISOString(),estado:state}));}catch{}
  window.dispatchEvent(new CustomEvent('forte-cloud-status',{detail:error?.message||''}));
}):null;
export async function loadCloudState(){return cloudStore?cloudStore.load():null}
export async function saveCloudState(estado){return cloudStore?cloudStore.save(estado):estado}
export async function getPatioStatus(caixaId){
 if(!supabase)throw new Error('Conferência do pátio exige conexão com o sistema.');
 const {data,error}=await supabase.rpc('fc_patio_status',{p_caixa:caixaId});
 if(error)throw new Error(error.message||'Não foi possível conferir o pátio.');return data;
}
export async function commitCashClosure(estado,snapshot){
 if(!supabase)throw new Error('Fechamento exige conexão e confirmação no servidor.');
 await saveCloudState(estado);
 const result=await saveCloudState({...estado,caixasBalcao:(estado.caixasBalcao||[]).map(x=>x.id===snapshot.id?snapshot:x)});
 const closed=result?.caixasBalcao?.find(x=>x.id===snapshot.id);
 if(closed?.status!=='FECHADO'||!closed.patioConferencia?.liberado)throw new Error('Fechamento não confirmado pelo sistema.');
 return closed;
}

export async function saveClosedCashSnapshot(snapshot){
  throw new Error('Use o fechamento integrado ao pátio; o histórico é gravado junto com o caixa.');
}
