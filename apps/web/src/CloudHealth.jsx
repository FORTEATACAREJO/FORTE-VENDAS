import { useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "./supabase";

const LEVEL = (p) => p == null ? "SEM DADO" : p >= 95 ? "URGENTE" : p >= 85 ? "CRÍTICO" : p >= 70 ? "ATENÇÃO" : "NORMAL";
const pct = (used, limit) => limit > 0 ? Math.round((used / limit) * 1000) / 10 : null;

export default function CloudHealth({ onClose }) {
  const [health,setHealth]=useState(null), [busy,setBusy]=useState(false), [error,setError]=useState("");
  async function refresh(){
    if(!supabaseConfigured){setError("SUPABASE NÃO CONFIGURADO.");return;}
    setBusy(true);setError("");
    try{
      const {data,error}=await supabase.functions.invoke("cloud-health");
      if(error) throw error; if(data?.error) throw new Error(data.error);
      setHealth(data);
    }catch(e){setError(e.message||"NÃO FOI POSSÍVEL CONSULTAR A INFRAESTRUTURA.");}
    finally{setBusy(false);}
  }
  useEffect(()=>{refresh();},[]);
  const services=health?.services||[];
  return <div className="modalBackdrop"><section className="modal wide">
    <div className="modalHead"><div><h2>SAÚDE DA NUVEM — FORTE ATACAREJO</h2><p>MONITOR CENTRAL DE SUPABASE, GITHUB, RENDER E SERVIÇOS INTEGRADOS.</p></div><button className="ghost dark" onClick={onClose}>FECHAR</button></div>
    <div className="note"><b>ALERTAS:</b> 70% ATENÇÃO • 85% CRÍTICO • 95% URGENTE. O SISTEMA NÃO ALTERA PLANOS NEM GERA DESPESAS AUTOMATICAMENTE.</div>
    {error&&<div className="alert warn">{error}</div>}
    <div className="cadList">{services.map(s=><div className="cadRow" key={s.name}><div style={{flex:1}}><b>{s.name}</b><small>{s.status||"STATUS NÃO INFORMADO"} • {s.detail||"SEM DETALHES"}</small>{(s.metrics||[]).map(m=>{const p=m.percent??pct(m.used,m.limit);return <small key={m.name}>{m.name}: {m.usedLabel??m.used??"-"} / {m.limitLabel??m.limit??"-"} • {p==null?"% NÃO DISPONÍVEL":p+"%"} • {LEVEL(p)}</small>})}</div><strong>{LEVEL(s.percent)}</strong></div>)}</div>
    <div className="modalActions"><small>ÚLTIMA CONSULTA: {health?.checkedAt?new Date(health.checkedAt).toLocaleString("pt-BR"):"-"}</small><button disabled={busy} onClick={refresh}>{busy?"CONSULTANDO…":"ATUALIZAR AGORA"}</button></div>
  </section></div>;
}