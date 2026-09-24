import { useMemo, useState } from "react";
import {putFile,getFile,openFile} from "./fileStore";
import {supabase} from "./supabase";
const BUCKET="forte-vendas-financeiro";

const STATUS = ["RECEBIDO", "EM ANÁLISE", "DIVERGENTE", "AGUARDANDO DOCUMENTO", "CONFERIDO", "INCORPORADO AO CONTAS A PAGAR", "REJEITADO/CANCELADO"];
const money = (v) => Number(v || 0).toLocaleString("pt-BR", { style:"currency", currency:"BRL" });
const now = () => new Date().toISOString();

export default function PreConferenciaBoletos({ data, onChange, currentUser }) {
  const [selected, setSelected] = useState([]);
  const [message, setMessage] = useState("");
  const rows = data.preConferenciaBoletos || [];
  const elegiveis = useMemo(() => rows.filter((x) => x.status === "CONFERIDO" && !x.contaPagarId), [rows]);
  const financial = currentUser?.admin || currentUser?.master || String(currentUser?.perfil || "").toUpperCase().includes("FINANCEIRO");
  const duplicate = (candidate) => Boolean(candidate.linhaDigitavel || (candidate.beneficiarioDocumento && candidate.valor && candidate.vencimento)) && rows.some((x) => x.id !== candidate.id && [x.linhaDigitavel, x.beneficiarioDocumento, x.valor, x.vencimento].join("|") === [candidate.linhaDigitavel, candidate.beneficiarioDocumento, candidate.valor, candidate.vencimento].join("|"));

  async function addFiles(files) {
    const novos = [...files].map((file) => ({ id:crypto.randomUUID(), documentoId:crypto.randomUUID(), arquivoNome:file.name, arquivoTipo:file.type, origem:"UPLOAD MANUAL", status:"RECEBIDO", fornecedor:"", beneficiarioDocumento:"", nf:"", pedido:"", carga:"", valor:0, valorNf:0, vencimento:"", parcela:"", linhaDigitavel:"", favorecido:"", divergencias:["AGUARDANDO LEITURA/CONFERÊNCIA"], criadoEm:now(), criadoPor:currentUser?.nome || "USUÁRIO" }));
    try {
      for(let i=0;i<novos.length;i++){
        const x=novos[i],file=files[i];
        if(supabase){
          const path="boletos/"+x.documentoId+"/"+file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
          const {error}=await supabase.storage.from(BUCKET).upload(path,file,{upsert:false,contentType:file.type||"application/pdf"});
          if(error)throw error;
          x.documentoPath=path;
        }else await putFile(x.documentoId,file);
      }
    } catch(e) {return setMessage("NÃO FOI POSSÍVEL GUARDAR O BOLETO NA NUVEM. CADASTRO INTERROMPIDO: "+String(e.message||e))}
    onChange((d) => ({ ...d, preConferenciaBoletos:[...(d.preConferenciaBoletos || []), ...novos], auditoria:[...(d.auditoria || []), ...novos.map((x) => ({ id:crypto.randomUUID(), acao:"BOLETO RECEBIDO NA PRÉ-CONFERÊNCIA", detalhe:`${x.arquivoNome} • ${x.origem}`, usuario:currentUser?.nome || "USUÁRIO", dataHora:now() }))] }));
    setMessage(`${novos.length} DOCUMENTO(S) ENCAMINHADO(S) À PRÉ-CONFERÊNCIA.`);
  }
  function patch(id, key, value) { onChange((d) => ({ ...d, preConferenciaBoletos:(d.preConferenciaBoletos || []).map((x) => x.id === id ? {...x, [key]:value, atualizadoEm:now()} : x) })); }
  async function abrirBoleto(item) {
    if(item.documentoPath && supabase){const {data,error}=await supabase.storage.from(BUCKET).createSignedUrl(item.documentoPath,60);if(error)throw error;window.open(data.signedUrl,"_blank","noopener");return}
    await openFile(item.documentoId);
  }
  async function arquivoDisponivel(item){if(item.documentoPath && supabase){const {error}=await supabase.storage.from(BUCKET).download(item.documentoPath);return !error}return !!(await getFile(item.documentoId).catch(()=>null))}
  async function setStatus(item, status) {
    if (!financial) return setMessage("SOMENTE USUÁRIO FINANCEIRO OU ADMINISTRADOR PODE CONFERIR/REJEITAR.");
    if(status==="CONFERIDO" && !(await arquivoDisponivel(item))) return setMessage("ARQUIVO ORIGINAL INDISPONÍVEL NESTE DISPOSITIVO. CONFIRA E ANEXE O BOLETO ANTES DE VALIDAR.");
    if(status==="CONFERIDO" && ![44,47,48].includes(String(item.linhaDigitavel||"").replace(/\D/g,"").length)) return setMessage("LINHA DIGITÁVEL INVÁLIDA: CONFIRA OS 44, 47 OU 48 DÍGITOS DO BOLETO.");
    const isDup = duplicate(item) || (data.contasPagar||[]).some(x=>x.linhaDigitavel && x.linhaDigitavel===item.linhaDigitavel);
    if (status === "CONFERIDO" && (!item.documentoId || !item.fornecedor || !item.beneficiarioDocumento || !(Number(item.valor)>0) || !item.vencimento || !item.linhaDigitavel || !item.nf || !item.carga || !item.validacaoManual)) return setMessage("CONFIRA O ARQUIVO E PREENCHA FORNECEDOR, CNPJ/CPF, VALOR, VENCIMENTO, LINHA DIGITÁVEL, NF, CARGA E MARQUE A VALIDAÇÃO MANUAL.");
    if (status === "CONFERIDO" && item.valorNf && Math.abs(Number(item.valorNf)-Number(item.valor))>0.01) return setMessage("VALOR DO BOLETO DIFERE DA NF. RESOLVA A DIVERGÊNCIA ANTES DA CONFERÊNCIA.");
    if (status === "CONFERIDO" && isDup) return setMessage("DUPLICIDADE DETECTADA. O DOCUMENTO NÃO PODE SER CONFERIDO ATÉ A DIVERGÊNCIA SER RESOLVIDA.");
    onChange((d) => ({ ...d, preConferenciaBoletos:(d.preConferenciaBoletos || []).map((x) => x.id === item.id ? {...x, status, conferidoPor:status === "CONFERIDO" ? currentUser?.nome : x.conferidoPor, conferidoEm:status === "CONFERIDO" ? now() : x.conferidoEm} : x), auditoria:[...(d.auditoria || []), {id:crypto.randomUUID(), acao:`PRÉ-CONFERÊNCIA — ${status}`, detalhe:`${item.arquivoNome || item.linhaDigitavel || item.id}`, usuario:currentUser?.nome || "USUÁRIO", dataHora:now()}] }));
  }
  function incorporate() {
    if (!financial) return setMessage("SOMENTE USUÁRIO FINANCEIRO OU ADMINISTRADOR PODE INCORPORAR TÍTULOS.");
    const ids = selected.filter((id) => elegiveis.some((x) => x.id === id && x.validacaoManual && x.conferidoPor && x.documentoId));
    if (!ids.length) return setMessage("SELECIONE AO MENOS UM BOLETO CONFERIDO.");
    onChange((d) => {
      const chosen = (d.preConferenciaBoletos || []).filter((x) => ids.includes(x.id) && x.status === "CONFERIDO" && !x.contaPagarId);
      const created = chosen.map((x) => ({ id:crypto.randomUUID(), preConferenciaId:x.id, fornecedor:x.fornecedor || x.favorecido || "FORNECEDOR NÃO IDENTIFICADO", titulo:x.linhaDigitavel || x.arquivoNome, nf:x.nf, carga:x.carga, valor:Number(x.valor || 0), emissao:new Date().toISOString().slice(0,10), vencimento:x.vencimento, status:"ABERTO — CONFERIDO", linhaDigitavel:x.linhaDigitavel, documentoOrigem:x.arquivoNome }));
      return {...d, contasPagar:[...(d.contasPagar || []), ...created], preConferenciaBoletos:(d.preConferenciaBoletos || []).map((x) => { const i=chosen.findIndex((c)=>c.id===x.id); return i < 0 ? x : {...x, status:"INCORPORADO AO CONTAS A PAGAR", contaPagarId:created[i].id, incorporadoPor:currentUser?.nome || "USUÁRIO", incorporadoEm:now()}; }), auditoria:[...(d.auditoria || []), ...chosen.map((x)=>({id:crypto.randomUUID(),acao:"BOLETO INCORPORADO AO CONTAS A PAGAR",detalhe:x.arquivoNome || x.id,usuario:currentUser?.nome || "USUÁRIO",dataHora:now()}))]};
    });
    setSelected([]); setMessage(`${ids.length} TÍTULO(S) INCORPORADO(S) AO CONTAS A PAGAR.`);
  }
  return <section className="card"><div className="sectionHead"><div><h2>PRÉ-CONFERÊNCIA FINANCEIRA</h2><p>GMAIL / UPLOAD / DOSSIÊ → CONFERÊNCIA HUMANA → CONTAS A PAGAR.</p></div><label className="fileButton">ANEXAR BOLETOS<input hidden multiple type="file" accept=".pdf,image/*" onChange={(e)=>addFiles(e.target.files || [])}/></label></div>
    <div className="alert warn"><b>REGRA DE SEGURANÇA:</b> NENHUM BOLETO DE FORNECEDOR ENTRA DIRETAMENTE NO CONTAS A PAGAR.</div>
    <div className="bulkBar"><button className="ghost dark" onClick={()=>setSelected(elegiveis.map((x)=>x.id))}>MARCAR TODOS OS ELEGÍVEIS</button><button className="ghost dark" onClick={()=>setSelected([])}>DESMARCAR TODOS</button><button onClick={incorporate}>INCORPORAR SELECIONADOS AO CONTAS A PAGAR</button></div>
    {message && <div className="alert">{message}</div>}
    <div className="precheckList">{rows.map((x)=><article className={`precheckCard ${duplicate(x)?"duplicate":""}`} key={x.id}><label><input type="checkbox" disabled={x.status!=="CONFERIDO"||!!x.contaPagarId} checked={selected.includes(x.id)} onChange={()=>setSelected((a)=>a.includes(x.id)?a.filter((id)=>id!==x.id):[...a,x.id])}/> SELECIONAR</label><div><b>{x.arquivoNome || "BOLETO"}</b><small>{x.origem} • {x.status}</small>{x.documentoId&&<button type="button" className="ghost dark" onClick={()=>abrirBoleto(x).catch(()=>setMessage("ARQUIVO INDISPONÍVEL. SOLICITE O DOCUMENTO ORIGINAL ANTES DE VALIDAR."))}>ABRIR BOLETO</button>}</div>{duplicate(x)&&<strong className="dangerText">DUPLICIDADE DETECTADA</strong>}
      <div className="precheckFields"><label>FORNECEDOR<input value={x.fornecedor||""} onChange={(e)=>patch(x.id,"fornecedor",e.target.value.toUpperCase())}/></label><label>CNPJ/CPF<input value={x.beneficiarioDocumento||""} onChange={(e)=>patch(x.id,"beneficiarioDocumento",e.target.value)}/></label><label>NF<input value={x.nf||""} onChange={(e)=>patch(x.id,"nf",e.target.value)}/></label><label>PEDIDO / CARGA<input value={x.carga||x.pedido||""} onChange={(e)=>patch(x.id,"carga",e.target.value.toUpperCase())}/></label><label>VALOR BOLETO<input type="number" step="0.01" value={x.valor||""} onChange={(e)=>patch(x.id,"valor",e.target.value)}/></label><label>VALOR NF<input type="number" step="0.01" value={x.valorNf||""} onChange={(e)=>patch(x.id,"valorNf",e.target.value)}/></label><label>VENCIMENTO<input type="date" value={x.vencimento||""} onChange={(e)=>patch(x.id,"vencimento",e.target.value)}/></label><label>LINHA DIGITÁVEL<input value={x.linhaDigitavel||""} onChange={(e)=>patch(x.id,"linhaDigitavel",e.target.value.replace(/\D/g,""))}/></label></div>
      <small>VALOR: {money(x.valor)} • CONFERIDO POR: {x.conferidoPor || "—"}</small><label><input type="checkbox" checked={!!x.validacaoManual} disabled={!financial || x.status==="INCORPORADO AO CONTAS A PAGAR"} onChange={e=>patch(x.id,"validacaoManual",e.target.checked)}/> CONFIRMO QUE COMPAREI O BOLETO ORIGINAL, BENEFICIÁRIO, CNPJ/CPF, NF, CARGA, VALOR, VENCIMENTO E LINHA DIGITÁVEL.</label><div className="cadRowActions"><select value={x.status} onChange={(e)=>setStatus(x,e.target.value)}>{STATUS.map((s)=><option key={s}>{s}</option>)}</select><button onClick={()=>setStatus(x,"CONFERIDO")}>CONFERIR</button><button className="dangerBtn" onClick={()=>setStatus(x,"REJEITADO/CANCELADO")}>REJEITAR</button></div></article>)}</div>
    {!rows.length && <p className="muted">NENHUM BOLETO AGUARDANDO CONFERÊNCIA.</p>}
  </section>;
}
