import { useMemo, useState } from "react";
import { putFile } from "./fileStore";
import { supabase, supabaseConfigured } from "./supabase";

const CARGOS = [
  "OPERADOR DE PÁTIO",
  "AUXILIAR DE ESCRITÓRIO — NÍVEL 1",
  "AUXILIAR DE ESCRITÓRIO — NÍVEL 2",
  "VENDEDOR INTERNO",
  "VENDEDOR EXTERNO",
  "FINANCEIRO",
  "MOTORISTA DE ENTREGA",
  "OPERADOR GERAL",
  "ADMINISTRADOR",
];
const PERFIS = ["CONSULTA", "VENDAS", "CONFERÊNCIA", "OPERADOR GERAL", "FINANCEIRO", "ADMINISTRADOR"];
const UNIDADES = [
  "MATRIZ - MONTE CARMELO/MG",
  "FILIAL - CALDAS NOVAS/GO",
  "AMBAS AS UNIDADES - MATRIZ E FILIAL",
];
const MODULOS = [
  "VENDAS E COMPRAS", "LOGÍSTICA E OPERAÇÃO", "CONFERÊNCIA E IA",
  "FINANCEIRO", "FORNECEDORES E SUPRIMENTOS", "CADASTROS",
  "RELATÓRIOS", "PÁTIO / ESTOQUE", "INTEGRAÇÕES",
];
const defaults = {
  nome: "", cpf: "", email: "", whatsapp: "", cargo: "",
  perfil: "CONSULTA", unidade: "MATRIZ - MONTE CARMELO/MG",
  permissoes: {}, documento: null, documentoNome: "", statusIa: "NÃO ANALISADO",
  cpfConferido: false,
};
const onlyDigits = (value) => String(value || "").replace(/\D/g, "");
const isValidCpf = (value) => {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (length) => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) sum += Number(cpf[index]) * (length + 1 - index);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
};
const toBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
  reader.onerror = reject;
  reader.readAsDataURL(file);
});
const appProfile = (perfil) => ({
  "CONFERÊNCIA": "CONFERENCIA",
  FINANCEIRO: "FINANCEIRO",
  VENDAS: "VENDAS",
  "OPERADOR GERAL": "OPERADOR_GERAL",
  ADMINISTRADOR: "ADMINISTRADOR",
}[perfil] || "CONSULTA");

export default function EmployeesV654({ data, onChange, currentUser, onClose }) {
  const [form, setForm] = useState(defaults);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [authorizationPassword, setAuthorizationPassword] = useState("");
  const [showAuthorizationPassword, setShowAuthorizationPassword] = useState(false);
  const isAdmin = !!currentUser?.admin;
  const isMaster = !!currentUser?.master;
  const employees = data.funcionarios || [];
  const filtered = useMemo(() => employees.filter((x) =>
    !search || `${x.nome} ${x.cpf} ${x.email} ${x.whatsapp} ${x.cargo}`.toUpperCase().includes(search.toUpperCase())
  ), [employees, search]);

  if (!isAdmin) return null;
  const patch = (key, value) => setForm((old) => ({
    ...old,
    [key]: value,
    ...(key === "cpf" ? { cpfConferido:false } : {}),
  }));
  const togglePermission = (module, action) => setForm((old) => ({
    ...old,
    permissoes: {
      ...old.permissoes,
      [module]: { ...(old.permissoes[module] || {}), [action]: !old.permissoes[module]?.[action] },
    },
  }));
  const permissionSet = (value, action = null) => Object.fromEntries(MODULOS.map((module) => [
    module,
    Object.fromEntries(["visualizar", "criar", "editar", "aprovar"].map((item) => [
      item,
      action ? (item === action ? value : !!form.permissoes?.[module]?.[item]) : value,
    ])),
  ]));
  const setAllPermissions = (value) => patch("permissoes", permissionSet(value));
  const setPermissionColumn = (action, value) => patch("permissoes", permissionSet(value, action));
  const changeProfile = (perfil) => setForm((old) => {
    const full = { visualizar:true, criar:true, editar:true, aprovar:true };
    const none = { visualizar:false, criar:false, editar:false, aprovar:false };
    const operadorGeral = Object.fromEntries(MODULOS.map((module) => [
      module,
      module === "FINANCEIRO" ? { ...none } : { ...full },
    ]));
    return {
      ...old,
      perfil,
      cargo: perfil === "OPERADOR GERAL" ? "OPERADOR GERAL" : old.cargo,
      permissoes: perfil === "ADMINISTRADOR"
        ? Object.fromEntries(MODULOS.map((module) => [module, { ...full }]))
        : perfil === "OPERADOR GERAL"
          ? operadorGeral
          : old.permissoes,
    };
  });

  async function readDocument() {
    if (!form.documento) return setMessage("ANEXE A CNH OU O DOCUMENTO DE IDENTIFICAÇÃO.");
    if (!supabaseConfigured) return setMessage("CONFIGURE O SUPABASE PARA USAR A LEITURA POR IA.");
    setBusy(true); setMessage("LENDO DOCUMENTO COM IA…");
    try {
      const { data: result, error } = await supabase.functions.invoke("employee-document-ai", {
        body: { filename: form.documento.name, mimeType: form.documento.type, contentBase64: await toBase64(form.documento) },
      });
      if (error) throw error;
      const cpfExtraido = onlyDigits(result.fields?.cpf);
      setForm((old) => ({ ...old, ...result.fields, cpfConferido:false, statusIa: "LIDO — AGUARDANDO CONFERÊNCIA DO ADMIN" }));
      setMessage(isValidCpf(cpfExtraido)
        ? "DADOS EXTRAÍDOS. COMPARE O CPF COM O DOCUMENTO E MARQUE A CONFIRMAÇÃO."
        : "CPF EXTRAÍDO PELA IA É INVÁLIDO. CORRIJA PELO DOCUMENTO; O CADASTRO PERMANECE BLOQUEADO.");
    } catch (error) {
      setMessage(`NÃO FOI POSSÍVEL LER AUTOMATICAMENTE: ${error.message || "SERVIÇO INDISPONÍVEL"}. PREENCHA E CONFIRA MANUALMENTE.`);
    } finally { setBusy(false); }
  }

  function validate() {
    const missing = [["nome","PRIMEIRO NOME"],["whatsapp","WHATSAPP"],["cargo","FUNÇÃO"],["perfil","PERFIL"],["unidade","EMPRESA/UNIDADE"]]
      .filter(([key]) => !String(form[key] || "").trim()).map(([, label]) => label);
    if (missing.length) return `PREENCHA: ${missing.join(", ")}.`;
    if (onlyDigits(form.whatsapp).length < 10) return "WHATSAPP INVÁLIDO.";
    if (form.perfil === "ADMINISTRADOR" && !isAdmin) return "SOMENTE ADMIN OU MASTER PODE CONCEDER PERFIL ADMINISTRADOR.";
    if (form.perfil === "MASTER" && !isMaster) return "SOMENTE MASTER PODE ALTERAR OUTRO MASTER.";
    return "";
  }

  async function saveAndInvite() {
    const invalid = validate(); if (invalid) return setMessage(invalid);
    setBusy(true); setMessage("SALVANDO CADASTRO E PREPARANDO CONVITE…");
    try {
      let documentoFileId = form.documentoFileId || "";
      if (form.documento) { documentoFileId = `func-${Date.now()}`; await putFile(documentoFileId, form.documento); }
      let documentoPath = form.documentoPath || "";
      if (supabaseConfigured && form.documento && currentUser?.empresaId) {
        const safeName = form.documento.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        documentoPath = `${currentUser.empresaId}/geral/funcionarios/${Date.now()}-${safeName}`;
        const { error: uploadError } = await supabase.storage.from("fc-documentos").upload(documentoPath, form.documento, { upsert:false });
        if (uploadError) throw uploadError;
      }
      const id = form.id || crypto.randomUUID();
      const record = {
        ...form, id, cpf: onlyDigits(form.cpf), email: String(form.email || "").trim().toLowerCase(),
        whatsapp: onlyDigits(form.whatsapp), documento: undefined, documentoFileId,
        documentoConferido:!!form.documento,
        documentoNome: form.documento?.name || form.documentoNome, documentoPath,
        status: supabaseConfigured ? "CONVITE EM PROCESSAMENTO" : "AGUARDANDO CONEXÃO COM SUPABASE",
        criadoEm: form.criadoEm || new Date().toISOString(), atualizadoEm: new Date().toISOString(),
        criadoPor: currentUser?.nome || "ADMINISTRADOR",
      };
      onChange((old) => ({
        ...old,
        funcionarios: form.id ? (old.funcionarios || []).map((x) => x.id === id ? record : x) : [...(old.funcionarios || []), record],
        auditoria: [...(old.auditoria || []), { id:`aud-${Date.now()}`, acao: form.id ? "FUNCIONÁRIO ATUALIZADO" : "FUNCIONÁRIO CADASTRADO", detalhe:`${record.nome} • ${record.cargo} • ${record.email}`, usuario:currentUser?.nome, dataHora:new Date().toISOString() }],
      }));
      if (supabaseConfigured) {
        const { data: invite, error } = await supabase.functions.invoke("invite-employee", { body: {
          id, nome: record.nome, whatsapp: record.whatsapp,
          cargo: record.cargo, perfil: appProfile(record.perfil), permissoes: record.permissoes,
          unidade: record.unidade, conviteWhatsapp:true, completarCadastro:true, criarSenha:true,
        }});
        if (error) throw error;
        setMessage(invite?.message || "CONVITE PREPARADO PARA WHATSAPP. O FUNCIONÁRIO COMPLETARÁ O CADASTRO E CRIARÁ A SENHA.");
      } else setMessage("CADASTRO SALVO LOCALMENTE. CONECTE O SUPABASE PARA ENVIAR O CONVITE.");
      setForm(defaults);
    } catch (error) { setMessage(`CADASTRO SALVO, MAS O CONVITE NÃO FOI ENVIADO: ${error.message || "FALHA NA FUNÇÃO"}.`); }
    finally { setBusy(false); }
  }

  function editEmployee(employee) { setForm({ ...defaults, ...employee, documento: null }); setMessage(""); }

  function deleteEmployee(employee) {
    if (!isAdmin && !isMaster) return setMessage("SOMENTE ADMIN OU MASTER PODE EXCLUIR UM CADASTRO.");
    if (employee.perfil === "MASTER" && !isMaster) return setMessage("SOMENTE MASTER PODE EXCLUIR OUTRO MASTER.");
    const sameCpf = onlyDigits(employee.cpf) && onlyDigits(employee.cpf) === onlyDigits(currentUser?.cpf);
    const sameEmail = employee.email && String(employee.email).toLowerCase() === String(currentUser?.email || "").toLowerCase();
    if (sameCpf || sameEmail) return setMessage("VOCÊ NÃO PODE EXCLUIR O PRÓPRIO CADASTRO.");
    if (employee.perfil === "MASTER") {
      const mastersAtivos = employees.filter((x) => x.perfil === "MASTER" && x.ativo !== false);
      if (mastersAtivos.length <= 1) return setMessage("O ÚLTIMO MASTER ATIVO NÃO PODE SER EXCLUÍDO.");
    }
    setAuthorizationPassword("");
    setShowAuthorizationPassword(false);
    setDeleteTarget(employee);
  }

  async function confirmDeleteEmployee() {
    const employee = deleteTarget;
    if (!employee) return;
    if (!authorizationPassword) return setMessage("INFORME A SENHA DO ADMIN/MASTER PARA AUTORIZAR A EXCLUSÃO.");
    setBusy(true); setMessage("VALIDANDO AUTORIZAÇÃO E EXCLUINDO CADASTRO…");
    try {
      if (supabaseConfigured) {
        const { data: result, error } = await supabase.functions.invoke("delete-employee", { body: {
          employeeId: employee.id, cpf: onlyDigits(employee.cpf), email: String(employee.email || "").trim().toLowerCase(),
          authorizationPassword,
        }});
        if (error) throw error;
        if (result?.error) throw new Error(result.error);
      }
      onChange((old) => ({ ...old,
        funcionarios:(old.funcionarios || []).filter((x) => x.id !== employee.id),
        auditoria:[...(old.auditoria || []), {id:`aud-${Date.now()}`, acao:"CADASTRO DE FUNCIONÁRIO EXCLUÍDO", detalhe:`${employee.nome} • cadastro duplicado/removido definitivamente`, usuario:currentUser?.nome || "ADMINISTRADOR", dataHora:new Date().toISOString()}],
      }));
      if (form.id === employee.id) setForm(defaults);
      setDeleteTarget(null);
      setAuthorizationPassword("");
      setShowAuthorizationPassword(false);
      setMessage("CADASTRO EXCLUÍDO DEFINITIVAMENTE.");
    } catch (error) {
      setAuthorizationPassword("");
      setShowAuthorizationPassword(false);
      setMessage(`NÃO FOI POSSÍVEL EXCLUIR: ${error.message || "FALHA NO SERVIÇO"}.`);
    } finally { setBusy(false); }
  }

  function deactivate(employee) {
    if (employee.perfil === "MASTER" && !isMaster) return setMessage("SOMENTE MASTER PODE ALTERAR UM MASTER.");
    const reativando = employee.ativo === false;
    if (!reativando && employee.perfil === "MASTER") {
      const mastersAtivos = employees.filter((x) => x.perfil === "MASTER" && x.ativo !== false);
      if (mastersAtivos.length <= 1) return setMessage("O ÚLTIMO MASTER ATIVO NÃO PODE SER DESATIVADO.");
    }
    if (!confirm(`${reativando ? "REATIVAR" : "DESATIVAR"} O USUÁRIO ${employee.nome}?\n\nO HISTÓRICO E A AUTORIA DOS REGISTROS SERÃO PRESERVADOS.`)) return;
    const motivo = reativando ? "REATIVAÇÃO AUTORIZADA" : (prompt("INFORME O MOTIVO DA DESATIVAÇÃO (OBRIGATÓRIO):") || "").trim();
    if (!motivo) return setMessage("INFORME O MOTIVO PARA CONCLUIR A DESATIVAÇÃO.");
    onChange((old) => ({ ...old,
      funcionarios:(old.funcionarios || []).map((x) => x.id === employee.id ? {...x, ativo:reativando, desativadoEm:reativando?null:new Date().toISOString(), desativadoPor:reativando?null:currentUser?.nome, motivoDesativacao:reativando?null:motivo} : x),
      auditoria:[...(old.auditoria || []), {id:`aud-${Date.now()}`, acao:reativando?"USUÁRIO REATIVADO":"USUÁRIO DESATIVADO", detalhe:`${employee.nome} • ${motivo}`, usuario:currentUser?.nome || "ADMINISTRADOR", dataHora:new Date().toISOString()}],
    }));
    setMessage(reativando ? "USUÁRIO REATIVADO." : "USUÁRIO DESATIVADO COM HISTÓRICO PRESERVADO.");
  }

  return <div className="modalBackdrop"><section className="modal employeeModal">
    {deleteTarget && <div className="modalBackdrop" style={{zIndex:9999}}>
      <section className="modal" style={{maxWidth:560}}>
        <div className="modalHead"><div><h2>AUTORIZAR EXCLUSÃO</h2><p>EXCLUIR DEFINITIVAMENTE O CADASTRO DE {deleteTarget.nome}?</p></div></div>
        <div className="note">A exclusão exige reautenticação do ADMIN/MASTER. A senha não será armazenada.</div>
        <label className="field">SENHA DO ADMIN/MASTER
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <input
              type={showAuthorizationPassword ? "text" : "password"}
              value={authorizationPassword}
              onChange={(e)=>setAuthorizationPassword(e.target.value)}
              autoComplete="new-password"
              autoFocus
              onKeyDown={(e)=>{ if(e.key==="Enter") confirmDeleteEmployee(); }}
              style={{flex:1}}
            />
            <button type="button" className="ghost dark" aria-label={showAuthorizationPassword ? "Ocultar senha" : "Mostrar senha"} onClick={()=>setShowAuthorizationPassword((v)=>!v)}>
              {showAuthorizationPassword ? "🙈" : "👁"}
            </button>
          </div>
        </label>
        <div className="modalActions">
          <button type="button" className="ghost dark" onClick={()=>{setDeleteTarget(null);setAuthorizationPassword("");setShowAuthorizationPassword(false);}}>CANCELAR</button>
          <button type="button" className="dangerBtn" disabled={busy || !authorizationPassword} onClick={confirmDeleteEmployee}>{busy ? "VALIDANDO…" : "AUTORIZAR E EXCLUIR"}</button>
        </div>
      </section>
    </div>}
    <div className="modalHead"><div><h2>FUNCIONÁRIOS E PERMISSÕES</h2><p>CADASTRO ADMINISTRADO EXCLUSIVAMENTE POR ADMIN OU MASTER.</p></div><button className="ghost dark" onClick={onClose}>FECHAR</button></div>
    <div className="employeeWorkflow"><b>1. PRIMEIRO NOME + WHATSAPP</b><span>2. FUNÇÃO / PERFIL / EMPRESA</span><span>3. CONVITE POR WHATSAPP</span><span>4. FUNCIONÁRIO COMPLETA CADASTRO E CRIA SENHA</span></div>
    <div className="employeeForm">
      <label className="field">PRIMEIRO NOME<input value={form.nome} onChange={(e)=>patch("nome",e.target.value.toUpperCase().split(/\\s+/)[0])} placeholder="EX.: MARIA"/></label>
      <label className="field">WHATSAPP<input value={form.whatsapp} onChange={(e)=>patch("whatsapp",e.target.value)}/></label>
      <label className="field">FUNÇÃO<select value={form.cargo} onChange={(e)=>patch("cargo",e.target.value)}><option value="">SELECIONE…</option>{CARGOS.map((x)=><option key={x}>{x}</option>)}</select></label>
      <label className="field">PERFIL<select value={form.perfil} onChange={(e)=>changeProfile(e.target.value)}>{PERFIS.map((x)=><option key={x}>{x}</option>)}</select></label>
      <label className="field">UNIDADE<select value={form.unidade} onChange={(e)=>patch("unidade",e.target.value)}>{UNIDADES.map((x)=><option key={x}>{x}</option>)}</select></label>
      <div className="note"><b>PRÉ-CADASTRO POR WHATSAPP</b><br/>Para enviar o convite basta primeiro nome, WhatsApp, função, perfil e empresa/unidade. CPF, e-mail e documentos serão preenchidos pelo próprio funcionário ao abrir o convite, antes da liberação definitiva.</div>
    </div>
    <h3>BLOCO DE PERMISSÕES — SOMENTE ADMIN / MASTER</h3>
    <div className="permissionBulkActions">
      <button type="button" className="ghost dark" onClick={()=>setAllPermissions(true)}>MARCAR TODAS</button>
      <button type="button" className="ghost dark" onClick={()=>setAllPermissions(false)}>DESMARCAR TODAS</button>
      <button type="button" className="ghost dark" onClick={()=>setPermissionColumn("visualizar",true)}>VER TODOS</button>
      <button type="button" className="ghost dark" onClick={()=>setPermissionColumn("criar",true)}>CRIAR TODOS</button>
      <button type="button" className="ghost dark" onClick={()=>setPermissionColumn("editar",true)}>EDITAR TODOS</button>
      <button type="button" className="ghost dark" onClick={()=>setPermissionColumn("aprovar",true)}>APROVAR TODOS</button>
    </div>
    <div className="permissionMatrix"><b>MÓDULO</b><b>VER</b><b>CRIAR</b><b>EDITAR</b><b>APROVAR</b>{MODULOS.map((module)=><div className="permissionRow" key={module}><strong>{module}</strong>{["visualizar","criar","editar","aprovar"].map((action)=><input key={action} type="checkbox" disabled={form.perfil === "OPERADOR GERAL" && module === "FINANCEIRO"} checked={!!form.permissoes?.[module]?.[action]} onChange={()=>togglePermission(module,action)}/>)}</div>)}</div>
    {form.alertaDocumento && <div className="alert danger">{form.alertaDocumento}</div>}
    {message && <div className="alert warn">{message}</div>}
    <div className="modalActions"><button className="ghost dark" onClick={()=>setForm(defaults)}>LIMPAR</button><button disabled={busy} onClick={saveAndInvite}>{busy ? "PROCESSANDO…" : "SALVAR E ENVIAR CONVITE"}</button></div>
    <div className="employeeListHead"><h3>FUNCIONÁRIOS CADASTRADOS</h3><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="BUSCAR NOME, WHATSAPP OU FUNÇÃO"/></div>
    <div className="cadList">{filtered.map((employee)=><div className={`cadRow ${employee.ativo === false ? "inactive" : ""}`} key={employee.id}><div><b>{employee.nome}</b><small>{employee.cargo} • {employee.perfil} • {employee.email} • {employee.whatsapp} • {employee.status || "CADASTRADO"}</small></div><div className="cadRowActions"><button className="ghost dark" onClick={()=>editEmployee(employee)}>EDITAR</button><button className={employee.ativo === false ? "secondary" : "dangerBtn"} onClick={()=>deactivate(employee)}>{employee.ativo === false ? "ATIVAR" : "DESATIVAR"}</button><button className="dangerBtn" disabled={busy} onClick={()=>deleteEmployee(employee)}>EXCLUIR</button></div></div>)}</div>
  </section></div>;
}
