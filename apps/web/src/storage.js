const KEY = "forte-cargas-v52-data";
const ARRAYS = [
  "usuarios",
  "funcionarios",
  "unidadesFiscaisHistoricas",
  "clientes",
  "produtos",
  "fornecedores",
  "motoristas",
  "pagamentos",
  "custosFornecedor",
  "unidades",
  "locais",
  "rotas",
  "caixasEmail",
  "vendas",
  "cargas",
  "documentos",
  "vendasBalcao",
  "vendasExternas",
  "estoqueMov",
  "precosClientes",
  "fretesBalcao",
  "fretesVendaBalcao",
  "fretesBalcaoTabela",
  "palletPatrimonio",
  "palletClientes",
  "palletFornecedores",
  "palletColetas",
  "palletDevolucoes",
  "contasPagar",
  "contasReceber",
  "auditoria",
  "caixasBalcao",
  "gmailImports",
  "despesas",
  "extratosBancarios",
  "conciliacoesFinanceiras",
  "pagamentosFretes",
  "boletosFornecedores",
  "emprestimos",
  "contasBancarias",
  "cartoesCredito",
  "patioSaidas",
  "boletosClientes",
  "cnabImportacoes",
  "comprovantesClientes",
  "comprovantesBalcao",
  "creditosClientes",
  "fornecedorCreditos",
  "sefazConsultas",
  "bankConnections",
  "bankEvents",
  "cobrancaEnvios",
  "preConferenciaBoletos",
  "pagamentosItau",
  "infinitePayTransacoes",
  "infinitePayTransferencias",
  "ofertasCargas",
  "motoristaDocumentos",
  "motoristaEventos",
];
function normalize(saved, fallback) {
  const base = {
    ...fallback,
    ...(saved || {}),
    settings: {
      ...(fallback.settings || {}),
      ...((saved || {}).settings || {}),
    },
  };
  for (const k of ARRAYS)
    base[k] = Array.isArray(saved?.[k])
      ? saved[k]
      : Array.isArray(fallback?.[k])
        ? fallback[k]
        : [];
  // V6.4.51 — preserva dados locais e incorpora novas condições/regras oficiais.
  for (const k of ["pagamentos", "custosFornecedor"]) {
    const atuais = Array.isArray(base[k]) ? base[k] : [];
    const ids = new Set(atuais.map((x) => x.id));
    for (const item of fallback?.[k] || [])
      if (!ids.has(item.id)) atuais.push(item);
    base[k] = atuais;
  }
  // V6.5.5 — incorpora os administradores oficiais sem substituir cadastros já editados.
  {
    const atuais = Array.isArray(base.funcionarios) ? base.funcionarios : [];
    const chaves = new Set(atuais.map((x) => String(x.cpf || x.id || "").replace(/\D/g, "")));
    for (const item of fallback?.funcionarios || []) {
      const chave = String(item.cpf || item.id || "").replace(/\D/g, "");
      if (chave && !chaves.has(chave)) { atuais.push(item); chaves.add(chave); }
    }
    base.funcionarios = atuais;
  }
  // V6.4.24 — importa/mescla a base higienizada de clientes mesmo em instalações que já possuem localStorage antigo.
  // Prioriza o cadastro já editado pelo usuário e acrescenta somente clientes-base ausentes, identificados por CNPJ/CPF ou id.
  {
    const atuais = Array.isArray(base.clientes) ? base.clientes : [];
    const baseClientes = Array.isArray(fallback?.clientes)
      ? fallback.clientes
      : [];
    const chaves = new Set(
      atuais.map(
        (c) =>
          String(c.documento || c.id || "").replace(/\D/g, "") ||
          String(c.id || ""),
      ),
    );
    for (const c of baseClientes) {
      const chave =
        String(c.documento || c.id || "").replace(/\D/g, "") ||
        String(c.id || "");
      if (chave && !chaves.has(chave)) {
        atuais.push(c);
        chaves.add(chave);
      }
    }
    base.clientes = atuais;
  }
  if (!base.currentUserId) base.currentUserId = fallback.currentUserId;
  // V6.3.2 — migração segura de numeração: VEN e ORC são sequências independentes.
  const year = new Date().getFullYear();
  const fmt = (prefix, n) => `${prefix}-${year}-${String(n).padStart(6, "0")}`;
  let vendaSeq = Number(base.settings.nextVendaSeq || 1),
    orcSeq = Number(base.settings.nextOrcamentoSeq || 1);
  const usedVenda = new Set(),
    usedOrc = new Set();
  for (const arr of [
    base.vendas || [],
    base.vendasBalcao || [],
    base.vendasExternas || [],
  ])
    for (const v of arr) {
      if (v.numeroVenda) usedVenda.add(v.numeroVenda);
      if (v.numeroOrcamento) usedOrc.add(v.numeroOrcamento);
    }
  const nextVenda = () => {
    let x;
    do {
      x = fmt("VEN", vendaSeq++);
    } while (usedVenda.has(x));
    usedVenda.add(x);
    return x;
  };
  const nextOrc = () => {
    let x;
    do {
      x = fmt("ORC", orcSeq++);
    } while (usedOrc.has(x));
    usedOrc.add(x);
    return x;
  };
  // Pedidos/carga direta: todos os itens do mesmo grupo recebem o mesmo número de venda.
  const groups = {};
  base.vendas = (base.vendas || []).map((v) => {
    if (v.numeroVenda) return v;
    const g = v.grupoPedidoId || v.id;
    groups[g] = groups[g] || nextVenda();
    return { ...v, numeroVenda: groups[g], numeroVendaMigrado: true };
  });
  base.vendasBalcao = (base.vendasBalcao || []).map((v) => {
    if (v.status === "ORÇAMENTO") {
      return v.numeroOrcamento
        ? v
        : { ...v, numeroOrcamento: nextOrc(), numeroOrcamentoMigrado: true };
    }
    if (v.status === "CONVERTIDO") return v;
    return v.numeroVenda
      ? v
      : { ...v, numeroVenda: nextVenda(), numeroVendaMigrado: true };
  });
  base.vendasExternas = (base.vendasExternas || []).map((v) =>
    v.numeroVenda
      ? v
      : { ...v, numeroVenda: nextVenda(), numeroVendaMigrado: true },
  );
  base.settings.nextVendaSeq = vendaSeq;
  base.settings.nextOrcamentoSeq = orcSeq;
  // A versão acompanha o pacote instalado; dados antigos não podem rebaixar a identificação visual.
  base.settings.versaoHomologacao = "6.7.0";
  base.settings.migracaoNumeracaoV632 = true;
  return base;
}
export function loadData(fallback) {
  try {
    const raw = localStorage.getItem(KEY);
    return raw
      ? normalize(JSON.parse(raw), fallback)
      : normalize(null, fallback);
  } catch {
    return normalize(null, fallback);
  }
}
export function saveData(data) {
  localStorage.setItem(KEY, JSON.stringify(data));
}
export function resetData() {
  localStorage.removeItem(KEY);
}
