import React,{useEffect,useState} from 'react';
import {getPatioStatus,savePatioCount,confirmConferencePassword} from './supabase';
const qty=value=>value==null?'—':Number(value).toLocaleString('pt-BR',{maximumFractionDigits:6});
export default function PatioConference({caixaId}){
 const [model,setModel]=useState(null),[counts,setCounts]=useState({}),[password,setPassword]=useState(''),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{let active=true;setModel(null);setConfirmed(false);setPassword('');setCounts({});setMessage('Carregando contagem…');getPatioStatus(caixaId).then(value=>{if(active){setModel(value);setMessage('');}}).catch(error=>{if(active)setMessage(error.message);});return()=>{active=false;};},[caixaId]);
 async function run(action){if(busy)return;setBusy(true);setMessage('');try{await action();}catch(error){setMessage(error.message);}finally{setBusy(false);}}
 return <div className="transportBox"><h3>CONFERÊNCIA FÍSICA DO ESTOQUE</h3><p>Conte o disponível de cada produto. Divergências, reservas inconsistentes ou movimentos posteriores à contagem bloqueiam o fechamento.</p>
 {!confirmed?<form onSubmit={e=>{e.preventDefault();const value=password;setPassword('');run(async()=>{await confirmConferencePassword(value);setConfirmed(true);});}}><label>SENHA DO CONFERENTE CONECTADO<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required disabled={busy}/></label><button disabled={busy}>CONFIRMAR CONFERENTE</button></form>:<p>Conferente autenticado nesta sessão.</p>}
 <p role="status">{message}</p>
 <button className="secondary" disabled={busy} onClick={()=>run(async()=>{setModel(await getPatioStatus(caixaId));})}>ATUALIZAR ESTOQUE</button>
 {(model?.itens||[]).map(item=><div className="transportBox" key={item.produtoId}><b>{item.marca} • {item.produto}</b><p>Estoque único: {qty(item.total)} • Bloqueado: {qty(item.bloqueado)} • Disponível: {qty(item.disponivel)} {item.unidade}</p>
 {item.inconsistente&&<p role="alert">Estoque ou reserva inconsistente. Revise os movimentos antes de fechar.</p>}
 <label>CONTAGEM FÍSICA<input inputMode="decimal" value={counts[item.produtoId]??(item.contagem==null?'':String(item.contagem))} onChange={e=>setCounts({...counts,[item.produtoId]:e.target.value})} disabled={busy||!confirmed}/></label>
 <button disabled={busy||!confirmed} onClick={()=>run(async()=>{const raw=String(counts[item.produtoId]??(item.contagem==null?'':item.contagem)).trim().replace(',','.');if(!/^\d+(?:\.\d{1,6})?$/.test(raw)||Number(raw)>1e12)throw new Error('Informe a quantidade não negativa, com até seis casas decimais. Campo vazio não é zero.');await savePatioCount(caixaId,item,Number(raw));setModel(await getPatioStatus(caixaId));})}>GRAVAR CONTAGEM</button>
 <p>{item.contagem==null?'Contagem pendente':!item.atual?'Estoque ou orçamento mudou. Conte novamente.':`Diferença: ${qty(item.diferenca)}`}</p>{item.conferente&&<small>Conferente: {item.conferente}</small>}</div>)}
 {model&&<p role="status">{model.liberado?'Todos os produtos conferidos. O caixa pode ser fechado.':`${model.pendentes||0} pendência(s) • ${model.divergencias||0} divergência(s) • ${model.desatualizados||0} contagem(ns) desatualizada(s).`}</p>}
 </div>;
}
