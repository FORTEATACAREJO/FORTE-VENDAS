import {useEffect,useState} from "react";
import App from "./App.jsx";
import {supabase,setAuthContext} from "./supabase.js";
export default function AuthGate(){const [ready,setReady]=useState(false);useEffect(()=>{let live=true;async function load(){const u=await supabase.auth.getUser();const p=await supabase.from("fc_perfis").select("*").eq("user_id",u.data.user?.id).maybeSingle();if(live&&p.data?.ativo&&p.data.status_aprovacao==="APROVADO"&&!p.data.trocar_senha){setAuthContext({user:u.data.user,profile:p.data});setReady(true)}}load();return()=>{live=false;setAuthContext(null)}},[]);return ready?<App/>:<p>Conferindo acesso autorizado…</p>}
