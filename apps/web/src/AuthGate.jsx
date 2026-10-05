import {useEffect,useState} from "react";
import App from "./App.jsx";
import {supabase,setAuthContext} from "./supabase.js";
import {accessTimeout} from "./access-standard.js";
export default function AuthGate(){
 const [ready,setReady]=useState(false),[error,setError]=useState(""),[attempt,setAttempt]=useState(0);
 useEffect(()=>{let live=true;setError("");async function load(){
  try{
   const u=await accessTimeout(supabase.auth.getUser());if(u.error||!u.data.user)throw Error("Não foi possível conferir a sessão.");
   const p=await accessTimeout(supabase.from("fc_perfis").select("*").eq("user_id",u.data.user.id).maybeSingle());
   if(p.error)throw Error("Não foi possível carregar o perfil.");
   if(!p.data?.ativo||p.data.status_aprovacao!=="APROVADO"||p.data.trocar_senha)throw Error("O cadastro precisa de aprovação ou atualização da senha.");
   if(live){setAuthContext({user:u.data.user,profile:p.data});setReady(true)}
  }catch(e){if(live)setError(e.message||"Não foi possível conferir o acesso.")}
 }load();return()=>{live=false;setAuthContext(null)}},[attempt]);
 return ready?<App/>:<section><p>{error||"Conferindo acesso autorizado…"}</p>{error&&<button onClick={()=>setAttempt(n=>n+1)}>TENTAR NOVAMENTE</button>}</section>;
}
