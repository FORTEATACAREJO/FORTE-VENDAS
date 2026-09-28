import { useEffect, useRef } from "react";
import { lerXmlNfe } from "./nfe";
import { putFile } from "./fileStore";

const UF_IBGE = { AC:"12", AL:"27", AP:"16", AM:"13", BA:"29", CE:"23", DF:"53", ES:"32", GO:"52", MA:"21", MT:"51", MS:"50", MG:"31", PA:"15", PB:"25", PR:"41", PE:"26", PI:"22", RJ:"33", RN:"24", RS:"43", RO:"11", RR:"14", SC:"42", SP:"35", SE:"28", TO:"17" };
const uid = p => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const now = () => new Date().toISOString();
const upper = v => String(v || "").toUpperCase();
const base64File = (base64, name) => {
  const raw = atob(base64), bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return new File([bytes], name, { type: "application/xml" });
};

export default function SefazAutoSync({ data, onChange, currentUser }) {
  const latest = useRef(data);
  const running = useRef(false);
  useEffect(() => { latest.current = data; }, [data]);

  useEffect(() => {
    if (data.settings?.sefazAutoSync === false) return;
    const endpoint = String(data.settings?.sefazEndpointSeguro || "").trim();
    const unitsKey = (data.unidades || []).filter(x => x.ativo !== false && x.cnpj).map(x => `${x.cnpj}:${x.uf}`).join("|");
    if (!endpoint || !unitsKey) return;
    const interval = Math.max(5, Number(data.settings?.sefazIntervaloMinutos || 10)) * 60000;

    async function sync() {
      if (running.current) return;
      running.current = true;
      const snapshot = latest.current;
      const unidades = (snapshot.unidades || []).filter(x => x.ativo !== false && x.cnpj);
      const tentativa = now();
      try {
        const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "DISTRIBUICAO_DFE", ambiente: snapshot.settings?.sefazAmbiente || "1", estabelecimentos: unidades.map(u => ({ cnpj: u.cnpj, unidade: u.nome, uf: u.uf, codigoUf: UF_IBGE[upper(u.uf)] })) }) });
        const retorno = await response.json();
        if (!response.ok) throw new Error(retorno.erro || (retorno.resultados || []).map(x => `${x.cnpj}: ${x.erro}`).join(" • ") || `SEFAZ ${response.status}`);
        const notas = [], arquivos = [];
        for (const doc of Array.isArray(retorno.documentos) ? retorno.documentos : []) {
          if (!doc.xmlBase64 || doc.erro) continue;
          const file = base64File(doc.xmlBase64, `SEFAZ-${doc.chave || doc.nsu}.xml`), fileId = uid("sefazxml");
          await putFile(fileId, file);
          let dados = null;
          if (!doc.resumo) try { const parsed = await lerXmlNfe(file); const { raw, ...clean } = parsed; dados = clean; } catch {}
          dados = dados || { chave: doc.chave, numero: String(doc.chave || "").slice(25, 34).replace(/^0+/, ""), emissao: doc.emissao, emitente: doc.emitente, emitenteCnpj: doc.emitenteCnpj, destinatarioCnpj: doc.destinatarioCnpj, valorNf: Number(doc.valorNf || 0), produtos: [] };
          notas.push({ id: uid("nfe"), ...dados, origem: doc.resumo ? "SEFAZ AUTOMÁTICA — RESUMO DF-E" : "SEFAZ AUTOMÁTICA — XML COMPLETO", documentoXmlId: fileId, nsu: doc.nsu, schemaSefaz: doc.schema, status: doc.resumo ? "RESUMO RECEBIDO — AGUARDANDO XML COMPLETO" : "AGUARDANDO DESTINAÇÃO", importadaEm: tentativa });
          arquivos.push({ id: fileId, fileId, tipo: doc.resumo ? "RESUMO DF-E" : "XML NF-E SEFAZ", nome: file.name, mime: file.type, xml: true, chaveNfe: doc.chave, nsu: doc.nsu, statusIa: "SEFAZ AUTOMÁTICA — AGUARDANDO VINCULAÇÃO", conferencia: { status: "AGUARDANDO IA", itens: [] }, criadoEm: tentativa });
        }
        onChange(d => {
          const novas = notas.filter(n => n.chave && !(d.notasFiscais || []).some(x => x.chave === n.chave));
          const novosArquivos = arquivos.filter(a => !(d.documentos || []).some(x => x.chaveNfe === a.chaveNfe && x.tipo === a.tipo));
          return { ...d, notasFiscais: [...(d.notasFiscais || []), ...novas], documentos: [...(d.documentos || []), ...novosArquivos], sefazConsultas: [...(d.sefazConsultas || []), { id: uid("sefaz"), cnpjs: unidades.map(u => u.cnpj), novos: novas.length, resultados: retorno.resultados || [], dataHora: tentativa, usuario: "AUTOMAÇÃO SEFAZ" }], settings: { ...(d.settings || {}), sefazAutoSync: true, ultimaConsultaSefaz: tentativa, sefazAutoStatus: "ATIVO", sefazAutoErro: "" }, auditoria: novas.length ? [...(d.auditoria || []), { id: uid("aud"), acao: "NF-E RECEBIDA AUTOMATICAMENTE DA SEFAZ", detalhe: `${novas.length} DOCUMENTO(S) • MATRIZ/FILIAL`, usuario: currentUser?.nome || "AUTOMAÇÃO SEFAZ", dataHora: tentativa }] : d.auditoria };
        });
      } catch (error) {
        onChange(d => ({ ...d, settings: { ...(d.settings || {}), ultimaTentativaSefaz: tentativa, sefazAutoStatus: "AGUARDANDO SERVIÇO SEGURO", sefazAutoErro: String(error.message || error).slice(0, 240) } }));
      } finally { running.current = false; }
    }
    const first = setTimeout(sync, 5000);
    const timer = setInterval(sync, interval);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [data.settings?.sefazAutoSync, data.settings?.sefazEndpointSeguro, data.settings?.sefazAmbiente, data.settings?.sefazIntervaloMinutos, (data.unidades || []).map(x => `${x.id}:${x.cnpj}:${x.uf}:${x.ativo}`).join("|")]);
  return null;
}
