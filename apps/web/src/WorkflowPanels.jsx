import { useMemo, useState } from "react";

const uid = (p) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const now = () => new Date().toISOString();
const br = (v) => (v ? new Date(v).toLocaleString("pt-BR") : "-");
const money = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const norm = (v) => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

function Audit({ rows = [] }) {
  return <details className="flowAudit"><summary>TRILHA DE AUDITORIA ({rows.length})</summary>{rows.slice().reverse().slice(0, 30).map(x => <p key={x.id}><b>{x.acao}</b> • {x.usuario || "USUÁRIO"} • {br(x.dataHora)}<small>{x.detalhe}</small></p>)}</details>;
}

export function UnifiedSalesPanel({ data, onChange, currentUser, canRoute = false, onNavigate }) {
  const [filter, setFilter] = useState("TODAS");
  const rows = useMemo(() => {
    const direct = Object.values((data.vendas || []).reduce((acc, x) => {
      const key = x.grupoPedidoId || x.numeroVenda || x.id;
      if (!acc[key]) acc[key] = { id: key, source: "vendas", ids: [], numero: x.numeroVenda || key, cliente: x.cliente, origem: x.origemComercial || "VR", vendedor: x.vendedorNome || "NÃO INFORMADO", criadoEm: x.criadoEm, destinoPainel: x.destinoPainel || "AGUARDANDO ROTEAMENTO", total: 0 };
      acc[key].ids.push(x.id); acc[key].total += Number(x.qtd || 0) * Number(x.precoUnitario || 0);
      return acc;
    }, {}));
    const ext = (data.vendasExternas || []).map(x => ({ id: x.id, source: "externas", ids: [x.id], numero: x.numeroVenda || x.id, cliente: x.cliente || x.clienteNome, origem: "VX", vendedor: x.vendedor || x.vendedorNome || "VENDEDOR EXTERNO", criadoEm: x.criadoEm || x.data, destinoPainel: x.destinoPainel || "AGUARDANDO ROTEAMENTO", total: Number(x.total || x.valor || 0) }));
    const balcao = (data.vendasBalcao || []).filter(x => x.status !== "ORÇAMENTO").map(x => ({ id: x.id, source: "balcao", ids: [x.id], numero: x.numeroVenda || x.id, cliente: x.cliente, origem: x.origemComercial || "VR", vendedor: x.vendedorNome || x.usuario || "BALCÃO", criadoEm: x.criadoEm || x.data, destinoPainel: "VENDA BALCÃO", total: Number(x.total || 0) }));
    return [...direct, ...ext, ...balcao].sort((a, b) => String(b.criadoEm || "").localeCompare(String(a.criadoEm || "")));
  }, [data.vendas, data.vendasExternas, data.vendasBalcao]);
  const shown = rows.filter(x => filter === "TODAS" || x.destinoPainel === filter || x.origem === filter);
  function route(row, destination) {
    if (!canRoute) return alert("SEU PERFIL NÃO POSSUI PERMISSÃO PARA ROTEAR VENDAS.");
    const at = now(), user = currentUser?.nome || "USUÁRIO";
    onChange(d => {
      const patch = x => row.ids.includes(x.id) ? { ...x, destinoPainel: destination, roteadaEm: at, roteadaPor: user, statusRoteamento: "ROTEADA" } : x;
      return { ...d, vendas: row.source === "vendas" ? (d.vendas || []).map(patch) : d.vendas, vendasExternas: row.source === "externas" ? (d.vendasExternas || []).map(patch) : d.vendasExternas, auditoria: [...(d.auditoria || []), { id: uid("aud"), acao: "VENDA ROTEADA", detalhe: `${row.numero} • ${row.origem} • ${destination}`, usuario: user, dataHora: at }] };
    });
  }
  return <section className="card flowPanel"><div className="sectionHead"><div><h2>PAINEL ÚNICO DE VENDAS</h2><p>TODA VENDA ENTRA AQUI • VX VENDEDOR EXTERNO • VR VENDEDOR REVENDA • ROTEAMENTO AUDITADO.</p></div><button onClick={() => onNavigate("clientes")}>+ NOVA VENDA AO CLIENTE</button></div>
    <div className="flowFilters">{["TODAS", "AGUARDANDO ROTEAMENTO", "VENDA BALCÃO", "CARGA DIRETA", "VX", "VR"].map(x => <button key={x} className={filter === x ? "activeChoice" : "ghost dark"} onClick={() => setFilter(x)}>{x}</button>)}</div>
    <div className="flowTable"><table><thead><tr><th>VENDA</th><th>ORIGEM</th><th>VENDEDOR</th><th>CLIENTE</th><th>ENTRADA</th><th>VALOR</th><th>DESTINO</th><th>AÇÃO</th></tr></thead><tbody>{shown.map(x => <tr key={`${x.source}-${x.id}`}><td><b>{x.numero}</b></td><td><span className={`originBadge ${x.origem}`}>{x.origem}</span></td><td>{x.vendedor}</td><td>{x.cliente || "-"}</td><td>{br(x.criadoEm)}</td><td>{money(x.total)}</td><td><b>{x.destinoPainel}</b></td><td><div className="rowActions"><button disabled={!canRoute || x.source === "balcao"} onClick={() => route(x, "VENDA BALCÃO")}>BALCÃO</button><button disabled={!canRoute || x.source === "balcao"} onClick={() => route(x, "CARGA DIRETA")}>CARGA DIRETA</button></div></td></tr>)}</tbody></table></div>
    {!shown.length && <p className="muted">NENHUMA VENDA NESTE FILTRO.</p>}<Audit rows={(data.auditoria || []).filter(x => x.acao === "VENDA ROTEADA")} />
  </section>;
}

export function SupplierPurchasesPanel({ data, onChange, currentUser, onNavigate }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ unidadeId: "", fornecedorId: "", motoristaId: "", produtoId: "", qtd: "", pallets: "0", pagamento: "", expedicao: "", enviarWhatsapp: true, enviarEmail: false });
  const compras = data.comprasFornecedor || [];
  const produto = (data.produtos || []).find(x => x.id === form.produtoId);
  const fornecedor = (data.fornecedores || []).find(x => x.id === form.fornecedorId);
  const motorista = (data.motoristas || []).find(x => x.id === form.motoristaId);
  const custo = (data.custosFornecedor || []).find(x => x.ativo !== false && x.produtoId === form.produtoId && (!x.fornecedorId || x.fornecedorId === form.fornecedorId) && (!form.pagamento || norm(x.condicaoPagamento) === norm(form.pagamento)))?.custoUnitario || 0;
  const peso = Number(form.qtd || 0) * Number(produto?.pesoKg || 0);
  const capacidade = Number(motorista?.capacidadeMaximaKg || motorista?.capacidadeAlvoKg || 0);
  function save() {
    if (!form.unidadeId || !fornecedor || !motorista || !produto || Number(form.qtd) <= 0) return alert("PREENCHA UNIDADE, FORNECEDOR, MOTORISTA, PRODUTO E QUANTIDADE.");
    if (capacidade && peso > capacidade) return alert(`COMPRA BLOQUEADA: PESO ${peso.toLocaleString("pt-BR")} KG ACIMA DA CAPACIDADE ${capacidade.toLocaleString("pt-BR")} KG.`);
    const at = now(), user = currentUser?.nome || "USUÁRIO", seq = Number(data.settings?.nextCompraSeq || 1), numero = `COMP-${new Date().getFullYear()}-${String(seq).padStart(5, "0")}`;
    const item = { id: uid("compra"), numero, ...form, unidade: (data.unidades || []).find(x => x.id === form.unidadeId)?.nome || "", fornecedor: fornecedor.nome, codigoFornecedor: fornecedor.codigoCliente || fornecedor.codigoForte || "", motorista: motorista.nome, proprietario: motorista.proprietario || motorista.nome, placas: [motorista.placa1, motorista.placa2, motorista.placa3, motorista.placa4].filter(Boolean), produto: produto.nome, pesoKg: peso, custoUnitario: Number(custo), custoTotal: Number(form.qtd) * Number(custo), status: "AGUARDANDO NÚMERO DO PEDIDO", criadaEm: at, criadaPor: user };
    onChange(d => ({ ...d, settings: { ...(d.settings || {}), nextCompraSeq: seq + 1 }, comprasFornecedor: [...(d.comprasFornecedor || []), item], auditoria: [...(d.auditoria || []), { id: uid("aud"), acao: "COMPRA AO FORNECEDOR CRIADA", detalhe: `${numero} • ${fornecedor.nome} • ${peso} KG`, usuario: user, dataHora: at }] }));
    setOpen(false);
  }
  function order(c) {
    const number = prompt("NÚMERO DO PEDIDO INFORMADO PELO FORNECEDOR:", c.numeroPedidoFornecedor || ""); if (!number) return;
    const at = now(), user = currentUser?.nome || "USUÁRIO";
    onChange(d => ({ ...d, comprasFornecedor: (d.comprasFornecedor || []).map(x => x.id === c.id ? { ...x, numeroPedidoFornecedor: norm(number), status: "PEDIDO CONFIRMADO — ORDEM PENDENTE", pedidoConfirmadoEm: at, pedidoConfirmadoPor: user } : x), auditoria: [...(d.auditoria || []), { id: uid("aud"), acao: "PEDIDO DO FORNECEDOR VINCULADO", detalhe: `${c.numero} • PEDIDO ${norm(number)}`, usuario: user, dataHora: at }] }));
  }
  function loading(c) {
    if (!c.numeroPedidoFornecedor) return alert("VINCULE PRIMEIRO O NÚMERO DO PEDIDO DO FORNECEDOR.");
    if (!confirm("CONFIRMA A REVISÃO MANUAL E A GERAÇÃO DA ORDEM DE CARREGAMENTO?")) return;
    const at = now(), user = currentUser?.nome || "USUÁRIO";
    onChange(d => { const seq = Number(d.settings?.nextCargaSeq || 1), code = `FC-${String(seq).padStart(4, "0")}`; const carga = { id: uid("c"), codigo: code, compraFornecedorId: c.id, vendaIds: [], marca: c.fornecedor, motoristaId: c.motoristaId, motorista: c.motorista, proprietario: c.proprietario, placas: c.placas, pesoKg: c.pesoKg, qtd: Number(c.qtd), status: "VERMELHO", fase: "ORDEM DE CARREGAMENTO EMITIDA", unidade: c.unidade, localCarregamento: c.expedicao, condicaoFornecedor: c.pagamento, pallet: Number(c.pallets) > 0 ? `COM PALLETS — ${c.pallets}` : "SEM PALLETS", numeroPedidoFornecedor: c.numeroPedidoFornecedor, ordemRevisadaEm: at, ordemRevisadaPor: user, criadaEm: at };
      return { ...d, settings: { ...(d.settings || {}), nextCargaSeq: seq + 1 }, cargas: [...(d.cargas || []), carga], comprasFornecedor: (d.comprasFornecedor || []).map(x => x.id === c.id ? { ...x, cargaId: carga.id, codigoCarga: code, status: "ORDEM DE CARREGAMENTO EMITIDA", ordemEmitidaEm: at } : x), auditoria: [...(d.auditoria || []), { id: uid("aud"), acao: "ORDEM DE CARREGAMENTO EMITIDA", detalhe: `${code} • ${c.numero} • PEDIDO ${c.numeroPedidoFornecedor}`, usuario: user, dataHora: at }] };
    });
  }
  return <section className="card flowPanel"><div className="sectionHead"><div><h2>COMPRA AO FORNECEDOR</h2><p>PEDIDO COM CUSTO AUTOMÁTICO • MOTORISTA/PROPRIETÁRIO DO FORTE FRETE • CAPACIDADE CONFERIDA • ENVIO RASTREÁVEL.</p></div><button onClick={() => setOpen(!open)}>+ NOVA COMPRA</button></div>
    {open && <div className="flowForm miniGrid"><label>UNIDADE / CNPJ<select value={form.unidadeId} onChange={e => setForm({ ...form, unidadeId: e.target.value })}><option value="">SELECIONE...</option>{(data.unidades || []).map(x => <option key={x.id} value={x.id}>{x.nome} • {x.cnpj}</option>)}</select></label><label>FORNECEDOR<select value={form.fornecedorId} onChange={e => setForm({ ...form, fornecedorId: e.target.value, pagamento: (data.fornecedores || []).find(x => x.id === e.target.value)?.formaPagamentoPadrao || "" })}><option value="">SELECIONE...</option>{(data.fornecedores || []).filter(x => x.ativo !== false).map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></label><label>MOTORISTA / VEÍCULO<select value={form.motoristaId} onChange={e => setForm({ ...form, motoristaId: e.target.value })}><option value="">SELECIONE...</option>{(data.motoristas || []).filter(x => x.ativo !== false).map(x => <option key={x.id} value={x.id}>{x.nome} • {x.proprietario || "PRÓPRIO"} • {x.placa1}</option>)}</select></label><label>PRODUTO<select value={form.produtoId} onChange={e => setForm({ ...form, produtoId: e.target.value })}><option value="">SELECIONE...</option>{(data.produtos || []).filter(x => x.ativo !== false).map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></label><label>QUANTIDADE<input type="number" min="1" value={form.qtd} onChange={e => setForm({ ...form, qtd: e.target.value })} /></label><label>PALLETS<input type="number" min="0" value={form.pallets} onChange={e => setForm({ ...form, pallets: e.target.value })} /></label><label>PAGAMENTO<input value={form.pagamento} readOnly /></label><label>EXPEDIÇÃO / LOCAL<input value={form.expedicao} onChange={e => setForm({ ...form, expedicao: e.target.value.toUpperCase() })} /></label><div className="lockedValue"><b>PESO</b><span>{peso.toLocaleString("pt-BR")} KG / {capacidade ? capacidade.toLocaleString("pt-BR") : "?"} KG</span></div><div className="lockedValue"><b>CUSTO AUTOMÁTICO</b><span>{money(custo)} • TOTAL {money(Number(form.qtd) * Number(custo))}</span></div><label className="checkLine"><input type="checkbox" checked={form.enviarWhatsapp} onChange={e => setForm({ ...form, enviarWhatsapp: e.target.checked })} /> WHATSAPP</label><label className="checkLine"><input type="checkbox" checked={form.enviarEmail} onChange={e => setForm({ ...form, enviarEmail: e.target.checked })} /> E-MAIL</label><button onClick={save}>SALVAR E GERAR PEDIDO</button></div>}
    <div className="flowCards">{compras.slice().reverse().map(c => <article key={c.id}><header><b>{c.numero}</b><span>{c.status}</span></header><h3>{c.fornecedor}</h3><p>{c.unidade} • {c.produto} • {c.qtd} UN • {Number(c.pesoKg).toLocaleString("pt-BR")} KG</p><p>MOTORISTA {c.motorista} • PROPRIETÁRIO {c.proprietario}</p><p>PEDIDO {c.numeroPedidoFornecedor || "PENDENTE"} • {c.codigoCarga || "ORDEM PENDENTE"}</p><div className="rowActions"><button onClick={() => order(c)}>VINCULAR PEDIDO</button><button onClick={() => loading(c)}>GERAR ORDEM</button><button className="ghost dark" onClick={() => onNavigate("conferencia")}>NF / DOSSIÊ</button></div></article>)}</div>
    {!compras.length && <p className="muted">NENHUMA COMPRA AO FORNECEDOR REGISTRADA.</p>}<Audit rows={(data.auditoria || []).filter(x => /COMPRA AO FORNECEDOR|PEDIDO DO FORNECEDOR|ORDEM DE CARREGAMENTO/.test(x.acao || ""))} />
  </section>;
}

export function LoadingOrdersPanel({ data, onNavigate }) {
  const rows = (data.cargas || []).filter(x => x.status !== "CANCELADA").slice().reverse();
  return <section className="card flowPanel"><div className="sectionHead"><div><h2>ORDENS DE CARREGAMENTO</h2><p>PAINEL EXCLUSIVAMENTE OPERACIONAL • SEM CUSTOS, PREÇOS OU DADOS FINANCEIROS.</p></div><button onClick={() => onNavigate("todasCargas")}>ABRIR OPERAÇÃO COMPLETA</button></div><div className="flowTable"><table><thead><tr><th>ORDEM</th><th>PEDIDO</th><th>FORNECEDOR</th><th>PRODUTOS/PESO</th><th>MOTORISTA / PROPRIETÁRIO</th><th>PLACAS</th><th>DESTINO</th><th>NF</th><th>FASE</th></tr></thead><tbody>{rows.map(c => <tr key={c.id}><td><b>{c.codigo}</b></td><td>{c.numeroPedidoFornecedor || "PENDENTE"}</td><td>{c.marca || "-"}</td><td>{Number(c.qtd || 0)} UN • {Number(c.pesoKg || 0).toLocaleString("pt-BR")} KG</td><td>{c.motorista || "-"}<small>{c.proprietario || ""}</small></td><td>{(c.placas || [c.placa]).filter(Boolean).join(" / ") || "-"}</td><td>{c.destino || c.unidade || "-"}</td><td>{c.numeroNotaFiscal || "AGUARDANDO"}</td><td>{c.fase || c.status}</td></tr>)}</tbody></table></div></section>;
}

export function PurchasesDestinationPanel({ data, onNavigate }) {
  const notes = (data.notasFiscais || []).slice().sort((a, b) => String(b.emissao || b.importadaEm || "").localeCompare(String(a.emissao || a.importadaEm || "")));
  return <section className="card flowPanel"><div className="sectionHead"><div><h2>PAINEL DE COMPRAS — NF-e</h2><p>MATRIZ E FILIAL NO MESMO PAINEL • CNPJ IDENTIFICADO • ESTOQUE FISCAL SEGREGADO • DESTINAÇÃO CONTROLADA.</p></div><button onClick={() => onNavigate("conferencia")}>CONSULTAR SEFAZ / DESTINAR NF</button></div><div className="flowTable"><table><thead><tr><th>NF</th><th>FORNECEDOR</th><th>CNPJ COMPRADOR</th><th>PEDIDO</th><th>MOTORISTA / PLACA</th><th>VALOR</th><th>DESTINAÇÃO</th><th>STATUS</th></tr></thead><tbody>{notes.map(n => { const carga = (data.cargas || []).find(c => c.id === n.cargaId); return <tr key={n.id}><td><b>{n.numero || "SEM NÚMERO"}</b><small>{n.chave || "SEM CHAVE"}</small></td><td>{n.emitente || "-"}</td><td>{n.destinatarioCnpj || "NÃO IDENTIFICADO"}<small>{n.destinatario || ""}</small></td><td>{(n.pedidos || [])[0] || carga?.numeroPedidoFornecedor || "-"}</td><td>{carga?.motorista || "-"}<small>{(carga?.placas || [carga?.placa]).filter(Boolean).join(" / ")}</small></td><td>{money(n.valorNf)}</td><td><b>{n.destinacao || "AGUARDANDO DESTINAÇÃO"}</b></td><td>{n.status || "AGUARDANDO DESTINAÇÃO"}</td></tr>; })}</tbody></table></div>{!notes.length && <p className="muted">NENHUMA NF-e RECEBIDA DA SEFAZ.</p>}</section>;
}
