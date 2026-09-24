import { useEffect, useMemo, useRef, useState } from "react";
import PalletsV47 from "./PalletsV47.jsx";
import PaymentSettingsV47 from "./PaymentSettingsV47.jsx";
import HomeCompactV47 from "./HomeCompactV47.jsx";
import EmployeesV654 from "./EmployeesV654.jsx";
import PreConferenciaBoletos from "./PreConferenciaBoletos.jsx";
import ItauPagamentos from "./ItauPagamentos.jsx";
import InfinitePay from "./InfinitePay.jsx";
import FinanceiroHub from "./FinanceiroHub.jsx";
import { CounterSalesPanel, SalesPanel } from "./SalesPanels.jsx";
import { jsPDF } from "jspdf";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  formatDateBR,
  palletText,
  requiredDocs,
  todayISO,
  validateBrands,
  validateCapacity,
} from "@forte/core";
import { seed } from "./seed";
import { loadData, saveData, resetData } from "./storage";
import { applyAuthUser, loadCloudState, saveCloudState, supabase, supabaseConfigured } from "./supabase";
import { putFile, getFile, openFile, downloadFile } from "./fileStore";
import { lerXmlNfe, gerarDanfeSimplificadoPdf } from "./nfe";
import { connectionMissingFields, normalizeBankEventStatus } from "./banking";
import {
  authorizeGmail,
  getGmailProfile,
  searchGmail,
  downloadGmailAttachment,
  hashBlob,
} from "./gmail";
const uid = (p) =>
  `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const nowISO = () => new Date().toISOString();
const stamp = () => new Date().toLocaleString("pt-BR");
const opDate = (x) =>
  formatDateBR(
    x?.dataOperacao ||
      x?.data ||
      x?.criadaEm ||
      x?.criadoEm ||
      x?.dataHora ||
      "",
  );
const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
const money = (v) =>
  Number(v || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
const upper = (s) => String(s || "").toUpperCase();
const SEFAZ_LOCAL = "http://127.0.0.1:4783";
const UF_IBGE = { AC:"12", AL:"27", AP:"16", AM:"13", BA:"29", CE:"23", DF:"53", ES:"32", GO:"52", MA:"21", MT:"51", MS:"50", MG:"31", PA:"15", PB:"25", PR:"41", PE:"26", PI:"22", RJ:"33", RN:"24", RS:"43", RO:"11", RR:"14", SC:"42", SP:"35", SE:"28", TO:"17" };
const fileToBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
  reader.onerror = () => reject(new Error("NÃO FOI POSSÍVEL LER O CERTIFICADO."));
  reader.readAsDataURL(file);
});
const base64ToFile = (base64, name, type = "application/xml") => {
  const raw = atob(base64), bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return new File([bytes], name, { type });
};
const rawDate = (x) =>
  String(
    x?.dataOperacao ||
      x?.data ||
      x?.vencimento ||
      x?.emissao ||
      x?.criadaEm ||
      x?.criadoEm ||
      x?.dataHora ||
      x?.abertoEm ||
      x?.fechadoEm ||
      "",
  ).slice(0, 10);
const inPeriod = (x, inicio, fim, getter = rawDate) => {
  const d = String(getter(x) || "").slice(0, 10);
  if (!d) return false;
  return (!inicio || d >= inicio) && (!fim || d <= fim);
};
const periodLabel = (inicio, fim) =>
  inicio && fim
    ? inicio === fim
      ? formatDateBR(inicio)
      : `${formatDateBR(inicio)} A ${formatDateBR(fim)}`
    : inicio
      ? `A PARTIR DE ${formatDateBR(inicio)}`
      : fim
        ? `ATÉ ${formatDateBR(fim)}`
        : "TODO O HISTÓRICO";

function gerarResumoCargaPdf({ c, vs: vendas, data, currentUser }) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" }),
    W = 297,
    blue = [30, 64, 103],
    light = [220, 231, 240],
    yellow = [255, 244, 204],
    green = [229, 241, 221],
    motorista = (data.motoristas || []).find((m) => m.id === c.motoristaId),
    fmt = (n) => money(Number(n || 0));
  const paginas = Object.values(
    (vendas || []).reduce((a, v) => {
      const k =
        v.grupoPedidoId || v.numeroVenda || v.clienteId || v.cliente || v.id;
      (a[k] ??= []).push(v);
      return a;
    }, {}),
  );
  if (!paginas.length) paginas.push([]);
  paginas.forEach((vs, pagina) => {
    if (pagina) doc.addPage("a4", "landscape");
    doc.setLineWidth(0.25);
    doc.setDrawColor(105, 115, 120);
    const band = (y, h, title) => {
      doc.setFillColor(...blue);
      doc.rect(8, y, W - 16, h, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(h > 9 ? 13 : 10);
      doc.text(title, W / 2, y + h * 0.68, { align: "center" });
      doc.setTextColor(0, 0, 0);
    };
    const field = (x, y, w, label, value, fill = yellow) => {
      doc.setFillColor(...light);
      doc.rect(x, y, w * 0.42, 7, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.6);
      doc.text(label, x + 1.2, y + 4.6);
      doc.setFillColor(...fill);
      doc.rect(x + w * 0.42, y, w * 0.58, 7, "FD");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.4);
      doc.text(
        doc.splitTextToSize(String(value || "-"), w * 0.55)[0] || "-",
        x + w * 0.42 + 1.2,
        y + 4.6,
      );
    };
    band(7, 11, "FORTE ATACAREJO LTDA — RESUMO DA CARGA E CONFERÊNCIA");
    field(8, 20, 91, "DATA DA VENDA", formatDateBR(vs[0]?.data || c.criadaEm));
    field(103, 20, 91, "DATA DA ENTREGA", formatDateBR(c.dataCarregamento));
    field(
      198,
      20,
      91,
      "VALOR DA VENDA",
      fmt(
        vs.reduce(
          (a, v) => a + Number(v.qtd || 0) * Number(v.precoUnitario || 0),
          0,
        ),
      ),
      green,
    );
    field(
      8,
      27,
      91,
      "CLIENTE(S)",
      [...new Set(vs.map((v) => v.cliente).filter(Boolean))].join(" / "),
    );
    field(
      103,
      27,
      91,
      "DESTINO / UNIDADE",
      vs
        .map((v) => v.destino)
        .filter(Boolean)
        .join(" / ") ||
        c.destinoEstoque ||
        c.unidade,
    );
    field(
      198,
      27,
      91,
      "CUSTO FORNECEDOR DA VENDA",
      fmt(
        vs.reduce(
          (a, v) => a + Number(v.qtd || 0) * Number(v.custoCompraUnitario || 0),
          0,
        ),
      ),
      green,
    );
    field(8, 34, 91, "NOTA FISCAL", c.numeroNotaFiscal);
    field(
      103,
      34,
      91,
      "FRETE R$/T",
      fmt(c.freteTipo === "TON" ? c.freteValor : 0),
    );
    const qtdCarga = (vendas || []).reduce((a, v) => a + Number(v.qtd || 0), 0),
      qtdVenda = vs.reduce((a, v) => a + Number(v.qtd || 0), 0),
      rateio = qtdCarga ? qtdVenda / qtdCarga : 1,
      pesoVendaKg =
        vs.reduce((a, v) => a + Number(v.pesoKg || 0), 0) ||
        Number(c.pesoKg || 0) * rateio,
      pesoT = pesoVendaKg / 1000,
      freteBase =
        c.modalidadeFrete === "CIF"
          ? 0
          : c.freteTipo === "SACO"
            ? Number(c.freteValor || 0) * qtdVenda
            : c.freteTipo === "TON"
              ? Number(c.freteValor || 0) * pesoT
              : Number(c.freteValor || 0) * rateio,
      freteTotal =
        freteBase +
        (c.extras || []).reduce((a, x) => a + Number(x.valor || 0), 0) * rateio;
    field(198, 34, 91, "VALOR TOTAL FRETE", fmt(freteTotal), green);
    field(
      8,
      41,
      91,
      "PEDIDO / OS",
      [
        c.numeroPedidoFornecedor && "PED. " + c.numeroPedidoFornecedor,
        c.numeroOSFornecedor && "OS " + c.numeroOSFornecedor,
      ]
        .filter(Boolean)
        .join(" • "),
    );
    field(
      103,
      41,
      91,
      "CÓDIGO / MODALIDADE",
      (c.codigo || "-") + " • " + (c.modalidadeFrete || "-"),
    );
    const totalVenda = vs.reduce(
        (a, v) => a + Number(v.qtd || 0) * Number(v.precoUnitario || 0),
        0,
      ),
      custo = vs.reduce(
        (a, v) => a + Number(v.qtd || 0) * Number(v.custoCompraUnitario || 0),
        0,
      );
    field(
      198,
      41,
      91,
      "LUCRO DA CARGA",
      fmt(totalVenda - custo - freteTotal),
      green,
    );
    field(8, 48, 186, "LOCAL DE CARREGAMENTO", c.localCarregamento);
    field(
      198,
      48,
      91,
      "PALLETS / CONFERÊNCIA",
      palletText(c.pallet) + " • " + (c.fase || c.status || "-"),
      green,
    );
    band(57, 8, "PRODUTOS — VENDA, CUSTO DA FÁBRICA + FRETE E LUCRO REAL");
    const heads = [
        "ITEM",
        "PRODUTO",
        "FORNECEDOR / MODAL",
        "QTD.",
        "VENDA UNIT.",
        "CUSTO FÁB.",
        "FRETE UNIT.",
        "CUSTO + FRETE",
        "LUCRO UNIT.",
        "LUCRO TOTAL",
        "TOTAL VENDA",
      ],
      widths = [10, 48, 42, 18, 24, 24, 22, 27, 23, 25, 25];
    let x = 8,
      y = 65;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    heads.forEach((h, i) => {
      doc.setFillColor(235, 238, 240);
      doc.rect(x, y, widths[i], 8, "FD");
      doc.text(doc.splitTextToSize(h, widths[i] - 2), x + 1, y + 3.2);
      x += widths[i];
    });
    y += 8;
    const grupos = Object.values(
      vs.reduce((a, v) => {
        const k = v.produtoId || v.produto || v.id;
        a[k] ??= {
          produto: v.produto,
          marca: v.marca,
          qtd: 0,
          venda: 0,
          custo: 0,
        };
        a[k].qtd += Number(v.qtd || 0);
        a[k].venda += Number(v.qtd || 0) * Number(v.precoUnitario || 0);
        a[k].custo += Number(v.qtd || 0) * Number(v.custoCompraUnitario || 0);
        return a;
      }, {}),
    );
    grupos.slice(0, 11).forEach((g, i) => {
      const vu = g.qtd ? g.venda / g.qtd : 0,
        cu = g.qtd ? g.custo / g.qtd : 0,
        fu = vs.reduce((a, v) => a + Number(v.qtd || 0), 0)
          ? freteTotal / vs.reduce((a, v) => a + Number(v.qtd || 0), 0)
          : 0,
        vals = [
          i + 1,
          g.produto,
          (g.marca || c.marca || "-") + " — " + (c.modalidadeFrete || "-"),
          g.qtd,
          fmt(vu),
          fmt(cu),
          fmt(fu),
          fmt(cu + fu),
          fmt(vu - cu - fu),
          fmt(g.venda - g.custo - fu * g.qtd),
          fmt(g.venda),
        ];
      x = 8;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.8);
      vals.forEach((v, j) => {
        doc.setFillColor(...(j >= 5 ? green : yellow));
        doc.rect(x, y, widths[j], 7, "FD");
        doc.text(
          doc.splitTextToSize(String(v), widths[j] - 2)[0] || "",
          x + 1,
          y + 4.5,
          { align: j >= 3 ? "left" : "left" },
        );
        x += widths[j];
      });
      y += 7;
    });
    if (!grupos.length) {
      doc.text("SEM PRODUTOS VINCULADOS.", 10, y + 5);
      y += 7;
    }
    y = Math.max(y + 3, 91);
    band(y, 8, "PAGAMENTO DO CLIENTE — PARCELAS E CONFERÊNCIA");
    y += 9;
    const recebiveis = (data.contasReceber || []).filter(
      (r) => r.carga === c.codigo || vs.some((v) => v.id === r.vendaId),
    );
    field(
      8,
      y,
      91,
      "PRAZO CLIENTE",
      [...new Set(vs.map((v) => v.condicaoPagamento).filter(Boolean))].join(
        " / ",
      ),
    );
    field(
      103,
      y,
      91,
      "FORMA PAGTO.",
      [...new Set(vs.map((v) => v.condicaoPagamento).filter(Boolean))].join(
        " / ",
      ),
    );
    field(198, y, 91, "VALOR VENDA", fmt(totalVenda), green);
    y += 8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    [
      [8, 95, "DATA DA PARCELA"],
      [103, 91, "VALOR DA PARCELA"],
      [198, 91, "CONFERÊNCIA"],
    ].forEach(([xx, ww, t]) => {
      doc.setFillColor(...light);
      doc.rect(xx, y, ww, 8, "FD");
      doc.text(t, xx + ww / 2, y + 5.2, { align: "center" });
    });
    y += 8;
    const parcelas = recebiveis.length
      ? recebiveis
      : [{ vencimento: "-", valor: totalVenda, status: "AGUARDANDO GERAÇÃO" }];
    parcelas.slice(0, 5).forEach((p) => {
      [
        [8, 95, formatDateBR(p.vencimento)],
        [103, 91, fmt(p.valor)],
        [198, 91, p.status || "PENDENTE"],
      ].forEach(([xx, ww, t]) => {
        doc.setFillColor(...green);
        doc.rect(xx, y, ww, 7, "FD");
        doc.setFont("helvetica", "normal");
        doc.text(String(t), xx + ww / 2, y + 4.7, { align: "center" });
      });
      y += 7;
    });
    y += 1;
    field(
      8,
      y,
      186,
      "TOTAL DAS PARCELAS",
      fmt(parcelas.reduce((a, p) => a + Number(p.valor || 0), 0)),
      yellow,
    );
    field(
      198,
      y,
      91,
      "DIFERENÇA",
      fmt(totalVenda - parcelas.reduce((a, p) => a + Number(p.valor || 0), 0)),
      yellow,
    );
    y += 8;
    field(
      8,
      y,
      186,
      "MOTORISTA",
      (c.motorista || "-") +
        (motorista?.apelido ? " — " + motorista.apelido : ""),
    );
    field(
      198,
      y,
      91,
      "PLACA(S)",
      [
        motorista?.placa1,
        motorista?.placa2,
        motorista?.placa3,
        motorista?.placa4,
        c.placa,
      ]
        .filter(Boolean)
        .join(" / "),
    );
    y += 7;
    field(8, y, 140, "CHAVE PIX", motorista?.chavePix || motorista?.pix);
    field(
      152,
      y,
      137,
      "FRETE TOTAL A PAGAR MOTORISTA",
      fmt(freteTotal),
      yellow,
    );
    doc.setFontSize(6.5);
    doc.setTextColor(80);
    doc.text(
      "GERADO EM " +
        stamp() +
        " POR " +
        (currentUser?.nome || "ADMINISTRADOR") +
        " • NF " +
        (c.numeroNotaFiscal || "PENDENTE") +
        " • NOTA DE PALLETS " +
        (c.notaPalletNome || "NÃO ANEXADA"),
      8,
      204,
    );
  });
  doc.save((c.codigo || "CARGA") + "-RESUMO-CARGA-POR-CLIENTE.pdf");
}
function Modal({ title, onClose, children, wide = false }) {
  return (
    <div className="modalBackdrop">
      <div className={`modal ${wide ? "wide" : ""}`}>
        <div className="modalHead">
          <h2>{title}</h2>
          <button className="ghost" onClick={onClose}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function UpperInput({ value, onChange, ...p }) {
  return (
    <input
      {...p}
      value={value ?? ""}
      onChange={(e) => onChange(upper(e.target.value))}
    />
  );
}
const PERMS = [
  "CLIENTE/CARGA DIRETA",
  "VENDA BALCÃO",
  "VENDAS EXTERNAS",
  "MOTORISTA/VEÍCULO",
  "FORNECEDOR/PEDIDO",
  "CONFERÊNCIA/IA",
  "FINANCEIRO",
  "CADASTROS",
  "CONTAS A PAGAR/RECEBER",
  "PALETES",
  "ESTOQUE",
  "PÁTIO / EXPEDIÇÃO INTERNA",
  "SAÚDE FINANCEIRA / TESOURARIA",
  "PAINEL DE CARGAS",
  "RELATÓRIOS",
];
const CARGOS = [
  "ADMINISTRADOR",
  "GERENTE",
  "SUPERVISOR",
  "FINANCEIRO",
  "FATURAMENTO",
  "COMPRAS",
  "VENDEDOR INTERNO",
  "VENDEDOR EXTERNO",
  "CAIXA",
  "ESTOQUISTA",
  "CONFERENTE",
  "EXPEDIÇÃO / PÁTIO",
  "LOGÍSTICA",
  "MOTORISTA",
  "CONSULTA",
];
const MODULES = [
  ["clientes", "1", "CARGA DIRETA", "Venda/carga direta com destino definido."],
  ["balcao", "2", "VENDA BALCÃO", "Vendas no balcão, entrega, frete e caixa."],
  [
    "externas",
    "3",
    "VENDAS EXTERNAS",
    "Pedidos externos, propostas e representantes.",
  ],
  [
    "motorista",
    "4",
    "MOTORISTAS / VEÍCULOS",
    "Motoristas, veículos, documentos e fretes.",
  ],
  [
    "fornecedor",
    "5",
    "FORNECEDORES / MARCAS",
    "Pedidos, marcas, contatos e prazos.",
  ],
  [
    "conferencia",
    "6",
    "CONFERÊNCIA",
    "Documentos, IA, checklist e divergências.",
  ],
  ["financeiro", "7", "FINANCEIRO", "Custos, fretes, pagamentos e fechamento."],
  ["painelVendas", "7A", "PAINEL DE VENDAS", "Visão gerencial consolidada, filtros, totais e exportação."],
  ["painelBalcao", "7B", "PAINEL VENDAS BALCÃO", "Visão operacional sem custo, lucro ou margem."],
  ["infinitePay", "12A", "INFINITEPAY", "Conta própria, D+1 útil, taxas, agenda e conciliação."],
  [
    "cadastros",
    "8",
    "CADASTROS GERAIS",
    "Cadastros, usuários, perfis e integrações.",
  ],
  [
    "contasPagar",
    "9",
    "CONTAS A PAGAR",
    "Fornecedores, títulos, vencimentos, comprovantes e baixas.",
  ],
  [
    "contasReceber",
    "10",
    "CONTAS A RECEBER",
    "Clientes, parcelas, vencimentos, recebimentos e liquidações.",
  ],
  [
    "preConferencia",
    "11",
    "PRÉ-CONFERÊNCIA DE BOLETOS",
    "Recepção, leitura assistida, divergências e incorporação em lote.",
  ],
  [
    "itau",
    "12",
    "BANCO ITAÚ",
    "Boletos, CNAB, movimentações, liquidações e francesinha.",
  ],
  ["paletes", "13", "PALETES", "Conta-corrente de paletes e movimentações."],
  ["estoque", "14", "ESTOQUE", "Conta-corrente, saldo e custo ponderado."],
  [
    "saude",
    "13",
    "DRE / SAÚDE FINANCEIRA",
    "Tesouraria, posição financeira e indicadores.",
  ],
  [
    "relatorios",
    "14",
    "RELATÓRIOS",
    "Relatórios gerenciais, operacionais e fiscais.",
  ],
  [
    "compraForte",
    "15",
    "COMPRA FORTE",
    "Reposição de estoque e cargas mistas.",
  ],
  [
    "planejamento",
    "16",
    "PLANEJAMENTO DE CARGAS",
    "Carga antecipada, sem destino e vinculação logística.",
  ],
  [
    "todasCargas",
    "17",
    "TODAS AS CARGAS",
    "Central operacional: Forte, sem destino e diretas.",
  ],
];
const MODULE_GROUPS = [
  {
    id: "vendas",
    title: "VENDAS E COMPRAS",
    subtitle: "Pedidos, vendas, compras e planejamento comercial.",
    modules: [
      "clientes",
      "balcao",
      "externas",
      "compraForte",
      "planejamento",
      "todasCargas",
    ],
  },
  {
    id: "logistica",
    title: "LOGÍSTICA E OPERAÇÃO",
    subtitle: "Motoristas, estoque, paletes e controle físico da operação.",
    modules: ["motorista", "estoque", "paletes"],
  },
  {
    id: "conferencia",
    title: "CONFERÊNCIA E IA",
    subtitle:
      "Documentos, auditoria, leitura por IA e tratamento de divergências.",
    modules: ["conferencia"],
  },
  {
    id: "financeiro",
    title: "FINANCEIRO",
    subtitle: "Custos, contas, tesouraria e saúde financeira.",
    modules: ["financeiro", "painelVendas", "painelBalcao", "preConferencia", "contasPagar", "contasReceber", "itau", "infinitePay", "saude"],
  },
  {
    id: "fornecedores",
    title: "FORNECEDORES E SUPRIMENTOS",
    subtitle: "Marcas, pedidos, condições comerciais e abastecimento.",
    modules: ["fornecedor"],
  },
  {
    id: "cadastros",
    title: "CADASTROS E CONFIGURAÇÕES",
    subtitle: "Bases mestres, usuários, permissões e integrações.",
    modules: ["cadastros"],
  },
  {
    id: "relatorios",
    title: "RELATÓRIOS E GESTÃO",
    subtitle: "Relatórios gerenciais, operacionais e fiscais.",
    modules: ["relatorios"],
  },
];
const PERFIS = [
  "ADMINISTRADOR",
  "FINANCEIRO",
  "VENDAS",
  "VENDEDOR EXTERNO",
  "COMPRAS / FORNECEDOR",
  "LOGÍSTICA / EXPEDIÇÃO",
  "PÁTIO / EMPILHADEIRA",
  "CONFERÊNCIA",
  "CONSULTA",
  "PERSONALIZADO",
];
const PERFIL_PERMS = {
  ADMINISTRADOR: ["*"],
  FINANCEIRO: [
    "FINANCEIRO",
    "CONTAS A PAGAR/RECEBER",
    "SAÚDE FINANCEIRA / TESOURARIA",
    "RELATÓRIOS",
  ],
  VENDAS: [
    "CLIENTE/CARGA DIRETA",
    "VENDA BALCÃO",
    "PAINEL DE CARGAS",
    "RELATÓRIOS",
  ],
  "VENDEDOR EXTERNO": ["VENDAS EXTERNAS", "RELATÓRIOS"],
  "COMPRAS / FORNECEDOR": ["FORNECEDOR/PEDIDO", "CADASTROS", "RELATÓRIOS"],
  "LOGÍSTICA / EXPEDIÇÃO": [
    "CLIENTE/CARGA DIRETA",
    "MOTORISTA/VEÍCULO",
    "FORNECEDOR/PEDIDO",
    "PAINEL DE CARGAS",
    "RELATÓRIOS",
  ],
  "PÁTIO / EMPILHADEIRA": ["PÁTIO / EXPEDIÇÃO INTERNA", "RELATÓRIOS"],
  CONFERÊNCIA: ["CONFERÊNCIA/IA", "PAINEL DE CARGAS", "RELATÓRIOS"],
  CONSULTA: ["RELATÓRIOS"],
};
const hashSenha = (s) => btoa(unescape(encodeURIComponent(String(s || ""))));
const isCreditSale = (v) =>
  ![
    "A VISTA",
    "À VISTA",
    "PIX",
    "DINHEIRO",
    "CARTÃO",
    "CARTAO",
    "DÉBITO",
    "DEBITO",
  ].some((x) => upper(v).includes(x));
const motoristaServe = (m, finalidade) => {
  const t = upper(m?.tipoMotorista || "TRANSPORTE DE CARGA");
  return finalidade === "ENTREGA"
    ? ["ENTREGA", "AMBOS"].includes(t)
    : ["TRANSPORTE DE CARGA", "AMBOS"].includes(t);
};
const customerCredit = (d, clienteId) => {
  const c = (d.clientes || []).find((x) => x.id === clienteId);
  const total = Number(c?.limiteCredito || 0);
  const used = (d.contasReceber || [])
    .filter(
      (t) =>
        t.clienteId === clienteId &&
        !upper(t.status).includes("LIQUIDADO") &&
        !upper(t.status).includes("PAGO") &&
        !upper(t.status).includes("RECEBIDO"),
    )
    .reduce(
      (a, t) => a + Number("saldoAberto" in t ? t.saldoAberto : t.valor || 0),
      0,
    );
  return { total, used, available: Math.max(0, total - used) };
};
const fornecedorIdDaMarca = (d, marca = "") =>
  (d.fornecedores || []).find(
    (f) =>
      norm(marca).includes(norm(String(f.nome || "").split("/")[0])) ||
      norm(f.nome).includes(norm(marca)),
  )?.id || "";
const custoFornecedor = (d, produtoId, condicaoPagamento, marca = "") => {
  const fornecedorId = fornecedorIdDaMarca(d, marca);
  return (d.custosFornecedor || []).find(
    (r) =>
      r.ativo !== false &&
      r.produtoId === produtoId &&
      (!r.fornecedorId || r.fornecedorId === fornecedorId) &&
      norm(r.condicaoPagamento) === norm(condicaoPagamento),
  );
};
export default function App() {
  const [data, setData] = useState(() => applyAuthUser(loadData(seed)));
  const cloudReady = useRef(false);
  const cloudTimer = useRef(null);
  const [tab, setTab] = useState("home");
  const [globalSearch, setGlobalSearch] = useState("");
  const [selectedSales, setSelectedSales] = useState([]);
  const [driverSearch, setDriverSearch] = useState("");
  const [driverId, setDriverId] = useState("");
  const [activeLoadId, setActiveLoadId] = useState("");
  const [modal, setModal] = useState(null);
  const [cadType, setCadType] = useState("clientes");
  const [cadSearch, setCadSearch] = useState("");
  const [walletSearch, setWalletSearch] = useState("");
  const [walletFull, setWalletFull] = useState(false);
  const [moduleView, setModuleView] = useState("CARDS");
  const [unidade, setUnidade] = useState("MATRIZ - MONTE CARMELO/MG");
  const [freteValor, setFreteValor] = useState("");
  const [freteTipo, setFreteTipo] = useState("TOTAL");
  const [extras, setExtras] = useState([]);
  const [local, setLocal] = useState("ARCOS - MG");
  const [dataCarreg, setDataCarreg] = useState("");
  const [condFornecedor, setCondFornecedor] = useState("14 DIAS");
  const [pallet, setPallet] = useState("SEM PALLETS");
  const [frete, setFrete] = useState("FOB");
  const [numeroPedido, setNumeroPedido] = useState("");
  const [numeroOS, setNumeroOS] = useState("");
  const [enviarWpp, setEnviarWpp] = useState(true);
  const [enviarEmail, setEnviarEmail] = useState(false);
  const [reportStart, setReportStart] = useState(todayISO());
  const [reportEnd, setReportEnd] = useState(todayISO());
  const [mobileMenu, setMobileMenu] = useState(false);
  useEffect(() => {let active=true;if(!supabaseConfigured)return;loadCloudState().then(remote=>{if(!active)return;cloudReady.current=true;if(remote){const funcionarios=[...(remote.funcionarios||[])];for(const oficial of seed.funcionarios||[])if(!funcionarios.some(x=>x.id===oficial.id||String(x.cpf||"").replace(/\D/g,"")===oficial.cpf))funcionarios.push(oficial);setData(applyAuthUser({...remote,settings:{...seed.settings,...(remote.settings||{})},funcionarios,unidadesFiscaisHistoricas:remote.unidadesFiscaisHistoricas||seed.unidadesFiscaisHistoricas}))}else saveCloudState(data).catch(e=>console.error("FALHA AO ENVIAR BASE INICIAL AO SUPABASE",e))}).catch(e=>console.error("FALHA AO CARREGAR BASE SUPABASE",e));return()=>{active=false}},[]);
  useEffect(() => {saveData(data);if(!supabaseConfigured||!cloudReady.current)return;clearTimeout(cloudTimer.current);cloudTimer.current=setTimeout(()=>saveCloudState(data).catch(e=>console.error("FALHA AO SALVAR BASE SUPABASE",e)),800);return()=>clearTimeout(cloudTimer.current)}, [data]);
  const currentUser =
    data.usuarios.find((u) => u.id === data.currentUserId) || data.usuarios[0];
  const isAdmin = !!currentUser?.admin;
  const isMaster = !!currentUser?.master;
  const permissionKeyByGroup = {
    vendas: "VENDAS E COMPRAS", logistica: "LOGÍSTICA E OPERAÇÃO",
    conferencia: "CONFERÊNCIA E IA", financeiro: "FINANCEIRO",
    fornecedores: "FORNECEDORES E SUPRIMENTOS", cadastros: "CADASTROS",
    relatorios: "RELATÓRIOS", patio: "PÁTIO / ESTOQUE", integracoes: "INTEGRAÇÕES",
  };
  const groupForTab = (screen) => {
    if (["estoque", "paletes"].includes(screen)) return "patio";
    if (["gmail", "integracoes", "integracoesFinanceiras"].includes(screen)) return "integracoes";
    return MODULE_GROUPS.find((g) => g.modules.includes(screen))?.id || "";
  };
  const canAccessGroup = (groupId, action = "visualizar") => {
    if (isAdmin) return true;
    const permissions = currentUser?.permissoes || {};
    if (Array.isArray(permissions)) {
      if (permissions.includes("*")) return true;
      const key = permissionKeyByGroup[groupId] || "";
      return permissions.some((item) => norm(item).includes(norm(key)) || norm(key).includes(norm(item)));
    }
    const rule = permissions[permissionKeyByGroup[groupId]] || {};
    return !!rule[action] || (action !== "visualizar" && !!rule.editar);
  };
  const canAccessTab = (screen, action = "visualizar") => canAccessGroup(groupForTab(screen), action);
  const visibleModuleGroups = MODULE_GROUPS.filter((g) => canAccessGroup(g.id));
  useEffect(() => {
    const requestedGroup = tab.startsWith("group:") ? tab.slice(6) : groupForTab(tab);
    if (tab !== "home" && requestedGroup && !canAccessGroup(requestedGroup))
      setTab("home");
  }, [isAdmin, tab, currentUser?.id]);
  const vendasSel = data.vendas.filter((v) => selectedSales.includes(v.id));
  const selKg = vendasSel.reduce((s, v) => s + Number(v.pesoKg || 0), 0);
  const selQtd = vendasSel.reduce((s, v) => s + Number(v.qtd || 0), 0);
  const brandCheck = validateBrands(vendasSel);
  const driver = data.motoristas.find((m) => m.id === driverId);
  const activeLoad = data.cargas.find((c) => c.id === activeLoadId) || null;
  const vehicleWeight = activeLoad ? Number(activeLoad.pesoKg) : selKg;
  const vehicleDriver = activeLoad
    ? data.motoristas.find((m) => m.id === activeLoad.motoristaId)
    : driver;
  const cap = vehicleDriver
    ? validateCapacity(
        vehicleWeight,
        vehicleDriver.capacidadeAlvoKg,
        vehicleDriver.capacidadeMaximaKg,
      )
    : null;
  const driverFiltered = data.motoristas
    .filter((m) => m.ativo !== false && motoristaServe(m, "TRANSPORTE"))
    .filter((m) => {
      const q = norm(driverSearch);
      return (
        !q ||
        [
          m.nome,
          m.apelido,
          m.cpf,
          m.telefone,
          m.rntrc,
          m.proprietario,
          m.placa1,
          m.placa2,
          m.placa3,
          m.placa4,
        ].some((x) => norm(x).includes(q))
      );
    });
  const fornecedorDaCarga = (c) =>
    data.fornecedores.find(
      (f) =>
        norm(c?.marca).includes(norm(f.nome.split("/")[0])) ||
        norm(f.nome).includes(norm(c?.marca)),
    ) || data.fornecedores.find((f) => f.nome === c?.marca);

  const globalResults = useMemo(() => {
    const q = norm(globalSearch).trim();
    if (!q) return [];
    const out = [];
    const push = (type, label, sub, action, restricted = false) => {
      if (restricted && !isAdmin) return;
      if (out.length < 24) out.push({ type, label, sub, action });
    };
    (data.clientes || []).forEach((x) => {
      if (
        [x.nome, x.documento, x.cidade, x.uf, x.email, x.telefone].some((v) =>
          norm(v).includes(q),
        )
      )
        push(
          "CLIENTE",
          x.nome,
          `${x.documento || ""} • ${x.cidade || ""}/${x.uf || ""}`,
          () => {
            setCadType("clientes");
            setCadSearch(x.nome);
            setTab("cadastros");
          },
        );
    });
    (data.vendas || []).forEach((x) => {
      if (
        [x.numeroVenda, x.cliente, x.produto, x.marca, x.destino].some((v) =>
          norm(v).includes(q),
        )
      )
        push(
          "VENDA / CARGA DIRETA",
          x.numeroVenda || x.cliente,
          `${x.cliente || ""} • ${x.produto || ""} • ${x.destino || ""}`,
          () => {
            setTab("clientes");
            setModal({ type: "editSale", saleId: x.id });
          },
        );
    });
    (data.vendasBalcao || []).forEach((x) => {
      if (
        [
          x.numeroVenda,
          x.cliente,
          ...(x.itens || []).map((i) => i.produto),
        ].some((v) => norm(v).includes(q))
      )
        push(
          "VENDA BALCÃO",
          x.numeroVenda || x.cliente,
          `${x.cliente || ""} • ${money(x.total || 0)}`,
          () => setTab("balcao"),
        );
    });
    (data.cargas || []).forEach((x) => {
      if (
        [
          x.codigo,
          x.numeroPedidoFornecedor,
          x.numeroOSFornecedor,
          x.numeroNotaFiscal,
          x.motorista,
          x.marca,
          x.destino,
          x.unidade,
        ].some((v) => norm(v).includes(q))
      )
        push(
          "CARGA",
          x.codigo,
          `${x.marca || ""} • ${x.motorista || ""} • ${x.fase || ""}`,
          () => {
            setActiveLoadId(x.id);
            setTab("todasCargas");
            setModal({ type: "load", loadId: x.id });
          },
        );
    });
    (data.produtos || []).forEach((x) => {
      if (
        [x.nome, x.marca, x.codigoInterno, x.codigoFornecedor].some((v) =>
          norm(v).includes(q),
        )
      )
        push(
          "PRODUTO",
          x.nome,
          `${x.marca || ""} • ${x.codigoInterno || ""}`,
          () => {
            setCadType("produtos");
            setCadSearch(x.nome);
            setTab("cadastros");
          },
        );
    });
    (data.fornecedores || []).forEach((x) => {
      if ([x.nome, x.cnpj, x.codigoCliente].some((v) => norm(v).includes(q)))
        push(
          "FORNECEDOR",
          x.nome,
          `${x.cnpj || ""} • ${x.codigoCliente || ""}`,
          () => {
            setCadType("fornecedores");
            setCadSearch(x.nome);
            setTab("cadastros");
          },
        );
    });
    (data.motoristas || []).forEach((x) => {
      if (
        [
          x.nome,
          x.apelido,
          x.cpf,
          x.placa1,
          x.placa2,
          x.placa3,
          x.placa4,
          x.proprietario,
        ].some((v) => norm(v).includes(q))
      )
        push(
          "MOTORISTA",
          x.nome,
          `${x.placa1 || ""} • ${x.proprietario || ""}`,
          () => {
            setDriverSearch(x.nome);
            setTab("motorista");
          },
        );
    });
    return out;
  }, [globalSearch, data, isAdmin]);
  function openGlobalResult(r) {
    setGlobalSearch("");
    r.action?.();
  }
  useEffect(() => {
    if (!activeLoad) return;
    setUnidade(activeLoad.unidade || "MATRIZ - MONTE CARMELO/MG");
    setLocal(activeLoad.localCarregamento || "ARCOS - MG");
    setDataCarreg(activeLoad.dataCarregamento || "");
    setCondFornecedor(
      activeLoad.condicaoFornecedor ||
        fornecedorDaCarga(activeLoad)?.formaPagamentoPadrao ||
        "14 DIAS",
    );
    setPallet(activeLoad.pallet || "SEM PALLETS");
    setFrete(activeLoad.modalidadeFrete || "FOB");
    setNumeroPedido(activeLoad.numeroPedidoFornecedor || "");
    setNumeroOS(activeLoad.numeroOSFornecedor || "");
    setFreteValor(activeLoad.freteValor || "");
    setFreteTipo(activeLoad.freteTipo || "TOTAL");
    setExtras(activeLoad.extras || []);
  }, [activeLoadId]);
  function audit(acao, cargaId = "", detalhe = "") {
    setData((d) => ({
      ...d,
      auditoria: [
        ...(d.auditoria || []),
        {
          id: uid("aud"),
          usuario: currentUser?.nome || "ADMINISTRADOR",
          acao,
          cargaId,
          detalhe,
          dataHora: new Date().toISOString(),
        },
      ],
    }));
  }
  function toggleSale(id) {
    setSelectedSales((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : [...s, id],
    );
  }
  function loadCodeForSale(id) {
    return (
      data.cargas.find(
        (c) => c.status !== "CANCELADA" && (c.vendaIds || []).includes(id),
      )?.codigo || ""
    );
  }
  function nextCode(d) {
    const n = Number(d.settings?.nextCargaSeq || 1);
    return { codigo: `FC-${String(n).padStart(4, "0")}`, next: n + 1 };
  }
  function addSale(f) {
    const c = data.clientes.find((x) => x.id === f.clienteId);
    const itens = Array.isArray(f.itens) ? f.itens : [];
    if (!c || !itens.length)
      return alert("PREENCHA CLIENTE E ADICIONE AO MENOS UM PRODUTO.");
    const valorPedido = itens.reduce(
      (a, it) => a + Number(it.qtd || 0) * Number(it.precoUnitario || 0),
      0,
    );
    if (isCreditSale(f.condicaoPagamento)) {
      const cred = customerCredit(data, c.id);
      if (valorPedido > cred.available)
        return alert(
          `PEDIDO BLOQUEADO POR LIMITE DE CRÉDITO.\n\nLIMITE: ${money(cred.total)}\nUTILIZADO: ${money(cred.used)}\nDISPONÍVEL: ${money(cred.available)}\nNOVA OPERAÇÃO: ${money(valorPedido)}`,
        );
    }
    const grupo = uid("ped");
    setData((d) => {
      const seq = Number(d.settings?.nextVendaSeq || 1);
      const numeroVenda = `VEN-${new Date().getFullYear()}-${String(seq).padStart(6, "0")}`;
      return {
        ...d,
        settings: { ...d.settings, nextVendaSeq: seq + 1 },
        vendas: [
          ...(d.vendas || []),
          ...itens.map((it) => {
            const p = (d.produtos || []).find((x) => x.id === it.produtoId);
            const qtd = Number(it.qtd || 0);
            return {
              id: uid("v"),
              grupoPedidoId: grupo,
              clienteId: c.id,
              cliente: c.nome,
              marca: p?.marca || "",
              produtoId: p?.id || it.produtoId,
              produto: p?.nome || it.produto || "",
              qtd,
              pesoKg: qtd * Number(p?.pesoKg || 0),
              destino: upper(f.destino || c.cidade),
              condicaoPagamento: f.condicaoPagamento,
              precoUnitario: Number(it.precoUnitario || 0),
              palletEmprestado: it.palletEmprestado || "NÃO",
              qtdPallets: Number(it.qtdPallets || 0),
              dataOperacao: todayISO(),
              criadoEm: nowISO(),
              atualizadoEm: nowISO(),
              status: "PENDENTE",
              numeroVenda,
            };
          }),
        ],
      };
    });
    setModal(null);
  }
  function addCompraForte(f) {
    const un = data.unidades.find((x) => x.id === f.unidadeId);
    const itens = Array.isArray(f.itens) ? f.itens : [];
    if (!un || !itens.length)
      return alert("SELECIONE A UNIDADE E ADICIONE AO MENOS UM PRODUTO.");
    const grupo = uid("compra");
    setData((d) => ({
      ...d,
      vendas: [
        ...(d.vendas || []),
        ...itens.map((it) => {
          const p = (d.produtos || []).find((x) => x.id === it.produtoId);
          const qtd = Number(it.qtd || 0);
          return {
            id: uid("v"),
            grupoPedidoId: grupo,
            tipoDestino: "ESTOQUE_FORTE",
            clienteId: un.id,
            cliente: `ESTOQUE FORTE — ${un.nome}`,
            marca: p?.marca || "",
            produtoId: p?.id || it.produtoId,
            produto: p?.nome || "",
            qtd,
            pesoKg: qtd * Number(p?.pesoKg || 0),
            destino: un.nome,
            unidadeEstoque: un.nome,
            condicaoPagamento: "COMPRA / ESTOQUE",
            precoUnitario: 0,
            custoCompraUnitario: Number(it.custoUnitario || 0),
            dataOperacao: todayISO(),
            criadoEm: nowISO(),
            atualizadoEm: nowISO(),
            status: "PENDENTE",
          };
        }),
      ],
    }));
    setModal(null);
    setTab("clientes");
  }
  function formLoad() {
    if (!vendasSel.length) return alert("SELECIONE AO MENOS UMA VENDA.");
    if (!brandCheck.ok)
      return alert("CARGA BLOQUEADA: OS PEDIDOS DEVEM SER DA MESMA MARCA.");
    if (!driver) return alert("SELECIONE O MOTORISTA/VEÍCULO.");
    const cv = validateCapacity(
      selKg,
      driver.capacidadeAlvoKg,
      driver.capacidadeMaximaKg,
    );
    if (cv.status === "BLOQUEADO") return alert(cv.mensagem);
    let just = "";
    if (cv.status === "PENDÊNCIA") {
      just =
        prompt(`${cv.mensagem}\nINFORME A JUSTIFICATIVA PARA CONTINUAR:`) || "";
      if (!just) return;
    }
    setData((d) => {
      const nc = nextCode(d);
      const carga = {
        id: uid("c"),
        codigo: nc.codigo,
        vendaIds: [...selectedSales],
        marca: vendasSel[0].marca,
        motoristaId: driver.id,
        motorista: driver.nome,
        placa: driver.placa1,
        pesoKg: selKg,
        qtd: selQtd,
        status: "VERMELHO",
        fase: "AGUARDANDO PEDIDO AO FORNECEDOR",
        unidade,
        localCarregamento: local,
        dataCarregamento: dataCarreg,
        condicaoFornecedor: condFornecedor,
        pallet,
        modalidadeFrete: frete,
        numeroPedidoFornecedor: "",
        numeroOSFornecedor: "",
        pedidoFornecedorEnviado: false,
        ordemMotoristaEnviada: false,
        justificativaPeso: upper(just),
        criadaEm: new Date().toISOString(),
        canceladaEm: null,
      };
      return {
        ...d,
        settings: { ...d.settings, nextCargaSeq: nc.next },
        cargas: [...d.cargas, carga],
        vendas: d.vendas.map((v) =>
          selectedSales.includes(v.id) ? { ...v, status: "EM CARGA" } : v,
        ),
      };
    });
    setSelectedSales([]);
    setTimeout(() => {
      const c = [...data.cargas].length;
    }, 0);
    setTab("fornecedor");
  }
  useEffect(() => {
    if (tab === "fornecedor" && !activeLoadId) {
      const c = [...data.cargas]
        .reverse()
        .find(
          (x) =>
            x.status !== "CANCELADA" &&
            x.fase === "AGUARDANDO PEDIDO AO FORNECEDOR",
        );
      if (c) setActiveLoadId(c.id);
    }
  }, [tab, data.cargas, activeLoadId]);
  function syncSupplierToLoad() {
    if (!activeLoad) return null;
    if (!condFornecedor) {
      alert("SELECIONE A FORMA / CONDIÇÃO DE PAGAMENTO DO FORNECEDOR.");
      return null;
    }
    const custosPedido = (activeLoad.vendaIds || [])
      .map((id) => data.vendas.find((v) => v.id === id))
      .filter(Boolean)
      .map((v) => {
        const regra = custoFornecedor(
          data,
          v.produtoId,
          condFornecedor,
          v.marca,
        );
        const produto = data.produtos.find((p) => p.id === v.produtoId);
        return {
          produtoId: v.produtoId,
          produto: v.produto,
          modalidadeCompra: regra?.modalidadeCompra || condFornecedor,
          custoUnitario: Number(
            regra?.custoUnitario ||
              v.custoCompraUnitario ||
              produto?.custoLiquidoSaco ||
              produto?.valorBase ||
              0,
          ),
        };
      });
    let updated = null;
    setData((d) => ({
      ...d,
      cargas: d.cargas.map((c) => {
        if (c.id !== activeLoad.id) return c;
        updated = {
          ...c,
          unidade,
          localCarregamento: local,
          dataCarregamento: dataCarreg,
          condicaoFornecedor: condFornecedor,
          custosPedido,
          pallet,
          modalidadeFrete: frete,
          numeroPedidoFornecedor: numeroPedido,
          numeroOSFornecedor: numeroOS,
          freteValor: Number(freteValor || 0),
          freteTipo,
          extras,
        };
        return updated;
      }),
    }));
    return {
      ...activeLoad,
      unidade,
      localCarregamento: local,
      dataCarregamento: dataCarreg,
      condicaoFornecedor: condFornecedor,
      custosPedido,
      pallet,
      modalidadeFrete: frete,
      numeroPedidoFornecedor: numeroPedido,
      numeroOSFornecedor: numeroOS,
    };
  }
  function gerarPdfFornecedor(c) {
    const f = fornecedorDaCarga(c);
    const vendas = (c.vendaIds || [])
      .map((id) => data.vendas.find((v) => v.id === id))
      .filter(Boolean);
    const grupos = Object.values(
      vendas.reduce((acc, v) => {
        const prod = data.produtos.find((p) => p.id === v.produtoId);
        const k = `${v.produtoId || v.produto}|${v.marca}`;
        acc[k] = acc[k] || {
          produto: v.produto,
          qtd: 0,
          pesoKg: 0,
          valorUnit: Number(
            custoFornecedor(data, v.produtoId, c.condicaoFornecedor, v.marca)
              ?.custoUnitario ||
              (c.custosPedido || []).find((x) => x.produtoId === v.produtoId)
                ?.custoUnitario ||
              v.custoCompraUnitario ||
              prod?.custoLiquidoSaco ||
              prod?.valorBase ||
              0,
          ),
        };
        acc[k].qtd += Number(v.qtd || 0);
        acc[k].pesoKg += Number(v.pesoKg || 0);
        return acc;
      }, {}),
    );
    const doc = new jsPDF();
    let y = 16;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("FORTE ATACAREJO", 105, y, { align: "center" });
    y += 10;
    doc.setFontSize(13);
    doc.text("PEDIDO AO FORNECEDOR", 105, y, { align: "center" });
    y += 10;
    doc.setFontSize(9);
    const add = (a, b) => {
      doc.setFont("helvetica", "bold");
      doc.text(`${a}:`, 15, y);
      doc.setFont("helvetica", "normal");
      doc.text(String(b || "-"), 60, y);
      y += 6;
    };
    const un = data.unidades.find((u) => u.nome === c.unidade);
    add("CARGA", c.codigo);
    add("DATA DE CRIAÇÃO", formatDateBR(c.criadaEm));
    add("UNIDADE", `${c.unidade}${un?.cnpj ? ` — CNPJ ${un.cnpj}` : ""}`);
    add("FORNECEDOR/MARCA", c.marca);
    add("CÓDIGO FORTE", f?.codigoForte || "");
    add("LOCAL DE CARREGAMENTO", c.localCarregamento);
    add("DATA DE CARREGAMENTO", formatDateBR(c.dataCarregamento));
    add("CONDIÇÃO DE PAGAMENTO", c.condicaoFornecedor);
    add("MOTORISTA", c.motorista);
    const mot = data.motoristas.find((x) => x.id === c.motoristaId);
    add("CPF MOTORISTA", mot?.cpf);
    add("TELEFONE MOTORISTA", mot?.telefone);
    add("PROPRIETÁRIO VEÍCULO", mot?.proprietario);
    add(
      "PLACAS",
      [mot?.placa1, mot?.placa2, mot?.placa3, mot?.placa4]
        .filter(Boolean)
        .join(" / "),
    );
    add("RNTRC/ANTT", mot?.rntrc);
    add("PESO TOTAL", `${Number(c.pesoKg).toLocaleString("pt-BR")} KG`);
    add("PALLETS", palletText(c.pallet));
    y += 3;
    doc.setFont("helvetica", "bold");
    doc.text("PRODUTOS CONSOLIDADOS", 15, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    for (const v of grupos) {
      const ls = doc.splitTextToSize(
        `${v.produto} | ${v.qtd} SACOS | ${(v.pesoKg / 1000).toFixed(2)} T | UNIT. ${money(v.valorUnit)} | TOTAL ${money(v.qtd * v.valorUnit)}`,
        180,
      );
      doc.text(ls, 15, y);
      y += ls.length * 5 + 2;
    }
    doc.setFontSize(7);
    doc.text(
      `DOCUMENTO GERADO EM ${new Date().toLocaleString("pt-BR")}`,
      15,
      290,
    );
    doc.save(`${c.codigo}-PEDIDO-FORNECEDOR.pdf`);
  }
  function enviarPedidoFornecedor() {
    const c = syncSupplierToLoad();
    if (!c) return;
    gerarPdfFornecedor(c);
    const f = fornecedorDaCarga(c);
    const msg = encodeURIComponent(
      `FORTE ATACAREJO - PEDIDO ${c.codigo} - ${c.marca} - ${c.localCarregamento} - ${Number(c.pesoKg / 1000).toFixed(2)} T.`,
    );
    if (enviarWpp && f?.whatsapp) {
      window.open(
        `https://wa.me/${String(f.whatsapp).replace(/\D/g, "")}?text=${msg}`,
        "_blank",
      );
    }
    if (enviarEmail && f?.emailPedidos) {
      window.location.href = `mailto:${f.emailPedidos}?subject=${encodeURIComponent(`PEDIDO ${c.codigo} - FORTE ATACAREJO`)}&body=${msg}`;
    }
    setData((d) => ({
      ...d,
      cargas: d.cargas.map((x) =>
        x.id === c.id
          ? {
              ...c,
              pedidoFornecedorEnviado: true,
              fase: "AGUARDANDO Nº PEDIDO FORNECEDOR",
            }
          : x,
      ),
    }));
    audit(
      "PEDIDO AO FORNECEDOR GERADO/ENVIADO",
      c.id,
      `${enviarWpp ? "WHATSAPP " : ""}${enviarEmail ? "E-MAIL" : ""}`,
    );
    alert(
      "PEDIDO GERADO. O PDF FOI BAIXADO. OS CANAIS MARCADOS FORAM ABERTOS EM MODO DE TESTE.",
    );
  }
  function incorporarNumeroPedido() {
    if (!activeLoad) return;
    const pedido = upper(numeroPedido.trim()),
      os = upper(numeroOS.trim());
    if (!pedido && !os)
      return alert(
        "INFORME PELO MENOS UMA REFERÊNCIA: Nº DO PEDIDO OU Nº DA OS.",
      );
    setData((d) => ({
      ...d,
      cargas: d.cargas.map((c) =>
        c.id === activeLoad.id
          ? {
              ...c,
              numeroPedidoFornecedor: pedido,
              numeroOSFornecedor: os,
              fase: "ORDEM AO MOTORISTA LIBERADA",
              unidade,
              localCarregamento: local,
              dataCarregamento: dataCarreg,
              condicaoFornecedor: condFornecedor,
              pallet,
              modalidadeFrete: frete,
            }
          : c,
      ),
    }));
    audit(
      "REFERÊNCIA DO FORNECEDOR INCORPORADA",
      activeLoad.id,
      [pedido && `PEDIDO ${pedido}`, os && `OS ${os}`]
        .filter(Boolean)
        .join(" • "),
    );
    alert(
      "REFERÊNCIA INCORPORADA. A CARGA PODE SEGUIR COM O PEDIDO OU COM A OS.",
    );
  }
  function gerarOrdemMotorista(c) {
    const m = data.motoristas.find((x) => x.id === c.motoristaId);
    const doc = new jsPDF();
    let y = 18;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("FORTE ATACAREJO", 105, y, { align: "center" });
    y += 10;
    doc.setFontSize(13);
    doc.text("ORDEM DE CARREGAMENTO", 105, y, { align: "center" });
    y += 12;
    doc.setFontSize(10);
    const add = (a, b) => {
      doc.setFont("helvetica", "bold");
      doc.text(`${a}:`, 15, y);
      doc.setFont("helvetica", "normal");
      doc.text(String(b || "-"), 65, y);
      y += 7;
    };
    add("CARGA", c.codigo);
    add("Nº PEDIDO FORNECEDOR", c.numeroPedidoFornecedor);
    add("Nº OS FORNECEDOR", c.numeroOSFornecedor);
    add("FORNECEDOR/MARCA", c.marca);
    add("LOCAL", c.localCarregamento);
    add("DATA", formatDateBR(c.dataCarregamento));
    add("MOTORISTA", c.motorista);
    add("CPF MOTORISTA", m?.cpf);
    add("TELEFONE MOTORISTA", m?.telefone);
    add("PROPRIETÁRIO DO VEÍCULO", m?.proprietario);
    add("TIPO DO VEÍCULO", m?.tipoVeiculo);
    add("PLACA 1", m?.placa1);
    add("PLACA 2", m?.placa2);
    add("PLACA 3", m?.placa3);
    add("PLACA 4", m?.placa4);
    add("RNTRC/ANTT", m?.rntrc);
    add("PESO", `${Number(c.pesoKg).toLocaleString("pt-BR")} KG`);
    add("PALLETS", palletText(c.pallet));
    y += 3;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("PRODUTOS A CARREGAR", 15, y);
    y += 7;
    doc.setFontSize(9);
    doc.text("PRODUTO / MARCA", 15, y);
    doc.text("QTD. SACOS", 112, y);
    doc.text("PESO UNIT.", 145, y);
    doc.text("PESO TOTAL", 176, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    const vendasCarga = data.vendas.filter((v) =>
      (c.vendaIds || []).includes(v.id),
    );
    for (const v of vendasCarga) {
      const prod = data.produtos.find((p) => p.id === v.produtoId);
      const qtd = Number(v.qtd ?? v.quantidade ?? 0);
      const pesoUnit = Number(prod?.pesoKg || 0);
      const nome = String(v.produto || prod?.nome || c.marca || "-");
      doc.text(nome.slice(0, 48), 15, y);
      doc.text(`${qtd.toLocaleString("pt-BR")} SC`, 112, y);
      doc.text(`${pesoUnit.toLocaleString("pt-BR")} KG`, 145, y);
      doc.text(`${(qtd * pesoUnit).toLocaleString("pt-BR")} KG`, 176, y);
      y += 6;
    }
    const totalSacos = vendasCarga.reduce(
      (a, v) => a + Number(v.qtd ?? v.quantidade ?? 0),
      0,
    );
    doc.setFont("helvetica", "bold");
    doc.text(
      `TOTAL: ${totalSacos.toLocaleString("pt-BR")} SACOS | ${Number(c.pesoKg).toLocaleString("pt-BR")} KG`,
      15,
      y + 2,
    );
    doc.setFontSize(7);
    doc.text(
      `DOCUMENTO CRIADO EM ${new Date().toLocaleString("pt-BR")}`,
      15,
      290,
    );
    doc.save(`${c.codigo}-ORDEM-MOTORISTA.pdf`);
  }
  function enviarOrdemMotorista() {
    const c = data.cargas.find((x) => x.id === activeLoadId);
    if (!c?.numeroPedidoFornecedor && !c?.numeroOSFornecedor)
      return alert(
        "ORDEM BLOQUEADA: INCORPORE O Nº DO PEDIDO OU O Nº DA OS DO FORNECEDOR.",
      );
    gerarOrdemMotorista(c);
    const m = data.motoristas.find((x) => x.id === c.motoristaId);
    if (m?.telefone) {
      const msg = encodeURIComponent(
        `FORTE ATACAREJO - ORDEM DE CARREGAMENTO ${c.codigo} - REFERÊNCIA ${c.numeroPedidoFornecedor || c.numeroOSFornecedor} - ${c.localCarregamento}.`,
      );
      window.open(
        `https://wa.me/55${String(m.telefone).replace(/\D/g, "")}?text=${msg}`,
        "_blank",
      );
    }
    setData((d) => ({
      ...d,
      cargas: d.cargas.map((x) =>
        x.id === c.id
          ? {
              ...x,
              ordemMotoristaEnviada: true,
              fase: "CONFERÊNCIA",
              status: "VERMELHO",
            }
          : x,
      ),
    }));
    audit("ORDEM AO MOTORISTA GERADA/ENVIADA", c.id);
    setTab("conferencia");
  }
  function cancelLoad(id) {
    const c = data.cargas.find((x) => x.id === id);
    if (
      !c ||
      !confirm(
        `CANCELAR DEFINITIVAMENTE A CARGA ${c.codigo}? AS VENDAS VOLTARÃO PARA A CARTEIRA.`,
      )
    )
      return;
    setData((d) => ({
      ...d,
      cargas: d.cargas.map((x) =>
        x.id === id
          ? {
              ...x,
              status: "CANCELADA",
              fase: "CANCELADA",
              canceladaEm: new Date().toISOString(),
            }
          : x,
      ),
      vendas: d.vendas.map((v) =>
        (c.vendaIds || []).includes(v.id) ? { ...v, status: "PENDENTE" } : v,
      ),
    }));
    audit("CARGA CANCELADA", id, "VENDAS RETORNARAM À CARTEIRA");
    if (activeLoadId === id) setActiveLoadId("");
  }
  async function attachDoc(cargaId, tipo, file) {
    const id = uid("doc");
    await putFile(id, file);
    let documentoFinanceiroPath = "";
    if(tipo==="BOLETO/TÍTULO DO FORNECEDOR" && supabase) {
      documentoFinanceiroPath="boletos/"+id+"/"+file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
      const {error}=await supabase.storage.from("forte-vendas-financeiro").upload(documentoFinanceiroPath,file,{upsert:false,contentType:file.type||"application/pdf"});
      if(error){alert("BOLETO NÃO ENVIADO À PRÉ-CONFERÊNCIA: FALHA AO GUARDAR DOCUMENTO NA NUVEM. "+error.message);return}
    }
    let nfeExtraida = null;
    let meta = {
      id,
      cargaId,
      tipo,
      nome: file.name,
      mime: file.type,
      tamanho: file.size,
      criadoEm: nowISO(),
      statusIa: "ANEXADO",
      conferencia: { status: "AGUARDANDO IA", itens: [] },
    };
    if (file.name.toLowerCase().endsWith(".xml")) {
      try {
        const nfe = await lerXmlNfe(file);
        nfeExtraida = nfe;
        const c = data.cargas.find((x) => x.id === cargaId);
        const diffs = [];
        if (
          c?.pesoKg &&
          nfe.pesoBruto &&
          Math.abs(Number(c.pesoKg) - Number(nfe.pesoBruto)) > 10
        )
          diffs.push("PESO DA NF DIVERGE DO PESO DA CARGA");
        meta = {
          ...meta,
          xml: true,
          dadosExtraidos: nfe,
          statusIa: "XML LIDO",
          conferencia: {
            status: diffs.length ? "DIVERGÊNCIA" : "CONFERE",
            itens: diffs,
          },
        };
      } catch (e) {
        meta = {
          ...meta,
          statusIa: "ERRO XML",
          conferencia: {
            status: "DIVERGÊNCIA",
            itens: [String(e.message || e)],
          },
        };
      }
    }
    setData((d) => {
      let contas = [...(d.contasPagar || [])],
        boletos = [...(d.boletosFornecedores || [])],
        preConferencia = [...(d.preConferenciaBoletos || [])],
        fretes = [...(d.pagamentosFretes || [])];
      const carga = d.cargas.find((x) => x.id === cargaId);
      if (tipo === "BOLETO/TÍTULO DO FORNECEDOR") {
        const reg = {
          id: uid("prebol"),
          fornecedor: carga?.marca || "",
          carga: carga?.codigo || "",
          nf: "",
          arquivoNome: file.name,
          valor: 0,
          vencimento: "",
          status: "RECEBIDO",
          documentoId: id,
          documentoPath: documentoFinanceiroPath,
          criadoEm: nowISO(),
          criadoPor: currentUser?.nome || "USUÁRIO",
          origem: "ANEXO DA CARGA / DOSSIÊ",
          divergencias: ["AGUARDANDO LEITURA E CONFERÊNCIA FINANCEIRA"],
        };
        if (!preConferencia.some((x) => x.documentoId === id)) preConferencia.push(reg);
        if (!boletos.some((x) => x.documentoId === id))
          boletos.push({
            ...reg,
            id: uid("bol"),
            documentoId: id,
            origem: "ANEXO DA CARGA / IA",
            hash: `${file.name}|${file.size}|${file.lastModified}`,
          });
      }
      if (
        tipo === "COMPROVANTE DE PAGAMENTO DO FRETE" &&
        !fretes.some((x) => x.documentoId === id)
      )
        fretes.push({
          id: uid("frpg"),
          carga: carga?.codigo || "",
          motorista: carga?.motorista || "",
          favorecido: carga?.motorista || "",
          valor: Number(carga?.freteValor || 0),
          data: todayISO(),
          documento: file.name,
          documentoId: id,
          status: "REGISTRADO / A CONCILIAR",
          origem: "ANEXO DA CARGA / IA",
          hash: `${file.name}|${file.size}|${file.lastModified}`,
        });
      const notas = [...(d.notasFiscais || [])];
      if (
        nfeExtraida &&
        !notas.some((n) => n.chave && n.chave === nfeExtraida.chave)
      ) {
        const { raw, ...dados } = nfeExtraida;
        notas.push({
          id: uid("nfe"),
          ...dados,
          origem: "XML MANUAL",
          documentoXmlId: id,
          cargaId,
          status: "AGUARDANDO DESTINAÇÃO",
          importadaEm: nowISO(),
        });
      }
      return {
        ...d,
        documentos: [...(d.documentos || []), meta],
        notasFiscais: notas,
        contasPagar: contas,
        preConferenciaBoletos: preConferencia,
        boletosFornecedores: boletos,
        pagamentosFretes: fretes,
      };
    });
    audit("DOCUMENTO ANEXADO", cargaId, `${tipo} - ${file.name}`);
  }
  function docStatus(c, tipo) {
    if (tipo === "NF DE PALLETS" && c.pallet !== "COM PALLETS")
      return "NÃO SE APLICA";
    if (
      tipo === "COMPROVANTE DE PAGAMENTO DO FRETE" &&
      c.modalidadeFrete === "CIF"
    )
      return "NÃO SE APLICA — CIF";
    const docs = (data.documentos || []).filter(
      (d) => d.cargaId === c.id && d.tipo === tipo,
    );
    if (!docs.length) return "PENDENTE";
    if (docs.some((d) => d.conferencia?.status === "DIVERGÊNCIA"))
      return "DIVERGÊNCIA";
    if (docs.some((d) => d.conferencia?.status === "CONFERE"))
      return "RESOLVIDO";
    return "AGUARDANDO CONFERÊNCIA IA";
  }
  function auditStatus(c) {
    return requiredDocs(c).every((t) => docStatus(c, t) === "RESOLVIDO")
      ? "RESOLVIDO"
      : "PENDENTE";
  }
  useEffect(() => {
    setData((d) => ({
      ...d,
      cargas: d.cargas.map((c) => {
        if (c.status === "CANCELADA") return c;
        const ok = requiredDocs(c).every((t) => {
          const ds = (d.documentos || []).filter(
            (x) => x.cargaId === c.id && x.tipo === t,
          );
          return (
            ds.some((x) => x.conferencia?.status === "CONFERE") &&
            !ds.some((x) => x.conferencia?.status === "DIVERGÊNCIA")
          );
        });
        return {
          ...c,
          status: ok ? "AZUL" : "VERMELHO",
          fase: ok ? "FINALIZADA" : c.fase,
        };
      }),
    }));
  }, [data.documentos]);
  function iaConferirEmails(c) {
    alert(
      `IA — CONFERIR E-MAILS\n\nCARGA ${c.codigo}\nFORNECEDOR ${c.marca}\n\nAS CAIXAS GMAIL AUTORIZADAS JÁ PODEM SER SINCRONIZADAS EM INTEGRAÇÕES. SINCRONIZE AS CONTAS E VOLTE AO BANCO DE NOTAS PARA CONFERIR O DOSSIÊ CONSOLIDADO.`,
    );
    audit(
      "IA CONFERIR E-MAILS ACIONADA — REDIRECIONAMENTO PARA INTEGRAÇÕES",
      c.id,
    );
    setTab("group:integracoes");
  }
  function supplierCredit(nome) {
    const voto = norm(nome).includes("votorantim");
    const total = voto
      ? 225000
      : Number(
          data.fornecedores.find((x) => x.nome === nome)?.limiteCredito || 0,
        );
    const used = (data.contasPagar || [])
      .filter(
        (t) =>
          (voto
            ? norm(t.fornecedor).includes("votorantim")
            : t.fornecedor === nome) && t.status !== "PAGO/LIQUIDADO",
      )
      .reduce((s, t) => s + Number(t.valor || 0), 0);
    return { total, used, available: Math.max(0, total - used) };
  }
  function markPaid(id) {
    const t = data.contasPagar.find((x) => x.id === id);
    if (!t) return;
    setModal({ type: "proof", titleId: id });
  }
  function doProofPayment(titleId, file) {
    const id = uid("doc");
    putFile(id, file).then(() => {
      setData((d) => ({
        ...d,
        documentos: [
          ...(d.documentos || []),
          {
            id,
            cargaId: d.contasPagar.find((t) => t.id === titleId)?.carga || "",
            tipo: "COMPROVANTE DE PAGAMENTO DO FORNECEDOR",
            nome: file.name,
            mime: file.type,
            criadoEm: nowISO(),
            statusIa: "ANEXADO / AGUARDANDO CONFERÊNCIA",
          },
        ],
        contasPagar: d.contasPagar.map((t) =>
          t.id === titleId
            ? {
                ...t,
                status: upper(t.status).includes("CONCILIADO")
                  ? t.status
                  : "COMPROVANTE ANEXADO / AGUARDANDO LIQUIDAÇÃO",
                comprovanteDocumentoId: id,
                comprovanteNome: file.name,
              }
            : t,
        ),
      }));
      audit("COMPROVANTE DE FORNECEDOR ANEXADO", "", titleId);
      setModal(null);
    });
  }
  function liquidarTitulo(id) {
    const t = data.contasPagar.find((x) => x.id === id);
    if (!t) return;
    if (
      upper(t.status).includes("CONCILIADO") ||
      upper(t.status).includes("LIQUIDADO") ||
      upper(t.status).includes("PAGO")
    )
      return alert(
        "TÍTULO JÁ LIQUIDADO/CONCILIADO. NÃO SERÁ GERADA NOVA BAIXA.",
      );
    if (
      !t.comprovanteDocumentoId &&
      !confirm(
        "NÃO HÁ COMPROVANTE ANEXADO. DESEJA CONTINUAR SOMENTE COMO BAIXA MANUAL DO ADMINISTRADOR?",
      )
    )
      return;
    setData((d) => ({
      ...d,
      contasPagar: d.contasPagar.map((x) =>
        x.id === id
          ? {
              ...x,
              status: "PAGO/LIQUIDADO — COMPROVANTE",
              pagoEm: nowISO(),
              origemLiquidacao: "COMPROVANTE",
            }
          : x,
      ),
    }));
    audit("TÍTULO LIQUIDADO POR COMPROVANTE", "", id);
  }
  function dailyRows() {
    const pagar = data.contasPagar.filter((t) =>
      inPeriod(t, reportStart, reportEnd, (x) => x.vencimento),
    );
    const receber = data.contasReceber.filter((t) =>
      inPeriod(t, reportStart, reportEnd, (x) => x.vencimento),
    );
    const corte = reportEnd || reportStart || todayISO();
    const vencidos = [...data.contasPagar, ...data.contasReceber].filter(
      (t) =>
        !upper(t.status).includes("PAGO") &&
        !upper(t.status).includes("LIQUIDADO") &&
        !upper(t.status).includes("RECEBIDO") &&
        t.vencimento &&
        t.vencimento < corte,
    );
    const liquidados = [...data.contasPagar, ...data.contasReceber].filter(
      (t) =>
        inPeriod(t, reportStart, reportEnd, (x) =>
          String(x.pagoEm || x.recebidoEm || "").slice(0, 10),
        ),
    );
    return { pagar, receber, vencidos, liquidados };
  }
  function dailyPdf(tipo = "TODOS") {
    const r = dailyRows();
    const doc = new jsPDF();
    let y = 16;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text(
      `RELATÓRIO FINANCEIRO - ${periodLabel(reportStart, reportEnd)}`,
      105,
      y,
      { align: "center" },
    );
    y += 10;
    const section = (title, rows) => {
      doc.setFontSize(11);
      doc.text(title, 15, y);
      y += 6;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      for (const t of rows) {
        doc.text(
          `${upper(t.fornecedor || t.cliente || "")} | ${t.carga || "-"} | ${money(t.valor)} | ${t.status || "ABERTO"}`,
          15,
          y,
        );
        y += 6;
        if (y > 280) {
          doc.addPage();
          y = 16;
        }
      }
      doc.setFont("helvetica", "bold");
      y += 3;
    };
    if (tipo === "TODOS" || tipo === "PAGAR") section("CONTAS A PAGAR NO PERÍODO", r.pagar);
    if (tipo === "TODOS" || tipo === "RECEBER") section("CONTAS A RECEBER NO PERÍODO", r.receber);
    const origem = tipo === "PAGAR" ? data.contasPagar : tipo === "RECEBER" ? data.contasReceber : [...data.contasPagar, ...data.contasReceber];
    section(`VENCIDOS EM ABERTO ATÉ ${formatDateBR(reportEnd || reportStart)}`, r.vencidos.filter((x) => origem.some((o) => o.id === x.id)));
    section(tipo === "PAGAR" ? "PAGOS / LIQUIDADOS NO PERÍODO" : tipo === "RECEBER" ? "RECEBIDOS / LIQUIDADOS NO PERÍODO" : "LIQUIDADOS / RECEBIDOS NO PERÍODO", r.liquidados.filter((x) => origem.some((o) => o.id === x.id)));
    doc.save(
      `RELATORIO-${tipo === "PAGAR" ? "CONTAS-A-PAGAR" : tipo === "RECEBER" ? "CONTAS-A-RECEBER" : "FINANCEIRO"}-${reportStart || "INICIO"}-${reportEnd || "FIM"}.pdf`,
    );
  }
  function resetAll() {
    if (confirm("RESTAURAR A BASE LOCAL DE TESTES?")) {
      resetData();
      location.reload();
    }
  }
  function limparHomologacao() {
    if (
      !confirm(
        "LIMPAR SOMENTE OS LANÇAMENTOS FICTÍCIOS DE TESTE / HOMOLOGAÇÃO?\n\nCADASTROS BASE DE PRODUTOS, FORNECEDORES, MOTORISTAS E CLIENTES SERÃO PRESERVADOS.",
      )
    )
      return;
    setData((d) => {
      const arrKeys = [
        "vendas",
        "cargas",
        "documentos",
        "vendasBalcao",
        "vendasExternas",
        "caixasBalcao",
        "notasFiscais",
        "estoqueMov",
        "precosClientes",
        "fretesVendaBalcao",
        "fretesBalcao",
        "fretesBalcaoTabela",
        "despesas",
        "extratosBancarios",
        "conciliacoesFinanceiras",
        "pagamentosFretes",
        "boletosFornecedores",
        "emprestimos",
        "cartoesCredito",
        "patioSaidas",
        "palletPatrimonio",
        "palletClientes",
        "palletFornecedores",
        "palletColetas",
        "palletDevolucoes",
        "contasPagar",
        "contasReceber",
        "auditoria",
      ];
      const out = { ...d };
      out.usuarios = (d.usuarios || []).filter((x) => x?.teste !== true);
      out.motoristas = (d.motoristas || []).filter((x) => x?.teste !== true);
      for (const k of arrKeys)
        out[k] = (d[k] || []).filter((x) => x?.teste !== true);
      out.contasBancarias = (d.contasBancarias || []).map((x) =>
        x.saldoHomologacao
          ? {
              ...x,
              saldo: 0,
              saldoHomologacao: false,
              observacao: "",
              atualizadoEm: nowISO(),
            }
          : x,
      );
      out.clientes = (d.clientes || []).map((x) =>
        x.homologacaoCredito
          ? {
              ...x,
              limiteCredito: 0,
              condicaoPagamento: "",
              vendedorResponsavelId: "",
              homologacaoCredito: false,
            }
          : x,
      );
      if (d.resultadoBase?.teste)
        out.resultadoBase = { valor: 0, dataBase: "", atualizadoEm: nowISO() };
      const temVenda =
        (out.vendas || []).length +
        (out.vendasBalcao || []).filter((x) => !x.numeroOrcamento).length;
      const temOrc = (out.vendasBalcao || []).some((x) => x.numeroOrcamento);
      out.settings = {
        ...d.settings,
        nextVendaSeq: temVenda ? d.settings?.nextVendaSeq || 1 : 1,
        nextCargaSeq: (out.cargas || []).length
          ? d.settings?.nextCargaSeq || 1
          : 1,
        nextOrcamentoSeq: temOrc ? d.settings?.nextOrcamentoSeq || 1 : 1,
      };
      return out;
    });
    alert("DADOS FICTÍCIOS REMOVIDOS. CADASTROS BASE PRESERVADOS.");
  }
  function gerarFinalizacao(c) {
    if (auditStatus(c) !== "RESOLVIDO")
      return alert(
        "FINALIZAÇÃO BLOQUEADA: EXISTEM DOCUMENTOS/CONFERÊNCIAS PENDENTES.",
      );
    const vs = (c.vendaIds || [])
      .map((id) => data.vendas.find((v) => v.id === id))
      .filter(Boolean);
    gerarResumoCargaPdf({ c, vs, data, currentUser });
    setData((d) => {
      const ja = (d.estoqueMov || []).some(
        (x) =>
          x.referencia === c.codigo &&
          x.tipo === "ENTRADA - COMPRA FORTE / CARGA",
      );
      const entradas = ja
        ? []
        : vs
            .filter((v) => v.tipoDestino === "ESTOQUE_FORTE")
            .map((v) => ({
              id: uid("est"),
              data: todayISO(),
              dataHora: new Date().toISOString(),
              unidade: v.unidadeEstoque || c.unidade,
              marca: v.marca,
              produtoId: v.produtoId,
              produto: v.produto,
              tipo: "ENTRADA - COMPRA FORTE / CARGA",
              quantidade: Number(v.qtd || 0),
              custoUnitario: Number(v.custoCompraUnitario || 0),
              referencia: c.codigo,
              usuario: currentUser?.nome || "ADMINISTRADOR",
            }));
      return {
        ...d,
        estoqueMov: [...(d.estoqueMov || []), ...entradas],
        cargas: d.cargas.map((x) =>
          x.id === c.id
            ? {
                ...x,
                status: "AZUL",
                fase: "FINALIZADA",
                finalizadaEm: new Date().toISOString(),
                finalizadaPor: currentUser?.nome,
              }
            : x,
        ),
      };
    });
    audit("FINALIZAÇÃO DA CARGA GERADA", c.id);
  }
  const panelLoads = data.cargas
    .filter((c) => c.status !== "CANCELADA")
    .slice()
    .reverse();
  if(new URLSearchParams(window.location.search).get("app")==="financeiro") {
    if(!canAccessGroup("financeiro"))return <main className="main"><h1>ACESSO AO FINANCEIRO NÃO AUTORIZADO</h1><a href="/">VOLTAR AO FORTE VENDAS</a></main>;
    return <FinanceiroHub data={data} onChange={setData} currentUser={currentUser}/>;
  }
  return (
    <div className="app">
      <aside className="sideNav">
        <div className="sideBrand">
          <b>FORTE VENDAS</b>
          <small>Gestão de Cargas e Vendas</small>
        </div>
        <button
          className={tab === "home" ? "sideActive" : ""}
          onClick={() => setTab("home")}
        >
          ⌂ PAINEL PRINCIPAL
        </button>
        {canAccessGroup("vendas") && <button
          className={tab === "group:vendas" ? "sideActive" : ""}
          onClick={() => setTab("group:vendas")}
        >
          ▦ VENDAS E COMPRAS
        </button>}
        {canAccessGroup("logistica") && <button
          className={tab === "group:logistica" ? "sideActive" : ""}
          onClick={() => setTab("group:logistica")}
        >
          ▣ LOGÍSTICA E OPERAÇÃO
        </button>}
        {canAccessGroup("conferencia") && <button
          className={tab === "group:conferencia" ? "sideActive" : ""}
          onClick={() => setTab("group:conferencia")}
        >
          ✓ CONFERÊNCIA / IA
        </button>}
        {canAccessGroup("financeiro") && (
          <button
            className={tab === "group:financeiro" ? "sideActive" : ""}
            onClick={() => setTab("group:financeiro")}
          >
            $ FINANCEIRO
          </button>
        )}
        {canAccessGroup("fornecedores") && <button
          className={tab === "group:fornecedores" ? "sideActive" : ""}
          onClick={() => setTab("group:fornecedores")}
        >
          ▤ FORNECEDORES / SUPRIMENTOS
        </button>}
        {canAccessGroup("cadastros") && <button
          className={tab === "group:cadastros" ? "sideActive" : ""}
          onClick={() => setTab("group:cadastros")}
        >
          ⚙ CADASTROS / CONFIGURAÇÕES
        </button>}
        {canAccessGroup("relatorios") && <button
          className={tab === "group:relatorios" ? "sideActive" : ""}
          onClick={() => setTab("group:relatorios")}
        >
          ▥ RELATÓRIOS
        </button>}
        {canAccessGroup("patio") && <button
          className={tab === "group:patio" ? "sideActive" : ""}
          onClick={() => setTab("group:patio")}
        >
          ▣ PÁTIO / ESTOQUE
        </button>}
        {canAccessGroup("integracoes") && <button
          className={tab === "group:integracoes" ? "sideActive" : ""}
          onClick={() => setTab("group:integracoes")}
        >
          ⌁ INTEGRAÇÕES
        </button>}
        <div className="sideVersion">
          <small>VERSÃO</small>
          <b>V6.8.3</b>
          <span>● Online</span>
        </div>
      </aside>
      <main className="main">
        <header className="header dashboardHeader">
          <div>
            <h1>FORTE VENDAS</h1>
            <small>FORTE ATACAREJO — CONTROLE OPERACIONAL + IA</small>
            {canAccessGroup("financeiro")&&<p><a href="/?app=financeiro" className="secondary">▣ ABRIR FORTE FINANCEIRO</a></p>}
          </div>
          <div className="globalSearchWrap">
            <input
              className="headerSearchInput"
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && globalResults[0])
                  openGlobalResult(globalResults[0]);
              }}
              placeholder="🔎 Buscar cliente, venda, carga, produto, motorista, destino..."
            />
            {globalSearch && (
              <div className="globalSearchResults">
                {globalResults.length ? (
                  globalResults.map((r, i) => (
                    <button
                      key={`${r.type}-${i}`}
                      onClick={() => openGlobalResult(r)}
                    >
                      <b>{r.type}</b>
                      <span>{r.label}</span>
                      <small>{r.sub}</small>
                    </button>
                  ))
                ) : (
                  <div className="globalSearchEmpty">
                    NENHUM RESULTADO ENCONTRADO.
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="headerActions">
            <button
              className="ghost"
              onClick={() => setModal({ type: "ajudaIa", tab })}
            >
              ? AJUDA IA
            </button>
            <div className="userSessionBox">
              <span className="mode">{currentUser?.nome}</span>
              {supabaseConfigured && <button className="dangerBtn sessionExit" onClick={()=>supabase?.auth.signOut()}>SAIR</button>}
            </div>
          </div>
        </header>
        {tab !== "home" && (
          <div className="moduleBreadcrumb">
            <button className="ghost dark" onClick={() => setTab("home")}>
              ← PAINEL PRINCIPAL
            </button>
            {!tab.startsWith("group:") && (
              <button
                className="ghost dark"
                onClick={() => {
                  const g = MODULE_GROUPS.find((x) => x.modules.includes(tab));
                  setTab(g ? `group:${g.id}` : "home");
                }}
              >
                ← QUADROS
              </button>
            )}
            <b>
              {tab.startsWith("group:")
                ? MODULE_GROUPS.find((g) => `group:${g.id}` === tab)?.title ||
                  "TÓPICO"
                : MODULES.find((m) => m[0] === tab)?.[2] || "MÓDULO"}
            </b>
          </div>
        )}
        {tab.startsWith("group:") &&
          (() => {
            const gid = tab.split(":")[1];
            if (gid === "integracoes")
              return (
                <section className="dashboardGroup groupScreen">
                  <div className="dashboardGroupHead">
                    <div>
                      <h2>INTEGRAÇÕES</h2>
                      <p>Conexões e importações do FORTE VENDAS.</p>
                    </div>
                  </div>
                  <div className="integrationCards">
                    <button onClick={() => setModal({ type: "integracoes" })}>
                      <b>GMAIL / WHATSAPP</b>
                      <small>MÚLTIPLAS CONTAS • SINCRONIZAÇÃO • STATUS</small>
                      <em>ABRIR</em>
                    </button>
                    <button
                      onClick={() =>
                        setModal({ type: "integracoesFinanceiras" })
                      }
                    >
                      <b>BANCOS / CARTÕES</b>
                      <small>
                        ITAÚ • OPEN FINANCE • ADQUIRENTES • IMPORTAÇÃO
                      </small>
                      <em>ABRIR</em>
                    </button>
                  </div>
                </section>
              );
            if (gid === "patio") {
              const mods = ["estoque", "paletes"]
                .map((id) => MODULES.find((m) => m[0] === id))
                .filter(Boolean);
              return (
                <section className="dashboardGroup groupScreen">
                  <div className="dashboardGroupHead">
                    <div>
                      <h2>PÁTIO / ESTOQUE</h2>
                      <p>Movimentação física, expedição, estoque e paletes.</p>
                    </div>
                    <span>{mods.length} QUADRO(S)</span>
                  </div>
                  <nav className="tabs mega moduleCards dashboardCards groupedCards">
                    {mods.map(([k, n, t, d]) => (
                      <button key={k} onClick={() => setTab(k)}>
                        <div className="moduleNumber">{n}</div>
                        <span>{t}</span>
                        <small>{d}</small>
                        <em>ABRIR</em>
                      </button>
                    ))}
                  </nav>
                </section>
              );
            }
            const g = MODULE_GROUPS.find((x) => x.id === gid);
            if (!g) return null;
            const mods = g.modules
              .map((id) => MODULES.find((m) => m[0] === id))
              .filter(Boolean)
              .filter(([id]) => canAccessTab(id));
            return (
              <section className="dashboardGroup groupScreen">
                <div className="dashboardGroupHead">
                  <div>
                    <h2>{g.title}</h2>
                    <p>{g.subtitle}</p>
                  </div>
                  <span>{mods.length} QUADRO(S)</span>
                </div>
                <nav className="tabs mega moduleCards dashboardCards groupedCards">
                  {mods.map(([k, n, t, d]) => (
                    <button key={k} onClick={() => setTab(k)}>
                      <div className="moduleNumber">{n}</div>
                      <span>{t}</span>
                      <small>{d}</small>
                      <em>ABRIR TELA</em>
                    </button>
                  ))}
                </nav>
              </section>
            );
          })()}
        {tab === "home" && (
          <HomeCompactV47
            groups={visibleModuleGroups}
            canIntegrations={canAccessGroup("integracoes")}
            onOpen={(id) => setTab("group:" + id)}
            onGmail={() => setModal({ type: "integracoes" })}
            onFinance={() => setModal({ type: "integracoesFinanceiras" })}
          />
        )}
        <div className="systemDate">
          <b>DATA/HORA DO SISTEMA:</b> {stamp()}
        </div>
        <nav className="mobileQuickActions">
          <button onClick={() => setModal({ type: "sale" })}>＋ PEDIDO RÁPIDO</button>
          <button onClick={() => setModal({ type: "cadastroIa" })}>✦ CADASTRO COM IA</button>
          <button onClick={() => setTab("todasCargas")}>▣ CARGAS</button>
          <button onClick={() => setTab("conferencia")}>✓ DOCUMENTOS</button>
        </nav>
        {tab !== "home" && !tab.startsWith("group:") && tab !== "clientes" && (
          <ModuleAttachBar
            data={data}
            onChange={setData}
            module={tab}
            refId={activeLoadId || tab}
          />
        )}
        {tab === "clientes" && (
          <section className="card walletCard">
            <div className="sectionHead">
              <div>
                <h2>
                  CARTEIRA DE VENDAS PENDENTES —{" "}
                  {data.vendas.filter((v) => v.status === "PENDENTE").length}{" "}
                  PEDIDO(S)
                </h2>
                <p>CARDS COMPACTOS • SELEÇÃO RÁPIDA • BUSCA E FILTROS.</p>
              </div>
              <div className="supplierActions">
                <button
                  className="ghost dark"
                  onClick={() => setWalletFull((x) => !x)}
                >
                  {walletFull
                    ? "FECHAR CARTEIRA COMPLETA"
                    : "ABRIR CARTEIRA COMPLETA"}
                </button>
                <button onClick={() => setModal({ type: "sale" })}>
                  + NOVO PEDIDO/CLIENTE
                </button>
                <button onClick={() => setModal({ type: "emissorBoletos", canal: "CARGA DIRETA" })}>
                  EMITIR / ALTERAR BOLETO
                </button>
              </div>
            </div>
            <div className="walletToolbar">
              <UpperInput
                value={walletSearch}
                onChange={setWalletSearch}
                placeholder="🔎 BUSCAR CLIENTE, MARCA, PRODUTO OU DESTINO..."
              />
            </div>
            <div className={`walletCards ${walletFull ? "full" : ""}`}>
              {data.vendas
                .filter((v) => v.status === "PENDENTE")
                .slice()
                .sort((a, b) =>
                  String(opDate(a) || "").localeCompare(
                    String(opDate(b) || ""),
                  ),
                )
                .filter(
                  (v) =>
                    !norm(walletSearch) ||
                    [v.cliente, v.marca, v.produto, v.destino].some((x) =>
                      norm(x).includes(norm(walletSearch)),
                    ),
                )
                .map((v) => (
                  <article
                    className={`walletSaleCard ${selectedSales.includes(v.id) ? "selected" : ""}`}
                    key={v.id}
                  >
                    <div className="walletCardTop">
                      <label>
                        <input
                          type="checkbox"
                          checked={selectedSales.includes(v.id)}
                          onChange={() => toggleSale(v.id)}
                        />{" "}
                        SELECIONAR
                      </label>
                      <span className="statusPill">{v.status}</span>
                    </div>
                    <b>
                      {v.tipoDestino === "ESTOQUE_FORTE"
                        ? "🏭 ESTOQUE FORTE"
                        : v.cliente}
                    </b>
                    <small>
                      {v.numeroVenda || "SEM Nº VENDA"} • {opDate(v) || "-"} •{" "}
                      {Math.max(
                        0,
                        Math.floor(
                          (new Date(todayISO()) -
                            new Date(opDate(v) || todayISO())) /
                            86400000,
                        ),
                      )}{" "}
                      DIA(S) PENDENTE • {v.marca}
                    </small>
                    <strong>{v.produto}</strong>
                    <div className="walletFacts">
                      <span>{v.qtd} SC</span>
                      <span>{(v.pesoKg / 1000).toFixed(1)} T</span>
                      <span>{v.destino}</span>
                      <span>{v.condicaoPagamento}</span>
                    </div>
                    <div className="walletCardActions">
                      <button
                        className="ghost dark"
                        onClick={() =>
                          setModal({ type: "editSale", saleId: v.id })
                        }
                      >
                        ABRIR / EDITAR
                      </button>
                      <small className="createdAt">
                        CRIADO EM:{" "}
                        {v.criadoEm
                          ? new Date(v.criadoEm).toLocaleString("pt-BR", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : v.dataOperacao
                            ? formatDateBR(v.dataOperacao)
                            : "-"}
                      </small>
                      <em>{loadCodeForSale(v.id) || "SEM CARGA"}</em>
                    </div>
                  </article>
                ))}
            </div>
            <details className="linkedCompact">
              <summary>
                PEDIDOS JÁ VINCULADOS A CARGAS ATIVAS —{" "}
                {data.vendas.filter((v) => v.status === "EM CARGA").length}
              </summary>
              <div className="linkedSales linkedSales6">
                {data.vendas
                  .filter((v) => v.status === "EM CARGA")
                  .map((v) => {
                    const c = data.cargas.find(
                      (c) =>
                        c.status !== "CANCELADA" &&
                        (c.vendaIds || []).includes(v.id),
                    );
                    return (
                      <div key={v.id}>
                        <b>{v.cliente}</b>
                        <span>{v.produto}</span>
                        <span>{v.qtd} SC</span>
                        <span>{(v.pesoKg / 1000).toFixed(1)} T</span>
                        <strong>{c?.codigo || "-"}</strong>
                        <span>{c?.motorista || "-"}</span>
                        <button
                          className="ghost dark"
                          onClick={() =>
                            setModal({ type: "editSale", saleId: v.id })
                          }
                        >
                          EDITAR VENDA
                        </button>
                      </div>
                    );
                  })}
              </div>
            </details>
            <div className={`alert ${brandCheck.ok ? "" : "danger"}`}>
              <b>SELECIONADO:</b> {vendasSel.length} PEDIDO(S) • {selQtd} SACOS
              • {(selKg / 1000).toFixed(1)} T{" "}
              {!brandCheck.ok && " • BLOQUEADO: MARCAS DIFERENTES"}
            </div>
            <button onClick={() => setTab("motorista")}>
              CONTINUAR / SELECIONAR MOTORISTA
            </button>
          </section>
        )}
        {tab === "motorista" && (
          <section className="card">
            <h2>MOTORISTA / VEÍCULO</h2>
            <Field label="🔎 BUSCAR MOTORISTA / VEÍCULO">
              <UpperInput
                value={driverSearch}
                onChange={setDriverSearch}
                placeholder="NOME, APELIDO, PLACA, PROPRIETÁRIO, CPF OU RNTRC..."
              />
            </Field>
            {driverSearch && (
              <div className="driverSearchResults">
                {driverFiltered.length ? (
                  driverFiltered.slice(0, 8).map((m) => (
                    <button
                      type="button"
                      key={m.id}
                      onClick={() => {
                        setDriverId(m.id);
                        setDriverSearch(m.nome);
                      }}
                    >
                      <b>
                        {m.nome}
                        {m.apelido ? ` — ${m.apelido}` : ""}
                      </b>
                      <small>
                        {[m.cpf, m.placa1, m.placa2, m.rntrc, m.proprietario]
                          .filter(Boolean)
                          .join(" • ")}
                      </small>
                    </button>
                  ))
                ) : (
                  <div className="globalSearchEmpty">
                    NENHUM MOTORISTA / VEÍCULO ENCONTRADO.
                  </div>
                )}
              </div>
            )}
            <Field label="SELECIONAR MOTORISTA">
              <select
                value={activeLoad ? activeLoad.motoristaId : driverId}
                disabled={!!activeLoad}
                onChange={(e) => setDriverId(e.target.value)}
              >
                <option value="">SELECIONE...</option>
                {driverFiltered.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                    {m.apelido ? ` — ${m.apelido}` : ""} • {m.placa1} •{" "}
                    {m.proprietario}
                  </option>
                ))}
              </select>
            </Field>
            {vehicleDriver && (
              <>
                <div className="infoGrid">
                  <div>
                    <b>MOTORISTA</b>
                    <span>{vehicleDriver.nome}</span>
                  </div>
                  <div>
                    <b>PLACA</b>
                    <span>{vehicleDriver.placa1}</span>
                  </div>
                  <div>
                    <b>PROPRIETÁRIO</b>
                    <span>{vehicleDriver.proprietario}</span>
                  </div>
                  <div>
                    <b>CAPACIDADE-ALVO</b>
                    <span>
                      {Number(vehicleDriver.capacidadeAlvoKg) / 1000} T
                    </span>
                  </div>
                  <div>
                    <b>CAPACIDADE MÁXIMA</b>
                    <span>
                      {Number(vehicleDriver.capacidadeMaximaKg) / 1000} T
                    </span>
                  </div>
                  <div>
                    <b>PESO DA CARGA</b>
                    <span>{vehicleWeight / 1000} T</span>
                  </div>
                  <div>
                    <b>DIFERENÇA</b>
                    <span>
                      {(
                        (vehicleWeight -
                          Number(vehicleDriver.capacidadeAlvoKg)) /
                        1000
                      ).toFixed(1)}{" "}
                      T
                    </span>
                  </div>
                  <div>
                    <b>PIX</b>
                    <span>{vehicleDriver.chavePix || "-"}</span>
                  </div>
                </div>
                <div
                  className={`alert ${cap.status === "CONFERE" ? "success" : cap.status === "BLOQUEADO" ? "danger" : "warn"}`}
                >
                  {cap.mensagem}
                </div>
              </>
            )}
            {!activeLoad && (
              <button onClick={formLoad}>
                FORMAR CARGA / IR AO FORNECEDOR
              </button>
            )}{" "}
            {activeLoad && (
              <div className="supplierActions">
                <button onClick={() => setTab("fornecedor")}>
                  IR AO FORNECEDOR / PEDIDO
                </button>
                <button
                  disabled={!activeLoad.numeroPedidoFornecedor}
                  onClick={enviarOrdemMotorista}
                >
                  WHATSAPP — ENVIAR ORDEM AO MOTORISTA
                </button>
              </div>
            )}
          </section>
        )}
        {tab === "fornecedor" && (
          <section className="card">
            <h2>FORNECEDOR / PEDIDO / ENVIO OPERACIONAL</h2>
            {!activeLoad ? (
              <p>FORME OU ABRA UMA CARGA PRIMEIRO.</p>
            ) : (
              <>
                <div className="statusBar">
                  <b>{activeLoad.codigo}</b>
                  <span>{activeLoad.marca}</span>
                  <span>{(activeLoad.pesoKg / 1000).toFixed(1)} T</span>
                  <span>{activeLoad.fase}</span>
                </div>
                <div className="miniGrid">
                  <Field label="MATRIZ / FILIAL">
                    <select
                      value={unidade}
                      onChange={(e) => setUnidade(e.target.value)}
                    >
                      {data.unidades
                        .filter((x) => x.ativo !== false)
                        .map((x) => (
                          <option key={x.id} value={x.nome}>
                            {x.nome}
                            {x.cnpj ? ` — ${x.cnpj}` : ""}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Field label="LOCAL DE CARREGAMENTO">
                    <select
                      value={local}
                      onChange={(e) => setLocal(e.target.value)}
                    >
                      {data.locais
                        .filter((x) => x.ativo !== false)
                        .map((x) => (
                          <option key={x.id}>{x.nome}</option>
                        ))}
                    </select>
                  </Field>
                  <Field label="DATA DE CARREGAMENTO">
                    <input
                      type="date"
                      value={dataCarreg}
                      onChange={(e) => setDataCarreg(e.target.value)}
                    />
                  </Field>
                  <Field label="FORMA / CONDIÇÃO DE PAGAMENTO — OBRIGATÓRIA">
                    <select
                      value={condFornecedor}
                      onChange={(e) => setCondFornecedor(e.target.value)}
                    >
                      <option value="">SELECIONE...</option>
                      {data.pagamentos
                        .filter((x) => x.ativo !== false)
                        .map((x) => (
                          <option key={x.id}>{x.descricao}</option>
                        ))}
                    </select>
                  </Field>
                  <Field label="PALLETS">
                    <select
                      value={pallet}
                      onChange={(e) => setPallet(e.target.value)}
                    >
                      <option>SEM PALLETS</option>
                      <option>COM PALLETS</option>
                      <option>LEVA PALLETS</option>
                    </select>
                  </Field>
                  <Field label="MODALIDADE FRETE">
                    <select
                      value={frete}
                      onChange={(e) => setFrete(e.target.value)}
                    >
                      <option>FOB</option>
                      <option>CIF</option>
                    </select>
                  </Field>
                  <Field label="Nº DO PEDIDO DO FORNECEDOR">
                    <UpperInput
                      value={numeroPedido}
                      onChange={setNumeroPedido}
                      placeholder="EX.: 0005889402 / 41495341"
                    />
                  </Field>
                  <Field label="Nº DA OS DO FORNECEDOR">
                    <UpperInput
                      value={numeroOS}
                      onChange={setNumeroOS}
                      placeholder="EX.: SO41495369"
                    />
                  </Field>
                </div>
                <div className="supplierCostPreview">
                  <h3>PRODUTOS E CUSTOS DA MODALIDADE SELECIONADA</h3>
                  {(activeLoad.vendaIds || [])
                    .map((id) => data.vendas.find((v) => v.id === id))
                    .filter(Boolean)
                    .map((v) => {
                      const regra = custoFornecedor(
                        data,
                        v.produtoId,
                        condFornecedor,
                        v.marca,
                      );
                      const produto = data.produtos.find(
                        (p) => p.id === v.produtoId,
                      );
                      const custo = Number(
                        regra?.custoUnitario ||
                          v.custoCompraUnitario ||
                          produto?.valorBase ||
                          produto?.custoLiquidoSaco ||
                          0,
                      );
                      return (
                        <div key={v.id}>
                          <b>{v.produto}</b>
                          <span>{regra?.modalidadeCompra || condFornecedor || "SELECIONE A CONDIÇÃO"}</span>
                          <strong>{money(custo)} / SACO</strong>
                          <small>TOTAL: {money(custo * Number(v.qtd || 0))}</small>
                        </div>
                      );
                    })}
                  {norm(condFornecedor).includes("BANCO FIBRA") && (
                    <p className="note">
                      BANCO FIBRA: CUSTO CSN CP II 50 KG DE R$ 22,34 — ACRÉSCIMO
                      DE 1,55% SOBRE A COMPRA DIRETA DE R$ 22,00.
                    </p>
                  )}
                </div>
                <div className="transportBox">
                  <h3>FRETE / OUTRAS DESPESAS DO MOTORISTA</h3>
                  <div className="miniGrid">
                    <Field label="FORMA DO FRETE">
                      <select
                        value={freteTipo}
                        onChange={(e) => setFreteTipo(e.target.value)}
                        disabled={frete === "CIF"}
                      >
                        <option value="TOTAL">VALOR TOTAL</option>
                        <option value="SACO">R$ POR SACO</option>
                        <option value="TON">R$ POR TONELADA</option>
                      </select>
                    </Field>
                    <Field label="VALOR DO FRETE COMBINADO">
                      <input
                        type="number"
                        step="0.01"
                        value={frete === "CIF" ? 0 : freteValor}
                        disabled={frete === "CIF"}
                        onChange={(e) => setFreteValor(e.target.value)}
                      />
                    </Field>
                  </div>
                  {frete === "CIF" ? (
                    <p className="note">
                      FRETE CIF — INCLUSO NO CUSTO DO PRODUTO — NÃO SE APLICA.
                    </p>
                  ) : (
                    <>
                      <div className="extraList">
                        {extras.map((x, i) => (
                          <div key={i}>
                            <UpperInput
                              value={x.descricao}
                              onChange={(v) =>
                                setExtras((a) =>
                                  a.map((z, j) =>
                                    j === i ? { ...z, descricao: v } : z,
                                  ),
                                )
                              }
                              placeholder="EX.: PEDÁGIO / DESCARGA"
                            />
                            <input
                              type="number"
                              step="0.01"
                              value={x.valor}
                              onChange={(e) =>
                                setExtras((a) =>
                                  a.map((z, j) =>
                                    j === i
                                      ? { ...z, valor: e.target.value }
                                      : z,
                                  ),
                                )
                              }
                            />
                            <button
                              className="dangerBtn"
                              onClick={() =>
                                setExtras((a) => a.filter((_, j) => j !== i))
                              }
                            >
                              REMOVER
                            </button>
                          </div>
                        ))}
                      </div>
                      <button
                        className="ghost dark"
                        onClick={() =>
                          setExtras((a) => [...a, { descricao: "", valor: "" }])
                        }
                      >
                        + OUTRA DESPESA
                      </button>
                      <p className="note">
                        <b>TOTAL A PAGAR AO MOTORISTA:</b>{" "}
                        {money(
                          (freteTipo === "SACO"
                            ? Number(freteValor || 0) *
                              Number(activeLoad.qtd || 0)
                            : freteTipo === "TON"
                              ? Number(freteValor || 0) *
                                (Number(activeLoad.pesoKg || 0) / 1000)
                              : Number(freteValor || 0)) +
                            extras.reduce(
                              (s, x) => s + Number(x.valor || 0),
                              0,
                            ),
                        )}
                      </p>
                    </>
                  )}
                </div>
                <div className="sendOptions">
                  <label>
                    <input
                      type="checkbox"
                      checked={enviarWpp}
                      onChange={(e) => setEnviarWpp(e.target.checked)}
                    />{" "}
                    WHATSAPP
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={enviarEmail}
                      onChange={(e) => setEnviarEmail(e.target.checked)}
                    />{" "}
                    E-MAIL
                  </label>
                </div>
                <div className="supplierActions">
                  <button onClick={enviarPedidoFornecedor}>
                    GERAR / ENVIAR PEDIDO AO FORNECEDOR
                  </button>
                  <button
                    className="secondary"
                    onClick={incorporarNumeroPedido}
                  >
                    INCORPORAR PEDIDO / OS
                  </button>
                  <button
                    disabled={
                      !activeLoad.numeroPedidoFornecedor &&
                      !activeLoad.numeroOSFornecedor &&
                      !numeroPedido &&
                      !numeroOS
                    }
                    onClick={enviarOrdemMotorista}
                  >
                    GERAR / ENVIAR ORDEM AO MOTORISTA
                  </button>
                </div>
                <p className="note">
                  A ORDEM AO MOTORISTA É LIBERADA QUANDO HOUVER PELO MENOS UMA
                  REFERÊNCIA: NÚMERO DO PEDIDO OU NÚMERO DA OS.
                </p>
              </>
            )}
          </section>
        )}
        {tab === "conferencia" && (
          <section className="card">
            <h2>PAINEL DE NOTAS FISCAIS — CONFERÊNCIA E DESTINAÇÃO</h2>
            <BancoNotasFiscais
              data={data}
              onChange={setData}
              currentUser={currentUser}
              onDireta={(loadId) => setModal({ type: "distribute", loadId })}
            />
            {panelLoads.length === 0 ? (
              <p>NENHUMA CARGA ATIVA.</p>
            ) : (
              panelLoads.map((c) => (
                <Conferencia
                  key={c.id}
                  carga={c}
                  data={data}
                  status={(tipo) => docStatus(c, tipo)}
                  auditStatus={() => auditStatus(c)}
                  onAttach={attachDoc}
                  onIA={() => iaConferirEmails(c)}
                  onFinalize={() => gerarFinalizacao(c)}
                />
              ))
            )}
          </section>
        )}
        {tab === "financeiro" && (
          <section className="card">
            <h2>FINANCEIRO DA CARGA</h2>
            <ContaCorrenteFornecedores
              data={data}
              onChange={setData}
              currentUser={currentUser}
            />
            {panelLoads.map((c) => (
              <div className="financialRow" key={c.id}>
                <b>{c.codigo}</b>
                <span>{c.marca}</span>
                <span>{(c.pesoKg / 1000).toFixed(1)} T</span>
                <span>
                  {c.status === "AZUL" ? "FINALIZADA" : "COM PENDÊNCIAS"}
                </span>
              </div>
            ))}
          </section>
        )}
        {tab === "cadastros" && (
          <section className="card">
            <div className="sectionHead">
              <div>
                <h2>CADASTROS</h2>
                <p>CADASTROS OPERACIONAIS E CONFIGURAÇÕES PROTEGIDAS.</p>
              </div>
              {isMaster && (
                <div className="cadRowActions">
                  <button className="dangerBtn" onClick={limparHomologacao}>
                    LIMPAR DADOS DE HOMOLOGAÇÃO
                  </button>
                  <button className="ghost dark" onClick={resetAll}>
                    RESTAURAR BASE TESTE
                  </button>
                </div>
              )}
            </div>
            <div className="cadGrid">
              {[
                ["clientes", "CLIENTES"],
                ["produtos", "PRODUTOS"],
                ["fornecedores", "FORNECEDORES / MARCAS"],
                ["motoristas", "MOTORISTAS / VEÍCULOS"],
    ...(isAdmin
                  ? [["funcionarios", "FUNCIONÁRIOS E PERMISSÕES"]]
                  : []),
                ...(isMaster
                  ? [
                      ["pagamentos", "FORMAS DE PAGAMENTO"],
                      ["unidades", "UNIDADES / FILIAIS"],
                      ["locais", "LOCAIS DE CARREGAMENTO"],
                      ["rotas", "ROTAS / DESTINOS"],
                      ["fretesVendaBalcao", "FRETES — VENDA BALCÃO"],
                      ["caixasEmail", "CAIXAS DE E-MAIL DA IA"],
                    ]
                  : []),
              ].map(([k, t]) => (
                <button
                  key={k}
                  onClick={() => {
                    if (k === "funcionarios") {
                      setModal({ type: "funcionarios" });
                      return;
                    }
                    setCadType(k);
                    setCadSearch("");
                    setModal({ type: "cad" });
                  }}
                >
                  <b>{t}</b>
                  <small>NOVO • EDITAR • ATIVAR/DESATIVAR</small>
                </button>
              ))}
              {isMaster && (
                <>
                  <button onClick={() => setTab("parametrosFinanceiros")}>
                    <b>PARAMETRIZAÇÃO FINANCEIRA — MASTER</b>
                    <small>CAIXA • CONTAS A RECEBER • CONCILIAÇÃO</small>
                  </button>
                  <button onClick={() => setModal({ type: "integracoes" })}>
                    <b>INTEGRAÇÕES — GMAIL / WHATSAPP</b>
                    <small>CONEXÃO • SINCRONIZAÇÃO • STATUS</small>
                  </button>
                  <button
                    onClick={() => setModal({ type: "integracoesFinanceiras" })}
                  >
                    <b>INTEGRAÇÕES — BANCOS / CARTÕES</b>
                    <small>CONTAS • OPEN FINANCE • IMPORTAÇÃO</small>
                  </button>
                </>
              )}
            </div>
            {!isMaster && (
              <div className="alert warn">
                CONFIGURAÇÕES ESTRUTURAIS EXIGEM USUÁRIO MASTER.
              </div>
            )}
          </section>
        )}
        {tab === "parametrosFinanceiros" && (
          <PaymentSettingsV47
            data={data}
            onChange={setData}
            currentUser={currentUser}
            onClose={() => setTab("cadastros")}
          />
        )}
        {tab === "paletes" && (
          <PalletsV47
            data={data}
            onChange={setData}
            audit={audit}
            currentUser={currentUser}
          />
        )}
        {tab === "balcao" && (
          <Balcao data={data} onChange={setData} currentUser={currentUser} onOpenBoleto={() => setModal({ type: "emissorBoletos", canal: "VENDA BALCÃO" })} />
        )}
        {tab === "externas" && (
          <VendasExternas
            data={data}
            onChange={setData}
            currentUser={currentUser}
          />
        )}
        {tab === "estoque" && <Estoque data={data} onChange={setData} />}
        {tab === "preConferencia" && (
          <PreConferenciaBoletos data={data} onChange={setData} currentUser={currentUser} />
        )}
        {tab === "saude" && <SaudeFinanceira data={data} onChange={setData} />}
        {tab === "relatorios" && <Relatorios data={data} />}
        {tab === "planejamento" && (
          <PlanejamentoCargas
            data={data}
            onChange={setData}
            currentUser={currentUser}
          />
        )}
        {tab === "todasCargas" && (
          <TodasCargas
            data={data}
            onChange={setData}
            currentUser={currentUser}
            audit={audit}
          />
        )}
        {tab === "compraForte" && (
          <section className="card">
            <div className="sectionHead">
              <div>
                <h2>COMPRA FORTE</h2>
                <p>REPOSIÇÃO DE ESTOQUE E CARGAS MISTAS.</p>
              </div>
              <button onClick={() => setModal({ type: "compraForte" })}>
                + NOVA COMPRA FORTE
              </button>
            </div>
          </section>
        )}
        {tab === "contasPagar" && (
          <section className="card">
            <div className="sectionHead">
              <div>
                <h2>CONTAS A PAGAR</h2>
                <p>FORNECEDORES, TÍTULOS, VENCIMENTOS, COMPROVANTES E BAIXAS.</p>
              </div>
            </div>
            <h3>LIMITES DOS FORNECEDORES</h3>
            <div className="limits">
              {data.fornecedores
                .filter(
                  (f) =>
                    f.ativo !== false && !norm(f.nome).includes("votorantim"),
                )
                .map((f) => {
                  const c = supplierCredit(f.nome);
                  return (
                    <div key={f.id}>
                      <b>{f.nome}</b>
                      <span>TOTAL {money(c.total)}</span>
                      <span>UTILIZADO {money(c.used)}</span>
                      <span>DISPONÍVEL {money(c.available)}</span>
                    </div>
                  );
                })}
              <div>
                <b>VOTORANTIM — TOCANTINS / ITAÚ</b>
                <span>LIMITE COMPARTILHADO {money(225000)}</span>
                <span>
                  UTILIZADO {money(supplierCredit("VOTORANTIM").used)}
                </span>
                <span>
                  DISPONÍVEL {money(supplierCredit("VOTORANTIM").available)}
                </span>
              </div>
            </div>
            <h3>TÍTULOS A PAGAR</h3>
            {data.contasPagar.map((t) => (
              <div className="titleRow" key={t.id}>
                <b>{t.fornecedor}</b>
                <span>{t.motorista || t.carga || "-"}</span>
                <span>{t.titulo || "-"}</span>
                <span>{money(t.valor)}</span>
                <span>{formatDateBR(t.emissao)}</span>
                <span>{formatDateBR(t.vencimento)}</span>
                <span>{t.status}</span>
                <button
                  disabled={upper(t.status).includes("CONCILIADO")}
                  onClick={() => markPaid(t.id)}
                >
                  ANEXAR COMPROVANTE
                </button>
                {t.comprovanteDocumentoId &&
                  !upper(t.status).includes("LIQUIDADO") &&
                  !upper(t.status).includes("PAGO") &&
                  !upper(t.status).includes("CONCILIADO") && (
                    <button onClick={() => liquidarTitulo(t.id)}>
                      LIQUIDAR TÍTULO
                    </button>
                  )}
              </div>
            ))}
            <h3>RELATÓRIO POR PERÍODO</h3>
            <div className="reportBar">
              <label>
                DE{" "}
                <input
                  type="date"
                  value={reportStart}
                  onChange={(e) => setReportStart(e.target.value)}
                />
              </label>
              <label>
                ATÉ{" "}
                <input
                  type="date"
                  value={reportEnd}
                  onChange={(e) => setReportEnd(e.target.value)}
                />
              </label>
              <button
                className="ghost dark"
                onClick={() => {
                  setReportStart(todayISO());
                  setReportEnd(todayISO());
                }}
              >
                HOJE
              </button>
              <button onClick={() => dailyPdf("PAGAR")}>
                GERAR PDF — CONTAS A PAGAR
              </button>
            </div>
            <p className="note">
              <b>PERÍODO SELECIONADO:</b> {periodLabel(reportStart, reportEnd)}
            </p>
            <Daily data={{ pagar: dailyRows().pagar, receber: [], vencidos: dailyRows().vencidos.filter((x) => data.contasPagar.some((t) => t.id === x.id)), liquidados: dailyRows().liquidados.filter((x) => data.contasPagar.some((t) => t.id === x.id)) }} />
          </section>
        )}
        {tab === "contasReceber" && (
          <section className="card">
            <div className="sectionHead"><div><h2>CONTAS A RECEBER</h2><p>CLIENTES, PARCELAS, VENCIMENTOS, RECEBIMENTOS E LIQUIDAÇÕES.</p></div></div>
            <div className="titleList">
              {data.contasReceber.map((t) => <div className="titleRow" key={t.id}><b>{t.cliente || t.origem || "CLIENTE"}</b><span>{t.numeroVenda || t.carga || "-"}</span><span>{t.titulo || t.nf || "-"}</span><span>{money(t.valor)}</span><span>{formatDateBR(t.emissao)}</span><span>{formatDateBR(t.vencimento)}</span><span>{t.status || "ABERTO"}</span></div>)}
              {!data.contasReceber.length && <p className="muted">NENHUMA CONTA A RECEBER CADASTRADA.</p>}
            </div>
            <h3>RELATÓRIO POR PERÍODO</h3>
            <div className="reportBar"><label>DE <input type="date" value={reportStart} onChange={(e) => setReportStart(e.target.value)} /></label><label>ATÉ <input type="date" value={reportEnd} onChange={(e) => setReportEnd(e.target.value)} /></label><button className="ghost dark" onClick={() => { setReportStart(todayISO()); setReportEnd(todayISO()); }}>HOJE</button><button onClick={() => dailyPdf("RECEBER")}>GERAR PDF — CONTAS A RECEBER</button></div>
            <p className="note"><b>PERÍODO SELECIONADO:</b> {periodLabel(reportStart, reportEnd)}</p>
            <Daily data={{ pagar: [], receber: dailyRows().receber, vencidos: dailyRows().vencidos.filter((x) => data.contasReceber.some((t) => t.id === x.id)), liquidados: dailyRows().liquidados.filter((x) => data.contasReceber.some((t) => t.id === x.id)) }} />
          </section>
        )}
        {tab === "itau" && (
          <section className="card">
            <div className="sectionHead"><div><h2>BANCO ITAÚ</h2><p>CENTRAL EXCLUSIVA DE COBRANÇA: BOLETOS, CNAB, MOVIMENTAÇÕES, LIQUIDAÇÕES, BAIXAS E FRANCESINHA.</p></div></div>
            <RecebiveisItau data={data} onChange={setData} />
            <FrancesinhaItau data={data} />
            <ItauPagamentos data={data} onChange={setData} currentUser={currentUser} />
          </section>
        )}
        {tab === "infinitePay" && <InfinitePay data={data} onChange={setData} currentUser={currentUser} />}
        {tab === "painelVendas" && <SalesPanel data={data} />}
        {tab === "painelBalcao" && <CounterSalesPanel data={data} />}
      </main>
      {modal?.type === "ajudaIa" && (
        <AjudaIa
          tab={modal.tab}
          onClose={() => setModal(null)}
          onNavigate={(t) => {
            setModal(null);
            setTab(t);
          }}
        />
      )}{" "}
      {modal?.type === "compraForte" && (
        <NewCompraForte
          data={data}
          onClose={() => setModal(null)}
          onSave={addCompraForte}
        />
      )}{" "}
      {modal?.type === "sale" && (
        <NewSale
          data={data}
          onClose={() => setModal(null)}
          onSave={addSale}
          onDataChange={setData}
        />
      )}{" "}
      {modal?.type === "editSale" && (
        <EditSale
          sale={data.vendas.find((v) => v.id === modal.saleId)}
          data={data}
          onClose={() => setModal(null)}
          onSave={(nv) => {
            setData((d) => ({
              ...d,
              vendas: d.vendas.map((v) => (v.id === nv.id ? nv : v)),
              cargas: d.cargas.map((c) => {
                if (!(c.vendaIds || []).includes(nv.id)) return c;
                const vs = d.vendas
                  .map((v) => (v.id === nv.id ? nv : v))
                  .filter((v) => (c.vendaIds || []).includes(v.id));
                return {
                  ...c,
                  pesoKg: vs.reduce((s, v) => s + Number(v.pesoKg || 0), 0),
                  qtd: vs.reduce((s, v) => s + Number(v.qtd || 0), 0),
                  status: "VERMELHO",
                  fase: "REVALIDAÇÃO APÓS EDIÇÃO DA VENDA",
                };
              }),
            }));
            setModal(null);
          }}
        />
      )}{" "}
      {modal?.type === "load" && (
        <LoadModal
          carga={data.cargas.find((c) => c.id === modal.loadId)}
          data={data}
          onClose={() => setModal(null)}
          onDistribute={() =>
            setModal({ type: "distribute", loadId: modal.loadId })
          }
          onGo={(t) => {
            setActiveLoadId(modal.loadId);
            setModal(null);
            setTab(t);
          }}
        />
      )}{" "}
      {modal?.type === "distribute" && (
        <DistribuirCargaModal
          carga={data.cargas.find((c) => c.id === modal.loadId)}
          data={data}
          currentUser={currentUser}
          onChange={setData}
          onClose={() => setModal(null)}
        />
      )}{" "}
      {modal?.type === "cad" && (
        <CadModal
          type={cadType}
          data={data}
          search={cadSearch}
          setSearch={setCadSearch}
          onClose={() => setModal(null)}
          onChange={setData}
          isAdmin={isAdmin}
        />
      )}{" "}
      {modal?.type === "cadastroIa" && (
        <CadastroIaModal
          data={data}
          onChange={setData}
          currentUser={currentUser}
          onClose={() => setModal(null)}
        />
      )}{" "}
      {modal?.type === "funcionarios" && (
        <EmployeesV654 data={data} onChange={setData} currentUser={currentUser} onClose={() => setModal(null)} />
      )}{" "}
      {modal?.type === "integracoes" && (
        <Integracoes
          data={data}
          onChange={setData}
          onClose={() => setModal(null)}
          audit={audit}
        />
      )}{" "}
      {modal?.type === "integracoesFinanceiras" && (
        <IntegracoesFinanceiras
          data={data}
          onChange={setData}
          onClose={() => setModal(null)}
        />
      )}{" "}
      {modal?.type === "emissorBoletos" && (
        <EmissorBoletosVenda
          data={data}
          onChange={setData}
          canal={modal.canal}
          currentUser={currentUser}
          onClose={() => setModal(null)}
        />
      )}{" "}
      {modal?.type === "proof" && (
        <ProofModal
          titleId={modal.titleId}
          onClose={() => setModal(null)}
          onSave={doProofPayment}
        />
      )}{" "}
    </div>
  );
}

function pdfSimple(title, lines, file) {
  const doc = new jsPDF();
  let y = 16;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("FORTE ATACAREJO", 105, y, { align: "center" });
  y += 8;
  doc.setFontSize(13);
  doc.text(title, 105, y, { align: "center" });
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`RELATÓRIO GERADO EM: ${stamp()}`, 105, y, { align: "center" });
  y += 9;
  for (const line of lines) {
    doc.setDrawColor(190);
    doc.rect(12, y - 4, 186, 8);
    doc.setFontSize(9);
    const txt = doc.splitTextToSize(String(line), 180);
    doc.text(txt, 15, y);
    y += Math.max(8, txt.length * 4.5 + 3);
    if (y > 278) {
      doc.addPage();
      y = 18;
    }
  }
  doc.save(file);
}
function pdfTabela(title, headers, rows, file, summary = []) {
  const doc = new jsPDF({ orientation: "landscape" });
  const W = 297,
    margin = 10,
    usable = W - margin * 2;
  let y = 13;
  const widths = headers.map((h) => Number(h.w || 1)),
    sum = widths.reduce((a, b) => a + b, 0),
    cols = widths.map((w) => (usable * w) / sum);
  const header = () => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("FORTE ATACAREJO", W / 2, y, { align: "center" });
    y += 7;
    doc.setFontSize(13);
    doc.text(title, W / 2, y, { align: "center" });
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(`EMITIDO EM ${stamp()} • ${rows.length} REGISTRO(S)`, W / 2, y, {
      align: "center",
    });
    y += 7;
    doc.setFillColor(245, 247, 250);
    doc.setDrawColor(80, 80, 80);
    doc.setTextColor(0, 0, 0);
    let x = margin;
    headers.forEach((h, i) => {
      doc.rect(x, y, cols[i], 11, "FD");
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      const hl = doc.splitTextToSize(String(h.label), cols[i] - 3);
      doc.text(hl, x + 1.5, y + 4.2);
      x += cols[i];
    });
    doc.setTextColor(0, 0, 0);
    y += 11;
  };
  header();
  doc.setFont("helvetica", "normal");
  for (const row of rows) {
    const cells = headers.map((h) =>
      String(typeof h.get === "function" ? h.get(row) : (row[h.key] ?? "-")),
    );
    const lines = cells.map((v, i) => doc.splitTextToSize(v, cols[i] - 4));
    const rh = Math.max(9, ...lines.map((a) => a.length * 4 + 3));
    if (y + rh > 195) {
      doc.addPage();
      y = 13;
      header();
    }
    let x = margin;
    cells.forEach((v, i) => {
      doc.rect(x, y, cols[i], rh);
      doc.setFontSize(9.5);
      doc.text(lines[i], x + 2, y + 5.8);
      x += cols[i];
    });
    y += rh;
  }
  if (summary.length) {
    y += 5;
    if (y > 185) {
      doc.addPage();
      y = 18;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    summary.forEach((t) => {
      doc.text(String(t), margin, y);
      y += 6;
    });
  }
  doc.save(file);
}
function Balcao({ data, onChange, currentUser, onOpenBoleto }) {
  const unidades = data.unidades || [],
    clientes = data.clientes || [],
    produtos = data.produtos || [],
    motoristas = (data.motoristas || []).filter(
      (m) => m.ativo !== false && motoristaServe(m, "ENTREGA"),
    ),
    pagamentos = data.pagamentos || [];
  const [unidade, setUnidade] = useState(
    unidades?.[1]?.nome || unidades?.[0]?.nome || "",
  );
  const [clienteId, setClienteId] = useState("");
  const [produtoId, setProdutoId] = useState("");
  const [qtd, setQtd] = useState("");
  const BALCAO_DRAFT_KEY = "forte-vendas-balcao-itens-rascunho-v628";
  const [itens, setItens] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(BALCAO_DRAFT_KEY) || "[]");
    } catch {
      return [];
    }
  });
  const [itensConfirmados, setItensConfirmados] = useState(false);
  const [pag, setPag] = useState("A VISTA");
  const [entrega, setEntrega] = useState("SEM ENTREGA");
  const [motoristaId, setMotoristaId] = useState("");
  const [destinoEntrega, setDestinoEntrega] = useState("");
  const [responsavelFrete, setResponsavelFrete] = useState("FORTE ATACAREJO");
  const [situacaoPallets, setSituacaoPallets] = useState("");
  const [palletsForte, setPalletsForte] = useState("");
  const [palletsCliente, setPalletsCliente] = useState("");
  const [justificativaPallets, setJustificativaPallets] = useState("");
  const [saldoInicial, setSaldoInicial] = useState("");
  const [buscaOrcamento, setBuscaOrcamento] = useState("");
  const [filtroOrcCliente, setFiltroOrcCliente] = useState("");
  const [filtroOrcNumero, setFiltroOrcNumero] = useState("");
  const [filtroOrcProduto, setFiltroOrcProduto] = useState("");
  const [filtroOrcStatus, setFiltroOrcStatus] = useState("EM ABERTO");
  const [filtroOrcInicio, setFiltroOrcInicio] = useState("");
  const [filtroOrcFim, setFiltroOrcFim] = useState("");
  const [clienteRelatorioId, setClienteRelatorioId] = useState("");
  const [opsClienteSelecionadas, setOpsClienteSelecionadas] = useState([]);
  const [editVendaId, setEditVendaId] = useState("");
  const vendas = data.vendasBalcao || [];
  const caixas = data.caixasBalcao || [];
  const c = clientes.find((x) => x.id === clienteId),
    p = produtos.find((x) => x.id === produtoId);
  const motoristaEntregaSelecionado = motoristas.find(
    (x) => x.id === motoristaId,
  );
  const obraEntregaSelecionada = (c?.obras || []).find(
    (o) =>
      `${o.nome} — ${o.endereco || ""} ${o.cidade || ""}/${o.uf || ""}` ===
      destinoEntrega,
  );
  const enderecoPrincipalCliente = (cliente) =>
    [
      [cliente?.logradouro || cliente?.endereco, cliente?.numero]
        .filter(Boolean)
        .join(", "),
      cliente?.bairro,
      [cliente?.cidade, cliente?.uf].filter(Boolean).join("/")
    ]
      .filter(Boolean)
      .join(" — ");
  const enderecoCompletoEntrega = (v = null) => {
    if (v?.enderecoEntrega) return v.enderecoEntrega;
    const cliente = v
      ? clientes.find((x) => x.id === v.clienteId) || c
      : c;
    const destino = v?.destinoEntrega || destinoEntrega;
    const obra = (cliente?.obras || []).find(
      (o) =>
        destino ===
        `${o.nome} — ${o.endereco || ""} ${o.cidade || ""}/${o.uf || ""}`,
    );
    return upper(
      obra
        ? `${obra.nome || "OBRA"} — ${obra.endereco || ""} — ${obra.cidade || ""}${obra.uf ? `/${obra.uf}` : ""}`
        : destino || enderecoPrincipalCliente(cliente) || "NÃO INFORMADO",
    );
  };
  const regra = (data.precosClientes || []).find(
    (x) => x.clienteId === clienteId && x.produtoId === produtoId,
  );
  const tabela = Number(p?.precoTabela || 0),
    desconto = Number(regra?.descontoPct || 0),
    preco = tabela * (1 - desconto / 100),
    min = Number(p?.precoMinimo || 0);
  const tabelaFretes = data.fretesVendaBalcao || [];
  const regraFrete = tabelaFretes.find(
    (x) =>
      x.ativo !== false &&
      x.produtoId === produtoId &&
      (!x.unidade || x.unidade === "GERAL" || x.unidade === unidade),
  );
  const tarifa = Number(regraFrete?.valorPorSaco ?? p?.freteBalcaoPorSaco ?? 0);
  const caixaAberto = caixas.find(
    (x) =>
      x.unidade === unidade && x.data === todayISO() && x.status === "ABERTO",
  );
  const palletsSugeridos = itens.reduce((total, it) => {
    const prod = produtos.find((x) => x.id === it.produtoId) || {};
    const nome = upper(`${it.produto || ""} ${prod.nome || ""}`);
    const porPallet = /EXTRA FORTE|40\s*KG/.test(nome) ? 50 : 40;
    return total + Math.ceil(Number(it.qtd || 0) / porPallet);
  }, 0);
  const orcamentoCarregado = vendas.find(
    (v) =>
      normalizarNumeroOrcamento(v.numeroOrcamento || v.id) ===
        normalizarNumeroOrcamento(buscaOrcamento) &&
      ["ORÇAMENTO", "PARCIALMENTE ATENDIDO"].includes(v.status),
  );
  function validarPallets() {
    if (!situacaoPallets)
      return alert(
        `NÃO É POSSÍVEL GRAVAR. SELECIONE A SITUAÇÃO DOS PALLETS.\n\nSUGESTÃO PARA ESTA OPERAÇÃO: ${palletsSugeridos} PALLET(S).`,
      );
    const forte = Number(palletsForte || 0);
    const cliente = Number(palletsCliente || 0);
    if (situacaoPallets === "COM PALLETS" && forte <= 0)
      return alert("INFORME QUANTOS PALLETS SERÃO EMPRESTADOS PELA FORTE.");
    if (situacaoPallets === "CLIENTE LEVOU OS PALLETS" && cliente <= 0)
      return alert("INFORME QUANTOS PALLETS O CLIENTE LEVOU.");
    if (forte + cliente !== palletsSugeridos && !justificativaPallets.trim())
      return alert(
        `A OPERAÇÃO SUGERE ${palletsSugeridos} PALLET(S), MAS FORAM INFORMADOS ${forte + cliente}. INFORME A JUSTIFICATIVA PARA CONTINUAR.`,
      );
    return true;
  }
  useEffect(() => {
    try {
      localStorage.setItem(BALCAO_DRAFT_KEY, JSON.stringify(itens));
    } catch {}
  }, [itens]);
  function addItem() {
    if (!p || !qtd || Number(qtd) <= 0)
      return alert("SELECIONE PRODUTO E QUANTIDADE.");
    if (min && preco < min)
      return alert(
        "PREÇO AUTORIZADO ABAIXO DO MÍNIMO. SOLICITE O ADMINISTRADOR.",
      );
    setItens((a) => [
      ...a,
      {
        id: uid("it"),
        produtoId: p.id,
        produto: p.nome,
        marca: p.marca || "",
        qtd: Number(qtd),
        precoTabela: tabela,
        descontoPct: desconto,
        precoUnitario: preco,
        subtotal: Number(qtd) * preco,
        tarifaFreteSaco: tarifa,
        frete: entrega === "COM ENTREGA" ? Number(qtd) * tarifa : 0,
      },
    ]);
    setItensConfirmados(false);
    setProdutoId("");
    setQtd("");
  }
  const subtotal = itens.reduce((s, x) => s + Number(x.subtotal || 0), 0),
    frete =
      entrega === "COM ENTREGA"
        ? itens.reduce((s, x) => s + Number(x.frete || 0), 0)
        : 0,
    fretePreview = frete,
    subtotalPreview = subtotal,
    effectiveItems = itens,
    freteCobradoPelaForte =
      entrega === "COM ENTREGA" && responsavelFrete === "FORTE ATACAREJO"
        ? frete
        : 0,
    total = subtotal + freteCobradoPelaForte;
  function abrirCaixa() {
    if (caixaAberto)
      return alert("JÁ EXISTE UM CAIXA ABERTO PARA ESTA UNIDADE HOJE.");
    onChange((d) => ({
      ...d,
      caixasBalcao: [
        ...(d.caixasBalcao || []),
        {
          id: uid("cx"),
          data: todayISO(),
          unidade,
          operador: currentUser?.nome || "",
          abertoEm: new Date().toISOString(),
          saldoInicial: Number(saldoInicial || 0),
          status: "ABERTO",
        },
      ],
    }));
    setSaldoInicial("");
    alert("CAIXA ABERTO.");
  }
  function conferirCaixa() {
    if (!caixaAberto) return alert("NÃO HÁ CAIXA ABERTO PARA CONFERIR.");
    const vv = (data.vendasBalcao || []).filter(
      (v) =>
        v.caixaId === caixaAberto.id &&
        v.status === "CONCLUÍDA" &&
        v.regraPagamento?.entraCaixa !== false,
    );
    const totalVendas = vv.reduce((s, v) => s + Number(v.total || 0), 0);
    const porForma = vv.reduce(
      (a, v) => (
        (a[v.pagamento] = (a[v.pagamento] || 0) + Number(v.total || 0)),
        a
      ),
      {},
    );
    const dinheiro = Number(porForma["DINHEIRO"] || porForma["A VISTA"] || 0);
    const saldoEsperado = Number(caixaAberto.saldoInicial || 0) + dinheiro;
    const geradaEm = nowISO();
    const snapshot = {
      ...caixaAberto,
      preConferencia: true,
      preConferidaEm: geradaEm,
      totalVendas,
      porForma,
      vendaIds: vv.map((v) => v.id),
      saldoEsperado,
      creditosClientesSnapshot: (data.clientes || [])
        .map((cli) => ({
          clienteId: cli.id,
          cliente: cli.nome,
          saldo: (data.creditosClientes || [])
            .filter(
              (cr) => cr.clienteId === cli.id && cr.status !== "UTILIZADO",
            )
            .reduce((a, cr) => a + Number(cr.saldo ?? cr.valor ?? 0), 0),
        }))
        .filter((cr) => cr.saldo > 0),
    };
    onChange((d) => ({
      ...d,
      caixasBalcao: (d.caixasBalcao || []).map((x) =>
        x.id === caixaAberto.id
          ? {
              ...x,
              ultimaPreConferenciaEm: geradaEm,
              preConferencias: [
                ...(x.preConferencias || []),
                {
                  id: uid("preconf"),
                  geradaEm,
                  geradaPor: currentUser?.nome || "",
                  totalVendas,
                  saldoEsperado,
                  vendaIds: vv.map((v) => v.id),
                },
              ],
            }
          : x,
      ),
    }));
    pdfCaixaAnalitico(snapshot);
    alert(
      "PRÉ-CONFERÊNCIA GERADA. O CAIXA CONTINUA ABERTO E AS CORREÇÕES PERMITIDAS PODEM SER FEITAS ANTES DO FECHAMENTO DEFINITIVO.",
    );
  }
  function fecharCaixa() {
    if (!caixaAberto) return alert("NÃO HÁ CAIXA ABERTO PARA ESTA UNIDADE.");
    const vv = (data.vendasBalcao || []).filter(
      (v) =>
        v.caixaId === caixaAberto.id &&
        v.status === "CONCLUÍDA" &&
        v.regraPagamento?.entraCaixa !== false,
    );
    const totalVendas = vv.reduce((s, v) => s + Number(v.total || 0), 0);
    const porForma = vv.reduce(
      (a, v) => (
        (a[v.pagamento] = (a[v.pagamento] || 0) + Number(v.total || 0)),
        a
      ),
      {},
    );
    const dinheiro = Number(porForma["DINHEIRO"] || porForma["A VISTA"] || 0);
    const saldoEsperado = Number(caixaAberto.saldoInicial || 0) + dinheiro;
    const informado = prompt(
      `FECHAMENTO DE CAIXA\n\nTOTAL DE VENDAS: ${money(totalVendas)}\nDINHEIRO NO CAIXA ESPERADO: ${money(saldoEsperado)}\n\nINFORME O SALDO FÍSICO / CONTADO:`,
    );
    if (informado === null) return;
    const saldoContado = Number(String(informado).replace(",", "."));
    if (Number.isNaN(saldoContado)) return alert("SALDO CONTADO INVÁLIDO.");
    const diferenca = saldoContado - saldoEsperado;
    let justificativa = "";
    if (Math.abs(diferenca) > 0.009) {
      justificativa = upper(
        prompt(
          `DIVERGÊNCIA DE ${money(diferenca)}. INFORME A JUSTIFICATIVA:`,
        ) || "",
      );
      if (!justificativa)
        return alert(
          "FECHAMENTO NÃO CONFIRMADO: JUSTIFICATIVA OBRIGATÓRIA PARA DIVERGÊNCIA.",
        );
    }
    if (
      !confirm(
        `ATENÇÃO — FECHAMENTO DE CAIXA\n\nTOTAL DE VENDAS: ${money(totalVendas)}\nSALDO ESPERADO: ${money(saldoEsperado)}\nSALDO CONTADO: ${money(saldoContado)}\nDIFERENÇA: ${money(diferenca)}\n\nDESEJA CONFIRMAR O FECHAMENTO?`,
      )
    )
      return;
    const fechadoEm = new Date().toISOString();
    onChange((d) => ({
      ...d,
      caixasBalcao: (d.caixasBalcao || []).map((x) =>
        x.id === caixaAberto.id
          ? {
              ...x,
              status: "FECHADO",
              fechadoEm,
              fechadoPor: currentUser?.nome || "",
              totalVendas,
              porForma,
              vendaIds: vv.map((v) => v.id),
              saldoEsperado,
              saldoContado,
              diferenca,
              justificativa,
              estoqueSnapshot: (d.produtos || []).map((p) => {
                const movimentos = (d.estoqueMov || []).filter((m) =>
                  m.produtoId === p.id &&
                  (!m.unidade || m.unidade === caixaAberto.unidade) &&
                  String(m.dataHora || (m.data ? m.data + "T12:00:00" : "")) <= fechadoEm
                );
                const abertura = String(caixaAberto.abertoEm || caixaAberto.data + "T00:00:00");
                const noDia = movimentos.filter((m) => String(m.dataHora || (m.data ? m.data + "T12:00:00" : "")) >= abertura);
                const saldoFinal = buildStockLedger(d, caixaAberto.unidade, p.id).filter((m) =>
                  String(m.dataHora || (m.data ? m.data + "T12:00:00" : "")) <= fechadoEm
                ).at(-1)?.saldo || 0;
                const entradas = noDia.filter((m) => String(m.tipo||"").startsWith("ENTRADA")).reduce((a,m)=>a+Number(m.quantidade||0),0);
                const saidas = noDia.filter((m) => String(m.tipo||"").startsWith("SAÍDA")).reduce((a,m)=>a+Number(m.quantidade||0),0);
                const ajustes = noDia.filter((m) => !String(m.tipo||"").startsWith("ENTRADA") && !String(m.tipo||"").startsWith("SAÍDA")).reduce((a,m)=>a+Number(m.ajuste??m.quantidade??0),0);
                return {produtoId:p.id,produto:p.nome,marca:p.marca,saldoInicial:saldoFinal-entradas+saidas-ajustes,entradas:entradas+Math.max(0,ajustes),saidas:saidas+Math.max(0,-ajustes),saldoFinal};
              }).filter((p)=>p.saldoInicial||p.entradas||p.saidas||p.saldoFinal),
              titulosSnapshot: {
                receber: (d.contasReceber || []).filter(t=>t.vencimento===caixaAberto.data).map(t=>({id:t.id,cliente:t.cliente||t.titulo,valor:t.valor,status:t.status})),
                pagar: (d.contasPagar || []).filter(t=>t.vencimento===caixaAberto.data && (!t.preConferenciaId || (d.preConferenciaBoletos||[]).some(b=>b.id===t.preConferenciaId && b.status==="INCORPORADO AO CONTAS A PAGAR"))).map(t=>({id:t.id,fornecedor:t.fornecedor,valor:t.valor,status:t.status}))
              },
              creditosClientesSnapshot: (d.clientes || [])
                .map((cli) => ({
                  clienteId: cli.id,
                  cliente: cli.nome,
                  saldo: (d.creditosClientes || [])
                    .filter(
                      (cr) =>
                        cr.clienteId === cli.id && cr.status !== "UTILIZADO",
                    )
                    .reduce(
                      (a, cr) => a + Number(cr.saldo ?? cr.valor ?? 0),
                      0,
                    ),
                }))
                .filter((cr) => cr.saldo > 0),
            }
          : x,
      ),
    }));
    alert(
      "CAIXA FECHADO E GRAVADO NO HISTÓRICO. O SALDO DE CRÉDITOS DOS CLIENTES FOI CONGELADO NESTE FECHAMENTO.",
    );
  }
  function numeroOrcamento() {
    const ano = new Date().getFullYear();
    const seq = Number(data.settings?.nextOrcamentoSeq || 1);
    return `ORC-${ano}-${String(seq).padStart(6, "0")}`;
  }
  function proximoNumeroVenda() {
    const ano = new Date().getFullYear();
    const seq = Number(data.settings?.nextVendaSeq || 1);
    return `VEN-${ano}-${String(seq).padStart(6, "0")}`;
  }
  function normalizarNumeroOrcamento(v) {
    return upper(String(v || ""))
      .replace(/\s+/g, "")
      .replace(/[^A-Z0-9]/g, "");
  }
  function carregarOrcamento(escolhido = null) {
    const q = buscaOrcamento.trim();
    if (!escolhido && !q)
      return alert(
        "DIGITE O NÚMERO DO ORÇAMENTO OU SELECIONE UM ORÇAMENTO NA LISTA.",
      );
    let o = escolhido;
    if (!o) {
      const chave = normalizarNumeroOrcamento(q);
      const todos = vendas.filter(
        (v) => v.numeroOrcamento || String(v.id || "").startsWith("ORC"),
      );
      const exato = todos.find(
        (v) => normalizarNumeroOrcamento(v.numeroOrcamento || v.id) === chave,
      );
      if (exato) o = exato;
      else {
        const candidatos = todos.filter((v) =>
          normalizarNumeroOrcamento(v.numeroOrcamento || v.id).includes(chave),
        );
        if (candidatos.length === 1) o = candidatos[0];
        else if (candidatos.length > 1) {
          const lista = candidatos
            .slice(0, 8)
            .map(
              (v) =>
                `${v.numeroOrcamento || v.id} — ${v.cliente || "SEM CLIENTE"} — ${v.status || ""}`,
            )
            .join("\n");
          return alert(
            `MAIS DE UM ORÇAMENTO ENCONTRADO. COMPLETE O NÚMERO OU USE A LISTA DE ORÇAMENTOS ABAIXO:\n\n${lista}`,
          );
        }
      }
    }
    if (!o) {
      const proximo = normalizarNumeroOrcamento(numeroOrcamento());
      if (normalizarNumeroOrcamento(q) === proximo)
        return alert(
          `O NÚMERO ${numeroOrcamento()} É O PRÓXIMO NÚMERO DISPONÍVEL E AINDA NÃO FOI GERADO. CLIQUE EM GERAR ORÇAMENTO PARA CRIÁ-LO.`,
        );
      return alert("ORÇAMENTO NÃO ENCONTRADO.");
    }
    if (!["ORÇAMENTO", "PARCIALMENTE ATENDIDO"].includes(o.status))
      return alert(
        `ORÇAMENTO ${o.numeroOrcamento || o.id} LOCALIZADO, MAS O STATUS É ${o.status || "SEM STATUS"}. NÃO HÁ SALDO PENDENTE PARA NOVA VENDA.`,
      );
    const saldo = (o.itensSaldo?.length ? o.itensSaldo : o.itens || []).filter(
      (x) => Number(x.qtd || 0) > 0,
    );
    setUnidade(o.unidade || unidade);
    setClienteId(o.clienteId || "");
    setItens(saldo.map((x) => ({ ...x })));
    setItensConfirmados(true);
    setPag(o.pagamento || "A VISTA");
    setEntrega(o.entrega || "SEM ENTREGA");
    setMotoristaId(o.motoristaId || "");
    setDestinoEntrega(o.destinoEntrega || "");
    setResponsavelFrete(o.responsavelFrete || "FORTE ATACAREJO");
    setSituacaoPallets(o.situacaoPallets || "");
    setPalletsForte(String(o.palletsForte ?? ""));
    setPalletsCliente(String(o.palletsCliente ?? ""));
    setJustificativaPallets(o.justificativaPallets || "");
    setBuscaOrcamento(o.numeroOrcamento || o.id);
    alert(
      `ORÇAMENTO ${o.numeroOrcamento || o.id} CARREGADO. AS QUANTIDADES ABAIXO REPRESENTAM O SALDO DISPONÍVEL. AJUSTE A QUANTIDADE QUE O CLIENTE VAI COMPRAR AGORA E CLIQUE EM GERAR VENDA PARCIAL / TOTAL.`,
    );
  }
  const orcamentos = vendas.filter(
    (v) =>
      v.numeroOrcamento ||
      ["ORÇAMENTO", "PARCIALMENTE ATENDIDO", "ATENDIDO", "CANCELADO"].includes(
        v.status,
      ),
  );
  const orcamentosComReserva = orcamentos.filter((v) =>
    ["ORÇAMENTO", "PARCIALMENTE ATENDIDO"].includes(v.status),
  );
  const estoqueFisico = (pid) => {
    const ledger = buildStockLedger(data, "ESTOQUE ÚNICO", pid);
    return Number(ledger[ledger.length - 1]?.saldo || 0);
  };
  const estoqueReservado = (pid, ignorarOrcamentoId = "") =>
    orcamentosComReserva
      .filter((o) => o.id !== ignorarOrcamentoId)
      .reduce(
        (total, o) =>
          total +
          (o.itensSaldo?.length ? o.itensSaldo : o.itens || [])
            .filter((it) => it.produtoId === pid)
            .reduce((a, it) => a + Number(it.qtd || 0), 0),
        0,
      );
  const estoqueDisponivel = (pid, ignorarOrcamentoId = "") =>
    Math.max(0, estoqueFisico(pid) - estoqueReservado(pid, ignorarOrcamentoId));
  function validarDisponibilidadeEstoque(itensOperacao, usaReservaId = "") {
    const totais = itensOperacao.reduce((acc, it) => {
      acc[it.produtoId] = (acc[it.produtoId] || 0) + Number(it.qtd || 0);
      return acc;
    }, {});
    for (const [pid, quantidade] of Object.entries(totais)) {
      const produto = produtos.find((x) => x.id === pid);
      const disponivel = estoqueDisponivel(pid, usaReservaId);
      if (quantidade > disponivel)
        return alert(
          `ESTOQUE INSUFICIENTE PARA ${produto?.marca ? produto.marca + " • " : ""}${produto?.nome || pid}.\n\nFÍSICO: ${estoqueFisico(pid)}\nRESERVADO EM OUTROS ORÇAMENTOS: ${estoqueReservado(pid, usaReservaId)}\nDISPONÍVEL: ${disponivel}\nSOLICITADO: ${quantidade}`,
        );
    }
    return true;
  }
  const orcamentosFiltrados = orcamentos
    .filter((v) => {
      const cliente = upper(v.cliente || "");
      const numero = upper(v.numeroOrcamento || v.id || "");
      const produtosTxt = upper(
        (v.itens || []).map((i) => `${i.marca || ""} ${i.produto || ""}`).join(" "),
      );
      const dataRef = String(
        v.dataOperacao || v.data || v.criadoEm || "",
      ).slice(0, 10);
      const okCliente =
        !filtroOrcCliente || cliente.includes(upper(filtroOrcCliente));
      const okNumero =
        !filtroOrcNumero || numero.includes(upper(filtroOrcNumero));
      const okProduto =
        !filtroOrcProduto || produtosTxt.includes(upper(filtroOrcProduto));
      const okStatus =
        filtroOrcStatus === "TODOS" ||
        (filtroOrcStatus === "EM ABERTO"
          ? ["ORÇAMENTO", "PARCIALMENTE ATENDIDO"].includes(v.status)
          : v.status === filtroOrcStatus);
      const okInicio = !filtroOrcInicio || dataRef >= filtroOrcInicio;
      const okFim = !filtroOrcFim || dataRef <= filtroOrcFim;
      return (
        okCliente && okNumero && okProduto && okStatus && okInicio && okFim
      );
    })
    .slice()
    .sort((a, b) =>
      String(b.dataOperacao || b.data || b.criadoEm || "").localeCompare(
        String(a.dataOperacao || a.data || a.criadoEm || ""),
      ),
    );
  function creditoDisponivelCliente(cid, source = data) {
    return (source.creditosClientes || [])
      .filter(
        (x) =>
          x.clienteId === cid &&
          x.status !== "UTILIZADO" &&
          Number(x.saldo ?? x.valor ?? 0) > 0,
      )
      .reduce((a, x) => a + Number(x.saldo ?? x.valor ?? 0), 0);
  }
  function gerarRelatorioOrcamentos() {
    pdfTabela(
      `RELATÓRIO DE ORÇAMENTOS — ${filtroOrcStatus}`,
      [
        {
          label: "DATA",
          w: 0.7,
          get: (v) => formatDateBR(v.dataOperacao || v.data),
        },
        { label: "ORÇAMENTO", w: 1, get: (v) => v.numeroOrcamento || v.id },
        { label: "CLIENTE", w: 1.4, get: (v) => v.cliente || "-" },
        {
          label: "PRODUTOS",
          w: 2.4,
          get: (v) =>
            (v.itens || []).map((i) => `${i.marca ? i.marca + " • " : ""}${i.produto} ${i.qtd} SC`).join(" / "),
        },
        {
          label: "ORÇADO",
          w: 0.8,
          get: (v) =>
            `${(v.itens || []).reduce((a, x) => a + Number(x.qtd || 0), 0)} SC`,
        },
        {
          label: "VENDIDO",
          w: 0.8,
          get: (v) => `${Number(v.qtdVendida || 0)} SC`,
        },
        {
          label: "PENDENTE",
          w: 0.8,
          get: (v) =>
            `${Number(v.qtdPendente ?? (v.itensSaldo || v.itens || []).reduce((a, x) => a + Number(x.qtd || 0), 0))} SC`,
        },
        {
          label: "CRÉDITO",
          w: 0.9,
          get: (v) => money(creditoDisponivelCliente(v.clienteId)),
        },
        { label: "STATUS", w: 1.2, get: (v) => v.status },
      ],
      orcamentosFiltrados,
      `RELATORIO-ORCAMENTOS-${todayISO()}.pdf`,
      [
        `CLIENTE: ${filtroOrcCliente || "TODOS"} • PRODUTO: ${filtroOrcProduto || "TODOS"}`,
        `PERÍODO: ${filtroOrcInicio ? formatDateBR(filtroOrcInicio) : "INÍCIO"} ATÉ ${filtroOrcFim ? formatDateBR(filtroOrcFim) : "HOJE"} • ${orcamentosFiltrados.length} ORÇAMENTO(S)`,
      ],
    );
  }
  function gerarRelatorioEstoqueReservado() {
    const rows = orcamentosComReserva.flatMap((o) =>
      (o.itensSaldo?.length ? o.itensSaldo : o.itens || [])
        .filter((it) => Number(it.qtd || 0) > 0)
        .map((it) => ({
          data: o.dataOperacao || o.data,
          orcamento: o.numeroOrcamento || o.id,
          cliente: o.cliente,
          produtoId: it.produtoId,
          produto: `${it.marca ? it.marca + " • " : ""}${it.produto}`,
          reservado: Number(it.qtd || 0),
          status: o.status,
        })),
    );
    pdfTabela(
      "ESTOQUE RESERVADO — ORÇAMENTOS DA VENDA BALCÃO",
      [
        { label: "DATA", w: .7, get: (x) => formatDateBR(x.data) },
        { label: "ORÇAMENTO", w: 1, key: "orcamento" },
        { label: "CLIENTE", w: 1.5, key: "cliente" },
        { label: "MARCA / PRODUTO", w: 2.2, key: "produto" },
        { label: "RESERVADO", w: .8, get: (x) => `${x.reservado} SC` },
        { label: "ESTOQUE FÍSICO", w: .8, get: (x) => `${estoqueFisico(x.produtoId)} SC` },
        { label: "TOTAL RESERVADO", w: .9, get: (x) => `${estoqueReservado(x.produtoId)} SC` },
        { label: "DISPONÍVEL", w: .8, get: (x) => `${estoqueDisponivel(x.produtoId)} SC` },
        { label: "STATUS", w: 1.1, key: "status" },
      ],
      rows,
      `ESTOQUE-RESERVADO-ORCAMENTOS-${todayISO()}.pdf`,
      [
        `ORÇAMENTOS COM RESERVA: ${orcamentosComReserva.length}`,
        `TOTAL RESERVADO: ${rows.reduce((a, x) => a + x.reservado, 0)} SACO(S)`,
      ],
    );
  }
  function cancelarOrcamento(o) {
    if (!["ORÇAMENTO", "PARCIALMENTE ATENDIDO"].includes(o.status)) return;
    const motivo = upper(prompt("INFORME O MOTIVO DO CANCELAMENTO:") || "");
    if (!motivo) return;
    if (!confirm(`CANCELAR ${o.numeroOrcamento || o.id} E LIBERAR TODO O ESTOQUE AINDA RESERVADO?`)) return;
    onChange((d) => ({
      ...d,
      vendasBalcao: (d.vendasBalcao || []).map((v) =>
        v.id === o.id
          ? {
              ...v,
              status: "CANCELADO",
              reservaEstoqueStatus: "LIBERADA POR CANCELAMENTO",
              reservaLiberadaEm: nowISO(),
              motivoCancelamento: motivo,
              atualizadoEm: nowISO(),
            }
          : v,
      ),
      auditoria: [
        ...(d.auditoria || []),
        {
          id: uid("aud"),
          usuario: currentUser?.nome || "",
          acao: "ORÇAMENTO CANCELADO — RESERVA LIBERADA",
          referencia: o.numeroOrcamento || o.id,
          detalhe: motivo,
          dataHora: nowISO(),
        },
      ],
    }));
  }
  function gerarVendaParcialPorValor(o) {
    if (!o || !["ORÇAMENTO", "PARCIALMENTE ATENDIDO"].includes(o.status))
      return alert("ORÇAMENTO SEM SALDO PENDENTE.");
    if (!caixaAberto)
      return alert(
        "ABRA O CAIXA DESTA UNIDADE ANTES DE GERAR A VENDA DO ORÇAMENTO.",
      );
    if (o.entrega === "COM ENTREGA" && !o.motoristaId)
      return alert(
        "O ORÇAMENTO POSSUI ENTREGA, MAS NÃO TEM MOTORISTA SELECIONADO.",
      );
    const creditoAntes = creditoDisponivelCliente(o.clienteId);
    const entrada = prompt(
      `VENDA PARCIAL POR VALOR — ${o.numeroOrcamento || o.id}\n\nCRÉDITO DISPONÍVEL DO CLIENTE: ${money(creditoAntes)}\n\nINFORME O NOVO VALOR RECEBIDO PELO CLIENTE:`,
    );
    if (entrada === null) return;
    const valorRecebido = Number(
      String(entrada).replace(/\./g, "").replace(",", "."),
    );
    if (Number.isNaN(valorRecebido) || valorRecebido < 0)
      return alert("VALOR RECEBIDO INVÁLIDO.");
    const usarCredito =
      creditoAntes > 0 &&
      confirm(
        `ESTE CLIENTE POSSUI ${money(creditoAntes)} DE CRÉDITO DISPONÍVEL.\n\nDESEJA USAR ESSE CRÉDITO NESTA VENDA PARCIAL?`,
      );
    const creditoUsado = usarCredito ? creditoAntes : 0;
    const valorAplicavel = valorRecebido + creditoUsado;
    if (valorAplicavel <= 0)
      return alert(
        "INFORME UM VALOR RECEBIDO OU UTILIZE O CRÉDITO DISPONÍVEL DO CLIENTE.",
      );
    const saldoBase = (
      o.itensSaldo?.length ? o.itensSaldo : o.itens || []
    ).filter((x) => Number(x.qtd || 0) > 0);
    let restanteValor = valorAplicavel;
    const itensVenda = [];
    for (const [saldoIdx, base] of saldoBase.entries()) {
      const unitProduto = Number(base.precoUnitario || 0);
      const unitFrete =
        o.entrega === "COM ENTREGA" && o.responsavelFrete === "FORTE ATACAREJO"
          ? Number(base.tarifaFreteSaco || 0)
          : 0;
      const unitEfetivo = unitProduto + unitFrete;
      if (unitEfetivo <= 0) continue;
      const maxQtd = Math.min(
        Number(base.qtd || 0),
        Math.floor((restanteValor + 0.000001) / unitEfetivo),
      );
      if (maxQtd > 0) {
        itensVenda.push({
          ...base,
          _saldoIdx: saldoIdx,
          qtd: maxQtd,
          subtotal: maxQtd * unitProduto,
          frete:
            o.entrega === "COM ENTREGA"
              ? maxQtd * Number(base.tarifaFreteSaco || 0)
              : 0,
        });
        restanteValor -= maxQtd * unitEfetivo;
        if (restanteValor < 0.005) restanteValor = 0;
      }
    }
    if (!itensVenda.length)
      return alert(
        `O VALOR DISPONÍVEL ${money(valorAplicavel)} NÃO É SUFICIENTE PARA 1 UNIDADE DO PRIMEIRO ITEM PENDENTE. O SALDO PERMANECE COMO CRÉDITO DO CLIENTE.`,
      );
    const m = motoristas.find((x) => x.id === o.motoristaId) || {};
    const vendaId = uid("vb");
    const numeroVenda = proximoNumeroVenda();
    const vendaSubtotal = itensVenda.reduce(
      (a, x) => a + Number(x.subtotal || 0),
      0,
    );
    const vendaFrete =
      o.entrega === "COM ENTREGA"
        ? itensVenda.reduce((a, x) => a + Number(x.frete || 0), 0)
        : 0;
    const vendaTotal =
      vendaSubtotal +
      (o.entrega === "COM ENTREGA" && o.responsavelFrete === "FORTE ATACAREJO"
        ? vendaFrete
        : 0);
    const creditoGerado = Math.max(0, Math.round(restanteValor * 100) / 100);
    const venda = {
      ...o,
      id: vendaId,
      numeroVenda,
      orcamentoOrigemId: o.id,
      numeroOrcamento: o.numeroOrcamento,
      data: todayISO(),
      dataOperacao: todayISO(),
      convertidoEm: nowISO(),
      atualizadoEm: nowISO(),
      caixaId: caixaAberto.id,
      itens: itensVenda.map(({ _saldoIdx, ...x }) => x),
      subtotal: vendaSubtotal,
      frete: vendaFrete,
      freteCobradoPelaForte:
        o.entrega === "COM ENTREGA" && o.responsavelFrete === "FORTE ATACAREJO"
          ? vendaFrete
          : 0,
      total: vendaTotal,
      valorRecebido,
      creditoUsado,
      valorAplicavel,
      creditoGerado,
      status: "CONCLUÍDA",
      origemVendaParcial: "VALOR RECEBIDO",
    };
    onChange((d) => {
      const saldoNovo = saldoBase
        .map((base, saldoIdx) => {
          const vend = itensVenda.find((x) => x._saldoIdx === saldoIdx);
          const restante = Math.max(
            0,
            Number(base.qtd || 0) - Number(vend?.qtd || 0),
          );
          return {
            ...base,
            qtd: restante,
            subtotal: restante * Number(base.precoUnitario || 0),
            frete:
              o.entrega === "COM ENTREGA"
                ? restante * Number(base.tarifaFreteSaco || 0)
                : 0,
          };
        })
        .filter((x) => Number(x.qtd || 0) > 0);
      const historico = [
        ...(o.atendimentos || []),
        {
          id: uid("atd"),
          data: todayISO(),
          dataHora: nowISO(),
          numeroVenda,
          modo: "VALOR RECEBIDO",
          valorRecebido,
          creditoUsado,
          valorAplicavel,
          creditoGerado,
          itens: itensVenda.map((x) => ({
            produtoId: x.produtoId,
            produto: x.produto,
            marca: x.marca || "",
            qtd: Number(x.qtd || 0),
          })),
          usuario: currentUser?.nome || "",
        },
      ];
      const totalOriginal = (o.itens || []).reduce(
        (a, x) => a + Number(x.qtd || 0),
        0,
      );
      const totalRestante = saldoNovo.reduce(
        (a, x) => a + Number(x.qtd || 0),
        0,
      );
      const totalVendido = totalOriginal - totalRestante;
      const statusOrc =
        totalRestante > 0 ? "PARCIALMENTE ATENDIDO" : "ATENDIDO";
      let creditoRestanteParaUsar = creditoUsado;
      const creditosBase = (d.creditosClientes || []).map((cr) => {
        if (
          cr.clienteId !== o.clienteId ||
          creditoRestanteParaUsar <= 0 ||
          cr.status === "UTILIZADO"
        )
          return cr;
        const saldoAtual = Number(cr.saldo ?? cr.valor ?? 0);
        if (saldoAtual <= 0) return cr;
        const usado = Math.min(saldoAtual, creditoRestanteParaUsar);
        creditoRestanteParaUsar -= usado;
        const novoSaldo = Math.round((saldoAtual - usado) * 100) / 100;
        return {
          ...cr,
          saldo: novoSaldo,
          status: novoSaldo <= 0 ? "UTILIZADO" : "DISPONÍVEL",
          ultimaUtilizacaoEm: nowISO(),
          ultimaUtilizacaoVenda: numeroVenda,
        };
      });
      const creditos =
        creditoGerado > 0
          ? [
              ...creditosBase,
              {
                id: uid("cred"),
                data: todayISO(),
                clienteId: o.clienteId,
                cliente: o.cliente,
                origem: `SALDO VENDA PARCIAL ${numeroVenda}`,
                numeroOrcamento: o.numeroOrcamento,
                valor: creditoGerado,
                saldo: creditoGerado,
                status: "DISPONÍVEL",
                criadoEm: nowISO(),
              },
            ]
          : creditosBase;
      return {
        ...d,
        settings: {
          ...d.settings,
          nextVendaSeq: Number(d.settings?.nextVendaSeq || 1) + 1,
        },
        vendasBalcao: [
          ...(d.vendasBalcao || []).map((v) =>
            v.id === o.id
              ? {
                  ...v,
                  status: statusOrc,
                  itensSaldo: saldoNovo,
                  qtdOriginal: totalOriginal,
                  qtdVendida: totalVendido,
                  qtdPendente: totalRestante,
                  reservaEstoqueStatus:
                    totalRestante > 0 ? "ATIVA — SALDO PENDENTE" : "CONSUMIDA / ATENDIDA",
                  reservaAtualizadaEm: nowISO(),
                  atendimentos: historico,
                  atualizadoEm: nowISO(),
                }
              : v,
          ),
          venda,
        ],
        creditosClientes: creditos,
        patioSaidas: d.patioSaidas || [], // histórico legado preservado; fluxo de liberação removido na V6.8.0
      };
    });
    setItens([]);
    try {
      localStorage.removeItem(BALCAO_DRAFT_KEY);
    } catch {}
    setBuscaOrcamento("");
    const itensResumo = itensVenda
      .map((x) => `${x.produto}: ${x.qtd} SC`)
      .join("\n");
    alert(
      `VENDA ${numeroVenda} GERADA.\n\n${itensResumo}\n\nNOVO VALOR RECEBIDO: ${money(valorRecebido)}\nCRÉDITO UTILIZADO: ${money(creditoUsado)}\nVALOR TOTAL DISPONÍVEL: ${money(valorAplicavel)}\nVALOR CONVERTIDO EM MERCADORIA/FRETE: ${money(vendaTotal)}\n${creditoGerado > 0 ? `NOVO CRÉDITO DO CLIENTE: ${money(creditoGerado)}\n` : ""}CRÉDITO DISPONÍVEL APÓS A OPERAÇÃO: ${money(creditoGerado)}\nSALDO DO ORÇAMENTO: ${totalRestante} SC.`,
    );
  }
  function anexarComprovanteOperacao(op, arquivo, movimentoId = "") {
    if (!arquivo) return;
    const assinatura = [
      arquivo.name,
      arquivo.size,
      arquivo.type,
      arquivo.lastModified,
    ].join("|");
    const duplicado = (data.comprovantesBalcao || []).find(
      (x) => x.assinaturaArquivo === assinatura,
    );
    const registro = {
      id: uid("compvb"),
      operacaoId: op.id,
      numeroVenda: op.numeroVenda || "",
      numeroOrcamento: op.numeroOrcamento || "",
      clienteId: op.clienteId || "",
      cliente: op.cliente || "",
      movimentoId: movimentoId || "",
      arquivo: arquivo.name,
      tipo: arquivo.type || "",
      tamanho: arquivo.size || 0,
      assinaturaArquivo: assinatura,
      data: todayISO(),
      criadoEm: nowISO(),
      usuario: currentUser?.nome || "",
      statusVerificacao: duplicado
        ? "DUPLICADO — JÁ UTILIZADO"
        : "AGUARDANDO LEITURA / CONCILIAÇÃO",
      nivelVerificacao: duplicado ? "ERRO" : "PENDENTE",
      duplicadoDe: duplicado?.id || "",
      pagadorNome: "",
      pagadorDocumento: "",
      clienteBeneficiario: op.cliente || "",
      pagamentoTerceiro: false,
      confirmacaoTerceiro: false,
      observacaoTerceiro: "",
    };
    onChange((d) => ({
      ...d,
      comprovantesBalcao: [...(d.comprovantesBalcao || []), registro],
      vendasBalcao: (d.vendasBalcao || []).map((v) =>
        v.id === op.id
          ? {
              ...v,
              comprovanteIds: [...(v.comprovanteIds || []), registro.id],
              atualizadoEm: nowISO(),
            }
          : v,
      ),
    }));
    alert(
      duplicado
        ? `ATENÇÃO: ${arquivo.name} FOI ANEXADO, MAS O SISTEMA IDENTIFICOU UM ARQUIVO JÁ UTILIZADO EM OUTRA OPERAÇÃO. STATUS: DUPLICADO — CONFERIR.`
        : `COMPROVANTE ${arquivo.name} ANEXADO. STATUS: AGUARDANDO LEITURA / CONCILIAÇÃO. A CONFIRMAÇÃO VERDE SOMENTE DEVE OCORRER APÓS VALIDAÇÃO CRUZADA.`,
    );
  }
  function escolherComprovanteOperacao(op, movimentoId = "") {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,image/*";
    input.onchange = () => {
      const f = input.files?.[0];
      if (f) anexarComprovanteOperacao(op, f, movimentoId);
    };
    input.click();
  }
  function comprovantesDaOperacao(op) {
    return (data.comprovantesBalcao || []).filter(
      (x) =>
        x.operacaoId === op.id ||
        (x.numeroVenda && x.numeroVenda === op.numeroVenda) ||
        (x.numeroOrcamento && x.numeroOrcamento === op.numeroOrcamento),
    );
  }
  function listarComprovantesOperacao(op) {
    const lista = comprovantesDaOperacao(op);
    if (!lista.length)
      return alert("NENHUM COMPROVANTE ANEXADO NESTA OPERAÇÃO.");
    alert(
      `COMPROVANTES (${lista.length})\n\n${lista.map((x, i) => `${i + 1}. ${x.arquivo} — ${x.statusVerificacao || "AGUARDANDO LEITURA / CONCILIAÇÃO"} — ${x.pagadorNome ? `PAGADOR: ${x.pagadorNome}` : "PAGADOR A IDENTIFICAR"}${x.pagamentoTerceiro ? ` — PAGAMENTO POR TERCEIRO${x.confirmacaoTerceiro ? " CONFIRMADO" : " — CONFERIR VÍNCULO"}` : ""} — ${new Date(x.criadoEm).toLocaleString("pt-BR")} — ${x.usuario || "-"}`).join("\n")}`,
    );
  }
  function converterOrcamento() {
    const q = upper(buscaOrcamento).trim();
    const o = vendas.find(
      (v) =>
        upper(v.numeroOrcamento || v.id) === q &&
        ["ORÇAMENTO", "PARCIALMENTE ATENDIDO"].includes(v.status),
    );
    if (!o) return alert("LOCALIZE PRIMEIRO UM ORÇAMENTO COM SALDO PENDENTE.");
    if (!validarPallets()) return;
    if (!caixaAberto)
      return alert(
        "ABRA O CAIXA DESTA UNIDADE ANTES DE GERAR A VENDA DO ORÇAMENTO.",
      );
    if (o.entrega === "COM ENTREGA" && !o.motoristaId)
      return alert(
        "O ORÇAMENTO POSSUI ENTREGA, MAS NÃO TEM MOTORISTA SELECIONADO.",
      );
    const saldoBase = (
      o.itensSaldo?.length ? o.itensSaldo : o.itens || []
    ).filter((x) => Number(x.qtd || 0) > 0);
    const itensVenda = (itens || []).filter((x) => Number(x.qtd || 0) > 0);
    if (!itensVenda.length)
      return alert("INFORME AO MENOS UMA QUANTIDADE PARA VENDER AGORA.");
    for (const it of itensVenda) {
      const base = saldoBase.find((x) => x.produtoId === it.produtoId);
      if (!base || Number(it.qtd || 0) > Number(base.qtd || 0))
        return alert(
          `QUANTIDADE DE ${it.produto} MAIOR QUE O SALDO DO ORÇAMENTO (${base?.qtd || 0} SC).`,
        );
    }
    const m = motoristas.find((x) => x.id === o.motoristaId) || {};
    const vendaId = uid("vb");
    const numeroVenda = proximoNumeroVenda();
    const vendaSubtotal = itensVenda.reduce(
      (a, x) => a + Number(x.qtd || 0) * Number(x.precoUnitario || 0),
      0,
    );
    const vendaFrete =
      o.entrega === "COM ENTREGA"
        ? itensVenda.reduce(
            (a, x) => a + Number(x.qtd || 0) * Number(x.tarifaFreteSaco || 0),
            0,
          )
        : 0;
    const vendaTotal =
      vendaSubtotal +
      (o.entrega === "COM ENTREGA" && o.responsavelFrete === "FORTE ATACAREJO"
        ? vendaFrete
        : 0);
    const venda = {
      ...o,
      id: vendaId,
      numeroVenda,
      orcamentoOrigemId: o.id,
      numeroOrcamento: o.numeroOrcamento,
      data: todayISO(),
      dataOperacao: todayISO(),
      convertidoEm: nowISO(),
      atualizadoEm: nowISO(),
      caixaId: caixaAberto.id,
      itens: itensVenda.map((x) => ({
        ...x,
        subtotal: Number(x.qtd || 0) * Number(x.precoUnitario || 0),
        frete:
          o.entrega === "COM ENTREGA"
            ? Number(x.qtd || 0) * Number(x.tarifaFreteSaco || 0)
            : 0,
      })),
      subtotal: vendaSubtotal,
      frete: vendaFrete,
      freteCobradoPelaForte:
        o.entrega === "COM ENTREGA" && o.responsavelFrete === "FORTE ATACAREJO"
          ? vendaFrete
          : 0,
      total: vendaTotal,
      situacaoPallets,
      palletsSugeridos,
      palletsForte: Number(palletsForte || 0),
      palletsCliente: Number(palletsCliente || 0),
      justificativaPallets: upper(justificativaPallets),
      status: "CONCLUÍDA",
    };
    onChange((d) => {
      const saldoNovo = saldoBase
        .map((base) => {
          const vend = itensVenda.find((x) => x.produtoId === base.produtoId);
          const restante = Math.max(
            0,
            Number(base.qtd || 0) - Number(vend?.qtd || 0),
          );
          return {
            ...base,
            qtd: restante,
            subtotal: restante * Number(base.precoUnitario || 0),
            frete:
              o.entrega === "COM ENTREGA"
                ? restante * Number(base.tarifaFreteSaco || 0)
                : 0,
          };
        })
        .filter((x) => Number(x.qtd || 0) > 0);
      const historico = [
        ...(o.atendimentos || []),
        {
          id: uid("atd"),
          data: todayISO(),
          dataHora: nowISO(),
          numeroVenda,
          itens: itensVenda.map((x) => ({
            produtoId: x.produtoId,
            produto: x.produto,
            qtd: Number(x.qtd || 0),
          })),
          usuario: currentUser?.nome || "",
        },
      ];
      const totalOriginal = (o.itens || []).reduce(
        (a, x) => a + Number(x.qtd || 0),
        0,
      );
      const totalRestante = saldoNovo.reduce(
        (a, x) => a + Number(x.qtd || 0),
        0,
      );
      const totalVendido = totalOriginal - totalRestante;
      const statusOrc =
        totalRestante > 0 ? "PARCIALMENTE ATENDIDO" : "ATENDIDO";
      const freteLanc =
        o.entrega === "COM ENTREGA"
          ? {
              id: uid("fb"),
              data: todayISO(),
              vendaId,
              numeroOrcamento: o.numeroOrcamento,
              unidade: o.unidade,
              cliente: o.cliente,
              motoristaId: o.motoristaId,
              motorista: o.motorista,
              chavePix: o.chavePixMotorista || m.chavePix || "",
              favorecidoPix:
                o.favorecidoPix || m.favorecidoPix || o.motorista || "",
              itens: itensVenda.map((it) => ({
                produto: it.produto,
                quantidade: it.qtd,
                tarifaPorSaco: it.tarifaFreteSaco,
                valor: Number(it.qtd) * Number(it.tarifaFreteSaco || 0),
              })),
              valor: vendaFrete,
              responsavelPagamento: o.responsavelFrete,
              status:
                o.responsavelFrete === "FORTE ATACAREJO"
                  ? "A PAGAR"
                  : "PAGO DIRETAMENTE PELO CLIENTE",
              criadoEm: nowISO(),
            }
          : null;
      const conta =
        freteLanc && o.responsavelFrete === "FORTE ATACAREJO"
          ? {
              id: uid("cp"),
              fornecedor: `MOTORISTA — ${o.motorista || ""}`,
              motoristaId: o.motoristaId,
              motorista: o.motorista,
              titulo: `FRETE BALCÃO ${numeroVenda}`,
              referencia: vendaId,
              valor: vendaFrete,
              emissao: todayISO(),
              vencimento: todayISO(),
              status: "ABERTO",
              chavePix: o.chavePixMotorista || m.chavePix || "",
              favorecidoPix:
                o.favorecidoPix || m.favorecidoPix || o.motorista || "",
              tipo: "FRETE VENDA BALCÃO",
            }
          : null;
      return {
        ...d,
        settings: {
          ...d.settings,
          nextVendaSeq: Number(d.settings?.nextVendaSeq || 1) + 1,
        },
        vendasBalcao: [
          ...(d.vendasBalcao || []).map((v) =>
            v.id === o.id
              ? {
                  ...v,
                  status: statusOrc,
                  itensSaldo: saldoNovo,
                  qtdOriginal: totalOriginal,
                  qtdVendida: totalVendido,
                  qtdPendente: totalRestante,
                  reservaEstoqueStatus:
                    totalRestante > 0 ? "ATIVA — SALDO PENDENTE" : "CONSUMIDA / ATENDIDA",
                  reservaAtualizadaEm: nowISO(),
                  atendimentos: historico,
                  atualizadoEm: nowISO(),
                }
              : v,
          ),
          venda,
        ],
        patioSaidas: d.patioSaidas || [], // histórico legado preservado; fluxo de liberação removido na V6.8.0
        fretesBalcao: [
          ...(d.fretesBalcao || []),
          ...(freteLanc ? [freteLanc] : []),
        ],
        contasPagar: [...(d.contasPagar || []), ...(conta ? [conta] : [])],
        palletClientes: [
          ...(d.palletClientes || []).filter(
            (x) => x.documento !== (v.numeroVenda || v.numeroOrcamento),
          ),
          ...(Number(palletsForte || 0) > 0
            ? [
                {
                  id: uid("palcli"),
                  nome: o.cliente,
                  clienteId: o.clienteId,
                  origem: "FORTE ATACAREJO",
                  quantidade: Number(palletsForte || 0),
                  movimento: "EMPRÉSTIMO",
                  documento: `${numeroVenda} • ${o.numeroOrcamento}`,
                  motorista: o.motorista,
                  dataHora: nowISO(),
                },
              ]
            : []),
        ],
      };
    });
    setItens([]);
    try {
      localStorage.removeItem(BALCAO_DRAFT_KEY);
    } catch {}
    setBuscaOrcamento("");
    alert(
      totalRestante > 0
        ? `VENDA ${numeroVenda} GERADA. O ORÇAMENTO ${o.numeroOrcamento || o.id} CONTINUA ABERTO COM ${totalRestante} SACO(S) PENDENTE(S).`
        : `VENDA ${numeroVenda} GERADA. O ORÇAMENTO ${o.numeroOrcamento || o.id} FOI ATENDIDO INTEGRALMENTE.`,
    );
  }
  function salvar(status = "CONCLUÍDA") {
    if (!c || !effectiveItems.length)
      return alert(
        "SELECIONE O CLIENTE E INFORME AO MENOS UM PRODUTO COM QUANTIDADE.",
      );
    if (!editVendaId && !validarDisponibilidadeEstoque(effectiveItems)) return;
    if (!validarPallets()) return;
    if (status === "CONCLUÍDA" && !caixaAberto)
      return alert("ABRA O CAIXA DESTA UNIDADE ANTES DE CONCLUIR A VENDA.");
    if (entrega === "COM ENTREGA" && !motoristaId)
      return alert("SELECIONE O MOTORISTA DA ENTREGA.");
    const original = editVendaId
      ? vendas.find((x) => x.id === editVendaId)
      : null;
    if (
      original &&
      (!caixaAberto ||
        original.caixaId !== caixaAberto.id ||
        original.data !== todayISO())
    )
      return alert(
        "VENDA BLOQUEADA PARA EDIÇÃO: SOMENTE VENDAS DO CAIXA DO DIA AINDA ABERTO PODEM SER ALTERADAS.",
      );
    const valorOperacao =
      subtotalPreview +
      (entrega === "COM ENTREGA" && responsavelFrete === "FORTE ATACAREJO"
        ? fretePreview
        : 0);
    const formaRegra = pagamentos.find((x) => x.descricao === pag) || {};
    const regraPagamento = {
      entraCaixa: formaRegra.entraCaixa !== false,
      geraContasReceber: formaRegra.geraContasReceber !== false,
      recebidoNaHora: !!formaRegra.recebidoNaHora,
      exigeComprovante: !!formaRegra.exigeComprovante,
      exigeConciliacao: !!formaRegra.exigeConciliacao,
      permitePrazo: formaRegra.permitePrazo !== false,
    };
    if (
      status === "CONCLUÍDA" &&
      regraPagamento.geraContasReceber &&
      isCreditSale(pag)
    ) {
      const cred = customerCredit(data, c.id);
      const disponivel = original
        ? cred.available + Number(original.total || 0)
        : cred.available;
      if (valorOperacao > disponivel)
        return alert(
          `VENDA BLOQUEADA POR LIMITE DE CRÉDITO.\n\nLIMITE: ${money(cred.total)}\nUTILIZADO: ${money(cred.used)}\nDISPONÍVEL PARA ESTA EDIÇÃO: ${money(disponivel)}\nNOVA VENDA: ${money(valorOperacao)}`,
        );
    }
    const m = motoristas.find((x) => x.id === motoristaId);
    const numeroVenda =
      status === "CONCLUÍDA"
        ? original?.numeroVenda || proximoNumeroVenda()
        : "";
    const v = {
      ...(original || {}),
      id: original?.id || uid("vb"),
      numeroVenda,
      regraPagamento,
      caixaConsidera: regraPagamento.entraCaixa,
      geraContasReceber: regraPagamento.geraContasReceber,
      numeroOrcamento:
        status === "ORÇAMENTO"
          ? numeroOrcamento()
          : original?.numeroOrcamento || "",
      data: original?.data || todayISO(),
      dataOperacao: original?.dataOperacao || todayISO(),
      criadoEm: original?.criadoEm || nowISO(),
      atualizadoEm: nowISO(),
      unidade,
      caixaId:
        status === "CONCLUÍDA" ? original?.caixaId || caixaAberto?.id : "",
      clienteId,
      cliente: c.nome,
      itens: effectiveItems.map((x) => ({
        ...x,
        frete:
          entrega === "COM ENTREGA"
            ? Number(x.qtd) * Number(x.tarifaFreteSaco || 0)
            : 0,
      })),
      subtotal: subtotalPreview,
      entrega,
      frete: fretePreview,
      freteCobradoPelaForte:
        entrega === "COM ENTREGA" && responsavelFrete === "FORTE ATACAREJO"
          ? fretePreview
          : 0,
      total: valorOperacao,
      pagamento: pag,
      vendedor: currentUser?.nome || "",
      motoristaId: entrega === "COM ENTREGA" ? motoristaId : "",
      motorista: entrega === "COM ENTREGA" ? m?.nome || "" : "",
      placaEntrega: entrega === "COM ENTREGA" ? m?.placa1 || "" : "",
      chavePixMotorista: entrega === "COM ENTREGA" ? m?.chavePix || "" : "",
      favorecidoPix:
        entrega === "COM ENTREGA" ? m?.favorecidoPix || m?.nome || "" : "",
      destinoEntrega:
        entrega === "COM ENTREGA"
          ? upper(destinoEntrega || c.cidade || "")
          : "",
      enderecoEntrega:
        entrega === "COM ENTREGA" ? enderecoCompletoEntrega() : "",
      valorTotalFrete: fretePreview,
      responsavelFrete: entrega === "COM ENTREGA" ? responsavelFrete : "",
      situacaoPallets,
      palletsSugeridos,
      palletsForte: Number(palletsForte || 0),
      palletsCliente: Number(palletsCliente || 0),
      justificativaPallets: upper(justificativaPallets),
      configuracaoPalletsTravada: status === "ORÇAMENTO" || !!original,
      itensSaldo:
        status === "ORÇAMENTO"
          ? effectiveItems.map((x) => ({ ...x }))
          : original?.itensSaldo,
      qtdOriginal:
        status === "ORÇAMENTO"
          ? effectiveItems.reduce((a, x) => a + Number(x.qtd || 0), 0)
          : original?.qtdOriginal,
      qtdVendida: status === "ORÇAMENTO" ? 0 : original?.qtdVendida,
      qtdPendente:
        status === "ORÇAMENTO"
          ? effectiveItems.reduce((a, x) => a + Number(x.qtd || 0), 0)
          : original?.qtdPendente,
      reservaEstoqueStatus:
        status === "ORÇAMENTO" ? "ATIVA" : original?.reservaEstoqueStatus,
      reservaCriadaEm:
        status === "ORÇAMENTO" ? nowISO() : original?.reservaCriadaEm,
      status,
    };
    onChange((d) => {
      const freteLanc =
        status === "CONCLUÍDA" && entrega === "COM ENTREGA"
          ? {
              id:
                (d.fretesBalcao || []).find((x) => x.vendaId === v.id)?.id ||
                uid("fb"),
              data: todayISO(),
              vendaId: v.id,
              unidade,
              cliente: c.nome,
              destinoEntrega: v.destinoEntrega,
              enderecoEntrega: v.enderecoEntrega,
              motoristaId,
              motorista: m?.nome || "",
              chavePix: m?.chavePix || "",
              favorecidoPix: m?.favorecidoPix || m?.nome || "",
              itens: v.itens.map((it) => ({
                produto: it.produto,
                quantidade: it.qtd,
                tarifaPorSaco: it.tarifaFreteSaco,
                valor: Number(it.qtd) * Number(it.tarifaFreteSaco || 0),
              })),
              valor: fretePreview,
              responsavelPagamento: responsavelFrete,
              status:
                responsavelFrete === "FORTE ATACAREJO"
                  ? "A PAGAR"
                  : "PAGO DIRETAMENTE PELO CLIENTE",
              criadoEm: nowISO(),
            }
          : null;
      const contaMotorista =
        freteLanc && responsavelFrete === "FORTE ATACAREJO"
          ? {
              id:
                (d.contasPagar || []).find(
                  (x) =>
                    x.referencia === v.id && x.tipo === "FRETE VENDA BALCÃO",
                )?.id || uid("cp"),
              fornecedor: `MOTORISTA — ${m?.nome || ""}`,
              motoristaId,
              motorista: m?.nome || "",
              titulo: `FRETE BALCÃO ${v.numeroVenda || v.id}`,
              referencia: v.id,
              valor: fretePreview,
              emissao: todayISO(),
              vencimento: todayISO(),
              status: "ABERTO",
              chavePix: m?.chavePix || "",
              favorecidoPix: m?.favorecidoPix || m?.nome || "",
              tipo: "FRETE VENDA BALCÃO",
            }
          : null;
      const vb = original
        ? (d.vendasBalcao || []).map((x) => (x.id === v.id ? v : x))
        : [...(d.vendasBalcao || []), v];
      const patio = d.patioSaidas || []; // somente histórico; nenhuma nova liberação pelo pátio
      const fretes = (d.fretesBalcao || []).filter((x) => x.vendaId !== v.id);
      const cp = (d.contasPagar || []).filter(
        (x) => !(x.referencia === v.id && x.tipo === "FRETE VENDA BALCÃO"),
      );
      return {
        ...d,
        settings: {
          ...d.settings,
          nextVendaSeq:
            status === "CONCLUÍDA" && !original
              ? Number(d.settings?.nextVendaSeq || 1) + 1
              : Number(d.settings?.nextVendaSeq || 1),
          nextOrcamentoSeq:
            status === "ORÇAMENTO"
              ? Number(d.settings?.nextOrcamentoSeq || 1) + 1
              : Number(d.settings?.nextOrcamentoSeq || 1),
        },
        vendasBalcao: vb,
        patioSaidas: patio,
        fretesBalcao: [...fretes, ...(freteLanc ? [freteLanc] : [])],
        contasPagar: [...cp, ...(contaMotorista ? [contaMotorista] : [])],
        palletClientes: [
          ...(d.palletClientes || []).filter(
            (x) => x.documento !== (v.numeroVenda || v.numeroOrcamento),
          ),
          ...(status === "CONCLUÍDA" && Number(palletsForte || 0) > 0
            ? [
                {
                  id: uid("palcli"),
                  nome: c.nome,
                  clienteId: c.id,
                  origem: "FORTE ATACAREJO",
                  quantidade: Number(palletsForte || 0),
                  movimento: "EMPRÉSTIMO",
                  documento: v.numeroVenda || v.numeroOrcamento,
                  motorista: v.motorista,
                  dataHora: nowISO(),
                },
              ]
            : []),
        ],
        auditoria: [
          ...(d.auditoria || []),
          ...(original
            ? [
                {
                  id: uid("aud"),
                  dataHora: nowISO(),
                  acao: "VENDA BALCÃO EDITADA",
                  entityType: "VENDA BALCÃO",
                  entityId: v.id,
                  usuario: currentUser?.nome || "",
                  detalhe: `${v.numeroVenda} • TOTAL ANTERIOR ${money(original.total || 0)} • NOVO TOTAL ${money(v.total || 0)}`,
                },
              ]
            : []),
        ],
      };
    });
    setItens([]);
    setItensConfirmados(false);
    setEditVendaId("");
    try {
      localStorage.removeItem(BALCAO_DRAFT_KEY);
    } catch {}
    alert(
      original
        ? `VENDA ${v.numeroVenda} ATUALIZADA E GRAVADA.`
        : status === "CONCLUÍDA"
          ? responsavelFrete === "FORTE ATACAREJO"
            ? "VENDA CONCLUÍDA. FRETE LANÇADO NO CONTA-CORRENTE DO MOTORISTA E CONTAS A PAGAR DA FORTE."
            : "VENDA CONCLUÍDA. FRETE REGISTRADO COMO PAGO DIRETAMENTE PELO CLIENTE."
          : `ORÇAMENTO ${v.numeroOrcamento} SALVO E NUMERADO.`,
    );
  }
  function comprovante(v) {
    const iv = (v.itens || []).map(
      (x) =>
        `${x.marca ? x.marca + " • " : ""}${x.produto} | ${x.qtd} SC | ${money(x.precoUnitario)} | ${money(x.subtotal)}`,
    );
    pdfSimple(
      `${v.status === "CONCLUÍDA" ? "COMPROVANTE DE VENDA" : "ORÇAMENTO"} - FORTE ATACAREJO`,
      [
        `Nº VENDA: ${v.numeroVenda || "-"}`,
        `Nº ORÇAMENTO: ${v.numeroOrcamento || "-"}`,
        `UNIDADE: ${v.unidade}`,
        `DATA: ${formatDateBR(v.data)}`,
        `CLIENTE: ${v.cliente}`,
        `ENDEREÇO DA ENTREGA: ${enderecoCompletoEntrega(v)}`,
        ...iv,
        `ENTREGA: ${v.entrega}`,
        `FRETE: ${money(v.frete)}`,
        `RESPONSÁVEL PELO FRETE: ${v.responsavelFrete || "-"}`,
        `VALOR RECEBIDO DO CLIENTE: ${money(v.valorRecebido ?? v.total)}`,
        `VALOR DOS PRODUTOS: ${money((v.itens || []).reduce((a, x) => a + Number(x.subtotal || 0), 0))}`,
        `FRETE: ${money(v.frete || 0)}`,
        `TOTAL UTILIZADO NA VENDA: ${money(v.total)}`,
        `CRÉDITO DO CLIENTE APÓS ESTA MOVIMENTAÇÃO: ${money(v.creditoClienteApos ?? 0)}`,
        `MOTORISTA: ${v.motorista || "-"}`,
        `FORMA DE PAGAMENTO: ${v.pagamento}`,
        `VENDEDOR: ${v.vendedor}`,
        "",
        "ASSINATURA DO CLIENTE: __________________________________________",
        "",
        "ASSINATURA FORTE ATACAREJO: __________________________________",
      ],
      `${v.id}.pdf`,
    );
  }
  function reciboFrete(v) {
    const m = motoristas.find((x) => x.id === v.motoristaId) || {};
    pdfSimple(
      "RECIBO / ORDEM DE PAGAMENTO DE FRETE — FORTE ATACAREJO",
      [
        `DATA: ${formatDateBR(v.data)}`,
        `VENDA: ${v.numeroVenda || v.id}`,
        `CLIENTE: ${v.cliente}`,
        `DESTINO: ${v.destinoEntrega || "-"}`,
        `ENDEREÇO COMPLETO DA ENTREGA: ${enderecoCompletoEntrega(v)}`,
        `MOTORISTA: ${v.motorista || "-"}`,
        `PLACA: ${v.placaEntrega || "-"}`,
        `CHAVE PIX: ${m.chavePix || v.chavePixMotorista || "-"}`,
        `FAVORECIDO PIX: ${m.favorecidoPix || v.favorecidoPix || v.motorista || "-"}`,
        `VALOR DO FRETE: ${money(v.frete)}`,
        `RESPONSÁVEL PELO PAGAMENTO: ${v.responsavelFrete || "-"}`,
        `SITUAÇÃO: ${v.responsavelFrete === "FORTE ATACAREJO" ? "A PAGAR PELA FORTE ATACAREJO" : "FRETE PAGO DIRETAMENTE PELO CLIENTE"}`,
        "",
        "ASSINATURA DO MOTORISTA: ________________________________________",
        "",
        "ASSINATURA / RESPONSÁVEL: ______________________________________",
      ],
      `RECIBO-FRETE-${v.id}.pdf`,
    );
  }
  function comprovanteEntrega(v) {
    const itensEntrega = (v.itens || []).map(
      (it) =>
        `${it.marca ? it.marca + " • " : ""}${it.produto} — ${Number(it.qtd || 0)} SACO(S)`,
    );
    pdfSimple(
      "COMPROVANTE DE ENTREGA — FORTE ATACAREJO",
      [
        `DATA DA VENDA: ${formatDateBR(v.data)}`,
        `VENDA: ${v.numeroVenda || v.id}`,
        `CLIENTE: ${v.cliente || "-"}`,
        `DESTINO / OBRA: ${v.destinoEntrega || "-"}`,
        `ENDEREÇO COMPLETO DA ENTREGA: ${enderecoCompletoEntrega(v)}`,
        `MOTORISTA: ${v.motorista || "-"}`,
        `PLACA: ${v.placaEntrega || "-"}`,
        "",
        "PRODUTOS ENTREGUES:",
        ...itensEntrega,
        "",
        "DATA/HORA DA ENTREGA: ____/____/________  ______:______",
        "NOME DE QUEM RECEBEU: __________________________________________",
        "CPF/RG DE QUEM RECEBEU: ________________________________________",
        "",
        "ASSINATURA DO RECEBEDOR: _______________________________________",
        "",
        "OBSERVAÇÕES: ___________________________________________________",
      ],
      `COMPROVANTE-ENTREGA-${v.numeroVenda || v.id}.pdf`,
    );
  }
  function abrirWhatsappMotorista(v, tipo = "VENDA") {
    const m =
      motoristas.find((x) => x.id === (v?.motoristaId || motoristaId)) ||
      motoristaEntregaSelecionado;
    if (!m) return alert("SELECIONE O MOTORISTA DA ENTREGA.");
    const whats = String(m.whatsapp || m.telefone || m.celular || "").replace(
      /\D/g,
      "",
    );
    if (!whats)
      return alert("O MOTORISTA SELECIONADO NÃO POSSUI WHATSAPP CADASTRADO.");
    const cliente = v?.cliente || c?.nome || "-";
    const destino = v?.destinoEntrega || destinoEntrega || c?.cidade || "-";
    const obra =
      (c?.obras || []).find(
        (o) =>
          `${o.nome} — ${o.endereco || ""} ${o.cidade || ""}/${o.uf || ""}` ===
          destino,
      ) || obraEntregaSelecionada;
    const link = obra?.link || obra?.linkLocalizacao || "";
    const endereco = obra
      ? `${obra.nome || "OBRA"} — ${obra.endereco || ""} ${obra.cidade || ""}${obra.uf ? `/${obra.uf}` : ""}`
      : destino;
    const itensMsg = (v?.itens || effectiveItems || [])
      .map((it) => {
        const prod = produtos.find((p) => p.id === it.produtoId);
        const marca = it.marca || prod?.marca || "";
        return `• ${[marca, it.produto || prod?.nome].filter(Boolean).join(" — ")} — ${Number(it.qtd || 0)} SC`;
      })
      .join("\n");
    const numero =
      tipo === "ORÇAMENTO"
        ? v?.numeroOrcamento || buscaOrcamento || numeroOrcamento()
        : v?.numeroVenda || editVendaId || "VENDA EM PREPARAÇÃO";
    const aviso =
      tipo === "ORÇAMENTO"
        ? "\n⚠️ ORÇAMENTO / ENTREGA AINDA NÃO CONFIRMADA."
        : "";
    const msg = `FORTE ATACAREJO — ${tipo}\nNº: ${numero}\nCLIENTE: ${cliente}\nOBRA / DESTINO: ${endereco}${link ? `\nLOCALIZAÇÃO: ${link}` : ""}\n\nPRODUTOS / QUANTIDADES:\n${itensMsg || "SEM ITENS INFORMADOS"}${aviso}\n\nOBSERVAÇÃO: CONFIRA A OBRA, A LOCALIZAÇÃO E AS QUANTIDADES ANTES DA ENTREGA.`;
    window.open(
      `https://wa.me/${whats}?text=${encodeURIComponent(msg)}`,
      "_blank",
      "noopener,noreferrer",
    );
  }
  function enviarAtualAoMotorista(tipo) {
    if (entrega !== "COM ENTREGA") return alert("MARQUE COM ENTREGA.");
    if (!c) return alert("SELECIONE O CLIENTE.");
    if (!motoristaId) return alert("SELECIONE O MOTORISTA DA ENTREGA.");
    if (!effectiveItems.length) return alert("INFORME AO MENOS UM PRODUTO.");
    abrirWhatsappMotorista(null, tipo);
  }
  function reciboFreteAtual() {
    if (entrega !== "COM ENTREGA")
      return alert("MARQUE COM ENTREGA PARA GERAR O RECIBO DE FRETE.");
    if (!c) return alert("SELECIONE O CLIENTE.");
    if (!motoristaId) return alert("SELECIONE O MOTORISTA DA ENTREGA.");
    if (!effectiveItems.length)
      return alert(
        "INFORME AO MENOS UM PRODUTO COM QUANTIDADE PARA CALCULAR O FRETE.",
      );
    const m = motoristas.find((x) => x.id === motoristaId) || {};
    const linhas = effectiveItems.map(
      (it) =>
        `${it.marca ? it.marca + " • " : ""}${it.produto} | ${it.qtd} SC x ${money(it.tarifaFreteSaco || 0)} = ${money(Number(it.qtd || 0) * Number(it.tarifaFreteSaco || 0))}`,
    );
    pdfSimple(
      "RECIBO / ORDEM DE PAGAMENTO DE FRETE — VENDA BALCÃO",
      [
        `DATA: ${formatDateBR(todayISO())}`,
        `CLIENTE: ${c.nome}`,
        `DESTINO / OBRA: ${upper(destinoEntrega || c.cidade || "-")}`,
        `ENDEREÇO COMPLETO DA ENTREGA: ${enderecoCompletoEntrega()}`,
        `MOTORISTA: ${m.nome || "-"}`,
        `PLACA: ${m.placa1 || "-"}`,
        `CHAVE PIX: ${m.chavePix || "-"}`,
        `FAVORECIDO PIX: ${m.favorecidoPix || m.nome || "-"}`,
        "",
        "CÁLCULO DO FRETE:",
        ...linhas,
        "",
        `VALOR TOTAL DO FRETE: ${money(fretePreview)}`,
        `RESPONSÁVEL PELO PAGAMENTO: ${responsavelFrete}`,
        `SITUAÇÃO: ${responsavelFrete === "FORTE ATACAREJO" ? "A PAGAR PELA FORTE ATACAREJO" : "FRETE PAGO DIRETAMENTE PELO CLIENTE — NÃO GERA CONTAS A PAGAR"}`,
        "",
        "ASSINATURA DO MOTORISTA: ________________________________________",
        "",
        "ASSINATURA / RESPONSÁVEL: ______________________________________",
      ],
      `RECIBO-FRETE-BALCAO-${todayISO()}-${String(m.nome || "MOTORISTA").replace(/[^A-Z0-9]+/gi, "-")}.pdf`,
    );
  }
  const fechados = caixas
    .filter((x) => x.status === "FECHADO")
    .slice()
    .reverse();
  function vendaPodeSerAlterada(v) {
    return !!(
      caixaAberto &&
      v?.status === "CONCLUÍDA" &&
      v.caixaId === caixaAberto.id &&
      v.data === todayISO()
    );
  }
  function editarVendaBalcao(v) {
    if (!vendaPodeSerAlterada(v))
      return alert(
        "VENDA BLOQUEADA: SOMENTE VENDAS DO CAIXA DO DIA AINDA ABERTO PODEM SER EDITADAS.",
      );
    setEditVendaId(v.id);
    setUnidade(v.unidade || unidade);
    setClienteId(v.clienteId || "");
    setItens((v.itens || []).map((x) => ({ ...x })));
    setItensConfirmados(true);
    setPag(v.pagamento || "A VISTA");
    setEntrega(v.entrega || "SEM ENTREGA");
    setMotoristaId(v.motoristaId || "");
    setDestinoEntrega(v.destinoEntrega || "");
    setResponsavelFrete(v.responsavelFrete || "FORTE ATACAREJO");
    window.scrollTo({ top: 0, behavior: "smooth" });
    alert(
      `VENDA ${v.numeroVenda || v.id} ABERTA PARA EDIÇÃO. O NÚMERO DA VENDA SERÁ PRESERVADO.`,
    );
  }
  function cancelarVendaBalcao(v) {
    if (!vendaPodeSerAlterada(v))
      return alert(
        "VENDA BLOQUEADA: O CAIXA DESTA VENDA JÁ FOI FECHADO OU NÃO É O CAIXA ABERTO DE HOJE.",
      );
    const motivo = upper(
      prompt(
        `CANCELAR / ESTORNAR ${v.numeroVenda || v.id}\n\nINFORME O MOTIVO:`,
      ) || "",
    );
    if (!motivo) return;
    if (
      !confirm(
        `CONFIRME QUE O PAGAMENTO FOI DEVOLVIDO / ESTORNADO QUANDO APLICÁVEL.\n\nVENDA: ${v.numeroVenda || v.id}\nVALOR: ${money(v.total || 0)}\n\nDESEJA CANCELAR?`,
      )
    )
      return;
    onChange((d) => {
      let vb = (d.vendasBalcao || []).filter((x) => x.id !== v.id);
      if (v.orcamentoOrigemId) {
        vb = vb.map((o) => {
          if (o.id !== v.orcamentoOrigemId) return o;
          const orig = o.itens || [];
          const saldoAtual = o.itensSaldo || [];
          const saldoNovo = orig
            .map((base) => {
              const atual = saldoAtual.find(
                (x) => x.produtoId === base.produtoId,
              ) || { ...base, qtd: 0 };
              const devolvida = (v.itens || [])
                .filter((x) => x.produtoId === base.produtoId)
                .reduce((a, x) => a + Number(x.qtd || 0), 0);
              const qtdNova = Math.min(
                Number(base.qtd || 0),
                Number(atual.qtd || 0) + devolvida,
              );
              return {
                ...base,
                qtd: qtdNova,
                subtotal: qtdNova * Number(base.precoUnitario || 0),
                frete:
                  o.entrega === "COM ENTREGA"
                    ? qtdNova * Number(base.tarifaFreteSaco || 0)
                    : 0,
              };
            })
            .filter((x) => Number(x.qtd || 0) > 0);
          const totalOriginal = orig.reduce(
              (a, x) => a + Number(x.qtd || 0),
              0,
            ),
            totalRestante = saldoNovo.reduce(
              (a, x) => a + Number(x.qtd || 0),
              0,
            ),
            totalVendido = Math.max(0, totalOriginal - totalRestante);
          return {
            ...o,
            itensSaldo: saldoNovo,
            qtdOriginal: totalOriginal,
            qtdVendida: totalVendido,
            qtdPendente: totalRestante,
            status: totalVendido > 0 ? "PARCIALMENTE ATENDIDO" : "ORÇAMENTO",
            reservaEstoqueStatus: "ATIVA — VENDA ESTORNADA / SALDO DEVOLVIDO",
            reservaAtualizadaEm: nowISO(),
            atendimentos: (o.atendimentos || []).filter(
              (a) => a.numeroVenda !== v.numeroVenda,
            ),
            atualizadoEm: nowISO(),
          };
        });
      }
      const creditos = (d.creditosClientes || []).filter(
        (cr) => !String(cr.origem || "").includes(v.numeroVenda || v.id),
      );
      return {
        ...d,
        vendasBalcao: vb,
        patioSaidas: (d.patioSaidas || []).filter((x) => x.vendaId !== v.id),
        fretesBalcao: (d.fretesBalcao || []).filter((x) => x.vendaId !== v.id),
        contasPagar: (d.contasPagar || []).filter(
          (x) => !(x.referencia === v.id && x.tipo === "FRETE VENDA BALCÃO"),
        ),
        contasReceber: (d.contasReceber || []).filter(
          (x) => x.vendaId !== v.id && x.referencia !== v.id,
        ),
        boletosClientes: (d.boletosClientes || []).filter(
          (x) => x.vendaId !== v.id,
        ),
        comprovantesClientes: (d.comprovantesClientes || []).filter(
          (x) => x.vendaId !== v.id,
        ),
        creditosClientes: creditos,
        auditoria: [
          ...(d.auditoria || []),
          {
            id: uid("aud"),
            dataHora: nowISO(),
            acao: "VENDA BALCÃO CANCELADA / ESTORNADA",
            entityType: "VENDA BALCÃO",
            entityId: v.id,
            usuario: currentUser?.nome || "",
            detalhe: `${v.numeroVenda || v.id} • ${money(v.total || 0)} • ${motivo}`,
          },
        ],
      };
    });
    if (editVendaId === v.id) {
      setEditVendaId("");
      setItens([]);
    }
    alert(
      "VENDA CANCELADA / ESTORNADA. EFEITOS DO CAIXA DO DIA FORAM DESFEITOS. O REGISTRO MÍNIMO FOI PRESERVADO NA AUDITORIA.",
    );
  }
  const clienteRelatorio = clientes.find((x) => x.id === clienteRelatorioId);
  const operacoesCliente = clienteRelatorio
    ? vendas
        .filter((v) => v.clienteId === clienteRelatorio.id)
        .slice()
        .sort((a, b) =>
          String(b.dataOperacao || b.data || b.criadoEm || "").localeCompare(
            String(a.dataOperacao || a.data || a.criadoEm || ""),
          ),
        )
    : [];
  const resumoCliente = clienteRelatorio
    ? {
        compras: operacoesCliente.filter((v) => v.status === "CONCLUÍDA")
          .length,
        totalLiquidado: operacoesCliente
          .filter((v) => v.status === "CONCLUÍDA")
          .reduce((a, v) => a + Number(v.total || 0), 0),
        orcAbertos: operacoesCliente.filter((v) =>
          ["ORÇAMENTO", "PARCIALMENTE ATENDIDO"].includes(v.status),
        ).length,
        credito: creditoDisponivelCliente(clienteRelatorio.id),
        ultima: operacoesCliente[0],
      }
    : null;
  function abrirRelatorioCompletoCliente() {
    const q = upper(filtroOrcCliente || "").trim();
    if (!q) return alert("DIGITE O NOME DO CLIENTE NO FILTRO CLIENTE.");
    const candidatos = clientes.filter((x) => upper(x.nome || "").includes(q));
    if (candidatos.length === 0) return alert("CLIENTE NÃO ENCONTRADO.");
    if (candidatos.length > 1) {
      const lista = candidatos
        .slice(0, 12)
        .map((x) => x.nome)
        .join("\n");
      return alert(
        `MAIS DE UM CLIENTE ENCONTRADO. DIGITE MAIS CARACTERES:\n\n${lista}`,
      );
    }
    setClienteRelatorioId(candidatos[0].id);
    setOpsClienteSelecionadas([]);
  }
  function gerarPdfClienteSelecionados() {
    if (!clienteRelatorio) return alert("SELECIONE UM CLIENTE.");
    const rows = operacoesCliente.filter((x) =>
      opsClienteSelecionadas.includes(x.id),
    );
    if (!rows.length) return alert("MARQUE AO MENOS UMA OPERAÇÃO.");
    pdfTabela(
      `RELATÓRIO COMPLETO DO CLIENTE — ${clienteRelatorio.nome}`,
      [
        {
          label: "DATA",
          w: 0.7,
          get: (x) => formatDateBR(x.dataOperacao || x.data),
        },
        {
          label: "TIPO",
          w: 1,
          get: (x) => (x.status === "CONCLUÍDA" ? "VENDA BALCÃO" : "ORÇAMENTO"),
        },
        {
          label: "NÚMERO",
          w: 1.2,
          get: (x) => x.numeroVenda || x.numeroOrcamento || x.id,
        },
        {
          label: "PRODUTOS / QTD",
          w: 2.7,
          get: (x) =>
            (x.itens || []).map((i) => `${i.produto} ${i.qtd}SC`).join(" / "),
        },
        {
          label: "DESTINO / OBRA",
          w: 1.5,
          get: (x) => x.destinoEntrega || "-",
        },
        { label: "TOTAL", w: 0.9, get: (x) => money(x.total || 0) },
        { label: "STATUS", w: 1.2, get: (x) => x.status },
      ],
      rows,
      `CLIENTE-${clienteRelatorio.id}-${todayISO()}.pdf`,
      [
        `OPERAÇÕES SELECIONADAS: ${rows.length}`,
        `TOTAL LIQUIDADO: ${money(resumoCliente?.totalLiquidado || 0)} • ORÇAMENTOS EM ABERTO: ${resumoCliente?.orcAbertos || 0} • CRÉDITO: ${money(resumoCliente?.credito || 0)}`,
      ],
    );
  }
  function pdfCaixaCondensado(cx) {
    pdfSimple(
      `FECHAMENTO DE CAIXA — CONDENSADO — ${formatDateBR(cx.data)}`,
      [
        `UNIDADE: ${cx.unidade}`,
        `OPERADOR: ${cx.operador}`,
        `ABERTURA: ${cx.abertoEm ? new Date(cx.abertoEm).toLocaleString("pt-BR") : "-"}`,
        `FECHAMENTO: ${cx.fechadoEm ? new Date(cx.fechadoEm).toLocaleString("pt-BR") : "-"}`,
        `SALDO INICIAL: ${money(cx.saldoInicial)}`,
        `TOTAL VENDAS: ${money(cx.totalVendas)}`,
        `SALDO ESPERADO: ${money(cx.saldoEsperado ?? cx.saldoInicial)}`,
        `SALDO CONTADO: ${money(cx.saldoContado ?? cx.saldoInicial)}`,
        `DIFERENÇA: ${money(cx.diferenca || 0)}`,
        ...(cx.justificativa ? [`JUSTIFICATIVA: ${cx.justificativa}`] : []),
        "",
        "TOTAIS POR FORMA DE PAGAMENTO:",
        ...Object.entries(cx.porForma || {}).map(
          ([k, v]) => `${k}: ${money(v)}`,
        ),
        "",
        "CRÉDITOS DISPONÍVEIS DOS CLIENTES NO FECHAMENTO:",
        ...((cx.creditosClientesSnapshot || []).length
          ? (cx.creditosClientesSnapshot || []).map(
              (cr) => `${cr.cliente}: ${money(cr.saldo)}`,
            )
          : ["NENHUM CLIENTE COM CRÉDITO DISPONÍVEL."]),
      ],
      `CAIXA-${cx.data}-CONDENSADO.pdf`,
    );
  }
  function pdfCaixaAnalitico(cx) {
    const lista = (cx.vendaIds || [])
      .map((id) => (data.vendasBalcao || []).find((v) => v.id === id))
      .filter(Boolean);
    const linhas = [
      `UNIDADE: ${cx.unidade}`,
      `OPERADOR: ${cx.operador}`,
      `PERÍODO: ${cx.abertoEm ? new Date(cx.abertoEm).toLocaleString("pt-BR") : "-"} ATÉ ${cx.fechadoEm ? new Date(cx.fechadoEm).toLocaleString("pt-BR") : "-"}`,
      "",
      ...lista.flatMap((v, i) => [
        `VENDA ${i + 1} — ${v.numeroVenda || v.id} — ${v.dataHora ? new Date(v.dataHora).toLocaleString("pt-BR") : formatDateBR(v.data)}`,
        `CLIENTE: ${v.cliente || "-"} | DESTINO/OBRA: ${v.destinoEntrega || "-"}`,
        `ITENS: ${(v.itens || []).map((it) => `${it.marca ? it.marca + " — " : ""}${it.produto} ${it.qtd} SC`).join(" / ") || "-"}`,
        `PAGAMENTO: ${v.pagamento || "-"} | PRODUTOS: ${money(v.subtotal || 0)} | FRETE: ${money(v.frete || 0)} | TOTAL: ${money(v.total || 0)}`,
        `MOTORISTA/ENTREGA: ${v.motorista || "-"} | COMPROVANTES: ${(data.comprovantesClientes || []).filter((cp) => cp.vendaId === v.id || cp.operacaoId === v.id).length}`,
        `STATUS: ${v.status || "-"}`,
        "",
      ]),
      "CRÉDITOS DISPONÍVEIS AO FINAL DO CAIXA:",
      ...((cx.creditosClientesSnapshot || []).length
        ? (cx.creditosClientesSnapshot || []).map(
            (cr) => `${cr.cliente}: ${money(cr.saldo)}`,
          )
        : ["NENHUM."]),
    ];
    pdfSimple(
      `${cx.preConferencia ? "PRÉ-CONFERÊNCIA" : "FECHAMENTO"} DE CAIXA — ANALÍTICO — ${formatDateBR(cx.data)}`,
      [
        ...(cx.preConferencia
          ? [
              "DOCUMENTO DE CONFERÊNCIA — O CAIXA PERMANECE ABERTO E EDITÁVEL ATÉ O FECHAMENTO DEFINITIVO.",
              `GERADO EM: ${new Date(cx.preConferidaEm).toLocaleString("pt-BR")}`,
              "",
            ]
          : []),
        ...linhas,
      ],
      `${cx.preConferencia ? "PRE-CONFERENCIA" : "CAIXA"}-${cx.data}-ANALITICO.pdf`,
    );
  }
  return (
    <section className="card">
      <div className="sectionHead">
        <div>
          <h2>VENDA BALCÃO</h2>
          <p>
            VÁRIOS PRODUTOS • PREÇO BLINDADO • FRETE POR SACO • CAIXA DIÁRIO.
          </p>
          {editVendaId && (
            <div className="alert warning">
              <b>EDITANDO VENDA DO CAIXA DO DIA</b> • O NÚMERO SERÁ PRESERVADO.
              SALVE OS ITENS E CLIQUE EM GERAR / CONCLUIR VENDA PARA GRAVAR AS
              ALTERAÇÕES.
            </div>
          )}
        </div>
        <div className="actions">
          <button onClick={onOpenBoleto}>
            EMITIR / ALTERAR BOLETO
          </button>
          <button
            onClick={() =>
              pdfSimple(
              "RELATÓRIO DE VENDA BALCÃO",
              vendas.map(
                (v) =>
                  `${v.data} | ${v.unidade} | ${v.cliente} | ${(v.itens || []).map((i) => `${i.produto} ${i.qtd}SC`).join("; ")} | FRETE ${money(v.frete)} | ${v.responsavelFrete || "-"} | TOTAL ${money(v.total)} | ${v.status}`,
              ),
              "RELATORIO-VENDA-BALCAO.pdf",
            )
          }
        >
            GERAR RELATÓRIO PDF
          </button>
        </div>
      </div>
      <div className="transportBox">
        <h3>CAIXA BALCÃO</h3>
        <div className="miniGrid">
          <Field label="DESTINO PARA CONSULTA (SALDO SEMPRE CONSOLIDADO)">
            <select
              value={unidade}
              onChange={(e) => setUnidade(e.target.value)}
            >
              {unidades.map((u) => (
                <option key={u.id}>{u.nome}</option>
              ))}
            </select>
          </Field>
          {!caixaAberto ? (
            <>
              <Field label="SALDO INICIAL / TROCO">
                <input
                  type="number"
                  step="0.01"
                  value={saldoInicial}
                  onChange={(e) => setSaldoInicial(e.target.value)}
                />
              </Field>
              <button onClick={abrirCaixa}>ABRIR CAIXA</button>
            </>
          ) : (
            <>
              <div className="alert success">
                <b>CAIXA ABERTO</b> • {formatDateBR(caixaAberto.data)} •{" "}
                {caixaAberto.operador}
              </div>
              <button className="secondary" onClick={conferirCaixa}>
                CONFERIR CAIXA
              </button>
              <button className="dangerBtn" onClick={fecharCaixa}>
                FECHAR CAIXA
              </button>
            </>
          )}
        </div>
        {fechados.slice(0, 8).map((cx) => (
          <div className="financialRow" key={cx.id}>
            <b>{formatDateBR(cx.data)}</b>
            <span>{cx.unidade}</span>
            <span>{cx.operador}</span>
            <span>{money(cx.totalVendas)}</span>
            <span>{cx.status}</span>
            <button
              className="secondary"
              onClick={() => pdfCaixaCondensado(cx)}
            >
              PDF CONDENSADO
            </button>
            <button onClick={() => pdfCaixaAnalitico(cx)}>PDF ANALÍTICO</button>
          </div>
        ))}
      </div>
      <div className="miniGrid">
        <Field label="CLIENTE">
          <select
            value={clienteId}
            onChange={(e) => setClienteId(e.target.value)}
          >
            <option value="">SELECIONE...</option>
            {clientes
              .filter(
                (c) =>
                  c.ativo !== false &&
                  c.statusCadastro !== "AGUARDANDO APROVAÇÃO",
              )
              .map((c) => (
                <option value={c.id} key={c.id}>
                  {c.nome}
                </option>
              ))}
          </select>
        </Field>
        <Field label="ENTREGA">
          <select value={entrega} onChange={(e) => setEntrega(e.target.value)}>
            <option>SEM ENTREGA</option>
            <option>COM ENTREGA</option>
          </select>
        </Field>
        {entrega === "COM ENTREGA" && (
          <>
            <Field label="DESTINO / OBRA DA ENTREGA">
              <select
                value={destinoEntrega}
                onChange={(e) => setDestinoEntrega(e.target.value)}
              >
                <option value="">SELECIONE...</option>
                {(c?.obras || [])
                  .filter((o) => o.ativo !== false)
                  .map((o) => (
                    <option
                      key={o.id}
                      value={`${o.nome} — ${o.endereco || ""} ${o.cidade || ""}/${o.uf || ""}`}
                    >
                      {o.nome} • {o.endereco || ""} • {o.cidade || ""}/
                      {o.uf || ""}
                    </option>
                  ))}
                {c && !(c?.obras || []).length && (
                  <option value={enderecoPrincipalCliente(c)}>
                    ENDEREÇO PRINCIPAL — {enderecoPrincipalCliente(c) || `${c.cidade || ""}/${c.uf || ""}`}
                  </option>
                )}
              </select>
            </Field>
            <Field label="MOTORISTA DA ENTREGA">
              <select
                value={motoristaId}
                disabled={!!orcamentoCarregado}
                onChange={(e) => setMotoristaId(e.target.value)}
              >
                <option value="">SELECIONE...</option>
                {motoristas
                  .filter((m) => m.ativo !== false)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome}
                      {m.apelido ? ` — ${m.apelido}` : ""} • {m.placa1}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="RESPONSÁVEL PELO PAGAMENTO DO FRETE">
              <select
                value={responsavelFrete}
                disabled={!!orcamentoCarregado}
                onChange={(e) => setResponsavelFrete(e.target.value)}
              >
                <option>FORTE ATACAREJO</option>
                <option>CLIENTE</option>
              </select>
            </Field>
            <Field label="VALOR TOTAL DO FRETE">
              <input
                readOnly
                className="freightTotalField"
                value={money(fretePreview)}
              />
            </Field>
            {motoristaId && (
              <>
                <Field label="WHATSAPP DO MOTORISTA">
                  <input
                    readOnly
                    value={
                      motoristaEntregaSelecionado?.whatsapp ||
                      motoristaEntregaSelecionado?.telefone ||
                      motoristaEntregaSelecionado?.celular ||
                      "SEM WHATSAPP CADASTRADO"
                    }
                  />
                </Field>
                <Field label="PIX DO MOTORISTA">
                  <input
                    readOnly
                    value={
                      motoristaEntregaSelecionado?.chavePix ||
                      "SEM PIX CADASTRADO"
                    }
                  />
                </Field>
                <button
                  className="secondary"
                  onClick={() => enviarAtualAoMotorista("ORÇAMENTO")}
                >
                  ENVIAR ORÇAMENTO AO MOTORISTA
                </button>
                <button onClick={() => enviarAtualAoMotorista("VENDA")}>
                  ENVIAR VENDA AO MOTORISTA
                </button>
              </>
            )}
          </>
        )}
        <Field label="FORMA DE PAGAMENTO">
          <select value={pag} onChange={(e) => setPag(e.target.value)}>
            {pagamentos.map((p) => (
              <option key={p.id}>{p.descricao}</option>
            ))}
          </select>
        </Field>
      </div>
      <h3>ITENS DA VENDA</h3>
      <div className="miniGrid">
        <Field label="PRODUTO">
          <select
            value={produtoId}
            onChange={(e) => setProdutoId(e.target.value)}
          >
            <option value="">SELECIONE...</option>
            {produtos
              .filter((p) => p.ativo !== false)
              .map((p) => (
                <option value={p.id} key={p.id}>
                  {p.marca ? `${p.marca} • ` : ""}{p.nome}
                </option>
              ))}
          </select>
        </Field>
        <Field label="QUANTIDADE">
          <input
            type="number"
            value={qtd}
            onChange={(e) => setQtd(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addItem();
              }
            }}
            placeholder="DIGITE E PRESSIONE ENTER"
          />
        </Field>
        <Field label="PREÇO TABELA">
          <input disabled value={money(tabela)} />
        </Field>
        <Field label="ESTOQUE FÍSICO / RESERVADO / DISPONÍVEL">
          <input
            disabled
            value={
              produtoId
                ? `${estoqueFisico(produtoId)} / ${estoqueReservado(produtoId)} / ${estoqueDisponivel(produtoId)} SC`
                : "SELECIONE O PRODUTO"
            }
          />
        </Field>
        <Field label="DESCONTO ADMIN.">
          <input disabled value={`${desconto}%`} />
        </Field>
        <Field label="PREÇO AUTORIZADO">
          <input disabled value={money(preco)} />
        </Field>
        <Field label="TARIFA ENTREGA / SACO">
          <input
            disabled
            value={money(entrega === "COM ENTREGA" ? tarifa : 0)}
          />
        </Field>
      </div>
      <div className="note">
        <b>INCLUSÃO DE ITEM:</b> SELECIONE O PRODUTO, INFORME A QUANTIDADE E
        PRESSIONE ENTER.
      </div>
      <div className="cadList">
        {itens.map((it) => (
          <div className="cadRow" key={it.id}>
            <div>
              <b>{it.marca ? `${it.marca} • ` : ""}{it.produto}</b>
              <small>
                QTD {it.qtd} • PREÇO {money(it.precoUnitario)} • FRETE/SACO{" "}
                {money(entrega === "COM ENTREGA" ? it.tarifaFreteSaco : 0)} •
                SUBTOTAL {money(Number(it.subtotal || 0))}
              </small>
            </div>
            <div className="cadRowActions">
              <label className="inlineQty">
                QTD{" "}
                <input
                  type="number"
                  min="0"
                  value={it.qtd}
                  onChange={(e) => {
                    const nq = Math.max(0, Number(e.target.value || 0));
                    setItens((a) =>
                      a.map((x) =>
                        x.id === it.id
                          ? {
                              ...x,
                              qtd: nq,
                              subtotal: nq * Number(x.precoUnitario || 0),
                              frete:
                                entrega === "COM ENTREGA"
                                  ? nq * Number(x.tarifaFreteSaco || 0)
                                  : 0,
                            }
                          : x,
                      ),
                    );
                    setItensConfirmados(false);
                  }}
                />
              </label>
              <b>
                {money(
                  Number(it.qtd || 0) * Number(it.precoUnitario || 0) +
                    (entrega === "COM ENTREGA" &&
                    responsavelFrete === "FORTE ATACAREJO"
                      ? Number(it.qtd || 0) * Number(it.tarifaFreteSaco || 0)
                      : 0),
                )}
              </b>
              <button
                className="dangerBtn"
                onClick={() => {
                  setItens((a) => a.filter((x) => x.id !== it.id));
                  setItensConfirmados(false);
                }}
              >
                REMOVER
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="supplierActions">
        <button
          disabled={!itens.length}
          onClick={() => {
            try {
              localStorage.setItem(BALCAO_DRAFT_KEY, JSON.stringify(itens));
              setItensConfirmados(true);
              alert(
                `${itens.length} ITEM(NS) SALVO(S). AGORA ESCOLHA GERAR ORÇAMENTO OU CONCLUIR A VENDA.`,
              );
            } catch {
              alert("NÃO FOI POSSÍVEL SALVAR OS ITENS.");
            }
          }}
        >
          SALVAR
        </button>
        <span className="note">
          <b>{itens.length} ITEM(NS) NA LISTA</b>
          {itens.length
            ? itensConfirmados
              ? " — ITENS SALVOS. ESCOLHA ORÇAMENTO OU VENDA."
              : " — PRESSIONE SALVAR QUANDO FINALIZAR A MONTAGEM."
            : " — ADICIONE PRODUTOS COM ENTER."}
        </span>
      </div>
      <div className="transportBox palletDecisionV49">
        <h3>PALLETS — PREENCHIMENTO OBRIGATÓRIO</h3>
        <p>
          PARA ESTA QUANTIDADE, O SISTEMA SUGERE{" "}
          <b>{palletsSugeridos} PALLET(S)</b>. CP2 50 KG: 40 SACOS/PALLET •
          EXTRA FORTE/40 KG: 50 SACOS/PALLET.
        </p>
        <div className="miniGrid">
          <Field label="SITUAÇÃO DOS PALLETS">
            <select
              value={situacaoPallets}
              onChange={(e) => {
                const valor = e.target.value;
                setSituacaoPallets(valor);
                if (valor === "SEM PALLETS") {
                  setPalletsForte("0");
                  setPalletsCliente("0");
                }
                if (valor === "COM PALLETS" && !palletsForte)
                  setPalletsForte(String(palletsSugeridos));
                if (valor === "CLIENTE LEVOU OS PALLETS" && !palletsCliente)
                  setPalletsCliente(String(palletsSugeridos));
              }}
            >
              <option value="">SELECIONE...</option>
              <option>COM PALLETS</option>
              <option>SEM PALLETS</option>
              <option>CLIENTE LEVOU OS PALLETS</option>
            </select>
          </Field>
          <Field label="EMPRESTADOS PELA FORTE">
            <input
              type="number"
              min="0"
              value={palletsForte}
              onChange={(e) => setPalletsForte(e.target.value)}
            />
          </Field>
          <Field label="LEVADOS PELO CLIENTE">
            <input
              type="number"
              min="0"
              value={palletsCliente}
              onChange={(e) => setPalletsCliente(e.target.value)}
            />
          </Field>
          <Field label="TOTAL INFORMADO">
            <input
              readOnly
              value={`${Number(palletsForte || 0) + Number(palletsCliente || 0)} PALLET(S)`}
            />
          </Field>
          <Field label="JUSTIFICATIVA SE DIFERENTE DA SUGESTÃO">
            <UpperInput
              value={justificativaPallets}
              onChange={setJustificativaPallets}
            />
          </Field>
        </div>
        <small>
          NENHUM ORÇAMENTO OU VENDA SERÁ GRAVADO COM A SITUAÇÃO DOS PALLETS EM
          BRANCO. SOMENTE OS PALLETS DA FORTE GERAM DÉBITO NO CONTA-CORRENTE DO
          CLIENTE.
        </small>
      </div>
      <div className="alert success">
        <b>PRODUTOS:</b> {money(subtotalPreview)} • <b>FRETE:</b>{" "}
        {money(fretePreview)} • <b>PAGO POR:</b>{" "}
        {entrega === "COM ENTREGA" ? responsavelFrete : "N/A"} •{" "}
        <b>TOTAL A COBRAR PELA FORTE:</b> {money(total)}
        {entrega === "COM ENTREGA" && motoristaId && (
          <>
            {" "}
            • <b>MOTORISTA:</b>{" "}
            {motoristas.find((x) => x.id === motoristaId)?.nome || "-"} •{" "}
            <b>PLACA:</b>{" "}
            {motoristas.find((x) => x.id === motoristaId)?.placa1 || "-"}
          </>
        )}
      </div>
      {itensConfirmados && (
        <>
          <div className="transportBox">
            <h3>ORÇAMENTO NUMERADO</h3>
            <div className="miniGrid">
              <Field label="PRÓXIMO Nº DE ORÇAMENTO">
                <input readOnly value={numeroOrcamento()} />
              </Field>
              <Field label="LOCALIZAR Nº DE ORÇAMENTO">
                <input
                  value={buscaOrcamento}
                  onChange={(e) => setBuscaOrcamento(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      carregarOrcamento();
                    }
                  }}
                  placeholder="EX.: ORC-2026-000001"
                />
              </Field>
            </div>
            <small>
              A QUANTIDADE ORIGINAL DO ORÇAMENTO É PRESERVADA. CADA VENDA ABATE
              SOMENTE A QUANTIDADE INFORMADA E O SALDO CONTINUA PENDENTE ATÉ SER
              TOTALMENTE ATENDIDO OU ENCERRADO.
            </small>
          </div>
          <div className="transportBox">
            <h3>PAINEL DE AÇÕES</h3>
            <div className="supplierActions">
              <button className="secondary" onClick={() => carregarOrcamento()}>
                LOCALIZAR ORÇAMENTO
              </button>
              <button
                className="secondary"
                disabled={
                  !vendas.some(
                    (v) =>
                      normalizarNumeroOrcamento(v.numeroOrcamento || v.id) ===
                        normalizarNumeroOrcamento(buscaOrcamento) &&
                      ["ORÇAMENTO", "PARCIALMENTE ATENDIDO"].includes(v.status),
                  )
                }
                onClick={converterOrcamento}
              >
                GERAR VENDA PARCIAL / TOTAL
              </button>
              {entrega === "COM ENTREGA" && (
                <button className="secondary" onClick={reciboFreteAtual}>
                  GERAR RECIBO DE FRETE / PIX
                </button>
              )}
              <button className="secondary" onClick={() => salvar("ORÇAMENTO")}>
                GERAR ORÇAMENTO
              </button>
              <button onClick={() => salvar("CONCLUÍDA")}>
                GERAR / CONCLUIR VENDA
              </button>
            </div>
          </div>
        </>
      )}
      <div className="transportBox budgetSearchBox">
        <div className="sectionHead">
          <div>
            <h3>ORÇAMENTOS — CONSULTA E SALDOS PENDENTES</h3>
            <p>
              DIGITE O CLIENTE, PRODUTO, NÚMERO OU PERÍODO. EX.: AO DIGITAR
              DÁRIO, O SISTEMA MOSTRA TODOS OS ORÇAMENTOS DESSE CLIENTE.
            </p>
          </div>
          <div className="cadRowActions">
            <button
              className="secondary"
              onClick={abrirRelatorioCompletoCliente}
            >
              RELATÓRIO COMPLETO DO CLIENTE
            </button>
            <button onClick={gerarRelatorioOrcamentos}>
              GERAR RELATÓRIO PDF
            </button>
            <button className="secondary" onClick={gerarRelatorioEstoqueReservado}>
              ESTOQUE RESERVADO
            </button>
          </div>
        </div>
        <div className="miniGrid budgetFilters">
          <Field label="CLIENTE">
            <input
              value={filtroOrcCliente}
              onChange={(e) => setFiltroOrcCliente(e.target.value)}
              placeholder="EX.: DÁRIO"
            />
          </Field>
          <Field label="Nº ORÇAMENTO">
            <input
              value={filtroOrcNumero}
              onChange={(e) => setFiltroOrcNumero(e.target.value)}
              placeholder="ORC-2026..."
            />
          </Field>
          <Field label="PRODUTO">
            <input
              value={filtroOrcProduto}
              onChange={(e) => setFiltroOrcProduto(e.target.value)}
              placeholder="EX.: CP2 CIPLAN"
            />
          </Field>
          <Field label="STATUS">
            <select
              value={filtroOrcStatus}
              onChange={(e) => setFiltroOrcStatus(e.target.value)}
            >
              <option>EM ABERTO</option>
              <option>ORÇAMENTO</option>
              <option>PARCIALMENTE ATENDIDO</option>
              <option>ATENDIDO</option>
              <option>CANCELADO</option>
              <option>TODOS</option>
            </select>
          </Field>
          <Field label="DE">
            <input
              type="date"
              value={filtroOrcInicio}
              onChange={(e) => setFiltroOrcInicio(e.target.value)}
            />
          </Field>
          <Field label="ATÉ">
            <input
              type="date"
              value={filtroOrcFim}
              onChange={(e) => setFiltroOrcFim(e.target.value)}
            />
          </Field>
          <button
            className="ghost dark"
            onClick={() => {
              setFiltroOrcCliente("");
              setFiltroOrcNumero("");
              setFiltroOrcProduto("");
              setFiltroOrcStatus("EM ABERTO");
              setFiltroOrcInicio("");
              setFiltroOrcFim("");
            }}
          >
            LIMPAR FILTROS
          </button>
        </div>
        {clienteRelatorio && (
          <div className="transportBox">
            <div className="sectionHead">
              <div>
                <h3>HISTÓRICO COMPLETO — {clienteRelatorio.nome}</h3>
                <p>ORÇAMENTOS E VENDAS BALCÃO NO MESMO PRONTUÁRIO COMERCIAL.</p>
              </div>
              <button
                className="ghost dark"
                onClick={() => {
                  setClienteRelatorioId("");
                  setOpsClienteSelecionadas([]);
                }}
              >
                FECHAR HISTÓRICO
              </button>
            </div>
            <div className="budgetFacts">
              <span>
                <b>VENDAS CONCLUÍDAS</b>
                {resumoCliente?.compras || 0}
              </span>
              <span>
                <b>TOTAL LIQUIDADO</b>
                {money(resumoCliente?.totalLiquidado || 0)}
              </span>
              <span>
                <b>ORÇAMENTOS EM ABERTO</b>
                {resumoCliente?.orcAbertos || 0}
              </span>
              <span>
                <b>CRÉDITO DISPONÍVEL</b>
                {money(resumoCliente?.credito || 0)}
              </span>
              <span>
                <b>ÚLTIMA MOVIMENTAÇÃO</b>
                {resumoCliente?.ultima
                  ? formatDateBR(
                      resumoCliente.ultima.dataOperacao ||
                        resumoCliente.ultima.data,
                    )
                  : "-"}
              </span>
            </div>
            <div className="supplierActions">
              <button
                className="secondary"
                onClick={() =>
                  setOpsClienteSelecionadas(operacoesCliente.map((x) => x.id))
                }
              >
                SELECIONAR TODOS
              </button>
              <button
                className="ghost dark"
                onClick={() => setOpsClienteSelecionadas([])}
              >
                LIMPAR SELEÇÃO
              </button>
              <button onClick={gerarPdfClienteSelecionados}>
                GERAR PDF DOS SELECIONADOS
              </button>
            </div>
            <div className="cadList">
              {operacoesCliente.map((op) => (
                <div className="cadRow" key={op.id}>
                  <input
                    type="checkbox"
                    checked={opsClienteSelecionadas.includes(op.id)}
                    onChange={(e) =>
                      setOpsClienteSelecionadas((a) =>
                        e.target.checked
                          ? [...a, op.id]
                          : a.filter((id) => id !== op.id),
                      )
                    }
                  />
                  <div style={{ flex: 1 }}>
                    <b>
                      {op.status === "CONCLUÍDA" ? "VENDA BALCÃO" : "ORÇAMENTO"}{" "}
                      • {op.numeroVenda || op.numeroOrcamento || op.id}
                    </b>
                    <small>
                      {formatDateBR(op.dataOperacao || op.data)} •{" "}
                      {(op.itens || [])
                        .map((i) => `${i.produto} ${i.qtd}SC`)
                        .join(" / ")}{" "}
                      • DESTINO: {op.destinoEntrega || "-"}
                    </small>
                  </div>
                  <span>{money(op.total || 0)}</span>
                  <span
                    className={`statusPill ${op.status === "PARCIALMENTE ATENDIDO" ? "warning" : op.status === "ATENDIDO" || op.status === "CONCLUÍDA" ? "done" : ""}`}
                  >
                    {op.status}
                  </span>
                  {op.status === "CONCLUÍDA" && (
                    <button onClick={() => comprovante(op)}>PDF</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="budgetResultMeta">
          <b>{orcamentosFiltrados.length} ORÇAMENTO(S) ENCONTRADO(S)</b>
          <span>
            USE “POR QUANTIDADE” OU “VENDA PARCIAL POR VALOR”. A BAIXA POR VALOR
            SEGUE OS ITENS DE CIMA PARA BAIXO E MOSTRA O STATUS DE CADA PRODUTO.
          </span>
        </div>
        <div className="budgetCards">
          {orcamentosFiltrados.map((v) => {
            const original = (v.itens || []).reduce(
              (a, x) => a + Number(x.qtd || 0),
              0,
            );
            const pendente = Number(
              v.qtdPendente ??
                (v.itensSaldo || v.itens || []).reduce(
                  (a, x) => a + Number(x.qtd || 0),
                  0,
                ),
            );
            const vendido = Number(
              v.qtdVendida ?? Math.max(0, original - pendente),
            );
            return (
              <div className="budgetCard" key={v.id}>
                <div className="budgetCardTop">
                  <div>
                    <b>{v.numeroOrcamento || v.id}</b>
                    <small>
                      {formatDateBR(v.dataOperacao || v.data)} • {v.cliente}
                    </small>
                  </div>
                  <div>
                    <span
                      className={`statusPill ${v.status === "PARCIALMENTE ATENDIDO" ? "warning" : v.status === "ATENDIDO" ? "done" : ""}`}
                    >
                      {v.status}
                    </span>
                    {creditoDisponivelCliente(v.clienteId) > 0 && (
                      <small>
                        <b>
                          CRÉDITO DO CLIENTE:{" "}
                          {money(creditoDisponivelCliente(v.clienteId))}
                        </b>
                      </small>
                    )}
                  </div>
                </div>
                <div className="budgetItems">
                  {(v.itens || []).map((i) => {
                    const saldoItem = (v.itensSaldo || []).find(
                      (x) =>
                        (x.id && i.id && x.id === i.id) ||
                        (x.produtoId === i.produtoId &&
                          upper(x.produto || "") === upper(i.produto || "")),
                    );
                    const temSaldoRegistrado = Array.isArray(v.itensSaldo);
                    const pendItem =
                      v.status === "ATENDIDO"
                        ? 0
                        : temSaldoRegistrado
                          ? Number(saldoItem?.qtd || 0)
                          : Number(i.qtd || 0);
                    const vendItem = Math.max(0, Number(i.qtd || 0) - pendItem);
                    const stItem =
                      pendItem <= 0
                        ? "LIQUIDADO"
                        : vendItem > 0
                          ? "PARCIALMENTE ATENDIDO"
                          : "PENDENTE";
                    return (
                      <span key={i.id || i.produtoId}>
                        <b>{i.marca ? `${i.marca} • ` : ""}{i.produto}</b> • ORÇADO {i.qtd} SC • VENDIDO{" "}
                        {vendItem} SC • PENDENTE {pendItem} SC • <b>{stItem}</b>
                      </span>
                    );
                  })}
                </div>
                <div className="budgetFacts">
                  <span>
                    <b>ORÇADO</b>
                    {original} SC
                  </span>
                  <span>
                    <b>VENDIDO</b>
                    {vendido} SC
                  </span>
                  <span>
                    <b>PENDENTE</b>
                    {pendente} SC
                  </span>
                  <span>
                    <b>VALOR</b>
                    {money(v.total || 0)}
                  </span>
                  <span>
                    <b>CRÉDITO CLIENTE</b>
                    {money(creditoDisponivelCliente(v.clienteId))}
                  </span>
                  <span>
                    <b>RESERVA DE ESTOQUE</b>
                    {pendente} SC • {v.reservaEstoqueStatus || "ATIVA"}
                  </span>
                </div>
                <div className="budgetActions">
                  <button className="secondary" onClick={() => comprovante(v)}>
                    PDF / IMPRIMIR
                  </button>
                  <button
                    className="secondary"
                    onClick={() => escolherComprovanteOperacao(v)}
                  >
                    ANEXAR COMPROVANTE
                  </button>
                  {comprovantesDaOperacao(v).length > 0 && (
                    <button
                      className="secondary"
                      onClick={() => listarComprovantesOperacao(v)}
                    >
                      COMPROVANTES ({comprovantesDaOperacao(v).length})
                    </button>
                  )}
                  {v.entrega === "COM ENTREGA" && v.motoristaId && (
                    <button
                      className="secondary"
                      onClick={() => abrirWhatsappMotorista(v, "ORÇAMENTO")}
                    >
                      ENVIAR AO MOTORISTA
                    </button>
                  )}
                  {["ORÇAMENTO", "PARCIALMENTE ATENDIDO"].includes(
                    v.status,
                  ) && (
                    <>
                      <button
                        className="secondary"
                        onClick={() => carregarOrcamento(v)}
                      >
                        ABRIR / POR QUANTIDADE
                      </button>
                      <button onClick={() => gerarVendaParcialPorValor(v)}>
                        GERAR VENDA PARCIAL POR VALOR
                      </button>
                      <button className="dangerBtn" onClick={() => cancelarOrcamento(v)}>
                        CANCELAR / LIBERAR RESERVA
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
          {orcamentosFiltrados.length === 0 && (
            <p className="muted">
              NENHUM ORÇAMENTO ENCONTRADO COM OS FILTROS INFORMADOS.
            </p>
          )}
        </div>
      </div>
      <h3>HISTÓRICO DE VENDAS</h3>
      {vendas
        .filter((v) => v.status === "CONCLUÍDA")
        .slice()
        .reverse()
        .map((v) => (
          <div className="financialRow" key={v.id}>
            <b>{formatDateBR(v.data)}</b>
            <span>{v.numeroVenda || v.id}</span>
            <span>{v.cliente}</span>
            <span>
              {(v.itens || [])
                .map((i) => `${i.produto} • ${i.qtd}`)
                .join(" / ")}
            </span>
            <span>{money(v.total)}</span>
            <span>{v.status}</span>
            <button onClick={() => comprovante(v)}>PDF / IMPRIMIR</button>
            <button
              className="secondary"
              onClick={() => escolherComprovanteOperacao(v)}
            >
              ANEXAR COMPROVANTE
            </button>
            {comprovantesDaOperacao(v).length > 0 && (
              <button
                className="secondary"
                onClick={() => listarComprovantesOperacao(v)}
              >
                COMPROVANTES ({comprovantesDaOperacao(v).length})
              </button>
            )}
            {v.entrega === "COM ENTREGA" && (
              <>
                <button className="secondary" onClick={() => comprovanteEntrega(v)}>
                  COMPROVANTE DE ENTREGA
                </button>
                <button onClick={() => reciboFrete(v)}>
                  RECIBO FRETE / PIX
                </button>
                <button
                  className="secondary"
                  onClick={() => abrirWhatsappMotorista(v, "VENDA")}
                >
                  ENVIAR AO MOTORISTA
                </button>
              </>
            )}
            {vendaPodeSerAlterada(v) && (
              <>
                <button
                  className="secondary"
                  onClick={() => editarVendaBalcao(v)}
                >
                  EDITAR VENDA
                </button>
                <button
                  className="dangerBtn"
                  onClick={() => cancelarVendaBalcao(v)}
                >
                  CANCELAR / ESTORNAR
                </button>
              </>
            )}
          </div>
        ))}
    </section>
  );
}

function VendasExternas({ data, onChange, currentUser }) {
  const [clienteId, setClienteId] = useState("");
  const [produtoId, setProdutoId] = useState("");
  const [qtd, setQtd] = useState("");
  const [itens, setItens] = useState([]);
  const [destino, setDestino] = useState("");
  const propostas = data.vendasExternas || [];
  const clientes = data.clientes || [],
    produtos = data.produtos || [];
  const c = clientes.find((x) => x.id === clienteId),
    p = produtos.find((x) => x.id === produtoId);
  const regra = (data.precosClientes || []).find(
    (x) => x.clienteId === clienteId && x.produtoId === produtoId,
  );
  const base = Number(regra?.precoTabela ?? p?.precoTabela ?? 0),
    desc = Number(regra?.descontoPct || 0),
    preco = base * (1 - desc / 100),
    min = Number(p?.precoMinimo || 0);
  function addItem() {
    if (!p || !qtd || Number(qtd) <= 0)
      return alert("SELECIONE PRODUTO E QUANTIDADE.");
    if (min && preco < min)
      return alert(
        "PREÇO AUTORIZADO ABAIXO DO MÍNIMO. SOLICITE AUTORIZAÇÃO ADMINISTRATIVA.",
      );
    setItens((a) => [
      ...a,
      {
        id: uid("it"),
        produtoId: p.id,
        produto: p.nome,
        qtd: Number(qtd),
        precoTabela: base,
        descontoPct: desc,
        precoAutorizado: preco,
        subtotal: Number(qtd) * preco,
        comissao: Number(p.comissaoVendaExterna || 0) * Number(qtd),
      },
    ]);
    setProdutoId("");
    setQtd("");
  }
  function criar() {
    if (!c || !itens.length)
      return alert("SELECIONE CLIENTE E ADICIONE AO MENOS UM PRODUTO.");
    const total = itens.reduce((s, x) => s + Number(x.subtotal || 0), 0),
      comissao = itens.reduce((s, x) => s + Number(x.comissao || 0), 0);
    onChange((d) => ({
      ...d,
      vendasExternas: [
        ...(d.vendasExternas || []),
        {
          id: uid("ve"),
          data: todayISO(),
          dataOperacao: todayISO(),
          criadoEm: nowISO(),
          atualizadoEm: nowISO(),
          vendedor: currentUser?.nome || "VENDEDOR EXTERNO",
          clienteId: c.id,
          cliente: c.nome,
          itens,
          total,
          comissao,
          destino: upper(destino || c.cidade),
          status: "AGUARDANDO APROVAÇÃO",
          atendimento: "",
        },
      ],
    }));
    setItens([]);
    alert("PROPOSTA ENVIADA PARA APROVAÇÃO.");
  }
  function upd(id, patch) {
    onChange((d) => ({
      ...d,
      vendasExternas: (d.vendasExternas || []).map((v) =>
        v.id === id ? { ...v, ...patch } : v,
      ),
    }));
  }
  return (
    <section className="card">
      <div className="sectionHead">
        <div>
          <h2>PAINEL DE VENDAS EXTERNAS</h2>
          <p>
            VÁRIOS PRODUTOS • PREÇOS BLINDADOS • PROPOSTA → APROVAÇÃO →
            ATENDIMENTO → COMISSÃO.
          </p>
        </div>
        <button
          onClick={() =>
            pdfSimple(
              "RELATÓRIO DE VENDAS EXTERNAS",
              propostas
                .filter((v) => v.status === "CONCLUÍDA")
                .map(
                  (v) =>
                    `${opDate(v) || "-"} | ${v.vendedor} | ${v.cliente} | ${(v.itens || []).map((i) => `${i.produto} ${i.qtd}SC`).join("; ")} | TOTAL ${money(v.total)} | COMISSÃO ${money(v.comissao)} | ${v.atendimento}`,
                ),
              "RELATORIO-VENDAS-EXTERNAS.pdf",
            )
          }
        >
          RELATÓRIO / COMISSÃO PDF
        </button>
      </div>
      <div className="miniGrid">
        <Field label="CLIENTE">
          <select
            value={clienteId}
            onChange={(e) => setClienteId(e.target.value)}
          >
            <option value="">SELECIONE...</option>
            {clientes
              .filter((c) => c.ativo !== false)
              .map((c) => (
                <option value={c.id} key={c.id}>
                  {c.nome}
                </option>
              ))}
          </select>
        </Field>
        <Field label="DESTINO / OBRA">
          <select value={destino} onChange={(e) => setDestino(e.target.value)}>
            <option value="">SELECIONE A OBRA / DESTINO...</option>
            {(c?.obras || [])
              .filter((o) => o.ativo !== false)
              .map((o) => (
                <option
                  key={o.id}
                  value={`${o.nome} — ${o.endereco || ""} ${o.cidade || ""}/${o.uf || ""}`}
                >
                  {o.nome} • {o.endereco || ""} • {o.cidade || ""}/{o.uf || ""}
                </option>
              ))}
            {!(c?.obras || []).length && c && (
              <option value={`${c.cidade || ""}${c.uf ? ` - ${c.uf}` : ""}`}>
                ENDEREÇO PRINCIPAL — {c.cidade}/{c.uf}
              </option>
            )}
          </select>
        </Field>
      </div>
      <h3>ITENS DA PROPOSTA</h3>
      <div className="miniGrid">
        <Field label="PRODUTO">
          <select
            value={produtoId}
            onChange={(e) => setProdutoId(e.target.value)}
          >
            <option value="">SELECIONE...</option>
            {produtos
              .filter((p) => p.ativo !== false)
              .map((p) => (
                <option value={p.id} key={p.id}>
                  {p.nome}
                </option>
              ))}
          </select>
        </Field>
        <Field label="QUANTIDADE">
          <input
            type="number"
            value={qtd}
            onChange={(e) => setQtd(e.target.value)}
          />
        </Field>
        <Field label="PREÇO TABELA">
          <input disabled value={money(base)} />
        </Field>
        <Field label="DESCONTO ADMIN.">
          <input disabled value={`${desc}%`} />
        </Field>
        <Field label="PREÇO AUTORIZADO">
          <input disabled value={money(preco)} />
        </Field>
        <button onClick={addItem}>+ ADICIONAR PRODUTO</button>
      </div>
      <div className="cadList">
        {itens.map((it) => (
          <div className="cadRow" key={it.id}>
            <div>
              <b>{it.produto}</b>
              <small>
                {it.qtd} SC • {money(it.precoAutorizado)} • {money(it.subtotal)}
              </small>
            </div>
            <button
              className="dangerBtn"
              onClick={() => setItens((a) => a.filter((x) => x.id !== it.id))}
            >
              REMOVER
            </button>
          </div>
        ))}
      </div>
      <button onClick={criar}>ENVIAR PROPOSTA PARA APROVAÇÃO</button>
      <div className="cadList">
        {propostas
          .slice()
          .reverse()
          .map((v) => (
            <div className="cadRow" key={v.id}>
              <div>
                <b>{v.cliente}</b>
                <small>
                  {opDate(v) || "-"} • {v.vendedor} •{" "}
                  {(v.itens || [])
                    .map((i) => `${i.produto} ${i.qtd}SC`)
                    .join(" / ")}{" "}
                  • TOTAL {money(v.total)} • {v.status}{" "}
                  {v.atendimento && `• ${v.atendimento}`}
                </small>
              </div>
              <div className="cadRowActions">
                {v.status === "AGUARDANDO APROVAÇÃO" && (
                  <>
                    <button onClick={() => upd(v.id, { status: "APROVADA" })}>
                      APROVAR
                    </button>
                    <button
                      className="dangerBtn"
                      onClick={() => upd(v.id, { status: "CANCELADA" })}
                    >
                      CANCELAR
                    </button>
                  </>
                )}
                {v.status === "APROVADA" && (
                  <>
                    <button
                      onClick={() =>
                        upd(v.id, {
                          status: "EM ATENDIMENTO",
                          atendimento: "VENDA BALCÃO",
                        })
                      }
                    >
                      PUXAR PARA BALCÃO
                    </button>
                    <button
                      onClick={() =>
                        upd(v.id, {
                          status: "EM ATENDIMENTO",
                          atendimento: "CARGA DIRETA",
                        })
                      }
                    >
                      PUXAR PARA CARGA DIRETA
                    </button>
                  </>
                )}
                {v.status === "EM ATENDIMENTO" && (
                  <button
                    onClick={() =>
                      upd(v.id, {
                        status: "CONCLUÍDA",
                        concluidaEm: new Date().toISOString(),
                      })
                    }
                  >
                    CONCLUIR
                  </button>
                )}
              </div>
            </div>
          ))}
      </div>
    </section>
  );
}
function buildStockLedger(data, unidade, produtoId) {
  const rows = (data.estoqueMov || [])
    .filter((x) => x.produtoId === produtoId && (!x.unidade || x.unidade === unidade))
    .slice()
    .sort((a, b) =>
      String(a.dataHora || a.data || "").localeCompare(
        String(b.dataHora || b.data || ""),
      ),
    );
  let saldo = 0,
    valor = 0,
    custoMedio = 0;
  return rows.map((x) => {
    const q = Number(x.quantidade || 0),
      entrada = String(x.tipo || "").startsWith("ENTRADA"),
      saida = String(x.tipo || "").startsWith("SAÍDA");
    const ajuste = !entrada && !saida;
    const custoEnt = Number(x.custoUnitario || custoMedio || 0);
    let valorMov = 0;
    if (entrada) {
      valorMov = q * custoEnt;
      valor += valorMov;
      saldo += q;
      custoMedio = saldo ? valor / saldo : 0;
    } else if (saida) {
      valorMov = q * custoMedio;
      valor -= valorMov;
      saldo -= q;
    } else if (ajuste) {
      const sinal = Number(x.ajuste || q);
      if (sinal >= 0) {
        valorMov = sinal * custoEnt;
        valor += valorMov;
        saldo += sinal;
      } else {
        valorMov = Math.abs(sinal) * custoMedio;
        valor -= valorMov;
        saldo += sinal;
      }
      custoMedio = saldo ? valor / saldo : 0;
    }
    return {
      ...x,
      entrada: entrada ? q : 0,
      saida: saida ? q : 0,
      ajuste: ajuste ? Number(x.ajuste || q) : 0,
      saldo,
      custoEntrada: entrada ? custoEnt : 0,
      custoMedio,
      valorMov,
      valorEstoque: saldo * custoMedio,
    };
  });
}
function Estoque({ data, onChange }) {
  const [unidade, setUnidade] = useState(
    data.unidades?.[1]?.nome || data.unidades?.[0]?.nome || "",
  );
  const [marca, setMarca] = useState("");
  const [produtoId, setProdutoId] = useState("");
  const [qtd, setQtd] = useState("");
  const [custoEntrada, setCustoEntrada] = useState("");
  const [tipo, setTipo] = useState("ENTRADA - COMPRA/NF");
  const [referencia, setReferencia] = useState("");
  const [periodStart, setPeriodStart] = useState(todayISO());
  const [periodEnd, setPeriodEnd] = useState(todayISO());
  const marcas = [
    ...new Set(
      (data.produtos || [])
        .filter((p) => p.ativo !== false)
        .map((p) => p.marca)
        .filter(Boolean),
    ),
  ].sort();
  function summary(p) {
    const l = buildStockLedger(data, unidade, p.id);
    const last = l[l.length - 1];
    return {
      qtd: last?.saldo || 0,
      custoMedio: last?.custoMedio || 0,
      valor: last?.valorEstoque || 0,
    };
  }
  function registrar() {
    const p = data.produtos.find((x) => x.id === produtoId);
    if (!p || !qtd) return alert("SELECIONE MARCA, PRODUTO E QUANTIDADE.");
    if (String(tipo).startsWith("ENTRADA") && !custoEntrada)
      return alert("INFORME O CUSTO POSTO UNITÁRIO DA ENTRADA.");
    const atual = summary(p);
    onChange((d) => ({
      ...d,
      produtos: produtosAtualizados,
      estoqueMov: [
        ...(d.estoqueMov || []),
        {
          id: uid("est"),
          data: todayISO(),
          dataHora: new Date().toISOString(),
          unidade,
          marca: p.marca,
          produtoId: p.id,
          produto: p.nome,
          tipo,
          quantidade: Number(qtd),
          custoUnitario: String(tipo).startsWith("ENTRADA")
            ? Number(custoEntrada)
            : atual.custoMedio,
          referencia: upper(referencia || "AJUSTE MANUAL"),
          usuario: "ADMINISTRADOR",
        },
      ],
    }));
    setQtd("");
    setCustoEntrada("");
    setReferencia("");
  }
  const linhas = data.produtos
    .filter((p) => p.ativo !== false)
    .map((p) => ({ p, ...summary(p) }));
  const fullLedger = produtoId
    ? buildStockLedger(data, unidade, produtoId)
    : [];
  const ledger = fullLedger.filter((x) =>
    inPeriod(x, periodStart, periodEnd, (z) =>
      String(z.dataHora || z.data || "").slice(0, 10),
    ),
  );
  const prodSel = data.produtos.find((p) => p.id === produtoId);
  const movimentosUnidade = (data.estoqueMov || []).filter((x) =>
    inPeriod(x, periodStart, periodEnd, (z) =>
      String(z.dataHora || z.data || "").slice(0, 10),
    ),
  );
  const entradasPeriodo = movimentosUnidade
    .filter((x) => String(x.tipo || "").startsWith("ENTRADA"))
    .reduce((a, x) => a + Number(x.quantidade || 0), 0);
  const saidasPeriodo = movimentosUnidade
    .filter((x) => String(x.tipo || "").startsWith("SAÍDA"))
    .reduce((a, x) => a + Number(x.quantidade || 0), 0);
  function gerarRelatorioPeriodo() {
    const movimentos = movimentosUnidade
      .slice()
      .sort((a, b) =>
        String(a.dataHora || a.data || "").localeCompare(
          String(b.dataHora || b.data || ""),
        ),
      );
    pdfSimple(
      `MOVIMENTAÇÃO DE ESTOQUE - ${unidade} - ${periodLabel(periodStart, periodEnd)}`,
      [
        `PERÍODO: ${periodLabel(periodStart, periodEnd)}`,
        `ENTRADAS NO PERÍODO: ${entradasPeriodo} SACOS`,
        `SAÍDAS NO PERÍODO: ${saidasPeriodo} SACOS`,
        `MOVIMENTAÇÕES: ${movimentos.length}`,
        ...movimentos.map(
          (x) =>
            `${formatDateBR(x.dataHora || x.data)} | ${x.marca || "-"} | ${x.produto || "-"} | ${x.tipo || "-"} | QTD ${x.quantidade || 0} | ${x.referencia || "-"}`,
        ),
      ],
      `ESTOQUE-MOVIMENTACAO-${periodStart || "INICIO"}-${periodEnd || "FIM"}.pdf`,
    );
  }
  return (
    <section className="card">
      <div className="sectionHead">
        <div>
          <h2>ESTOQUE — CONTA-CORRENTE ÚNICA FORTE ATACAREJO</h2>
          <p>
            UM ÚNICO SALDO PARA MONTE CARMELO E CALDAS NOVAS • DESTINO
            REGISTRADO EM CADA MOVIMENTO • CUSTO MÉDIO PONDERADO MÓVEL.
          </p>
        </div>
        <button onClick={gerarRelatorioPeriodo}>
          GERAR RELATÓRIO DO PERÍODO
        </button>
      </div>
      <div className="transportBox">
        <h3>CONSULTAR MOVIMENTAÇÃO POR PERÍODO</h3>
        <div className="reportBar">
          <label>
            DE{" "}
            <input
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
            />
          </label>
          <label>
            ATÉ{" "}
            <input
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
            />
          </label>
          <button
            className="ghost dark"
            onClick={() => {
              setPeriodStart(todayISO());
              setPeriodEnd(todayISO());
            }}
          >
            HOJE
          </button>
          <button
            className="ghost dark"
            onClick={() => {
              setPeriodStart("");
              setPeriodEnd("");
            }}
          >
            TODO HISTÓRICO
          </button>
        </div>
        <p className="note">
          <b>PERÍODO:</b> {periodLabel(periodStart, periodEnd)} •{" "}
          <b>ENTRADAS:</b> {entradasPeriodo} SC • <b>SAÍDAS:</b> {saidasPeriodo}{" "}
          SC • <b>MOVIMENTAÇÕES:</b> {movimentosUnidade.length}
        </p>
      </div>
      <div className="miniGrid">
        <Field label="DESTINO PARA REGISTRO (SALDO ÚNICO)">
          <select value={unidade} onChange={(e) => setUnidade(e.target.value)}>
            {data.unidades.map((u) => (
              <option key={u.id}>{u.nome}</option>
            ))}
          </select>
        </Field>
        <Field label="MARCA / FORNECEDOR">
          <select
            value={marca}
            onChange={(e) => {
              setMarca(e.target.value);
              setProdutoId("");
            }}
          >
            <option value="">TODAS / SELECIONE...</option>
            {marcas.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="palletForm">
        <Field label="PRODUTO">
          <select
            value={produtoId}
            onChange={(e) => setProdutoId(e.target.value)}
          >
            <option value="">SELECIONE...</option>
            {data.produtos
              .filter((p) => !marca || p.marca === marca)
              .map((p) => (
                <option value={p.id} key={p.id}>
                  {p.marca} • {p.nome}
                </option>
              ))}
          </select>
        </Field>
        <Field label="MOVIMENTO">
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option>ENTRADA - COMPRA/NF</option>
            <option>ENTRADA - AJUSTE</option>
            <option>SAÍDA - AJUSTE</option>
            <option>DEVOLUÇÃO</option>
          </select>
        </Field>
        <Field label="QUANTIDADE">
          <input
            type="number"
            value={qtd}
            onChange={(e) => setQtd(e.target.value)}
          />
        </Field>
        {String(tipo).startsWith("ENTRADA") && (
          <Field label="CUSTO POSTO UNITÁRIO">
            <input
              type="number"
              step="0.01"
              value={custoEntrada}
              onChange={(e) => setCustoEntrada(e.target.value)}
            />
          </Field>
        )}
        <Field label="DOCUMENTO / REFERÊNCIA">
          <UpperInput value={referencia} onChange={setReferencia} />
        </Field>
        <button onClick={registrar}>REGISTRAR</button>
      </div>
      <div className="stockSummaryTable brand">
        <b>MARCA / FORNECEDOR</b>
        <b>PRODUTO</b>
        <b>SALDO ATUAL</b>
        <b>CUSTO MÉDIO PONDERADO</b>
        <b>VALOR TOTAL ATUAL</b>
        {linhas.map((x) => (
          <div className="rowContents" key={x.p.id}>
            <span>{x.p.marca || "-"}</span>
            <button
              className="ghost dark"
              onClick={() => {
                setMarca(x.p.marca || "");
                setProdutoId(x.p.id);
              }}
            >
              {x.p.nome}
            </button>
            <strong>{x.qtd} SC</strong>
            <span>{money(x.custoMedio)}</span>
            <strong>{money(x.valor)}</strong>
          </div>
        ))}
      </div>
      {prodSel && (
        <div className="transportBox">
          <div className="sectionHead">
            <div>
              <h3>
                {prodSel.marca} • {prodSel.nome}
              </h3>
              <p>
                EXTRATO DO PRODUTO SOMENTE NO PERÍODO SELECIONADO, MANTENDO O
                SALDO CRONOLÓGICO CORRETO.
              </p>
            </div>
            <button
              onClick={() =>
                pdfSimple(
                  `CONTA-CORRENTE DE ESTOQUE - ${prodSel.marca} - ${prodSel.nome} - ${periodLabel(periodStart, periodEnd)}`,
                  ledger.map(
                    (x) =>
                      `${formatDateBR(x.dataHora || x.data)} | ${x.tipo} | ${x.referencia || "-"} | ENTRADA ${x.entrada} | SAÍDA ${x.saida} | SALDO ${x.saldo} | CUSTO MÉDIO ${money(x.custoMedio)} | ESTOQUE ${money(x.valorEstoque)}`,
                  ),
                  `EXTRATO-${prodSel.id}-${periodStart || "INICIO"}-${periodEnd || "FIM"}.pdf`,
                )
              }
            >
              RELATÓRIO DO PRODUTO / PERÍODO
            </button>
          </div>
          <div className="stockLedger">
            <b>DATA/HORA</b>
            <b>MOVIMENTO</b>
            <b>DOCUMENTO</b>
            <b>ENTRADA</b>
            <b>SAÍDA</b>
            <b>SALDO</b>
            <b>CUSTO ENTRADA</b>
            <b>CUSTO MÉDIO</b>
            <b>VALOR ESTOQUE</b>
            {ledger.map((x) => (
              <div className="rowContents" key={x.id}>
                <span>
                  {new Date(x.dataHora || x.data).toLocaleString("pt-BR")}
                </span>
                <span>{x.tipo}</span>
                <span>
                  {(x.referencia || "-") +
                    (x.destinoOperacional
                      ? " • DESTINO " + x.destinoOperacional
                      : "")}
                </span>
                <b>{x.entrada || "-"}</b>
                <b>{x.saida || "-"}</b>
                <strong>{x.saldo}</strong>
                <span>{x.custoEntrada ? money(x.custoEntrada) : "-"}</span>
                <span>{money(x.custoMedio)}</span>
                <span>{money(x.valorEstoque)}</span>
              </div>
            ))}
          </div>
          {ledger.length === 0 && (
            <p className="muted">
              NENHUMA MOVIMENTAÇÃO ENCONTRADA NESTE PERÍODO.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function Patio({ data, onChange, currentUser }) {
  return (
    <section>
      <div className="card">
        <div className="sectionHead">
          <div>
            <h2>PÁTIO / EXPEDIÇÃO INTERNA</h2>
            <p>CONTROLE FÍSICO DE RECEBIMENTO, CARREGAMENTO E ESTOQUE.</p>
          </div>
        </div>
        <div className="transportBox">
          <p>
            O PÁTIO ESTÁ OPERACIONAL. USE O CONTROLE DE ESTOQUE ABAIXO PARA
            REGISTRAR E CONFERIR AS MOVIMENTAÇÕES FÍSICAS.
          </p>
        </div>
      </div>
      <Estoque data={data} onChange={onChange} />
    </section>
  );
}

function SaudeFinanceira({ data, onChange }) {
  const [view, setView] = useState("GERAL");
  const [inicio, setInicio] = useState(
    () =>
      `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`,
  );
  const [fim, setFim] = useState(todayISO());
  const [banco, setBanco] = useState("");
  const [agencia, setAgencia] = useState("");
  const [conta, setConta] = useState("");
  const [tipoConta, setTipoConta] = useState("CONTA CORRENTE");
  const [unidade, setUnidade] = useState("GERAL");
  const [saldo, setSaldo] = useState("");
  const [despTipo, setDespTipo] = useState("FORTE ATACAREJO");
  const [desp, setDesp] = useState({
    data: todayISO(),
    descricao: "",
    valor: "",
    observacao: "",
  });
  const [emp, setEmp] = useState({
    instituicao: "",
    contrato: "",
    dataContratacao: todayISO(),
    valorOriginal: "",
    parcelas: "",
    valorParcela: "",
    primeiroVencimento: todayISO(),
    classificacao: "FORTE ATACAREJO",
    indexador: "",
    status: "ATIVO",
  });
  const [baseResultado, setBaseResultado] = useState(
    String(data.resultadoBase?.valor || ""),
  );
  const [produtoRent, setProdutoRent] = useState("TODOS");
  const [canalRent, setCanalRent] = useState("TODOS");
  const contas = data.contasBancarias || [];
  const saldoBancos = contas
    .filter((x) => x.ativo !== false)
    .reduce((a, x) => a + Number(x.saldo || 0), 0);
  const receber = (data.contasReceber || [])
    .filter(
      (x) =>
        !upper(x.status).includes("LIQUIDADO") &&
        !upper(x.status).includes("PAGO") &&
        !upper(x.status).includes("RECEBIDO"),
    )
    .reduce((a, x) => a + Number(x.valor || 0), 0);
  const pagar = (data.contasPagar || [])
    .filter(
      (x) =>
        !upper(x.status).includes("LIQUIDADO") &&
        !upper(x.status).includes("PAGO"),
    )
    .reduce((a, x) => a + Number(x.valor || 0), 0);
  const estoque = (data.produtos || []).reduce((ss, p) => {
    const l = buildStockLedger(data, "ESTOQUE ÚNICO", p.id);
    return ss + Number(l[l.length - 1]?.valorEstoque || 0);
  }, 0);
  const posicao = saldoBancos + receber + estoque - pagar;
  const despesas = (data.despesas || []).filter((x) =>
    inPeriod(x, inicio, fim, (y) => y.data),
  );
  const despForte = despesas.filter(
    (x) => x.classificacao === "FORTE ATACAREJO",
  );
  const despPart = despesas.filter((x) => x.classificacao === "PARTICULAR");
  const extratos = data.extratosBancarios || [];
  const conciliacoes = data.conciliacoesFinanceiras || [];
  const fretes = data.pagamentosFretes || [];
  const boletos = data.boletosFornecedores || [];
  const emprestimos = data.emprestimos || [];
  function salvarConta() {
    if (!banco || saldo === "") return alert("INFORME BANCO E SALDO.");
    onChange((d) => ({
      ...d,
      contasBancarias: [
        ...(d.contasBancarias || []),
        {
          id: uid("bank"),
          banco: upper(banco),
          agencia: upper(agencia),
          conta: upper(conta),
          tipo: tipoConta,
          unidade,
          saldo: Number(saldo),
          ativo: true,
          atualizadoEm: nowISO(),
        },
      ],
    }));
    setBanco("");
    setAgencia("");
    setConta("");
    setSaldo("");
  }
  function addDespesa() {
    if (!desp.descricao || !Number(desp.valor))
      return alert("INFORME DESCRIÇÃO E VALOR.");
    onChange((d) => ({
      ...d,
      despesas: [
        ...(d.despesas || []),
        {
          id: uid("desp"),
          ...desp,
          descricao: upper(desp.descricao),
          valor: Number(desp.valor),
          classificacao: despTipo,
          dataHoraCriacao: nowISO(),
          usuario: "ADMINISTRADOR",
          origem: "MANUAL",
        },
      ],
    }));
    setDesp({ data: todayISO(), descricao: "", valor: "", observacao: "" });
  }
  function despPdf(tipo) {
    const rows = (data.despesas || []).filter(
      (x) =>
        x.classificacao === tipo && inPeriod(x, inicio, fim, (y) => y.data),
    );
    pdfSimple(
      `DESPESAS — ${tipo} — ${periodLabel(inicio, fim)}`,
      [
        ...rows.map(
          (x) =>
            `${formatDateBR(x.data)} | ${x.descricao} | ${money(x.valor)} | ${x.observacao || "-"}`,
        ),
        `TOTAL: ${money(rows.reduce((a, x) => a + Number(x.valor || 0), 0))}`,
      ],
      `DESPESAS-${tipo.replaceAll(" ", "-")}.pdf`,
    );
  }
  function addEmp() {
    if (
      !emp.instituicao ||
      !emp.contrato ||
      !Number(emp.valorOriginal) ||
      !Number(emp.parcelas)
    )
      return alert("PREENCHA INSTITUIÇÃO, CONTRATO, VALOR E PARCELAS.");
    const parcelas = [];
    let dt = new Date(`${emp.primeiroVencimento}T12:00:00`);
    for (let i = 1; i <= Number(emp.parcelas); i++) {
      parcelas.push({
        id: uid("parc"),
        numero: i,
        vencimento: dt.toISOString().slice(0, 10),
        valor: Number(emp.valorParcela || 0),
        status: "ABERTA",
      });
      dt.setMonth(dt.getMonth() + 1);
    }
    onChange((d) => ({
      ...d,
      emprestimos: [
        ...(d.emprestimos || []),
        {
          id: uid("emp"),
          ...emp,
          valorOriginal: Number(emp.valorOriginal),
          totalParcelas: Number(emp.parcelas),
          valorParcela: Number(emp.valorParcela || 0),
          parcelasLista: parcelas,
          createdAt: nowISO(),
        },
      ],
    }));
    setEmp({
      instituicao: "",
      contrato: "",
      dataContratacao: todayISO(),
      valorOriginal: "",
      parcelas: "",
      valorParcela: "",
      primeiroVencimento: todayISO(),
      classificacao: "FORTE ATACAREJO",
      indexador: "",
      status: "ATIVO",
    });
  }
  async function importarExtrato(file, tipo = "BANCO") {
    if (!file) return;
    const hash = `${file.name}|${file.size}|${file.lastModified}`;
    if (extratos.some((x) => x.hash === hash))
      return alert("ARQUIVO JÁ IMPORTADO — DUPLICIDADE IGNORADA.");
    let texto = "";
    try {
      if (!file.type.includes("pdf")) texto = await file.text();
    } catch {}
    const linhas = texto.split(/\r?\n/).filter(Boolean).slice(0, 1000);
    const existentes = new Set(
      (extratos || [])
        .flatMap((e) => e.linhas || [])
        .map((x) => x.chave)
        .filter(Boolean),
    );
    const movimentos = [];
    let duplicados = 0;
    for (const l of linhas) {
      const m = l.match(
        /(\d{2}[\/\-]\d{2}[\/\-]\d{2,4}).*?(-?\s*\d+[\.,]\d{2})/,
      );
      if (m) {
        const val = Number(
          m[2].replace(/\s/g, "").replace(".", "").replace(",", "."),
        );
        const hist = l.slice(0, 180).trim();
        const chave = norm(`${m[1]}|${val.toFixed(2)}|${hist}`).replace(
          /\s+/g,
          " ",
        );
        if (existentes.has(chave)) {
          duplicados++;
          continue;
        }
        existentes.add(chave);
        movimentos.push({
          id: uid("movb"),
          data: m[1],
          historico: hist,
          descricaoGerencial: "",
          valor: val,
          chave,
          selecionado: false,
          classificacao: "A CLASSIFICAR",
          status: "A CONCILIAR",
        });
      }
    }
    onChange((d) => ({
      ...d,
      extratosBancarios: [
        ...(d.extratosBancarios || []),
        {
          id: uid("ext"),
          nome: file.name,
          tipo,
          hash,
          importadoEm: nowISO(),
          linhas: movimentos,
          duplicadosIgnorados: duplicados,
          status: movimentos.length
            ? "LIDO / A CONCILIAR"
            : "ARQUIVO REGISTRADO / SEM NOVOS LANÇAMENTOS",
        },
      ],
    }));
    alert(
      `EXTRATO IMPORTADO. ${movimentos.length} NOVO(S) • ${duplicados} JÁ EXISTENTE(S) IGNORADO(S). PERÍODOS SOBREPOSTOS NÃO SÃO DUPLICADOS.`,
    );
  }
  function reclassificarDesp(id, nova) {
    onChange((d) => ({
      ...d,
      despesas: (d.despesas || []).map((x) =>
        x.id === id
          ? { ...x, classificacao: nova, reclassificadoEm: nowISO() }
          : x,
      ),
    }));
  }
  function salvarBase() {
    onChange((d) => ({
      ...d,
      resultadoBase: {
        valor: Number(baseResultado || 0),
        dataBase: todayISO(),
        atualizadoEm: nowISO(),
        usuario: "ADMINISTRADOR",
      },
    }));
  }
  const lucros = [
    ...(data.vendasBalcao || []).map((x) => ({ ...x, canal: "BALCÃO" })),
    ...(data.vendas || [])
      .filter(
        (x) =>
          upper(x.status).includes("CONCLU") ||
          upper(x.status).includes("FATUR"),
      )
      .map((x) => ({ ...x, canal: "CARGA DIRETA" })),
  ].filter((x) =>
    inPeriod(x, inicio, fim, (y) => y.data || y.criadoEm || y.createdAt),
  );
  const creditoLucro = lucros.reduce(
    (a, x) => a + Number(x.lucro ?? x.resultadoBruto ?? 0),
    0,
  );
  const debForte = despForte.reduce((a, x) => a + Number(x.valor || 0), 0);
  const saldoResultado =
    Number(data.resultadoBase?.valor || 0) + creditoLucro - debForte;
  const vendasRent = [
    ...(data.vendasBalcao || []).map((x) => ({ ...x, canal: "VENDA BALCÃO" })),
    ...(data.vendas || []).map((x) => ({ ...x, canal: "CARGA DIRETA" })),
  ].filter((x) =>
    inPeriod(x, inicio, fim, (y) => y.data || y.criadoEm || y.createdAt),
  );
  const rentRows = (data.produtos || [])
    .filter((p) => produtoRent === "TODOS" || p.id === produtoRent)
    .map((p) => {
      const xs = vendasRent.filter(
        (v) =>
          (v.produtoId === p.id || v.produto === p.nome) &&
          (canalRent === "TODOS" || v.canal === canalRent),
      );
      const qtd = xs.reduce(
        (a, x) => a + Number(x.qtd || x.quantidade || 0),
        0,
      );
      const total = xs.reduce(
        (a, x) =>
          a +
          Number(
            x.valorTotal ??
              Number(x.qtd || x.quantidade || 0) * Number(x.precoUnitario || 0),
          ),
        0,
      );
      const ledger = buildStockLedger(data, "ESTOQUE ÚNICO", p.id);
      const custo = Number(ledger[ledger.length - 1]?.custoMedio || 0);
      const medio = qtd ? total / qtd : 0;
      const brutoUnit = medio - custo;
      const brutoTotal = brutoUnit * qtd;
      const margem = total ? (brutoTotal / total) * 100 : 0;
      return { p, qtd, total, medio, custo, brutoUnit, brutoTotal, margem };
    })
    .filter((x) => x.qtd > 0);
  const nav = [
    "GERAL",
    "EXTRATOS",
    "CONCILIAÇÃO",
    "DESPESAS",
    "FRETES",
    "BOLETOS FORNECEDOR",
    "EMPRÉSTIMOS",
    "RESULTADO",
    "RENTABILIDADE",
  ];
  return (
    <section className="card">
      <div className="sectionHead">
        <div>
          <h2>DRE / SAÚDE FINANCEIRA / TESOURARIA</h2>
          <p>
            ÁREA EXCLUSIVA DO ADMINISTRADOR MASTER • CONCILIAÇÃO, DESPESAS,
            EMPRÉSTIMOS, RESULTADO E RENTABILIDADE.
          </p>
        </div>
        <button
          onClick={() =>
            pdfSimple(
              "POSIÇÃO FINANCEIRA",
              [
                `SALDO BANCÁRIO TOTAL: ${money(saldoBancos)}`,
                `A RECEBER: ${money(receber)}`,
                `ESTOQUE: ${money(estoque)}`,
                `A PAGAR: ${money(pagar)}`,
                `POSIÇÃO LÍQUIDA: ${money(posicao)}`,
              ],
              "POSICAO-FINANCEIRA.pdf",
            )
          }
        >
          GERAR PDF
        </button>
      </div>
      <div className="reportBar financeNav">
        <label>
          DE{" "}
          <input
            type="date"
            value={inicio}
            onChange={(e) => setInicio(e.target.value)}
          />
        </label>
        <label>
          ATÉ{" "}
          <input
            type="date"
            value={fim}
            onChange={(e) => setFim(e.target.value)}
          />
        </label>
        {nav.map((x) => (
          <button
            key={x}
            className={view === x ? "primary" : "ghost dark"}
            onClick={() => setView(x)}
          >
            {x}
          </button>
        ))}
      </div>
      {view === "GERAL" && (
        <>
          <div className="healthCards">
            {contas
              .filter((x) => x.ativo !== false)
              .map((x) => (
                <div key={x.id}>
                  <b>{x.banco}</b>
                  <strong>{money(x.saldo)}</strong>
                  <small>{x.conta || "CONTA"}</small>
                </div>
              ))}
            <div className="highlight">
              <b>SALDO BANCÁRIO TOTAL</b>
              <strong>{money(saldoBancos)}</strong>
            </div>
            <div>
              <b>A RECEBER</b>
              <strong>{money(receber)}</strong>
            </div>
            <div>
              <b>A PAGAR</b>
              <strong>{money(pagar)}</strong>
            </div>
            <div>
              <b>POSIÇÃO LÍQUIDA</b>
              <strong>{money(posicao)}</strong>
            </div>
          </div>
          <div className="transportBox">
            <h3>CONTAS BANCÁRIAS</h3>
            <div className="bankGrid">
              <Field label="BANCO">
                <UpperInput value={banco} onChange={setBanco} />
              </Field>
              <Field label="AGÊNCIA">
                <UpperInput value={agencia} onChange={setAgencia} />
              </Field>
              <Field label="CONTA">
                <UpperInput value={conta} onChange={setConta} />
              </Field>
              <Field label="TIPO">
                <select
                  value={tipoConta}
                  onChange={(e) => setTipoConta(e.target.value)}
                >
                  <option>CONTA CORRENTE</option>
                  <option>CONTA PAGAMENTO</option>
                  <option>CAIXA</option>
                </select>
              </Field>
              <Field label="UNIDADE">
                <select
                  value={unidade}
                  onChange={(e) => setUnidade(e.target.value)}
                >
                  <option>GERAL</option>
                  {(data.unidades || []).map((u) => (
                    <option key={u.id}>{u.nome}</option>
                  ))}
                </select>
              </Field>
              <Field label="SALDO ATUAL">
                <input
                  type="number"
                  step="0.01"
                  value={saldo}
                  onChange={(e) => setSaldo(e.target.value)}
                />
              </Field>
              <button onClick={salvarConta}>SALVAR CONTA</button>
            </div>
          </div>
        </>
      )}
      {view === "EXTRATOS" && (
        <div className="dualBoxes">
          <div className="transportBox">
            <h3>EXTRATOS BANCÁRIOS — IMPORTAÇÃO IA</h3>
            <p className="note">
              OFX, CSV, XLS/XLSX E PDF. O MESMO ARQUIVO É BLOQUEADO POR HASH
              PARA EVITAR DUPLICIDADE.
            </p>
            <input
              type="file"
              accept=".ofx,.csv,.xls,.xlsx,.pdf,text/*"
              onChange={(e) => {
                importarExtrato(e.target.files?.[0], "BANCO");
                e.target.value = "";
              }}
            />
            <div className="bankList">
              {extratos
                .filter((x) => x.tipo === "BANCO")
                .map((x) => (
                  <div className="cadRow" key={x.id}>
                    <div>
                      <b>{x.nome}</b>
                      <small>
                        {new Date(x.importadoEm).toLocaleString("pt-BR")} •{" "}
                        {(x.linhas || []).length} LANÇAMENTOS
                      </small>
                    </div>
                    <span>{x.status}</span>
                  </div>
                ))}
            </div>
          </div>
          <div className="transportBox">
            <h3>CARTÕES / RECEBÍVEIS — IMPORTAÇÃO IA</h3>
            <p className="note">
              INFINITEPAY E OUTRAS ADQUIRENTES • TAXAS, PARCELAS, LIQUIDAÇÕES E
              ESTORNOS.
            </p>
            <input
              type="file"
              accept=".csv,.xls,.xlsx,.pdf,text/*"
              onChange={(e) => {
                importarExtrato(e.target.files?.[0], "CARTÕES/RECEBÍVEIS");
                e.target.value = "";
              }}
            />
            <div className="bankList">
              {extratos
                .filter((x) => x.tipo !== "BANCO")
                .map((x) => (
                  <div className="cadRow" key={x.id}>
                    <div>
                      <b>{x.nome}</b>
                      <small>
                        {new Date(x.importadoEm).toLocaleString("pt-BR")}
                      </small>
                    </div>
                    <span>{x.status}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
      {view === "CONCILIAÇÃO" && (
        <div className="transportBox">
          <h3>CENTRAL DE CONCILIAÇÃO FINANCEIRA</h3>
          <p className="note">
            A IA CONFRONTA EXTRATO COM FRETES, BOLETOS, EMPRÉSTIMOS E DESPESAS.
            LANÇAMENTOS JÁ VINCULADOS NÃO GERAM NOVA DESPESA.
          </p>
          <div className="receivableSummary">
            <div>
              <b>CONCILIADOS</b>
              <strong>
                {conciliacoes.filter((x) => x.status === "CONCILIADO").length}
              </strong>
            </div>
            <div>
              <b>A CONFIRMAR</b>
              <strong>
                {conciliacoes.filter((x) => x.status === "SUGESTÃO").length}
              </strong>
            </div>
            <div>
              <b>NÃO CONCILIADOS</b>
              <strong>
                {
                  conciliacoes.filter((x) => x.status === "NÃO CONCILIADO")
                    .length
                }
              </strong>
            </div>
            <div>
              <b>DUPLICADOS IGNORADOS</b>
              <strong>
                {conciliacoes.filter((x) => x.status === "DUPLICADO").length}
              </strong>
            </div>
          </div>
          {conciliacoes.length === 0 && (
            <p className="muted">
              SEM CONCILIAÇÕES AINDA. IMPORTE UM EXTRATO PARA INICIAR A
              CONFERÊNCIA.
            </p>
          )}
        </div>
      )}
      {view === "DESPESAS" && (
        <>
          <div className="transportBox">
            <h3>LANÇAR DESPESA EXTRA / MANUAL</h3>
            <div className="miniGrid">
              <Field label="CLASSIFICAÇÃO">
                <select
                  value={despTipo}
                  onChange={(e) => setDespTipo(e.target.value)}
                >
                  <option>FORTE ATACAREJO</option>
                  <option>PARTICULAR</option>
                </select>
              </Field>
              <Field label="DATA">
                <input
                  type="date"
                  value={desp.data}
                  onChange={(e) =>
                    setDesp((x) => ({ ...x, data: e.target.value }))
                  }
                />
              </Field>
              <Field label="NOME / DESCRIÇÃO">
                <UpperInput
                  value={desp.descricao}
                  onChange={(v) => setDesp((x) => ({ ...x, descricao: v }))}
                />
              </Field>
              <Field label="VALOR">
                <input
                  type="number"
                  step="0.01"
                  value={desp.valor}
                  onChange={(e) =>
                    setDesp((x) => ({ ...x, valor: e.target.value }))
                  }
                />
              </Field>
              <Field label="OBSERVAÇÃO">
                <UpperInput
                  value={desp.observacao}
                  onChange={(v) => setDesp((x) => ({ ...x, observacao: v }))}
                />
              </Field>
              <button onClick={addDespesa}>LANÇAR DESPESA EXTRA</button>
            </div>
          </div>
          <div className="dualBoxes">
            {[
              ["FORTE ATACAREJO", despForte],
              ["PARTICULAR", despPart],
            ].map(([tipo, rows]) => (
              <div className="transportBox" key={tipo}>
                <div className="sectionHead">
                  <div>
                    <h3>DESPESA {tipo}</h3>
                    <p>
                      TOTAL DO PERÍODO:{" "}
                      {money(
                        rows.reduce((a, x) => a + Number(x.valor || 0), 0),
                      )}
                    </p>
                  </div>
                  <button onClick={() => despPdf(tipo)}>
                    GERAR RELATÓRIO PDF
                  </button>
                </div>
                <div className="bankList">
                  {rows.map((x) => (
                    <div className="cadRow" key={x.id}>
                      <div>
                        <b>
                          {formatDateBR(x.data)} • {x.descricao}
                        </b>
                        <small>
                          {x.origem || "MANUAL"} • {x.observacao || "-"}
                        </small>
                      </div>
                      <div>
                        <strong>{money(x.valor)}</strong>
                        <button
                          className="ghost dark"
                          onClick={() =>
                            reclassificarDesp(
                              x.id,
                              tipo === "FORTE ATACAREJO"
                                ? "PARTICULAR"
                                : "FORTE ATACAREJO",
                            )
                          }
                        >
                          MOVER PARA{" "}
                          {tipo === "FORTE ATACAREJO" ? "PARTICULAR" : "FORTE"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      {view === "FRETES" && (
        <div className="transportBox">
          <h3>PAGAMENTOS DE FRETES</h3>
          <p className="note">
            BASE AUXILIAR PARA CONCILIAÇÃO COM EXTRATOS. COMPROVANTES ANEXADOS
            ÀS CARGAS SERÃO VINCULADOS AQUI.
          </p>
          <div className="cardLedger">
            <b>DATA</b>
            <b>CARGA</b>
            <b>MOTORISTA / FAVORECIDO</b>
            <b>VALOR</b>
            <b>DOCUMENTO</b>
            <b>STATUS</b>
            {fretes.map((x) => (
              <div className="rowContents" key={x.id}>
                <span>{formatDateBR(x.data)}</span>
                <span>{x.carga || "-"}</span>
                <span>{x.motorista || x.favorecido || "-"}</span>
                <strong>{money(x.valor)}</strong>
                <span>{x.documento || "-"}</span>
                <span>{x.status || "REGISTRADO"}</span>
              </div>
            ))}
          </div>
          {fretes.length === 0 && (
            <p className="muted">SEM PAGAMENTOS DE FRETE REGISTRADOS.</p>
          )}
        </div>
      )}
      {view === "BOLETOS FORNECEDOR" && (
        <div className="transportBox">
          <h3>BOLETOS DE FORNECEDORES</h3>
          <p className="note">
            NÃO SUBSTITUI CONTAS A PAGAR. ESTA BASE DOCUMENTAL SERVE PARA
            CONFRONTO E CONCILIAÇÃO BANCÁRIA.
          </p>
          <div className="cardLedger">
            <b>VENCIMENTO</b>
            <b>FORNECEDOR</b>
            <b>NF / TÍTULO</b>
            <b>VALOR</b>
            <b>CARGA</b>
            <b>STATUS</b>
            {boletos.map((x) => (
              <div className="rowContents" key={x.id}>
                <span>{formatDateBR(x.vencimento)}</span>
                <span>{x.fornecedor}</span>
                <span>{x.titulo || x.nf || "-"}</span>
                <strong>{money(x.valor)}</strong>
                <span>{x.carga || "-"}</span>
                <span>{x.status || "ABERTO"}</span>
              </div>
            ))}
          </div>
          {boletos.length === 0 && (
            <p className="muted">SEM BOLETOS DOCUMENTAIS IMPORTADOS.</p>
          )}
        </div>
      )}
      {view === "EMPRÉSTIMOS" && (
        <>
          <div className="transportBox">
            <h3>EMPRÉSTIMOS / CONTRATOS FINANCEIROS</h3>
            <div className="miniGrid">
              <Field label="INSTITUIÇÃO">
                <UpperInput
                  value={emp.instituicao}
                  onChange={(v) => setEmp((x) => ({ ...x, instituicao: v }))}
                />
              </Field>
              <Field label="CONTRATO">
                <UpperInput
                  value={emp.contrato}
                  onChange={(v) => setEmp((x) => ({ ...x, contrato: v }))}
                />
              </Field>
              <Field label="DATA CONTRATAÇÃO">
                <input
                  type="date"
                  value={emp.dataContratacao}
                  onChange={(e) =>
                    setEmp((x) => ({ ...x, dataContratacao: e.target.value }))
                  }
                />
              </Field>
              <Field label="VALOR ORIGINAL">
                <input
                  type="number"
                  step="0.01"
                  value={emp.valorOriginal}
                  onChange={(e) =>
                    setEmp((x) => ({ ...x, valorOriginal: e.target.value }))
                  }
                />
              </Field>
              <Field label="TOTAL PARCELAS">
                <input
                  type="number"
                  value={emp.parcelas}
                  onChange={(e) =>
                    setEmp((x) => ({ ...x, parcelas: e.target.value }))
                  }
                />
              </Field>
              <Field label="VALOR PARCELA">
                <input
                  type="number"
                  step="0.01"
                  value={emp.valorParcela}
                  onChange={(e) =>
                    setEmp((x) => ({ ...x, valorParcela: e.target.value }))
                  }
                />
              </Field>
              <Field label="1º VENCIMENTO">
                <input
                  type="date"
                  value={emp.primeiroVencimento}
                  onChange={(e) =>
                    setEmp((x) => ({
                      ...x,
                      primeiroVencimento: e.target.value,
                    }))
                  }
                />
              </Field>
              <Field label="CLASSIFICAÇÃO">
                <select
                  value={emp.classificacao}
                  onChange={(e) =>
                    setEmp((x) => ({ ...x, classificacao: e.target.value }))
                  }
                >
                  <option>FORTE ATACAREJO</option>
                  <option>DESPESA PARTICULAR</option>
                </select>
              </Field>
              <Field label="INDEXADOR / CORREÇÃO">
                <UpperInput
                  value={emp.indexador}
                  onChange={(v) => setEmp((x) => ({ ...x, indexador: v }))}
                  placeholder="EX.: TR, IPCA, MANUAL"
                />
              </Field>
              <button onClick={addEmp}>CADASTRAR CONTRATO</button>
            </div>
            <div className="bankList">
              {emprestimos.map((x) => {
                const pagas = (x.parcelasLista || []).filter(
                  (p) => p.status === "LIQUIDADA",
                ).length;
                const vencidas = (x.parcelasLista || []).filter(
                  (p) => p.status !== "LIQUIDADA" && p.vencimento < todayISO(),
                ).length;
                return (
                  <div className="cadRow" key={x.id}>
                    <div>
                      <b>
                        {x.instituicao} • {x.contrato}
                      </b>
                      <small>
                        {x.classificacao} • {pagas}/{x.totalParcelas} PAGAS •{" "}
                        {vencidas
                          ? `${vencidas} PENDÊNCIA(S)`
                          : "SEM PENDÊNCIA"}
                      </small>
                    </div>
                    <div>
                      <strong>
                        {money(
                          Number(x.valorOriginal || 0) -
                            pagas * Number(x.valorParcela || 0),
                        )}
                      </strong>
                      <label className="ghost dark">
                        IMPORTAR EXTRATO PELA IA
                        <input
                          hidden
                          type="file"
                          accept=".pdf,.csv,.xls,.xlsx"
                          onChange={(e) => {
                            importarExtrato(
                              e.target.files?.[0],
                              `EMPRÉSTIMO ${x.contrato}`,
                            );
                            e.target.value = "";
                          }}
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
      {view === "RESULTADO" && (
        <>
          <div className="healthCards">
            <div>
              <b>BASE INICIAL</b>
              <strong>{money(data.resultadoBase?.valor || 0)}</strong>
            </div>
            <div>
              <b>LUCRO / RESULTADO DO PERÍODO</b>
              <strong>{money(creditoLucro)}</strong>
            </div>
            <div>
              <b>DESPESAS FORTE DO PERÍODO</b>
              <strong>{money(debForte)}</strong>
            </div>
            <div className="highlight">
              <b>SALDO FINAL DO RESULTADO</b>
              <strong>{money(saldoResultado)}</strong>
            </div>
          </div>
          <div className="transportBox">
            <h3>BASE INICIAL DO RESULTADO GERENCIAL</h3>
            <div className="miniGrid">
              <Field label="VALOR BASE">
                <input
                  type="number"
                  step="0.01"
                  value={baseResultado}
                  onChange={(e) => setBaseResultado(e.target.value)}
                />
              </Field>
              <button onClick={salvarBase}>SALVAR BASE INICIAL</button>
            </div>
            <p className="note">
              RESULTADO GERENCIAL = BASE INICIAL + LUCROS REALIZADOS − DESPESAS
              FORTE ATACAREJO. DESPESAS PARTICULARES NÃO ENTRAM.
            </p>
            <button
              onClick={() =>
                pdfSimple(
                  `RESULTADO GERENCIAL — ${periodLabel(inicio, fim)}`,
                  [
                    `BASE INICIAL: ${money(data.resultadoBase?.valor || 0)}`,
                    `CRÉDITOS DE LUCRO: ${money(creditoLucro)}`,
                    `DESPESAS FORTE: ${money(debForte)}`,
                    `SALDO FINAL: ${money(saldoResultado)}`,
                  ],
                  "RESULTADO-GERENCIAL.pdf",
                )
              }
            >
              GERAR PDF
            </button>
          </div>
        </>
      )}
      {view === "RENTABILIDADE" && (
        <div className="transportBox">
          <div className="sectionHead">
            <div>
              <h3>RENTABILIDADE POR PRODUTO</h3>
              <p>
                VENDA BALCÃO E CARGA DIRETA • CUSTO MÉDIO PONDERADO • RESULTADO
                • MARGEM.
              </p>
            </div>
            <button
              onClick={() =>
                pdfSimple(
                  `RENTABILIDADE — ${periodLabel(inicio, fim)}`,
                  rentRows.map(
                    (x) =>
                      `${x.p.marca} ${x.p.nome} | QTD ${x.qtd} ${x.p.unidadeMedida || "UN"} | MÉDIA ${money(x.medio)} | CMP ${money(x.custo)} | RESULTADO ${money(x.brutoTotal)} | MARGEM ${x.margem.toFixed(2)}%`,
                  ),
                  "RENTABILIDADE-PRODUTOS.pdf",
                )
              }
            >
              GERAR PDF
            </button>
          </div>
          <div className="miniGrid">
            <Field label="CANAL">
              <select
                value={canalRent}
                onChange={(e) => setCanalRent(e.target.value)}
              >
                <option>TODOS</option>
                <option>VENDA BALCÃO</option>
                <option>CARGA DIRETA</option>
              </select>
            </Field>
            <Field label="PRODUTO">
              <select
                value={produtoRent}
                onChange={(e) => setProdutoRent(e.target.value)}
              >
                <option value="TODOS">TODOS OS PRODUTOS</option>
                {(data.produtos || []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.marca} • {p.nome}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="cardLedger">
            <b>PRODUTO</b>
            <b>QUANTIDADE</b>
            <b>VALOR TOTAL</b>
            <b>VALOR MÉDIO</b>
            <b>CUSTO MÉDIO POND.</b>
            <b>RESULTADO BRUTO</b>
            <b>MARGEM %</b>
            {rentRows.map((x) => (
              <div className="rowContents" key={x.p.id}>
                <span>
                  {x.p.marca} • {x.p.nome}
                </span>
                <strong>
                  {x.qtd} {x.p.unidadeMedida || "UN"}
                </strong>
                <span>{money(x.total)}</span>
                <span>{money(x.medio)}</span>
                <span>{money(x.custo)}</span>
                <strong>{money(x.brutoTotal)}</strong>
                <strong>{x.margem.toFixed(2)}%</strong>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function EmissorBoletosVenda({ data, onChange, canal, currentUser, onClose }) {
  const vendas = (canal === "VENDA BALCÃO" ? data.vendasBalcao || [] : data.vendas || [])
    .filter((v) => v.numeroVenda && (canal !== "VENDA BALCÃO" || v.status === "CONCLUÍDA"));
  const boletos = (data.boletosClientes || []).filter((b) => b.canal === canal);
  const itau = (data.bankConnections || []).find((x) => upper(x.provedor).includes("ITAU")) || {};
  const [vendaId, setVendaId] = useState("");
  const [parcelas, setParcelas] = useState("1");
  const [primeiroVencimento, setPrimeiroVencimento] = useState(todayISO());
  const [intervalo, setIntervalo] = useState("30");
  const [editId, setEditId] = useState("");
  const [novoVencimento, setNovoVencimento] = useState("");
  const [novoValor, setNovoValor] = useState("");
  const [novoJurosMes, setNovoJurosMes] = useState("");
  const [novaMulta, setNovaMulta] = useState("");
  const [jurosMes, setJurosMes] = useState(String(itau.jurosPadrao ?? 5));
  const [multa, setMulta] = useState(String(itau.multaPadrao ?? 2));
  const [envioWhatsapp, setEnvioWhatsapp] = useState(true);
  const [envioEmail, setEnvioEmail] = useState(false);
  const [incluirNota, setIncluirNota] = useState(false);
  const [envioAutomatico, setEnvioAutomatico] = useState(true);
  const venda = vendas.find((v) => v.id === vendaId);
  const total = Number(venda?.total || venda?.valorTotal || venda?.valor || 0);
  function emitir() {
    const qtd = Math.max(1, Number(parcelas || 1));
    if (!venda || !total) return alert("SELECIONE UMA VENDA CONCLUÍDA COM VALOR.");
    const juros = Number(jurosMes);
    const multaValor = Number(multa);
    if (!Number.isFinite(juros) || juros < 0 || !Number.isFinite(multaValor) || multaValor < 0) return alert("INFORME JUROS E MULTA VÁLIDOS.");
    const base = new Date(`${primeiroVencimento}T12:00:00`);
    const valorBase = Math.floor((total / qtd) * 100) / 100;
    const novos = Array.from({ length:qtd }, (_,i) => {
      const d = new Date(base); d.setDate(d.getDate() + i * Number(intervalo || 30));
      const valor = i === qtd - 1 ? Number((total - valorBase * (qtd - 1)).toFixed(2)) : valorBase;
      return { id:uid("bcli"), vendaId:venda.id, numeroVenda:venda.numeroVenda, cliente:venda.cliente || venda.nomeCliente || "", clienteId:venda.clienteId || "", canal, banco:"ITAÚ", especie:itau.especiePadrao || "DM - DUPLICATA DE VENDA MERCANTIL", parcela:i+1, totalParcelas:qtd, valor, vencimento:d.toISOString().slice(0,10), jurosMes:juros, multa:multaValor, negativacao:false, protestoAutomatico:false, status:"AGUARDANDO EMISSÃO API", alteracaoLiberadaEm:new Date(Date.now()+86400000).toISOString().slice(0,10), envioWhatsapp, envioEmail, incluirNota, envioAutomatico, lembreteDiarioAposVencimento:true, criadoEm:nowISO(), criadoPor:currentUser?.nome || "USUÁRIO" };
    });
    onChange((d) => ({ ...d, boletosClientes:[...(d.boletosClientes || []), ...novos], bankEvents:[...(d.bankEvents || []), ...novos.map((b) => ({ id:uid("bankevt"), provedor:"ITAU", tipo:"SOLICITAÇÃO DE EMISSÃO", status:"PENDENTE", numeroVenda:b.numeroVenda, boletoId:b.id, detalhe:`PARCELA ${b.parcela}/${b.totalParcelas} • ${money(b.valor)} • VENC. ${formatDateBR(b.vencimento)}`, criadoEm:nowISO(), usuario:currentUser?.nome || "USUÁRIO" }))] }));
    alert(`${qtd} TÍTULO(S) PREPARADO(S) PARA EMISSÃO ITAÚ. A API SERÁ ACIONADA QUANDO AS CREDENCIAIS FOREM LIBERADAS.`);
  }
  function alterar() {
    const atual = boletos.find((b) => b.id === editId);
    if (!atual) return alert("SELECIONE UM BOLETO.");
    const criado = String(atual.criadoEm || "").slice(0,10);
    const liberado = atual.alteracaoLiberadaEm || (criado ? new Date(new Date(`${criado}T12:00:00`).getTime()+86400000).toISOString().slice(0,10) : todayISO());
    if (todayISO() < liberado) return alert(`O ITAÚ LIBERA A ALTERAÇÃO SOMENTE NO DIA SEGUINTE. TENTE NOVAMENTE EM ${formatDateBR(liberado)}.`);
    const juros = novoJurosMes === "" ? Number(atual.jurosMes ?? 5) : Number(novoJurosMes);
    const multaValor = novaMulta === "" ? Number(atual.multa ?? 2) : Number(novaMulta);
    if (!Number.isFinite(juros) || juros < 0 || !Number.isFinite(multaValor) || multaValor < 0) return alert("INFORME JUROS E MULTA VÁLIDOS.");
    const next = { ...atual, vencimento:novoVencimento || atual.vencimento, valor:novoValor ? Number(novoValor) : atual.valor, jurosMes:juros, multa:multaValor, negativacao:false, protestoAutomatico:false, status:"ALTERAÇÃO PENDENTE NA API", atualizadoEm:nowISO(), atualizadoPor:currentUser?.nome || "USUÁRIO" };
    onChange((d) => ({ ...d, boletosClientes:(d.boletosClientes || []).map((b) => b.id === editId ? next : b), bankEvents:[...(d.bankEvents || []), { id:uid("bankevt"), provedor:"ITAU", tipo:"SOLICITAÇÃO DE ALTERAÇÃO", status:"PENDENTE", numeroVenda:atual.numeroVenda, boletoId:atual.id, detalhe:`ANTES: ${money(atual.valor)} / ${formatDateBR(atual.vencimento)} • DEPOIS: ${money(next.valor)} / ${formatDateBR(next.vencimento)}`, criadoEm:nowISO(), usuario:currentUser?.nome || "USUÁRIO" }] }));
    alert("ALTERAÇÃO REGISTRADA COM HISTÓRICO. SERÁ ENVIADA AO ITAÚ PELA API.");
  }
  function filaEnvio() {
    const lista = boletos.filter((b) => b.vendaId === vendaId);
    if (!vendaId || !lista.length) return alert("SELECIONE UMA VENDA QUE JÁ POSSUA BOLETOS.");
    if (!envioWhatsapp && !envioEmail) return alert("MARQUE WHATSAPP, E-MAIL OU OS DOIS.");
    const cliente = (data.clientes || []).find((c) => c.id === (venda?.clienteId || lista[0]?.clienteId)) || {};
    if (envioWhatsapp && !(cliente.whatsapp || cliente.telefone)) return alert("CLIENTE SEM WHATSAPP/TELEFONE CADASTRADO.");
    if (envioEmail && !cliente.email) return alert("CLIENTE SEM E-MAIL CADASTRADO.");
    onChange((d) => ({ ...d, cobrancaEnvios:[...(d.cobrancaEnvios || []), { id:uid("sendbill"), vendaId, numeroVenda:venda?.numeroVenda || lista[0]?.numeroVenda, clienteId:cliente.id || "", cliente:cliente.nome || lista[0]?.cliente || "", whatsapp:cliente.whatsapp || cliente.telefone || "", email:cliente.email || "", canais:[envioWhatsapp ? "WHATSAPP" : null, envioEmail ? "E-MAIL" : null].filter(Boolean), incluirNota, boletoIds:lista.map((b) => b.id), status:lista.every((b) => b.arquivo || b.url) ? "PRONTO PARA ENVIO" : "AGUARDANDO DOCUMENTOS DO ITAÚ", solicitadoEm:nowISO(), solicitadoPor:currentUser?.nome || "USUÁRIO" }] }));
    alert("ENVIO AUTOMÁTICO REGISTRADO. OS DOCUMENTOS SERÃO ENVIADOS ASSIM QUE O ITAÚ DEVOLVER OS BOLETOS VÁLIDOS.");
  }
  function relatorio(tipo) {
    const hoje=todayISO();
    const lista=boletos.filter((b) => tipo === "VENCIDOS" ? b.vencimento < hoje && !upper(b.status).includes("LIQUID") : b.vencimento >= hoje && !upper(b.status).includes("LIQUID"));
    pdfSimple(`RELATÓRIO CONDENSADO — BOLETOS ${tipo}`, [...lista.map((b) => `${b.cliente} | VENDA ${b.numeroVenda} | PARC. ${b.parcela || 1}/${b.totalParcelas || 1} | VENC. ${formatDateBR(b.vencimento)} | ${money(b.valor)} | ${b.status}`),"",`TOTAL: ${money(lista.reduce((s,b)=>s+Number(b.valor||0),0))} • ${lista.length} TÍTULO(S)`], `BOLETOS-${tipo}-${todayISO()}.pdf`);
  }
  return <Modal title={`EMISSÃO DE BOLETOS — ${canal}`} onClose={onClose} wide>
    <div className="transportBox"><p className="note">ESTA TELA PERMITE EMITIR, ENVIAR E ALTERAR BOLETOS DA PRÓPRIA VENDA. A ALTERAÇÃO É LIBERADA NO DIA SEGUINTE À EMISSÃO, CONFORME O FLUXO ATUAL DO ITAÚ. NÃO EXIBE A FRANCESINHA DETALHADA.</p><div className="actions"><button className="ghost dark" onClick={() => relatorio("A VENCER")}>RELATÓRIO A VENCER</button><button className="ghost dark" onClick={() => relatorio("VENCIDOS")}>RELATÓRIO VENCIDOS</button></div></div>
    <h3>NOVA EMISSÃO</h3><div className="miniGrid">
      <Field label="VENDA"><select value={vendaId} onChange={(e) => setVendaId(e.target.value)}><option value="">SELECIONE...</option>{vendas.slice().reverse().map((v) => <option key={v.id} value={v.id}>{v.numeroVenda} • {v.cliente || v.nomeCliente || "CLIENTE"} • {money(v.total || v.valorTotal || v.valor)}</option>)}</select></Field>
      <Field label="PARCELAS"><input type="number" min="1" max="36" value={parcelas} onChange={(e) => setParcelas(e.target.value)} /></Field>
      <Field label="PRIMEIRO VENCIMENTO"><input type="date" value={primeiroVencimento} onChange={(e) => setPrimeiroVencimento(e.target.value)} /></Field>
      <Field label="INTERVALO EM DIAS"><input type="number" min="1" value={intervalo} onChange={(e) => setIntervalo(e.target.value)} /></Field>
      <Field label="JUROS AO MÊS (%)"><input type="number" min="0" step="0.01" value={jurosMes} onChange={(e) => setJurosMes(e.target.value)} /></Field>
      <Field label="MULTA (%)"><input type="number" min="0" step="0.01" value={multa} onChange={(e) => setMulta(e.target.value)} /></Field>
    </div><div className="transportBox"><b>PROTEÇÃO DO CLIENTE</b><p className="note">NEGATIVAÇÃO: DESATIVADA • PROTESTO AUTOMÁTICO: DESATIVADO. O OPERADOR NÃO PODE ALTERAR ESSAS REGRAS. EVENTUAL PROTESTO SERÁ SOLICITADO MANUALMENTE POR USUÁRIO AUTORIZADO.</p></div><div className="sendOptions"><label><input type="checkbox" checked={envioWhatsapp} onChange={(e)=>setEnvioWhatsapp(e.target.checked)} /> WHATSAPP</label><label><input type="checkbox" checked={envioEmail} onChange={(e)=>setEnvioEmail(e.target.checked)} /> E-MAIL</label><label><input type="checkbox" checked={incluirNota} onChange={(e)=>setIncluirNota(e.target.checked)} /> INCLUIR NOTA FISCAL</label><label><input type="checkbox" checked={envioAutomatico} onChange={(e)=>setEnvioAutomatico(e.target.checked)} /> ENVIAR AUTOMATICAMENTE APÓS EMISSÃO</label></div><div className="actions"><button onClick={emitir}>GERAR TÍTULOS PARA O ITAÚ</button><button className="ghost dark" onClick={filaEnvio}>ENVIAR BOLETOS DA VENDA</button></div>
    <h3>ALTERAR BOLETO DA VENDA</h3><div className="miniGrid">
      <Field label="BOLETO"><select value={editId} onChange={(e) => { const id=e.target.value; setEditId(id); const b=boletos.find((x) => x.id===id); setNovoVencimento(b?.vencimento || ""); setNovoValor(String(b?.valor || "")); setNovoJurosMes(String(b?.jurosMes ?? 5)); setNovaMulta(String(b?.multa ?? 2)); }}><option value="">SELECIONE...</option>{boletos.slice().reverse().map((b) => <option key={b.id} value={b.id}>{b.numeroVenda} • PARC. {b.parcela || 1} • {money(b.valor)} • {formatDateBR(b.vencimento)} • {b.status}</option>)}</select></Field>
      <Field label="NOVO VENCIMENTO"><input type="date" value={novoVencimento} onChange={(e) => setNovoVencimento(e.target.value)} /></Field>
      <Field label="NOVO VALOR"><input type="number" step="0.01" value={novoValor} onChange={(e) => setNovoValor(e.target.value)} /></Field>
      <Field label="JUROS AO MÊS (%)"><input type="number" min="0" step="0.01" value={novoJurosMes} onChange={(e) => setNovoJurosMes(e.target.value)} /></Field>
      <Field label="MULTA (%)"><input type="number" min="0" step="0.01" value={novaMulta} onChange={(e) => setNovaMulta(e.target.value)} /></Field>
    </div><div className="actions"><button onClick={alterar}>REGISTRAR ALTERAÇÃO</button></div>
    <h3>BOLETOS DISPONÍVEIS NESTA VENDA</h3><div className="bankList">{boletos.filter((b)=>!vendaId || b.vendaId===vendaId).slice().reverse().map((b)=><div className="cadRow" key={b.id}><div><b>{b.numeroVenda} • PARCELA {b.parcela || 1}/{b.totalParcelas || 1}</b><small>{formatDateBR(b.vencimento)} • {money(b.valor)} • {b.status} • ALTERAÇÃO {todayISO() >= (b.alteracaoLiberadaEm || todayISO()) ? "LIBERADA" : `EM ${formatDateBR(b.alteracaoLiberadaEm)}`}</small></div><span>{b.arquivo || b.url ? "DOCUMENTO DISPONÍVEL" : "AGUARDANDO ITAÚ"}</span></div>)}</div>
  </Modal>;
}

function FrancesinhaItau({ data }) {
  const [inicio,setInicio] = useState(() => `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,"0")}-01`);
  const [fim,setFim] = useState(todayISO());
  const [status,setStatus] = useState("TODOS");
  const eventos = (data.bankEvents || []).filter((e) => upper(e.provedor).includes("ITAU")).filter((e) => { const dt=String(e.ocorridoEm || e.criadoEm || "").slice(0,10); return (!inicio || dt >= inicio) && (!fim || dt <= fim) && (status === "TODOS" || normalizeBankEventStatus(e.status) === status); }).slice().sort((a,b) => String(b.ocorridoEm || b.criadoEm).localeCompare(String(a.ocorridoEm || a.criadoEm)));
  function report() { pdfSimple("FRANCESINHA ITAÚ — MOVIMENTAÇÃO DE TÍTULOS", [`PERÍODO: ${formatDateBR(inicio)} A ${formatDateBR(fim)}`,`FILTRO: ${status}`,"",...eventos.map((e) => `${new Date(e.ocorridoEm || e.criadoEm).toLocaleString("pt-BR")} | ${e.numeroVenda || "-"} | ${e.nossoNumero || "-"} | ${e.tipo} | ${normalizeBankEventStatus(e.status)} | ${money(e.valor || 0)} | ${e.detalhe || "-"}`),"",`TOTAL DE MOVIMENTAÇÕES: ${eventos.length}`], `FRANCESINHA-ITAU-${inicio}-${fim}.pdf`); }
  return <div className="transportBox"><div className="sectionHead"><div><h3>BANCO ITAÚ — FRANCESINHA DE COBRANÇA</h3><p>ACESSO FINANCEIRO • TODAS AS MOVIMENTAÇÕES DE TÍTULOS EM UM ÚNICO RELATÓRIO.</p></div><button onClick={report}>GERAR PDF DA FRANCESINHA</button></div>
    <div className="reportBar"><label>DE <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} /></label><label>ATÉ <input type="date" value={fim} onChange={(e) => setFim(e.target.value)} /></label><select value={status} onChange={(e) => setStatus(e.target.value)}><option>TODOS</option><option>PAGAMENTO IDENTIFICADO</option><option>LIQUIDADO / CONCILIADO</option><option>PARCIALMENTE PAGO</option><option>VENCIDO</option><option>BAIXADO SEM PAGAMENTO</option><option>REJEITADO</option><option>PENDENTE</option></select></div>
    <div className="cardLedger francesinhaLedger"><b>DATA/HORA</b><b>VENDA</b><b>NOSSO NÚMERO</b><b>MOVIMENTO</b><b>STATUS</b><b>VALOR</b><b>USUÁRIO/ORIGEM</b>{eventos.map((e) => <div className="rowContents" key={e.id}><span>{new Date(e.ocorridoEm || e.criadoEm).toLocaleString("pt-BR")}</span><span>{e.numeroVenda || "-"}</span><span>{e.nossoNumero || "-"}</span><span>{e.tipo}</span><strong>{normalizeBankEventStatus(e.status)}</strong><span>{money(e.valor || 0)}</span><span>{e.usuario || "API/CNAB"}</span></div>)}</div>{!eventos.length && <p className="muted">SEM MOVIMENTAÇÕES ITAÚ NO PERÍODO.</p>}
  </div>;
}

function IntegracoesFinanceiras({ data, onChange, onClose }) {
  const connections = data.bankConnections || [];
  const [selectedId, setSelectedId] = useState(connections[0]?.id || "novo");
  const current = connections.find((x) => x.id === selectedId);
  const blank = { id:"", nome:"", provedor:"OUTRO BANCO", codigoBanco:"", cnpj:"49832961000232", agencia:"", conta:"", carteira:"", convenio:"", ambiente:"HOMOLOGAÇÃO", autenticacao:"OAUTH2 + MTLS", clientId:"", certificadoAlias:"", apiBaseUrl:"", webhookUrl:"", especiePadrao:"DM - DUPLICATA DE VENDA MERCANTIL", jurosPadrao:5, multaPadrao:2, negativacao:false, protestoAutomatico:false, secretConfigurado:false, certificadoConfigurado:false, ativo:false, status:"AGUARDANDO DADOS DO BANCO" };
  const [form, setForm] = useState(current || blank);
  useEffect(() => setForm(current || blank), [selectedId]);
  const set = (key, value) => setForm((x) => ({ ...x, [key]: value }));
  const missing = connectionMissingFields(form);
  function save() {
    if (!form.nome || !form.provedor || !form.cnpj) return alert("INFORME NOME DA CONEXÃO, BANCO E CNPJ.");
    const id = form.id || uid("bankapi");
    const next = { ...form, id, cnpj:String(form.cnpj).replace(/\D/g,""), jurosPadrao:Number(form.jurosPadrao ?? 5), multaPadrao:Number(form.multaPadrao ?? 2), negativacao:false, protestoAutomatico:false, status:missing.length ? "AGUARDANDO DADOS DO BANCO" : "PRONTO PARA TESTE", atualizadoEm:nowISO() };
    onChange((d) => ({ ...d, bankConnections:(d.bankConnections || []).some((x) => x.id === id) ? (d.bankConnections || []).map((x) => x.id === id ? next : x) : [...(d.bankConnections || []), next] }));
    setForm(next); setSelectedId(id);
    alert("CONFIGURAÇÃO BANCÁRIA SALVA. SEGREDOS E CERTIFICADOS DEVEM PERMANECER NO SERVIDOR.");
  }
  function testConnection() {
    const faltam = connectionMissingFields(form);
    const event = { id:uid("bankevt"), connectionId:form.id || selectedId, provedor:form.provedor, tipo:"TESTE DE CONEXÃO", status:faltam.length ? "NÃO EXECUTADO" : "AGUARDANDO ENDPOINT BANCÁRIO", detalhe:faltam.length ? `PENDENTE: ${faltam.join(", ")}` : "CONFIGURAÇÃO COMPLETA; EXECUTAR PELO SERVIDOR SEGURO.", criadoEm:nowISO() };
    onChange((d) => ({ ...d, bankEvents:[...(d.bankEvents || []), event] }));
    alert(event.detalhe);
  }
  return <Modal title="INTEGRAÇÕES BANCÁRIAS — API / CNAB" onClose={onClose} wide>
    <div className="transportBox bankApiNotice"><b>REGRA DE SEGURANÇA E CONCILIAÇÃO</b><p>CLIENT SECRET, CHAVES E CERTIFICADOS NÃO SÃO GRAVADOS NESTA TELA. BAIXA OU CANCELAMENTO NÃO QUITAM CONTAS A RECEBER; SOMENTE EVENTO DE LIQUIDAÇÃO/CRÉDITO CONFIRMADO.</p></div>
    <div className="reportBar">{connections.map((x) => <button key={x.id} className={selectedId === x.id ? "primary" : "ghost dark"} onClick={() => setSelectedId(x.id)}>{x.nome}</button>)}<button className={selectedId === "novo" ? "primary" : "ghost dark"} onClick={() => setSelectedId("novo")}>+ OUTRO BANCO</button></div>
    <div className="miniGrid bankApiGrid">
      <Field label="NOME DA CONEXÃO"><UpperInput value={form.nome} onChange={(v) => set("nome",v)} /></Field>
      <Field label="BANCO / PROVEDOR"><select value={form.provedor} onChange={(e) => set("provedor",e.target.value)}><option>ITAU</option><option>CAIXA</option><option>BANCO DO BRASIL</option><option>BRADESCO</option><option>SANTANDER</option><option>OUTRO BANCO</option></select></Field>
      <Field label="CÓDIGO DO BANCO"><input value={form.codigoBanco || ""} onChange={(e) => set("codigoBanco",e.target.value)} /></Field>
      <Field label="CNPJ BENEFICIÁRIO"><input value={form.cnpj || ""} onChange={(e) => set("cnpj",e.target.value)} /></Field>
      <Field label="AGÊNCIA"><input value={form.agencia || ""} onChange={(e) => set("agencia",e.target.value)} /></Field>
      <Field label="CONTA / CÓD. BENEFICIÁRIO"><input value={form.conta || ""} onChange={(e) => set("conta",e.target.value)} /></Field>
      <Field label="CARTEIRA"><input value={form.carteira || ""} onChange={(e) => set("carteira",e.target.value)} /></Field>
      <Field label="CONVÊNIO"><input value={form.convenio || ""} onChange={(e) => set("convenio",e.target.value)} placeholder="INFORMADO PELO BANCO" /></Field>
      <Field label="AMBIENTE"><select value={form.ambiente} onChange={(e) => set("ambiente",e.target.value)}><option>HOMOLOGAÇÃO</option><option>PRODUÇÃO</option></select></Field>
      <Field label="AUTENTICAÇÃO"><select value={form.autenticacao} onChange={(e) => set("autenticacao",e.target.value)}><option>OAUTH2 + MTLS</option><option>OAUTH2</option><option>API KEY</option><option>OUTRA</option></select></Field>
      <Field label="CLIENT ID"><input value={form.clientId || ""} onChange={(e) => set("clientId",e.target.value)} placeholder="NÃO INFORME O CLIENT SECRET" /></Field>
      <Field label="IDENTIFICAÇÃO DO CERTIFICADO"><input value={form.certificadoAlias || ""} onChange={(e) => set("certificadoAlias",e.target.value)} /></Field>
      <Field label="URL BASE DA API"><input value={form.apiBaseUrl || ""} onChange={(e) => set("apiBaseUrl",e.target.value)} placeholder="INFORMADA PELO BANCO" /></Field>
      <Field label="URL DE WEBHOOK"><input value={form.webhookUrl || ""} onChange={(e) => set("webhookUrl",e.target.value)} placeholder="GERADA NO SERVIDOR" /></Field>
      <Field label="ESPÉCIE PADRÃO"><UpperInput value={form.especiePadrao || ""} onChange={(v) => set("especiePadrao",v)} /></Field>
      <Field label="JUROS PADRÃO AO MÊS (%)"><input type="number" min="0" step="0.01" value={form.jurosPadrao ?? 5} onChange={(e) => set("jurosPadrao",e.target.value)} /></Field>
      <Field label="MULTA PADRÃO (%)"><input type="number" min="0" step="0.01" value={form.multaPadrao ?? 2} onChange={(e) => set("multaPadrao",e.target.value)} /></Field>
      <Field label="NEGATIVAÇÃO"><input value="DESATIVADA — BLOQUEIO INTERNO" disabled /></Field>
      <Field label="PROTESTO AUTOMÁTICO"><input value="DESATIVADO — SOMENTE PROTESTO MANUAL AUTORIZADO" disabled /></Field>
      <Field label="SEGREDO INSTALADO NO SERVIDOR"><select value={form.secretConfigurado ? "SIM" : "NÃO"} onChange={(e) => set("secretConfigurado",e.target.value === "SIM")}><option>NÃO</option><option>SIM</option></select></Field>
      <Field label="CERTIFICADO INSTALADO NO SERVIDOR"><select value={form.certificadoConfigurado ? "SIM" : "NÃO"} onChange={(e) => set("certificadoConfigurado",e.target.value === "SIM")}><option>NÃO</option><option>SIM</option></select></Field>
    </div>
    <div className="bankApiStatus"><b>STATUS: {missing.length ? "AGUARDANDO DADOS DO BANCO" : "PRONTO PARA TESTE"}</b><span>{missing.length ? `FALTAM: ${missing.join(" • ")}` : "CAMPOS MÍNIMOS PREENCHIDOS"}</span></div>
    <div className="actions"><button onClick={save}>SALVAR CONFIGURAÇÃO</button><button className="ghost dark" onClick={testConnection}>VERIFICAR PRONTIDÃO</button></div>
    <div className="transportBox"><h3>EVENTOS E REGRAS</h3><p className="note">API PRINCIPAL + CNAB DE CONTINGÊNCIA. PAGAMENTO IDENTIFICADO = AGUARDANDO CRÉDITO. SOMENTE LIQUIDADO/CREDITADO QUITA O RECEBÍVEL. BAIXADO/CANCELADO = SEM PAGAMENTO.</p><div className="bankList">{(data.bankEvents || []).slice().reverse().slice(0,10).map((e) => <div className="cadRow" key={e.id}><div><b>{e.provedor} • {e.tipo}</b><small>{new Date(e.criadoEm).toLocaleString("pt-BR")} • {e.detalhe}</small></div><span>{normalizeBankEventStatus(e.status)}</span></div>)}</div></div>
  </Modal>;
}

function RecebiveisItau({ data, onChange }) {
  const [vendaRef, setVendaRef] = useState("");
  const [cnabName, setCnabName] = useState("");
  const vendas = [
    ...(data.vendas || []).map((v) => ({ ...v, _canal: "CARGA DIRETA" })),
    ...(data.vendasBalcao || [])
      .filter((v) => v.status === "CONCLUÍDA")
      .map((v) => ({ ...v, _canal: "VENDA BALCÃO" })),
  ].filter((v) => v.numeroVenda);
  const boletos = data.boletosClientes || [];
  function anexar(file) {
    if (!file || !vendaRef) return alert("SELECIONE UMA VENDA E UM BOLETO.");
    const v = vendas.find((x) => x.id === vendaRef);
    const id = uid("bcli");
    onChange((d) => ({
      ...d,
      boletosClientes: [
        ...(d.boletosClientes || []),
        {
          id,
          vendaId: v.id,
          numeroVenda: v.numeroVenda,
          cliente: v.cliente || "",
          canal: v._canal,
          banco: "ITAÚ",
          arquivo: file.name,
          status: "BOLETO ANEXADO",
          criadoEm: nowISO(),
        },
      ],
    }));
    alert(
      `BOLETO VINCULADO À VENDA ${v.numeroVenda}. A IA USARÁ O NÚMERO DA VENDA, NOSSO NÚMERO, VALOR, VENCIMENTO E DEMAIS IDENTIFICADORES NA CONCILIAÇÃO.`,
    );
  }
  async function anexarComprovanteCliente(file) {
    if (!file || !vendaRef)
      return alert("SELECIONE A VENDA ANTES DE ANEXAR O COMPROVANTE.");
    const bruto = prompt("INFORME O VALOR RECEBIDO NESTE COMPROVANTE:");
    if (bruto === null) return;
    const valor = Number(String(bruto).replace(/\./g, "").replace(",", "."));
    if (!valor || valor <= 0) return alert("VALOR INVÁLIDO.");
    const venda = vendas.find((x) => x.id === vendaRef);
    onChange((d) => {
      let restante = valor;
      const agora = nowISO();
      const contas = (d.contasReceber || []).map((t) => {
        if (
          t.vendaId !== vendaRef ||
          restante <= 0 ||
          upper(t.status).includes("LIQUIDADO")
        )
          return t;
        const atual = Number(t.valorRecebido || 0);
        const saldo =
          "saldoAberto" in t
            ? Number(t.saldoAberto)
            : Math.max(0, Number(t.valor || 0) - atual);
        const aplicar = Math.min(restante, saldo);
        if (aplicar <= 0) return t;
        restante -= aplicar;
        const novoReceb = atual + aplicar;
        const novoSaldo = Math.max(0, Number(t.valor || 0) - novoReceb);
        return {
          ...t,
          valorRecebido: novoReceb,
          saldoAberto: novoSaldo,
          status: novoSaldo <= 0.009 ? "LIQUIDADO" : "PARCIALMENTE PAGO",
          pagamentos: [
            ...(t.pagamentos || []),
            {
              id: uid("pgcli"),
              data: todayISO(),
              valor: aplicar,
              arquivo: file.name,
              origem: "COMPROVANTE ANEXADO",
              criadoEm: agora,
            },
          ],
        };
      });
      return {
        ...d,
        contasReceber: contas,
        comprovantesClientes: [
          ...(d.comprovantesClientes || []),
          {
            id: uid("compcli"),
            vendaId: vendaRef,
            numeroVenda: venda?.numeroVenda || "",
            cliente: venda?.cliente || "",
            arquivo: file.name,
            valor,
            criadoEm: agora,
            status:
              restante <= 0.009
                ? "VINCULADO"
                : "VINCULADO PARCIALMENTE — SALDO SEM TÍTULO",
            teste: false,
          },
        ],
      };
    });
    alert(
      `COMPROVANTE VINCULADO À VENDA ${venda?.numeroVenda || ""}. O CONTAS A RECEBER FOI ATUALIZADO PELO VALOR INFORMADO.`,
    );
  }
  async function importarCnab(file) {
    if (!file) return;
    const txt = await file.text();
    const vendasRefs = vendas.map((v) => v.numeroVenda).filter(Boolean);
    const refs = vendasRefs.filter((n) => txt.includes(n));
    const id = uid("cnab");
    onChange((d) => ({
      ...d,
      cnabImportacoes: [
        ...(d.cnabImportacoes || []),
        {
          id,
          banco: "ITAÚ",
          arquivo: file.name,
          tamanho: file.size,
          hashSimples: `${file.name}|${file.size}|${txt.length}`,
          vendasLocalizadas: refs,
          status: "IMPORTADO / AGUARDANDO CONFERÊNCIA IA",
          criadoEm: nowISO(),
        },
      ],
    }));
    setCnabName(file.name);
    alert(
      `CNAB IMPORTADO. ${refs.length} REFERÊNCIA(S) DE VENDA LOCALIZADA(S) NO ARQUIVO. O SISTEMA NÃO DUPLICA TÍTULOS JÁ CADASTRADOS; ATUALIZA/CONCILIA PELOS IDENTIFICADORES BANCÁRIOS.`,
    );
  }
  return (
    <div className="transportBox">
      <div className="sectionHead">
        <div>
          <h3>BOLETOS DE CLIENTES / ITAÚ / CNAB</h3>
          <p>
            VENDA → PARCELA → BOLETO ITAÚ → CNAB → CONTAS A RECEBER. NUMERAÇÃO
            DE VENDA É INDEPENDENTE DOS ORÇAMENTOS.
          </p>
        </div>
      </div>
      <div className="miniGrid">
        <Field label="VENDA">
          <select
            value={vendaRef}
            onChange={(e) => setVendaRef(e.target.value)}
          >
            <option value="">SELECIONE...</option>
            {vendas
              .slice()
              .reverse()
              .map((v) => (
                <option key={v.id} value={v.id}>
                  {v.numeroVenda} • {v.cliente} • {v._canal}
                </option>
              ))}
          </select>
        </Field>
        <Field label="ANEXAR BOLETO DO CLIENTE — ITAÚ">
          <input
            type="file"
            accept=".pdf,image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                anexar(f);
                e.target.value = "";
              }
            }}
          />
        </Field>
        <Field label="ANEXAR COMPROVANTE DE PAGAMENTO DO CLIENTE">
          <input
            type="file"
            accept=".pdf,image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                anexarComprovanteCliente(f);
                e.target.value = "";
              }
            }}
          />
        </Field>
        <Field label="IMPORTAR CNAB ITAÚ">
          <input
            type="file"
            accept=".txt,.ret,.rem,.cnab"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                importarCnab(f);
                e.target.value = "";
              }
            }}
          />
        </Field>
      </div>
      {cnabName && (
        <p className="note">
          <b>ÚLTIMO CNAB:</b> {cnabName}
        </p>
      )}
      <div className="cardLedger">
        <b>Nº VENDA</b>
        <b>CLIENTE</b>
        <b>CANAL</b>
        <b>BANCO</b>
        <b>ARQUIVO</b>
        <b>STATUS</b>
        <b>DATA</b>
        {boletos
          .slice()
          .reverse()
          .map((b) => (
            <div className="rowContents" key={b.id}>
              <span>{b.numeroVenda}</span>
              <span>{b.cliente}</span>
              <span>{b.canal}</span>
              <span>{b.banco}</span>
              <span>{b.arquivo}</span>
              <strong>{b.status}</strong>
              <span>{new Date(b.criadoEm).toLocaleString("pt-BR")}</span>
            </div>
          ))}
      </div>
    </div>
  );
}

function ContaCorrenteFornecedores({ data, onChange, currentUser }) {
  const [fornecedorId, setFornecedorId] = useState("");
  const [tipo, setTipo] = useState("DEPÓSITO / ADIANTAMENTO");
  const [valor, setValor] = useState("");
  const [referencia, setReferencia] = useState("");
  const [arquivo, setArquivo] = useState(null);
  const fornecedores = (data.fornecedores || []).filter(
    (x) => x.ativo !== false,
  );
  const movimentos = (data.fornecedorCreditos || [])
    .slice()
    .sort((a, b) =>
      String(a.dataHora || "").localeCompare(String(b.dataHora || "")),
    );
  const sinal = (x) =>
    x.tipo === "DEPÓSITO / ADIANTAMENTO"
      ? Number(x.valor || 0)
      : -Number(x.valor || 0);
  const saldo = (id) =>
    movimentos
      .filter((x) => x.fornecedorId === id)
      .reduce((a, x) => a + sinal(x), 0);
  async function registrar() {
    const f = fornecedores.find((x) => x.id === fornecedorId),
      v = Number(valor || 0);
    if (!f || v <= 0)
      return alert("SELECIONE O FORNECEDOR E INFORME UM VALOR VÁLIDO.");
    if (tipo === "DEPÓSITO / ADIANTAMENTO" && !arquivo)
      return alert("ANEXE O COMPROVANTE DO DEPÓSITO / PAGAMENTO ANTECIPADO.");
    if (tipo !== "DEPÓSITO / ADIANTAMENTO" && v > saldo(f.id))
      return alert(
        `BAIXA BLOQUEADA. CRÉDITO DISPONÍVEL: ${money(saldo(f.id))}.`,
      );
    let fileId = "";
    if (arquivo) {
      fileId = uid("credforn");
      await putFile(fileId, arquivo);
    }
    const movimento = {
      id: uid("ccf"),
      fornecedorId: f.id,
      fornecedor: f.nome,
      tipo,
      valor: v,
      referencia: upper(referencia),
      arquivo: arquivo?.name || "",
      fileId,
      data: todayISO(),
      dataHora: nowISO(),
      usuario: currentUser?.nome || "",
      saldoApos: saldo(f.id) + (tipo === "DEPÓSITO / ADIANTAMENTO" ? v : -v),
    };
    onChange((d) => ({
      ...d,
      fornecedorCreditos: [...(d.fornecedorCreditos || []), movimento],
      documentos: [
        ...(d.documentos || []),
        ...(fileId
          ? [
              {
                id: fileId,
                fileId,
                tipo: "COMPROVANTE PAGAMENTO ANTECIPADO",
                nome: arquivo.name,
                mime: arquivo.type,
                criadoEm: nowISO(),
              },
            ]
          : []),
      ],
      auditoria: [
        ...(d.auditoria || []),
        {
          id: uid("aud"),
          acao: "CONTA-CORRENTE DO FORNECEDOR",
          detalhe: `${f.nome} • ${tipo} • ${money(v)} • ${referencia || "SEM REFERÊNCIA"}`,
          usuario: currentUser?.nome || "",
          dataHora: nowISO(),
        },
      ],
    }));
    setValor("");
    setReferencia("");
    setArquivo(null);
    alert(
      `MOVIMENTO REGISTRADO. SALDO DO FORNECEDOR: ${money(movimento.saldoApos)}.`,
    );
  }
  return (
    <div className="transportBox">
      <h3>CONTA-CORRENTE FINANCEIRO DOS FORNECEDORES</h3>
      <p>
        ADIANTAMENTOS GERAM CRÉDITO DA FORTE. A UTILIZAÇÃO EM NF OU DEVOLUÇÃO
        REDUZ O SALDO, SEM PERMITIR DUPLICIDADE.
      </p>
      <div className="miniGrid">
        <Field label="FORNECEDOR">
          <select
            value={fornecedorId}
            onChange={(e) => setFornecedorId(e.target.value)}
          >
            <option value="">SELECIONE...</option>
            {fornecedores.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome} • SALDO {money(saldo(f.id))}
              </option>
            ))}
          </select>
        </Field>
        <Field label="MOVIMENTO">
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option>DEPÓSITO / ADIANTAMENTO</option>
            <option>UTILIZAÇÃO EM NF</option>
            <option>DEVOLUÇÃO / BAIXA</option>
          </select>
        </Field>
        <Field label="VALOR">
          <input
            type="number"
            min="0"
            step="0.01"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
          />
        </Field>
        <Field label="NF / PEDIDO / REFERÊNCIA">
          <UpperInput value={referencia} onChange={setReferencia} />
        </Field>
        <Field label="COMPROVANTE">
          <input
            type="file"
            accept=".pdf,image/*"
            onChange={(e) => setArquivo(e.target.files?.[0] || null)}
          />
        </Field>
        <button onClick={registrar}>REGISTRAR MOVIMENTO</button>
      </div>
      {fornecedorId && (
        <div className="alert success">
          <b>SALDO ATUAL DISPONÍVEL:</b> {money(saldo(fornecedorId))}
        </div>
      )}
      <div className="cadList">
        {movimentos
          .slice()
          .reverse()
          .slice(0, 20)
          .map((x) => (
            <div className="cadRow" key={x.id}>
              <div>
                <b>
                  {x.fornecedor} • {x.tipo}
                </b>
                <small>
                  {formatDateBR(x.data)} • {x.referencia || "SEM REFERÊNCIA"} •{" "}
                  {x.arquivo || "SEM ARQUIVO"}
                </small>
              </div>
              <strong>
                {x.tipo === "DEPÓSITO / ADIANTAMENTO" ? "+" : "-"}
                {money(x.valor)}
              </strong>
            </div>
          ))}
      </div>
    </div>
  );
}

function BancoNotasFiscais({ data, onChange, currentUser, onDireta }) {
  const [busca, setBusca] = useState("");
  const [links, setLinks] = useState({});
  const [qtdPaletes, setQtdPaletes] = useState({});
  const [destinosNota, setDestinosNota] = useState({});
  const [palletsNota, setPalletsNota] = useState({});
  const [origemPallets, setOrigemPallets] = useState({});
  const [nfPalletEmitida, setNfPalletEmitida] = useState({});
  const todasNotas = data.notasFiscais || [];
  const ehNotaPallet = (n) =>
    (n.produtos || []).length > 0 &&
    (n.produtos || []).every((p) => /PALLET|PALETE/.test(upper(p.produto)));
  function notaPalletRelacionada(n) {
    const pedidos = new Set([...(n.pedidos || []), ...(n.os || [])].map(norm));
    return todasNotas.find((p) => {
      if (p.id === n.id || !ehNotaPallet(p)) return false;
      const mesmaEmpresa =
        norm(p.emitenteCnpj) === norm(n.emitenteCnpj) ||
        norm(p.emitente) === norm(n.emitente);
      const mesmaReferencia = [...(p.pedidos || []), ...(p.os || [])]
        .map(norm)
        .some((x) => pedidos.has(x));
      const mesmaData =
        String(p.emissao || "").slice(0, 10) ===
        String(n.emissao || "").slice(0, 10);
      return mesmaEmpresa && (mesmaReferencia || mesmaData);
    });
  }
  const notas = todasNotas
    .filter((n) => !ehNotaPallet(n))
    .slice()
    .sort((a, b) =>
      String(b.emissao || b.importadaEm || "").localeCompare(
        String(a.emissao || a.importadaEm || ""),
      ),
    )
    .filter(
      (n) =>
        !norm(busca) ||
        norm(
          [
            n.numero,
            n.emitente,
            n.emitenteCnpj,
            n.chave,
            (n.pedidos || []).join(" "),
            (n.os || []).join(" "),
            (n.produtos || []).map((p) => p.produto).join(" "),
          ].join(" "),
        ).includes(norm(busca)),
    );
  const cargas = (data.cargas || []).filter((c) => c.status !== "CANCELADA");
  const [abertas, setAbertas] = useState({});
  function siglaDestino(n) {
    return (
      n.siglaDestino ||
      (n.destinacao === "FORTE ATACAREJO"
        ? "G"
        : n.destinacao === "CARGA DIRETA"
          ? "D"
          : "")
    );
  }
  function iniciarConferencia(n) {
    onChange((d) => ({
      ...d,
      notasFiscais: (d.notasFiscais || []).map((x) =>
        x.id === n.id
          ? {
              ...x,
              status: "CONFERÊNCIA INICIADA",
              conferenciaIniciadaEm: nowISO(),
              conferenciaIniciadaPor: currentUser?.nome || "",
            }
          : x,
      ),
      auditoria: [
        ...(d.auditoria || []),
        {
          id: uid("aud"),
          usuario: currentUser?.nome || "",
          acao: "CONFERÊNCIA DA NF INICIADA",
          detalhe: "NF " + (n.numero || "-"),
          dataHora: nowISO(),
        },
      ],
    }));
  }
  function docsDossie(n) {
    const refs = [n.numero, n.chave, ...(n.pedidos || []), ...(n.os || [])]
      .map(norm)
      .filter(Boolean);
    return (data.gmailImports || []).filter(
      (x) =>
        x.nfe?.chave === n.chave ||
        x.threadId === n.threadId ||
        refs.some((r) =>
          norm(
            `${x.subject || ""} ${x.filename || ""} ${x.snippet || ""}`,
          ).includes(r),
        ),
    );
  }
  function documentosImprimiveis(n) {
    const ds = docsDossie(n);
    const manuais = (data.documentos || []).filter(
      (d) => d.notaFiscalPrincipalId === n.id,
    );
    const relacionados = [
      { ordem: 10, tipo: "NF DO PRODUTO / DANFE", nome: "DANFE / PDF", fileId: n.danfeDocumentoId },
      ...manuais.map((d) => ({
        ordem: /DANFE|NF PRINCIPAL/i.test(d.tipo || "") ? 10 : /PALLET|PALETE/i.test(d.tipo || "") ? 20 : /BOLETO|TÍTULO/i.test(d.tipo || "") ? 30 : /FRETE/i.test(d.tipo || "") ? 40 : /ANTECIPADO|FORNECEDOR/i.test(d.tipo || "") ? 50 : 60,
        tipo: d.tipo || "DOCUMENTO",
        nome: d.nome || "DOCUMENTO",
        fileId: d.fileId || d.id,
      })),
      ...ds.map((d) => ({
        ordem: /DANFE|NFE|NF-E/i.test(`${d.tipo || ""} ${d.filename || ""}`) ? 10 : /PALLET|PALETE/i.test(`${d.tipo || ""} ${d.filename || ""}`) ? 20 : /BOLETO|TÍTULO/i.test(`${d.tipo || ""} ${d.filename || ""}`) ? 30 : /FRETE/i.test(`${d.tipo || ""} ${d.filename || ""}`) ? 40 : /PAGAMENTO|LIQUIDA/i.test(d.tipo || "") ? 50 : 60,
        tipo: d.tipo || "DOCUMENTO",
        nome: d.filename || "DOCUMENTO",
        fileId: d.fileId,
      })),
    ];
    const vistos = new Set();
    return relacionados
      .filter((d) => d.fileId && !vistos.has(d.fileId) && vistos.add(d.fileId))
      .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome));
  }
  async function imprimirDocumento(fileId) {
    if (!fileId) return alert("DOCUMENTO AINDA NÃO ANEXADO.");
    try { await openFile(fileId, true); }
    catch (e) { alert(e.message || "NÃO FOI POSSÍVEL ABRIR O DOCUMENTO PARA IMPRESSÃO."); }
  }
  async function imprimirDossie(n, exigirCompleto = false) {
    const ck = checklist(n);
    const concluido = ck.ok && n.pagamentoFornecedorStatus === "LIQUIDADO" && /CONCLUÍDA E LIQUIDADA/.test(upper(n.status));
    if (exigirCompleto && !concluido)
      return alert("DOSSIÊ COMPLETO INDISPONÍVEL: A OPERAÇÃO AINDA POSSUI ETAPAS OU LIQUIDAÇÕES PENDENTES. USE IMPRIMIR DOSSIÊ DISPONÍVEL.");
    const itens = documentosImprimiveis(n);
    if (!itens.length) return alert("NENHUM DOCUMENTO IMPRIMÍVEL FOI ANEXADO A ESTE DOSSIÊ.");
    try {
      const saida = await PDFDocument.create();
      const fonte = await saida.embedFont(StandardFonts.Helvetica);
      const negrito = await saida.embedFont(StandardFonts.HelveticaBold);
      const capa = saida.addPage([595.28, 841.89]);
      capa.drawText("FORTE ATACAREJO - DOSSIE DA OPERACAO", { x: 42, y: 790, size: 16, font: negrito, color: rgb(0.04, 0.16, 0.35) });
      const linhas = [
        `NF: ${n.numero || "SEM NUMERO"}`,
        `PEDIDO: ${ck.pedido || "PENDENTE"}`,
        `FORNECEDOR: ${n.emitente || "NAO IDENTIFICADO"}`,
        `STATUS: ${n.status || "AGUARDANDO DESTINACAO"}`,
        `TIPO: ${exigirCompleto ? "DOSSIE COMPLETO" : "DOSSIE DISPONIVEL / PARCIAL"}`,
        "", "DOCUMENTOS NA SEQUENCIA:",
        ...itens.map((d, i) => `${i + 1}. ${d.tipo} - ${d.nome}`),
      ];
      let y = 750;
      for (const linha of linhas) {
        const texto = String(linha).normalize("NFD").replace(/[\u0300-\u036f]/g, "").slice(0, 92);
        capa.drawText(texto, { x: 42, y, size: 10, font: linha.includes("DOCUMENTOS") ? negrito : fonte });
        y -= 18;
      }
      for (const item of itens) {
        const arquivo = await getFile(item.fileId);
        if (!arquivo) continue;
        const bytes = await arquivo.arrayBuffer();
        if (/pdf/i.test(arquivo.type || "") || /\.pdf$/i.test(item.nome || "")) {
          const origem = await PDFDocument.load(bytes);
          const paginas = await saida.copyPages(origem, origem.getPageIndices());
          paginas.forEach((p) => saida.addPage(p));
        } else if (/image\/(png|jpeg|jpg)/i.test(arquivo.type || "")) {
          const imagem = /png/i.test(arquivo.type || "") ? await saida.embedPng(bytes) : await saida.embedJpg(bytes);
          const pagina = saida.addPage([595.28, 841.89]);
          const escala = Math.min(515 / imagem.width, 740 / imagem.height, 1);
          pagina.drawText(item.tipo.normalize("NFD").replace(/[\u0300-\u036f]/g, ""), { x: 40, y: 805, size: 10, font: negrito });
          pagina.drawImage(imagem, { x: (595.28 - imagem.width * escala) / 2, y: 35, width: imagem.width * escala, height: imagem.height * escala });
        }
      }
      const blob = new Blob([await saida.save()], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const janela = window.open(url, "_blank");
      if (janela) setTimeout(() => janela.print(), 900);
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { alert(e.message || "NÃO FOI POSSÍVEL MONTAR O DOSSIÊ PARA IMPRESSÃO."); }
  }
  function checklist(n) {
    const ds = docsDossie(n),
      pedido =
        (n.pedidos || [])[0] ||
        cargas.find((c) => c.id === (n.cargaId || sugerida(n)?.id))
          ?.numeroPedidoFornecedor ||
        "";
    const pdf =
        !!n.danfeDocumentoId ||
        ds.some(
          (x) =>
            /\.pdf$/i.test(x.filename || "") &&
            (/NFE|DOCUMENTO/.test(upper(x.tipo)) ||
              /danfe|nota/i.test(`${x.subject || ""} ${x.filename || ""}`)),
        ),
      xml =
        !!n.documentoXmlId || ds.some((x) => /\.xml$/i.test(x.filename || "")),
      boleto =
        !!n.boletoDocumentoId ||
        !!n.comprovantePagamentoAntecipadoDocumentoId ||
        (n.boletos || []).length > 0 ||
        ds.some((x) =>
          /BOLETO|TÍTULO|PAGAMENTO ANTECIPADO/.test(upper(x.tipo)),
        ),
      cargaRef = cargas.find((c) => c.id === (n.cargaId || sugerida(n)?.id)),
      freteCif = upper(cargaRef?.modalidadeFrete || cargaRef?.frete) === "CIF",
      comprovanteFrete =
        freteCif ||
        !!n.comprovanteFreteDocumentoId ||
        ds.some(
          (x) =>
            upper(x.tipo).includes("COMPROVANTE") &&
            /frete|motorista|pix|pagamento/i.test(
              (x.subject || "") + " " + (x.filename || ""),
            ),
        ),
      palletResposta = palletsNota[n.id] || n.palletAplica || "",
      palletAplica = palletResposta === "SIM",
      origemPallet = origemPallets[n.id] || n.origemPallets || "",
      nfPallet = nfPalletEmitida[n.id] || n.nfPalletEmitida || "",
      palletDocumento =
        !!n.notaPallet ||
        !!notaPalletRelacionada(n) ||
        ds.some((x) =>
          /pallet|palete/i.test((x.subject || "") + " " + (x.filename || "")),
        ),
      palletQuantidade = Number(qtdPaletes[n.id] ?? n.quantidadePaletes ?? 0),
      palletProprio = [
        "PALLETS DA FORTE NO FORNECEDOR",
        "PALLETS PRÓPRIOS LEVADOS PELO MOTORISTA",
      ].includes(origemPallet),
      palletOk =
        palletResposta === "NÃO" ||
        (palletAplica &&
          !!origemPallet &&
          palletQuantidade > 0 &&
          (palletProprio || nfPallet === "NÃO" || palletDocumento));
    const pend = [];
    if (!pedido) pend.push("PEDIDO");
    if (!pdf) pend.push("DANFE/PDF");
    if (!boleto) pend.push("BOLETO");
    if (!comprovanteFrete)
      pend.push("COMPROVANTE DE PAGAMENTO DO FRETE (NÃO CIF)");
    if (!palletResposta) pend.push("INFORMAR SE HÁ PALLETS");
    else if (palletAplica && !origemPallet) pend.push("ORIGEM DOS PALLETS");
    else if (palletAplica && palletQuantidade <= 0)
      pend.push("QUANTIDADE DE PALLETS");
    else if (palletAplica && !palletProprio && !nfPallet)
      pend.push("INFORMAR SE FOI EMITIDA NF DE PALLETS");
    else if (
      palletAplica &&
      !palletProprio &&
      nfPallet === "SIM" &&
      !palletDocumento
    )
      pend.push("NF PALLETS");
    return {
      ds,
      pedido,
      pdf,
      xml,
      boleto,
      freteCif,
      comprovanteFrete,
      palletAplica,
      palletOk,
      origemPallet,
      nfPallet,
      palletProprio,
      pend,
      ok: pend.length === 0,
    };
  }
  function exigirDossie(n) {
    const ck = checklist(n);
    if (!ck.ok) {
      alert(
        `CARGA BLOQUEADA — DOSSIÊ DOCUMENTAL INCOMPLETO.\nPENDENTE: ${ck.pend.join(", ")}.\n\nSINCRONIZE/ANEXE OS DOCUMENTOS ANTES DE PROSSEGUIR.`,
      );
      return false;
    }
    return true;
  }
  function sugerida(n) {
    const refs = [...(n.pedidos || []), ...(n.os || [])]
      .map(norm)
      .filter(Boolean);
    return (
      cargas.find((c) =>
        refs.some((r) =>
          [c.numeroPedidoFornecedor, c.numeroOSFornecedor].some(
            (v) => norm(v) === r,
          ),
        ),
      ) ||
      cargas.find(
        (c) =>
          norm(n.emitente).includes(norm(c.marca)) ||
          norm(c.marca).includes(norm(n.emitente)),
      )
    );
  }
  async function anexarDossie(n, tipo, file) {
    if (!file) return;
    const fileId = uid("docnf");
    await putFile(fileId, file);
    onChange((d) => ({
      ...d,
      documentos: [
        ...(d.documentos || []),
        {
          id: fileId,
          fileId,
          tipo,
          nome: file.name,
          mime: file.type,
          cargaId: n.cargaId || "",
          notaFiscalPrincipalId: n.id,
          statusIa: "ANEXADO AO DOSSIÊ — AGUARDANDO CONFERÊNCIA",
          conferencia: { status: "AGUARDANDO IA", itens: [] },
          criadoEm: nowISO(),
        },
      ],
      notasFiscais: (d.notasFiscais || []).map((x) =>
        x.id === n.id
          ? {
              ...x,
              ...(tipo === "DANFE / PDF"
                ? { danfeDocumentoId: fileId }
                : tipo === "COMPROVANTE DE PAGAMENTO DO FRETE"
                  ? { comprovanteFreteDocumentoId: fileId }
                  : tipo === "COMPROVANTE DE PAGAMENTO ANTECIPADO"
                    ? {
                        comprovantePagamentoAntecipadoDocumentoId: fileId,
                        pagamentoFornecedorStatus: "AGUARDANDO CONCILIAÇÃO",
                      }
                    : {
                        boletoDocumentoId: fileId,
                        pagamentoFornecedorStatus: "AGUARDANDO LIQUIDAÇÃO",
                      }),
              documentosManuais: [
                ...(x.documentosManuais || []),
                { id: fileId, tipo, nome: file.name },
              ],
            }
          : x,
      ),
    }));
    alert(tipo + " ANEXADO AO MESMO DOSSIÊ DA NF.");
  }
  function liquidarFornecedor(n) {
    const ck = checklist(n);
    if (!/FINALIZADA|INCORPORADA AO ESTOQUE/.test(upper(n.status)))
      return alert(
        "LIQUIDAÇÃO BLOQUEADA: CONCLUA PRIMEIRO A CONFERÊNCIA, A DESTINAÇÃO DA MERCADORIA E A MOVIMENTAÇÃO DOS PALLETS.",
      );
    if (!ck.boleto)
      return alert(
        "LIQUIDAÇÃO BLOQUEADA: ANEXE O BOLETO/TÍTULO OU O COMPROVANTE DE PAGAMENTO ANTECIPADO.",
      );
    const saldo = (data.fornecedorCreditos || [])
      .filter(
        (x) =>
          x.fornecedorId === n.fornecedorId ||
          norm(x.fornecedor) === norm(n.emitente),
      )
      .reduce(
        (a, x) =>
          a +
          (x.tipo === "DEPÓSITO / ADIANTAMENTO"
            ? Number(x.valor || 0)
            : -Number(x.valor || 0)),
        0,
      );
    const usar =
      saldo > 0 &&
      confirm(
        `EXISTE ${money(saldo)} DE CRÉDITO DISPONÍVEL COM ${n.emitente}. DESEJA UTILIZÁ-LO NESTA NOTA?`,
      );
    const usado = usar ? Math.min(saldo, Number(n.valorNf || 0)) : 0;
    const restante = Math.max(0, Number(n.valorNf || 0) - usado);
    const pago = Number(
      prompt(
        `VALOR DA NF: ${money(n.valorNf)}\nCRÉDITO UTILIZADO: ${money(usado)}\nSALDO A PAGAR: ${money(restante)}\n\nINFORME O VALOR DO NOVO PAGAMENTO:`,
      ) ?? "-1",
    );
    if (pago < 0 || Math.abs(pago + usado - Number(n.valorNf || 0)) > 0.01)
      return alert(
        "LIQUIDAÇÃO NÃO CONCLUÍDA: NOVO PAGAMENTO + CRÉDITO DEVEM CORRESPONDER AO VALOR DA NOTA.",
      );
    onChange((d) => ({
      ...d,
      fornecedorCreditos: [
        ...(d.fornecedorCreditos || []),
        ...(usado > 0
          ? [
              {
                id: uid("ccf"),
                fornecedorId: n.fornecedorId || "",
                fornecedor: n.emitente,
                tipo: "UTILIZAÇÃO EM NF",
                valor: usado,
                referencia: `NF ${n.numero}`,
                data: todayISO(),
                dataHora: nowISO(),
                usuario: currentUser?.nome || "",
              },
            ]
          : []),
      ],
      notasFiscais: (d.notasFiscais || []).map((x) =>
        x.id === n.id
          ? {
              ...x,
              pagamentoFornecedorStatus: "LIQUIDADO",
              creditoFornecedorUtilizado: usado,
              novoPagamentoFornecedor: pago,
              liquidadaEm: nowISO(),
              liquidadaPor: currentUser?.nome || "",
              status: "CARGA CONCLUÍDA E LIQUIDADA",
            }
          : x,
      ),
      auditoria: [
        ...(d.auditoria || []),
        {
          id: uid("aud"),
          acao: "FORNECEDOR LIQUIDADO",
          detalhe: `NF ${n.numero} • NOVO PAGAMENTO ${money(pago)} • CRÉDITO ${money(usado)}`,
          usuario: currentUser?.nome || "",
          dataHora: nowISO(),
        },
      ],
    }));
    alert(
      "FORNECEDOR LIQUIDADO. O DOSSIÊ FOI MARCADO COMO CARGA CONCLUÍDA E LIQUIDADA.",
    );
  }
  async function anexarNotaPallet(n, file) {
    if (!file) return;
    const fileId = uid("nfpallet");
    await putFile(fileId, file);
    onChange((d) => ({
      ...d,
      documentos: [
        ...(d.documentos || []),
        {
          id: fileId,
          fileId,
          tipo: "NF DE PALLETS",
          nome: file.name,
          mime: file.type,
          cargaId: n.cargaId || "",
          notaFiscalPrincipalId: n.id,
          statusIa: "ANEXADO — AGUARDANDO DESTINAÇÃO DOS PALLETS",
          conferencia: { status: "AGUARDANDO IA", itens: [] },
          criadoEm: nowISO(),
        },
      ],
      notasFiscais: (d.notasFiscais || []).map((x) =>
        x.id === n.id
          ? {
              ...x,
              notaPallet: {
                documentoId: fileId,
                nome: file.name,
                anexadaEm: nowISO(),
                status: "AGUARDANDO DESTINAÇÃO",
              },
            }
          : x,
      ),
    }));
    alert("NOTA DE PALLETS ANEXADA AO MESMO BLOCO DA NF PRINCIPAL.");
  }
  async function importarXml(file) {
    if (!file) return;
    try {
      const n = await lerXmlNfe(file);
      if ((data.notasFiscais || []).some((x) => x.chave && x.chave === n.chave))
        return alert("NF-E JÁ EXISTE NO BANCO DE NOTAS FISCAIS.");
      const fileId = uid("nfxml");
      await putFile(fileId, file);
      const { raw, ...dados } = n;
      onChange((d) => ({
        ...d,
        notasFiscais: [
          ...(d.notasFiscais || []),
          {
            id: uid("nfe"),
            ...dados,
            origem: "XML MANUAL — BANCO DE NOTAS",
            documentoXmlId: fileId,
            status: "AGUARDANDO DESTINAÇÃO",
            importadaEm: nowISO(),
          },
        ],
        documentos: [
          ...(d.documentos || []),
          {
            id: fileId,
            fileId,
            tipo: "NF PRINCIPAL DO PRODUTO",
            nome: file.name,
            mime: file.type,
            xml: true,
            dadosExtraidos: n,
            statusIa: "XML LIDO — AGUARDANDO VINCULAÇÃO",
            conferencia: { status: "AGUARDANDO IA", itens: [] },
            criadoEm: nowISO(),
          },
        ],
      }));
      alert("NOTA FISCAL IMPORTADA PARA O BANCO.");
    } catch (e) {
      alert(e.message || "NÃO FOI POSSÍVEL LER O XML.");
    }
  }
  async function consultarSefaz() {
    if (window.matchMedia("(max-width: 980px)").matches)
      return alert(
        "CONSULTA E DOWNLOAD OFICIAL DE NF-E POR CERTIFICADO DIGITAL SÃO EXCLUSIVOS DO DESKTOP. NO CELULAR, VOCÊ PODE VISUALIZAR E VINCULAR OS DOCUMENTOS JÁ SINCRONIZADOS.",
      );
    const endpoint = data.settings?.sefazEndpointSeguro || `${SEFAZ_LOCAL}/api/sefaz/distribuicao`;
    if (!endpoint)
      return alert(
        "CONSULTA SEFAZ PREPARADA, MAS AINDA NÃO ATIVADA. CADASTRE O SERVIÇO SEGURO COM OS CERTIFICADOS DIGITAIS DA MATRIZ E DA FILIAL. O CERTIFICADO NÃO SERÁ GUARDADO NO NAVEGADOR.",
      );
    try {
      const unidades = (data.unidades || []).filter((u) => u.ativo !== false && u.cnpj);
      const cnpjs = unidades.map((u) => u.cnpj).filter(Boolean);
      const resposta = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acao: "DISTRIBUICAO_DFE",
          ambiente: data.settings?.sefazAmbiente || "1",
          estabelecimentos: unidades.map((u) => ({
            cnpj: u.cnpj,
            unidade: u.nome,
            uf: u.uf,
            codigoUf: UF_IBGE[upper(u.uf)],
          })),
        }),
      });
      const retorno = await resposta.json();
      if (!resposta.ok) throw new Error(retorno.erro || (retorno.resultados || []).map(x => `${x.cnpj}: ${x.erro}`).join("\n") || `SERVIÇO SEFAZ RETORNOU ${resposta.status}.`);
      const recebidos = Array.isArray(retorno.documentos)
        ? retorno.documentos
        : [];
      const documentos = [];
      const arquivos = [];
      for (const doc of recebidos) {
        if (!doc.xmlBase64 || doc.erro) continue;
        const file = base64ToFile(doc.xmlBase64, `SEFAZ-${doc.chave || doc.nsu}.xml`);
        const fileId = uid("sefazxml");
        await putFile(fileId, file);
        let dados;
        if (!doc.resumo) {
          try { const nfe = await lerXmlNfe(file); const { raw, ...parsed } = nfe; dados = parsed; } catch { dados = null; }
        }
        dados = dados || {
          chave: doc.chave,
          numero: String(doc.chave || "").slice(25, 34).replace(/^0+/, ""),
          emissao: doc.emissao,
          emitente: doc.emitente,
          emitenteCnpj: doc.emitenteCnpj,
          destinatarioCnpj: doc.destinatarioCnpj,
          valorNf: Number(doc.valorNf || 0),
          produtos: [],
        };
        documentos.push({ id: uid("nfe"), ...dados, origem: doc.resumo ? "SEFAZ — RESUMO DF-E" : "SEFAZ — XML COMPLETO", documentoXmlId: fileId, nsu: doc.nsu, schemaSefaz: doc.schema, status: doc.resumo ? "RESUMO RECEBIDO — AGUARDANDO XML COMPLETO" : "AGUARDANDO DESTINAÇÃO", importadaEm: nowISO() });
        arquivos.push({ id:fileId, fileId, tipo:doc.resumo ? "RESUMO DF-E" : "XML NF-E SEFAZ", nome:file.name, mime:file.type, xml:true, chaveNfe:doc.chave, nsu:doc.nsu, statusIa:"SEFAZ — AGUARDANDO VINCULAÇÃO", conferencia:{status:"AGUARDANDO IA",itens:[]}, criadoEm:nowISO() });
      }
      onChange((d) => ({
        ...d,
        notasFiscais: [
          ...(d.notasFiscais || []),
          ...documentos.filter(
            (doc) =>
              doc.chave &&
              !(d.notasFiscais || []).some((n) => n.chave === doc.chave),
          ),
        ],
        documentos: [...(d.documentos || []), ...arquivos.filter(a => !(d.documentos || []).some(x => x.chaveNfe && x.chaveNfe === a.chaveNfe && x.tipo === a.tipo))],
        sefazConsultas: [
          ...(d.sefazConsultas || []),
          {
            id: uid("sefaz"),
            cnpjs,
            novos: documentos.length,
            resultados: retorno.resultados || [],
            dataHora: nowISO(),
            usuario: currentUser?.nome || "",
          },
        ],
      }));
      alert(
        `CONSULTA SEFAZ CONCLUÍDA: ${documentos.length} DOCUMENTO(S) NOVO(S).\n\n${(retorno.resultados || []).map(x => `${x.cnpj}: ${x.erro || `${x.recebidos} RECEBIDO(S) — NSU ${x.ultNsu}/${x.maxNsu}`}`).join("\n")}`,
      );
    } catch (e) {
      alert(e.message || "NÃO FOI POSSÍVEL CONSULTAR A SEFAZ.");
    }
  }
  function prepararDireta(n) {
    if (n.destinacao === "FORTE ATACAREJO" || n.status === "INCORPORADA AO ESTOQUE" || n.status === "OPERAÇÃO FINALIZADA") return alert("ESTA NOTA JÁ FOI DESTINADA AO ESTOQUE OU FINALIZADA.");
    if (!exigirDossie(n)) return;
    const notaPalletAutomatica = notaPalletRelacionada(n);
    const cargaId = links[n.id] || n.cargaId || sugerida(n)?.id;
    if (!cargaId)
      return alert("SELECIONE A CARGA / PRÉ-VENDA QUE RECEBERÁ ESTA NOTA.");
    const pedido = (n.pedidos || [])[0] || "",
      os = (n.os || [])[0] || "";
    onChange((d) => ({
      ...d,
      notasFiscais: (d.notasFiscais || []).map((x) =>
        x.id === n.id
          ? {
              ...x,
              cargaId,
              palletAplica: palletsNota[n.id] || x.palletAplica,
              quantidadePaletes: Number(
                qtdPaletes[n.id] ?? x.quantidadePaletes ?? 0,
              ),
              destinacao: "CARGA DIRETA",
              siglaDestino: "D",
              status: "DISTRIBUIÇÃO DIRETA EM ANDAMENTO",
            }
          : x,
      ),
      documentos: (d.documentos || []).map((doc) =>
        doc.id === n.documentoXmlId ||
        doc.fileId === n.documentoXmlId ||
        doc.id === n.notaPallet?.documentoId ||
        doc.fileId === n.notaPallet?.documentoId
          ? { ...doc, cargaId }
          : doc,
      ),
      cargas: (d.cargas || []).map((c) =>
        c.id === cargaId
          ? {
              ...c,
              numeroNotaFiscal: n.numero,
              dataNotaFiscal: String(n.emissao || "").slice(0, 10),
              valorNotaFiscal: Number(n.valorNf || 0),
              notaPalletDocumentoId:
                n.notaPallet?.documentoId ||
                notaPalletAutomatica?.documentoXmlId ||
                "",
              notaPalletNome:
                n.notaPallet?.nome ||
                (notaPalletAutomatica?.numero
                  ? `NF ${notaPalletAutomatica.numero}`
                  : ""),
              numeroPedidoFornecedor: c.numeroPedidoFornecedor || pedido,
              numeroOSFornecedor: c.numeroOSFornecedor || os,
              fase: "NF RECEBIDA — AGUARDANDO DISTRIBUIÇÃO",
            }
          : c,
      ),
    }));
    onDireta(cargaId);
  }
  function forte(n) {
    if (!exigirDossie(n)) return;
    if (
      n.destinacao === "CARGA DIRETA" ||
      n.status === "DISTRIBUIÇÃO DIRETA EM ANDAMENTO" ||
      n.status === "OPERAÇÃO FINALIZADA" ||
      n.status === "INCORPORADA AO ESTOQUE"
    )
      return alert(
        "ESTA NOTA JÁ FOI DESTINADA OU INCORPORADA. A ENTRADA DUPLICADA NO ESTOQUE FOI BLOQUEADA.",
      );
    const cargaId = links[n.id] || n.cargaId || sugerida(n)?.id || "",
      carga = cargas.find((c) => c.id === cargaId),
      destinoOperacional =
        destinosNota[n.id] ||
        carga?.unidade ||
        data.unidades?.[0]?.nome ||
        "MONTE CARMELO/MG",
      unidade = "FORTE ATACAREJO — ESTOQUE ÚNICO";
    const movimentos = [];
    const produtosAtualizados = [...(data.produtos || [])];
    const produtosCriados = [];
    for (const item of n.produtos || []) {
      const nomeOficial = String(item.produto || "").trim();
      let p = produtosAtualizados.find(
        (x) => norm(x.nome) === norm(nomeOficial),
      );
      if (!p) {
        p = produtosAtualizados.find(
          (x) =>
            norm(nomeOficial).includes(norm(x.nome)) ||
            norm(x.nome).includes(norm(nomeOficial)),
        );
        if (p) {
          p = {
            ...p,
            nome: nomeOficial,
            nomeAnterior: p.nome,
            origemNome: "NF/XML FORNECEDOR",
          };
          const i = produtosAtualizados.findIndex((x) => x.id === p.id);
          produtosAtualizados[i] = p;
        } else {
          const peso = Number(
            (nomeOficial.match(/(\d+(?:[.,]\d+)?)\s*KG/i) || [])[1]?.replace(
              ",",
              ".",
            ) ||
              item.pesoKg ||
              0,
          );
          p = {
            id: uid("prod"),
            nome: nomeOficial,
            marca: upper(carga?.marca || n.emitente || "FORNECEDOR"),
            pesoKg: peso,
            unidadeVenda: "SACO/SACA",
            ativo: true,
            origemNome: "NF/XML FORNECEDOR",
            criadoEm: nowISO(),
          };
          produtosAtualizados.push(p);
          produtosCriados.push(p);
        }
      }
      movimentos.push({
        id: uid("est"),
        data: String(n.emissao || todayISO()).slice(0, 10),
        dataHora: nowISO(),
        unidade,
        marca: p.marca,
        produtoId: p.id,
        produto: p.nome,
        tipo: "ENTRADA - NF BANCO DE NOTAS",
        quantidade: Number(item.quantidade || 0),
        custoUnitario: Number(item.valorUnitario || 0),
        referencia: `NF ${n.numero} • ${(n.pedidos || [])[0] ? `PEDIDO ${n.pedidos[0]}` : (n.os || [])[0] ? `OS ${n.os[0]}` : "SEM REFERÊNCIA"}`,
        destinoOperacional,
        numeroNotaFiscal: n.numero,
        chaveNfe: n.chave,
        cnpjComprador: n.destinatarioCnpj,
        nomeComprador: n.destinatario,
        cargaId,
        usuario: currentUser?.nome || "",
      });
    }
    if (!movimentos.length)
      return alert("A NOTA NÃO POSSUI PRODUTOS VÁLIDOS PARA INCORPORAÇÃO.");
    if (false)
      return alert(`ENTRADA NÃO CONCLUÍDA:

${naoEncontrados.join("\n")}`);
    const quantidadePaletes =
      palletsNota[n.id] === "SIM"
        ? Number(qtdPaletes[n.id] ?? n.quantidadePaletes ?? 0)
        : 0;
    const notaPalletAutomatica = notaPalletRelacionada(n);
    const documentoPallet =
      n.notaPallet?.nome ||
      (notaPalletAutomatica?.numero
        ? `NF ${notaPalletAutomatica.numero}`
        : `NF ${n.numero} — PALLETS`);
    const entradaPaletes =
      quantidadePaletes > 0 &&
      confirm(`FORAM INFORMADOS ${quantidadePaletes} PALLETS.

DESEJA DAR ENTRADA DESTES PALLETS NO ESTOQUE / GALPÃO DA FORTE ATACAREJO?`);
    onChange((d) => ({
      ...d,
      estoqueMov: [...(d.estoqueMov || []), ...movimentos],
      palletPatrimonio: [
        ...(d.palletPatrimonio || []),
        ...(entradaPaletes
          ? [
              {
                id: uid("pal"),
                nome: "FORTE ATACAREJO",
                origem: n.emitente || carga?.marca || "FORNECEDOR",
                quantidade: quantidadePaletes,
                movimento: "ENTRADA",
                documento: documentoPallet,
                notaFiscalPrincipal: n.numero,
                notaPalletDocumentoId: n.notaPallet?.documentoId || "",
                unidade,
                destinoOperacional,
                dataHora: nowISO(),
              },
            ]
          : []),
      ],
      palletFornecedores: [
        ...(d.palletFornecedores || []),
        ...(entradaPaletes &&
        (notaPalletAutomatica ||
          (origemPallets[n.id] || n.origemPallets) ===
            "PALLETS DO FORNECEDOR / COMODATO")
          ? [
              {
                id: uid("palforn"),
                nome: n.emitente || carga?.marca || "FORNECEDOR",
                origem: "FORNECEDOR",
                quantidade: quantidadePaletes,
                movimento: "ENTRADA / OBRIGAÇÃO",
                documento: documentoPallet,
                notaFiscalPrincipal: n.numero,
                dataHora: nowISO(),
              },
            ]
          : []),
      ],
      notasFiscais: (d.notasFiscais || []).map((x) =>
        x.id === n.id
          ? {
              ...x,
              cargaId,
              palletAplica: palletsNota[n.id] || x.palletAplica,
              destinacao: "FORTE ATACAREJO",
              siglaDestino: "G",
              unidadeEstoque: unidade,
              destinoOperacional,
              status:
                !quantidadePaletes || entradaPaletes
                  ? "OPERAÇÃO FINALIZADA"
                  : "ESTOQUE LANÇADO — PALLETS PENDENTES",
              finalizadaEm:
                !quantidadePaletes || entradaPaletes ? nowISO() : "",
              quantidadePaletes,
              destinacaoPaletes: entradaPaletes
                ? "ESTOQUE / GALPÃO FORTE"
                : "AGUARDANDO DEFINIÇÃO",
              incorporadaEm: nowISO(),
              incorporadaPor: currentUser?.nome || "",
            }
          : x,
      ),
      documentos: (d.documentos || []).map((doc) =>
        doc.id === n.documentoXmlId ||
        doc.fileId === n.documentoXmlId ||
        doc.id === n.notaPallet?.documentoId ||
        doc.fileId === n.notaPallet?.documentoId
          ? { ...doc, cargaId }
          : doc,
      ),
      cargas: (d.cargas || []).map((c) =>
        c.id === cargaId
          ? {
              ...c,
              numeroNotaFiscal: n.numero,
              dataNotaFiscal: String(n.emissao || "").slice(0, 10),
              valorNotaFiscal: Number(n.valorNf || 0),
              notaPalletDocumentoId: n.notaPallet?.documentoId || "",
              notaPalletNome: n.notaPallet?.nome || "",
              destinoEstoque: destinoOperacional,
              estoqueConsolidado: true,
              fase:
                !quantidadePaletes || entradaPaletes
                  ? "OPERAÇÃO FINALIZADA"
                  : "NF INCORPORADA — PALLETS PENDENTES",
            }
          : c,
      ),
      auditoria: [
        ...(d.auditoria || []),
        {
          id: uid("aud"),
          usuario: currentUser?.nome || "",
          acao: "NF INCORPORADA AO ESTOQUE FORTE",
          cargaId,
          detalhe: `NF ${n.numero} • DESTINO ${destinoOperacional} • ESTOQUE ÚNICO • ${movimentos.reduce((a, x) => a + Number(x.quantidade || 0), 0)} UNIDADE(S)`,
          dataHora: nowISO(),
        },
      ],
    }));
    alert(
      entradaPaletes
        ? "NOTA E PALLETS INCORPORADOS AO ESTOQUE DA FORTE ATACAREJO."
        : "NOTA INCORPORADA AO ESTOQUE. DESTINAÇÃO DOS PALLETS PERMANECE PENDENTE.",
    );
  }
  function destinarDespesa(n) {
    if ((data.despesas || []).some((x) => x.notaFiscalId === n.id))
      return alert("ESTA NOTA JÁ FOI DESTINADA AO BANCO DE DESPESAS.");
    const categoria = prompt(
      "CATEGORIA DA DESPESA (EX.: COMBUSTÍVEL, MANUTENÇÃO, SERVIÇOS, MATERIAL DE ESCRITÓRIO):",
      "DESPESA OPERACIONAL",
    );
    if (categoria === null) return;
    const unidade = destinosNota[n.id] || n.destinoOperacional || data.unidades?.[0]?.nome || "MATRIZ - MONTE CARMELO/MG";
    if (!confirm(`DESTINAR A NF ${n.numero || "SEM NÚMERO"} PARA O BANCO DE DESPESAS?\n\nFORNECEDOR: ${n.emitente || "NÃO IDENTIFICADO"}\nVALOR: ${money(n.valorNf)}\nUNIDADE: ${unidade}\nCATEGORIA: ${upper(categoria)}`)) return;
    onChange((d) => ({
      ...d,
      despesas: [...(d.despesas || []), {
        id: uid("desp-nf"),
        classificacao: "FORTE ATACAREJO",
        categoria: upper(categoria || "DESPESA OPERACIONAL"),
        descricao: `NF ${n.numero || "SEM NÚMERO"} — ${n.emitente || "FORNECEDOR"}`,
        fornecedor: n.emitente || "",
        fornecedorCnpj: n.emitenteCnpj || "",
        valor: Number(n.valorNf || 0),
        data: String(n.emissao || todayISO()).slice(0, 10),
        competencia: String(n.emissao || todayISO()).slice(0, 7),
        unidade,
        notaFiscalId: n.id,
        numeroNotaFiscal: n.numero || "",
        chaveNfe: n.chave || "",
        documentoXmlId: n.documentoXmlId || "",
        danfeDocumentoId: n.danfeDocumentoId || "",
        origem: "BANCO DE NOTAS FISCAIS",
        status: "CLASSIFICADA — PRONTA PARA CONTABILIDADE",
        criadoEm: nowISO(),
        criadoPor: currentUser?.nome || "",
      }],
      notasFiscais: (d.notasFiscais || []).map((x) => x.id === n.id ? {
        ...x,
        destinacao: "DESPESA",
        siglaDestino: "E",
        destinoOperacional: unidade,
        categoriaDespesa: upper(categoria || "DESPESA OPERACIONAL"),
        status: "DESTINADA AO BANCO DE DESPESAS",
        destinadaEm: nowISO(),
        destinadaPor: currentUser?.nome || "",
      } : x),
      auditoria: [...(d.auditoria || []), {
        id: uid("aud"),
        acao: "NF DESTINADA AO BANCO DE DESPESAS",
        detalhe: `NF ${n.numero || "-"} • ${n.emitente || "FORNECEDOR"} • ${money(n.valorNf)} • ${upper(categoria)}`,
        usuario: currentUser?.nome || "",
        dataHora: nowISO(),
      }],
    }));
    alert("NOTA CLASSIFICADA COMO DESPESA. XML E DANFE FORAM PRESERVADOS NO DOSSIÊ PARA O CONTADOR.");
  }
  return (
    <div className="transportBox">
      <div className="sectionHead">
        <div>
          <h2>BANCO DE NOTAS FISCAIS — DOSSIÊS</h2>
          <p>
            UMA NF POR LINHA • DOCUMENTOS AGRUPADOS • BUSCA POR NF, CHAVE,
            PEDIDO, OS, FORNECEDOR OU PRODUTO.
          </p>
        </div>
        <button className="secondary" onClick={consultarSefaz}>
          CONSULTAR SEFAZ — MATRIZ + FILIAL
        </button>
        <span className="mobileSefazNotice">
          CERTIFICADO DIGITAL: CONSULTA E DOWNLOAD SOMENTE NO DESKTOP.
        </span>
        <label className="secondary">
          IMPORTAR XML MANUALMENTE{" "}
          <input
            style={{ display: "none" }}
            type="file"
            accept=".xml"
            onChange={(e) => {
              importarXml(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <UpperInput
        value={busca}
        onChange={setBusca}
        placeholder="BUSCAR EM TODAS AS OPERAÇÕES POR NÚMERO DA NF OU NÚMERO DO PEDIDO..."
      />
      <div className="cadList">
        {notas.map((n) => {
          const sug = sugerida(n),
            cargaId = links[n.id] || n.cargaId || sug?.id,
            carga = cargas.find((c) => c.id === cargaId),
            ck = checklist(n),
            aberta = !!abertas[n.id],
            motorista = (data.motoristas || []).find(
              (m) => m.id === carga?.motoristaId,
            );
          return (
            <div className="docCard" key={n.id}>
              <div
                className="cadRow"
                style={{ cursor: "pointer" }}
                onClick={() => setAbertas((x) => ({ ...x, [n.id]: !x[n.id] }))}
              >
                <div style={{ flex: 1 }}>
                  <b>
                    NF {n.numero || "SEM NÚMERO"} •{" "}
                    {n.emitente || "FORNECEDOR NÃO IDENTIFICADO"}
                  </b>
                  <small>
                    {formatDateBR(n.emissao)} • {money(n.valorNf)} • PEDIDO{" "}
                    {ck.pedido || "PENDENTE"} • OS{" "}
                    {(n.os || []).join(" / ") ||
                      carga?.numeroOSFornecedor ||
                      "-"}
                  </small>
                  <small>
                    {(n.produtos || [])
                      .map((p) => `${p.produto}: ${p.quantidade} ${p.unidade}`)
                      .join(" / ") || "PRODUTOS PENDENTES"}
                  </small>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button
                    className="invoicePrintIcon"
                    title="IMPRIMIR DOSSIÊ DISPONÍVEL ATÉ ESTA ETAPA"
                    aria-label={`IMPRIMIR DOSSIÊ DA NF ${n.numero || ""}`}
                    onClick={(e) => { e.stopPropagation(); imprimirDossie(n, false); }}
                  >🖨️</button>
                  {siglaDestino(n) && (
                    <span
                      title={
                        siglaDestino(n) === "G"
                          ? "G = GALPÃO / ESTOQUE FORTE"
                          : siglaDestino(n) === "E"
                            ? "E = DESPESA / CONTABILIDADE"
                            : "D = CARGA DIRETA"
                      }
                      style={{
                        display: "inline-grid",
                        placeItems: "center",
                        width: 28,
                        height: 28,
                        borderRadius: 7,
                        fontWeight: 900,
                        color: "#fff",
                        background:
                          siglaDestino(n) === "G" ? "#334155" : siglaDestino(n) === "E" ? "#b45309" : "#2563eb",
                      }}
                    >
                      {siglaDestino(n)}
                    </span>
                  )}
                  <div>
                    <strong>
                      {ck.ok
                        ? n.status || "PRONTA PARA CONFERÊNCIA"
                        : `⚠ DOCUMENTAÇÃO INCOMPLETA`}
                    </strong>
                    <small>{aberta ? "▲ RECOLHER" : "▼ ABRIR DOSSIÊ"}</small>
                  </div>
                </div>
              </div>
              {aberta && (
                <>
                  <div className="infoGrid">
                    <div>
                      <b>CHAVE NF-E</b>
                      <span>{n.chave || "-"}</span>
                    </div>
                    <div>
                      <b>CNPJ EMISSOR</b>
                      <span>{n.emitenteCnpj || "-"}</span>
                    </div>
                    <div>
                      <b>DESTINATÁRIO</b>
                      <span>{n.destinatario || "FORTE ATACAREJO"}</span>
                    </div>
                    <div>
                      <b>CNPJ DESTINATÁRIO</b>
                      <span>{n.destinatarioCnpj || "-"}</span>
                    </div>
                    <div>
                      <b>CARGA / PRÉ-VENDA</b>
                      <span>{carga?.codigo || "NÃO VINCULADA"}</span>
                    </div>
                    <div>
                      <b>STATUS DOCUMENTAL</b>
                      <span>
                        {ck.ok
                          ? "VALIDADO / APTO"
                          : "PENDENTE: " + ck.pend.join(", ")}
                      </span>
                    </div>
                    <div>
                      <b>DESTINO OPERACIONAL</b>
                      <span>
                        {n.destinoOperacional || carga?.unidade || "A DEFINIR"}{" "}
                        • {siglaDestino(n) || "-"}
                      </span>
                    </div>
                  </div>
                  <div className="transportBox">
                    <b>DOCUMENTOS AGRUPADOS</b>
                    <div className="cadList">
                      <div className="cadRow">
                        <span>DANFE / PDF</span>
                        <div className="documentPrintStatus">
                          <strong>{ck.pdf ? "✓ PRESENTE" : "⚠ PENDENTE"}</strong>
                          {n.danfeDocumentoId && <button className="invoicePrintIcon" title="IMPRIMIR DANFE" onClick={() => imprimirDocumento(n.danfeDocumentoId)}>🖨️</button>}
                        </div>
                      </div>
                      <div className="cadRow">
                        <span>XML</span>
                        <strong>
                          {ck.xml ? "✓ PRESENTE" : "NÃO RECEBIDO"}
                        </strong>
                      </div>
                      <div className="cadRow">
                        <span>BOLETO FORNECEDOR</span>
                        <strong>
                          {ck.boleto ? "✓ PRESENTE / VINCULADO" : "⚠ PENDENTE"}
                        </strong>
                      </div>
                      <div className="cadRow">
                        <span>QUITAÇÃO DO FORNECEDOR</span>
                        <strong>
                          {n.pagamentoFornecedorStatus ||
                            (ck.boleto
                              ? "AGUARDANDO LIQUIDAÇÃO"
                              : "AGUARDANDO TÍTULO")}
                        </strong>
                      </div>
                      <div className="cadRow">
                        <span>COMPROVANTE DE PAGAMENTO DO FRETE</span>
                        <strong>
                          {ck.freteCif
                            ? "NÃO EXIGIDO — FRETE CIF"
                            : ck.comprovanteFrete
                              ? "✓ PRESENTE / VINCULADO"
                              : "⚠ OBRIGATÓRIO — FRETE NÃO CIF"}
                        </strong>
                      </div>
                      <div className="cadRow">
                        <span>NF DE PALLETS</span>
                        <strong>
                          {n.notaPallet?.nome ||
                            (notaPalletRelacionada(n)?.numero
                              ? `NF ${notaPalletRelacionada(n).numero} — VINCULADA AUTOMATICAMENTE`
                              : "") ||
                            (!ck.palletAplica
                              ? "NÃO IDENTIFICADA / NÃO APLICÁVEL"
                              : "⚠ PENDENTE")}
                        </strong>
                      </div>
                      {ck.ds.map((d) => (
                        <div className="cadRow" key={d.id}>
                          <div>
                            <b>
                              {d.tipo} • {d.filename}
                            </b>
                            <small>
                              {d.caixaEmail || "GMAIL"} • {d.subject || ""}
                            </small>
                          </div>
                          {d.fileId && (
                            <div className="documentPrintStatus">
                              <button className="ghost dark" onClick={() => openFile(d.fileId)}>ABRIR</button>
                              <button className="invoicePrintIcon" title={`IMPRIMIR ${d.filename || "DOCUMENTO"}`} onClick={() => imprimirDocumento(d.fileId)}>🖨️</button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="miniGrid">
                    <Field label="CARGA / PRÉ-VENDA">
                      <select
                        value={cargaId || ""}
                        onChange={(e) =>
                          setLinks((x) => ({ ...x, [n.id]: e.target.value }))
                        }
                      >
                        <option value="">SELECIONE...</option>
                        {cargas.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.codigo} • {c.marca} • PEDIDO{" "}
                            {c.numeroPedidoFornecedor || "-"} • OS{" "}
                            {c.numeroOSFornecedor || "-"}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="DESTINO DA NOTA (SOMENTE INFORMATIVO)">
                      <select
                        value={
                          destinosNota[n.id] ||
                          n.destinoOperacional ||
                          carga?.unidade ||
                          data.unidades?.[0]?.nome ||
                          ""
                        }
                        onChange={(e) =>
                          setDestinosNota((x) => ({
                            ...x,
                            [n.id]: e.target.value,
                          }))
                        }
                      >
                        {(data.unidades || []).map((u) => (
                          <option key={u.id} value={u.nome}>
                            {u.nome}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="HÁ PALLETS? (OBRIGATÓRIO)">
                      <select
                        value={palletsNota[n.id] || n.palletAplica || ""}
                        onChange={(e) =>
                          setPalletsNota((s) => ({
                            ...s,
                            [n.id]: e.target.value,
                          }))
                        }
                      >
                        <option value="">SELECIONE...</option>
                        <option value="SIM">SIM</option>
                        <option value="NÃO">NÃO</option>
                      </select>
                    </Field>
                    {(palletsNota[n.id] || n.palletAplica) === "SIM" && (
                      <>
                        <Field label="ORIGEM / PROPRIEDADE DOS PALLETS">
                          <select
                            value={origemPallets[n.id] || n.origemPallets || ""}
                            onChange={(e) =>
                              setOrigemPallets((s) => ({
                                ...s,
                                [n.id]: e.target.value,
                              }))
                            }
                          >
                            <option value="">SELECIONE...</option>
                            <option>PALLETS DA FORTE NO FORNECEDOR</option>
                            <option>
                              PALLETS PRÓPRIOS LEVADOS PELO MOTORISTA
                            </option>
                            <option>PALLETS DO FORNECEDOR / COMODATO</option>
                            <option>PALLETS COMPRADOS NESTA OPERAÇÃO</option>
                          </select>
                        </Field>
                        <Field label="FOI EMITIDA NF DE PALLETS?">
                          <select
                            value={
                              nfPalletEmitida[n.id] || n.nfPalletEmitida || ""
                            }
                            onChange={(e) =>
                              setNfPalletEmitida((s) => ({
                                ...s,
                                [n.id]: e.target.value,
                              }))
                            }
                          >
                            <option value="">SELECIONE...</option>
                            <option>SIM</option>
                            <option>NÃO</option>
                          </select>
                        </Field>
                      </>
                    )}
                    <Field label="QUANTIDADE DE PALLETS DA NOTA">
                      <input
                        type="number"
                        min="0"
                        value={qtdPaletes[n.id] ?? n.quantidadePaletes ?? ""}
                        onChange={(e) =>
                          setQtdPaletes((x) => ({
                            ...x,
                            [n.id]: e.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field label="DANFE / PDF — ANEXAR AO DOSSIÊ">
                      <input
                        type="file"
                        accept=".pdf,image/*"
                        onChange={(e) => {
                          anexarDossie(n, "DANFE / PDF", e.target.files?.[0]);
                          e.target.value = "";
                        }}
                      />
                    </Field>
                    <Field label="BOLETO DO FORNECEDOR — ANEXAR">
                      <input
                        type="file"
                        accept=".pdf,image/*"
                        onChange={(e) => {
                          anexarDossie(
                            n,
                            "BOLETO DO FORNECEDOR",
                            e.target.files?.[0],
                          );
                          e.target.value = "";
                        }}
                      />
                    </Field>
                    <Field label="PAGAMENTO ANTECIPADO — COMPROVANTE">
                      <input
                        type="file"
                        accept=".pdf,image/*"
                        onChange={(e) => {
                          anexarDossie(
                            n,
                            "COMPROVANTE DE PAGAMENTO ANTECIPADO",
                            e.target.files?.[0],
                          );
                          e.target.value = "";
                        }}
                      />
                    </Field>
                    <Field label="COMPROVANTE DO FRETE — OBRIGATÓRIO SE NÃO CIF">
                      <input
                        type="file"
                        accept=".pdf,image/*"
                        onChange={(e) => {
                          anexarDossie(
                            n,
                            "COMPROVANTE DE PAGAMENTO DO FRETE",
                            e.target.files?.[0],
                          );
                          e.target.value = "";
                        }}
                      />
                    </Field>
                    <Field label="NF DE PALLETS — ANEXAR AO DOSSIÊ">
                      <input
                        type="file"
                        accept=".pdf,.xml,image/*"
                        onChange={(e) => {
                          anexarNotaPallet(n, e.target.files?.[0]);
                          e.target.value = "";
                        }}
                      />
                    </Field>
                  </div>
                  <div>
                    <button className="secondary" onClick={() => imprimirDossie(n, false)}>🖨️ IMPRIMIR DOSSIÊ DISPONÍVEL</button>
                    <button
                      className="secondary"
                      disabled={!ck.ok || n.pagamentoFornecedorStatus !== "LIQUIDADO" || !/CONCLUÍDA E LIQUIDADA/.test(upper(n.status))}
                      onClick={() => imprimirDossie(n, true)}
                    >🖨️ IMPRIMIR DOSSIÊ COMPLETO</button>
                    <button
                      className="ghost dark"
                      disabled={
                        !ck.ok ||
                        n.status === "CONFERÊNCIA INICIADA" ||
                        n.status === "OPERAÇÃO FINALIZADA"
                      }
                      onClick={() => iniciarConferencia(n)}
                    >
                      INICIAR CONFERÊNCIA
                    </button>
                    <button disabled={!ck.ok} onClick={() => prepararDireta(n)}>
                      ENVIAR PARA VENDAS DIRETAS
                    </button>
                    <button
                      disabled={!ck.ok}
                      className="secondary"
                      onClick={() => forte(n)}
                    >
                      ENVIAR PARA ESTOQUE
                    </button>
                    <button
                      className="secondary"
                      disabled={!n.documentoXmlId && !n.danfeDocumentoId}
                      onClick={() => destinarDespesa(n)}
                    >
                      DESPESA / CONTADOR
                    </button>
                    <button
                      disabled={
                        !ck.boleto ||
                        n.pagamentoFornecedorStatus === "LIQUIDADO"
                      }
                      onClick={() => liquidarFornecedor(n)}
                    >
                      LIQUIDAR FORNECEDOR / USAR CRÉDITO
                    </button>
                    {n.documentoXmlId && (
                      <button
                        className="ghost dark"
                        onClick={() => openFile(n.documentoXmlId)}
                      >
                        ABRIR XML
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
        {!notas.length && <p>NENHUMA NOTA FISCAL IMPORTADA.</p>}
      </div>
    </div>
  );
}
function DistribuirCargaModal({ carga, data, onClose, onChange, currentUser }) {
  if (!carga) return null;
  const [nf, setNf] = useState({
    numero: carga.numeroNotaFiscal || "",
    data: carga.dataNotaFiscal || todayISO(),
    valor: carga.valorNotaFiscal || "",
    pedido: carga.numeroPedidoFornecedor || "",
    os: carga.numeroOSFornecedor || "",
  });
  const [linhas, setLinhas] = useState([]);
  const [linha, setLinha] = useState({
    clienteId: "",
    produtoId: carga.produtoId || "",
    qtd: "",
    preco: "",
    condicaoPagamento: "7/14/21/28",
    destino: "",
    qtdPallets: "",
    palletEmprestado: "NÃO",
  });
  const clientes = (data.clientes || []).filter((x) => x.ativo !== false),
    produtos = (data.produtos || []).filter(
      (x) =>
        x.ativo !== false &&
        (!carga.marca ||
          norm(x.marca).includes(norm(carga.marca)) ||
          norm(carga.marca).includes(norm(x.marca))),
    );
  const notaDireta=(data.notasFiscais||[]).find(n=>n.cargaId===carga.id&&n.destinacao==="CARGA DIRETA");
  const itensNota=(notaDireta?.produtos||[]).map(i=>({nome:i.produto,qtd:Number(i.quantidade||0),produtoId:(data.produtos||[]).find(p=>norm(p.nome)===norm(i.produto))?.id}));
  const pendentes=(data.vendas||[]).filter(v=>v.status==="PENDENTE"&&!v.cargaId&&!!v.produtoId);
  const [vendaPendenteId,setVendaPendenteId]=useState("");
  const vendasExistentes = (carga.vendaIds || [])
    .map((id) => (data.vendas || []).find((v) => v.id === id))
    .filter(Boolean);
  const qtdBaseProduto = (pid) => {
    if (itensNota.length) return itensNota.filter(i=>i.produtoId===pid).reduce((sum,i)=>sum+i.qtd,0);
    if (carga.produtoId === pid && Number(carga.qtd || 0) > 0)
      return Number(carga.qtd || 0);
    const existentes = vendasExistentes
      .filter((v) => v.produtoId === pid)
      .reduce((a, v) => a + Number(v.qtd || 0), 0);
    return existentes || Number(carga.qtd || 0);
  };
  function adicionar() {
    const cli = clientes.find((x) => x.id === linha.clienteId),
      p = (data.produtos || []).find((x) => x.id === linha.produtoId),
      q = Number(linha.qtd || 0);
    if (!cli || !p || q <= 0)
      return alert("SELECIONE CLIENTE, PRODUTO E QUANTIDADE.");
    const ja = linhas
      .filter((x) => x.produtoId === p.id)
      .reduce((a, x) => a + Number(x.qtd || 0), 0);
    const jaGravado = vendasExistentes
      .filter(
        (v) =>
          v.produtoId === p.id && v.origem === "DISTRIBUIÇÃO DA NF DA CARGA",
      )
      .reduce((a, v) => a + Number(v.qtd || 0), 0);
    const limite = Math.max(0, qtdBaseProduto(p.id) - jaGravado);
    if (ja + q > limite)
      return alert(
        `DISTRIBUIÇÃO BLOQUEADA: ${p.nome} POSSUI ${limite} SACOS NA CARGA E A NOVA SOMA SERIA ${ja + q}.`,
      );
    const sacosPorPallet = Number(
        p.sacosPorPallet || p.quantidadePorPallet || p.qtdPorPallet || 0,
      ),
      palletSug =
        linha.qtdPallets !== ""
          ? Number(linha.qtdPallets || 0)
          : sacosPorPallet > 0
            ? Math.ceil(q / sacosPorPallet)
            : 0;
    setLinhas((a) => [
      ...a,
      {
        ...linha,
        qtdPallets: palletSug,
        id: uid("dist"),
        cliente: cli.nome,
        produto: p.nome,
        marca: p.marca,
        qtd: q,
        preco: Number(linha.preco || 0),
        pesoKg: q * Number(p.pesoKg || 0),
        destino: upper(linha.destino || cli.cidade),
        condicaoPagamento:
          linha.condicaoPagamento || cli.condicaoPagamento || "A VISTA",
      },
    ]);
    setLinha((x) => ({
      ...x,
      clienteId: "",
      qtd: "",
      preco: "",
      destino: "",
      qtdPallets: "",
      palletEmprestado: "NÃO",
    }));
  }
  function gravar() {
    const pedido = upper(nf.pedido),
      os = upper(nf.os),
      numero = upper(nf.numero);
    if (!numero || !nf.data)
      return alert("INFORME O NÚMERO E A DATA DA NOTA FISCAL.");
    if (!pedido && !os)
      return alert("INFORME PELO MENOS UMA REFERÊNCIA: PEDIDO OU OS.");
    if (!linhas.length)
      return alert("ADICIONE PELO MENOS UMA VENDA / CLIENTE À DISTRIBUIÇÃO.");
    const totalQtd = linhas.reduce((a, x) => a + Number(x.qtd || 0), 0),
      totalVendas = linhas.reduce(
        (a, x) => a + Number(x.qtd || 0) * Number(x.preco || 0),
        0,
      ),
      saldoBase = Number(carga.qtdSemDestino ?? carga.qtd ?? 0),
      saldo = Math.max(0, saldoBase - totalQtd);
    onChange((d) => {
      let seq = Number(d.settings?.nextVendaSeq || 1);
      const novas = linhas.map((x) => ({
        ...x,
        id: x.origemVendaId || uid("v"),
        numeroVenda: x.numeroVenda || `VEN-${new Date().getFullYear()}-${String(seq++).padStart(6, "0")}`,
        clienteId: x.clienteId,
        produtoId: x.produtoId,
        precoUnitario: x.preco,
        dataOperacao: todayISO(),
        criadoEm: nowISO(),
        status: "EM CARGA",
        cargaId: carga.id,
        cargaCodigo: carga.codigo,
        numeroNotaFiscal: numero,
        dataNotaFiscal: nf.data,
        numeroPedidoFornecedor: pedido,
        numeroOSFornecedor: os,
        origem: "DISTRIBUIÇÃO DA NF DA CARGA",
      }));
      const palletsCliente = linhas
        .filter(
          (x) => Number(x.qtdPallets || 0) > 0 && x.palletEmprestado === "SIM",
        )
        .map((x) => ({
          id: uid("pal"),
          nome: x.cliente,
          clienteId: x.clienteId,
          origem: carga.marca || "FORNECEDOR",
          quantidade: Number(x.qtdPallets),
          movimento: "EMPRÉSTIMO",
          documento: carga.notaPalletNome || `NF ${numero} — PALLETS`,
          notaFiscalPrincipal: numero,
          cargaId: carga.id,
          dataHora: nowISO(),
        }));
      const palletsForte = linhas
        .filter(
          (x) => Number(x.qtdPallets || 0) > 0 && x.palletEmprestado !== "SIM",
        )
        .map((x) => ({
          id: uid("pal"),
          nome: "FORTE ATACAREJO",
          origem: carga.marca || "FORNECEDOR",
          quantidade: Number(x.qtdPallets),
          movimento: "ENTRADA",
          documento: carga.notaPalletNome || `NF ${numero} — PALLETS`,
          notaFiscalPrincipal: numero,
          cargaId: carga.id,
          dataHora: nowISO(),
        }));
      return {
        ...d,
        settings: { ...d.settings, nextVendaSeq: seq },
        vendas: [...(d.vendas || []).map(v=>novas.find(n=>n.id===v.id)||v), ...novas.filter(n=>!(d.vendas||[]).some(v=>v.id===n.id))],
        palletClientes: [...(d.palletClientes || []), ...palletsCliente],
        palletPatrimonio: [...(d.palletPatrimonio || []), ...palletsForte],
        notasFiscais: (d.notasFiscais || []).map((x) =>
          x.id === notaDireta?.id || (!notaDireta && (x.cargaId === carga.id || upper(x.numero) === numero))
            ? {
                ...x,
                cargaId: carga.id,
                destinacao: "CARGA DIRETA",
                siglaDestino: "D",
                status:
                  saldo === 0
                    ? "OPERAÇÃO FINALIZADA"
                    : "DISTRIBUIÇÃO DIRETA EM ANDAMENTO",
                finalizadaEm: saldo === 0 ? nowISO() : "",
                finalizadaPor: saldo === 0 ? currentUser?.nome || "" : "",
              }
            : x,
        ),
        cargas: (d.cargas || []).map((c) =>
          c.id === carga.id
            ? {
                ...c,
                numeroPedidoFornecedor: pedido,
                numeroOSFornecedor: os,
                numeroNotaFiscal: numero,
                dataNotaFiscal: nf.data,
                valorNotaFiscal: Number(nf.valor || 0),
                vendaIds: [...(c.vendaIds || []), ...novas.map((v) => v.id)],
                qtdSemDestino: saldo,
                distribuicoesNota: [
                  ...(c.distribuicoesNota || []),
                  {
                    id: uid("lote-dist"),
                    numeroNotaFiscal: numero,
                    dataNotaFiscal: nf.data,
                    pedido,
                    os,
                    linhas: novas.map((v) => v.id),
                    totalQtd,
                    totalVendas,
                    saldo,
                    criadaEm: nowISO(),
                    criadaPor: currentUser?.nome || "",
                  },
                ],
                fase:
                  saldo === 0
                    ? "NF DISTRIBUÍDA — VENDAS GERADAS"
                    : "NF PARCIALMENTE DISTRIBUÍDA — SALDO EM ABERTO",
                status: "VERMELHO",
              }
            : c,
        ),
        auditoria: [
          ...(d.auditoria || []),
          {
            id: uid("aud"),
            usuario: currentUser?.nome || "",
            acao: "NF DISTRIBUÍDA ENTRE CLIENTES",
            cargaId: carga.id,
            detalhe: `NF ${numero} • PEDIDO ${pedido || "-"} • OS ${os || "-"} • ${linhas.length} CLIENTE(S) • ${totalQtd} SACOS • SALDO ${saldo}`,
            dataHora: nowISO(),
          },
        ],
      };
    });
    const m = (data.motoristas || []).find((x) => x.id === carga.motoristaId);
    const freteTotal =
      carga.modalidadeFrete === "CIF"
        ? 0
        : carga.freteTipo === "SACO"
          ? Number(carga.freteValor || 0) * Number(carga.qtd || 0)
          : carga.freteTipo === "TON"
            ? Number(carga.freteValor || 0) * (Number(carga.pesoKg || 0) / 1000)
            : Number(carga.freteValor || 0);
    pdfTabela(
      `DISTRIBUIÇÃO DA CARGA ${carga.codigo} — NF ${numero}`,
      [
        { label: "CLIENTE", w: 1.5, key: "cliente" },
        {
          label: "PRODUTO",
          w: 1.5,
          get: (x) => `${x.marca || ""} ${x.produto}`,
        },
        { label: "QTD", w: 0.55, get: (x) => `${x.qtd} SC` },
        { label: "DESTINO / OBRA", w: 1.5, key: "destino" },
        { label: "PREÇO", w: 0.7, get: (x) => money(x.preco) },
        {
          label: "SUBTOTAL",
          w: 0.85,
          get: (x) => money(Number(x.qtd) * Number(x.preco)),
        },
        { label: "PAGAMENTO", w: 1, key: "condicaoPagamento" },
        {
          label: "PALLETS",
          w: 0.8,
          get: (x) =>
            `${Number(x.qtdPallets || 0)} • ${x.palletEmprestado === "SIM" ? "EMPRESTADO" : "FORTE"}`,
        },
      ],
      linhas,
      `${carga.codigo}-NF-${numero}-DISTRIBUICAO.pdf`,
      [
        `PEDIDO: ${pedido || "-"} • OS: ${os || "-"} • DATA NF: ${formatDateBR(nf.data)} • VALOR NF: ${money(nf.valor)}`,
        `MOTORISTA: ${carga.motorista || "-"} • PLACAS: ${[m?.placa1, m?.placa2, m?.placa3, m?.placa4].filter(Boolean).join(" / ") || carga.placa || "-"}`,
        `FRETE: ${carga.modalidadeFrete || "-"} • TOTAL DO FRETE: ${money(freteTotal)}`,
        `TOTAL DISTRIBUÍDO: ${totalQtd} SACOS • TOTAL DAS VENDAS: ${money(totalVendas)} • SALDO SEM DESTINO: ${saldo} SACOS`,
      ],
    );
    alert("DISTRIBUIÇÃO GRAVADA, VENDAS GERADAS E RELATÓRIO EMITIDO.");
    onClose();
  }
  return (
    <Modal
      title={`DISTRIBUIR NF / GERAR VENDAS — ${carga.codigo}`}
      onClose={onClose}
      wide
    >
      <div className="transportBox">
        <h3>REFERÊNCIA DA COMPRA</h3>
        <div className="miniGrid">
          <Field label="NÚMERO DA NF">
            <UpperInput
              value={nf.numero}
              onChange={(v) => setNf((x) => ({ ...x, numero: v }))}
            />
          </Field>
          <Field label="DATA DA NF">
            <input
              type="date"
              value={nf.data}
              onChange={(e) => setNf((x) => ({ ...x, data: e.target.value }))}
            />
          </Field>
          <Field label="VALOR TOTAL DA NF R$">
            <input
              type="number"
              step="0.01"
              value={nf.valor}
              onChange={(e) => setNf((x) => ({ ...x, valor: e.target.value }))}
            />
          </Field>
          <Field label="NÚMERO DO PEDIDO">
            <UpperInput
              value={nf.pedido}
              onChange={(v) => setNf((x) => ({ ...x, pedido: v }))}
            />
          </Field>
          <Field label="NÚMERO DA OS">
            <UpperInput
              value={nf.os}
              onChange={(v) => setNf((x) => ({ ...x, os: v }))}
            />
          </Field>
        </div>
        <p className="note">
          BASTA INFORMAR PEDIDO OU OS. QUANDO OS DOIS EXISTIREM, AMBOS SERÃO
          PRESERVADOS.
        </p>
      </div>
      <div className="transportBox">
        <h3>DISTRIBUIÇÃO ENTRE CLIENTES</h3>
        <label>SELECIONAR VENDA PENDENTE
          <select value={vendaPendenteId} onChange={e=>setVendaPendenteId(e.target.value)}><option value="">SELECIONE...</option>{pendentes.filter(v=>!linhas.some(x=>x.origemVendaId===v.id)).map(v=><option key={v.id} value={v.id}>{v.numeroVenda||v.id} • {v.cliente} • {v.produto} • {v.qtd} SC</option>)}</select>
        </label><button type="button" className="secondary" onClick={()=>{const v=pendentes.find(x=>x.id===vendaPendenteId);if(!v)return;const p=(data.produtos||[]).find(x=>x.id===v.produtoId);const cliente=clientes.find(x=>x.id===v.clienteId);if(!p||!cliente)return alert("VENDA PENDENTE SEM PRODUTO OU CLIENTE VÁLIDO.");const ja=linhas.filter(x=>x.produtoId===p.id).reduce((a,x)=>a+Number(x.qtd||0),0);const gravado=vendasExistentes.filter(x=>x.produtoId===p.id&&x.origem==="DISTRIBUIÇÃO DA NF DA CARGA").reduce((a,x)=>a+Number(x.qtd||0),0);if(ja+Number(v.qtd||0)+gravado>qtdBaseProduto(p.id))return alert("A QUANTIDADE DESTA VENDA EXCEDE O SALDO DO PRODUTO NA NF.");setLinhas(a=>[...a,{...v,origemVendaId:v.id,cliente:cliente.nome,produto:p.nome,marca:p.marca,preco:Number(v.precoUnitario||v.preco||0),qtd:Number(v.qtd),destino:v.destino||cliente.cidade||"",condicaoPagamento:v.condicaoPagamento||cliente.condicaoPagamento||"A VISTA"}]);setVendaPendenteId("")}}>ADICIONAR VENDA PENDENTE</button>
        {itensNota.length>0&&<p className="note">ITENS DA NF: {itensNota.map(i=>i.nome+" "+i.qtd+" SC").join(" • ")}</p>}
        <div className="miniGrid">
          <Field label="CLIENTE">
            <select
              value={linha.clienteId}
              onChange={(e) => {
                const cli = clientes.find((x) => x.id === e.target.value);
                setLinha((x) => ({
                  ...x,
                  clienteId: e.target.value,
                  condicaoPagamento:
                    cli?.condicaoPagamento || x.condicaoPagamento,
                  destino: cli?.cidade || "",
                }));
              }}
            >
              <option value="">SELECIONE...</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </Field>
          <Field label="PRODUTO DA CARGA">
            <select
              value={linha.produtoId}
              onChange={(e) =>
                setLinha((x) => ({ ...x, produtoId: e.target.value }))
              }
            >
              <option value="">SELECIONE...</option>
              {produtos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.marca} • {p.nome}
                </option>
              ))}
            </select>
          </Field>
          <Field label="QUANTIDADE (SACOS)">
            <input
              type="number"
              min="1"
              value={linha.qtd}
              onChange={(e) => setLinha((x) => ({ ...x, qtd: e.target.value }))}
            />
          </Field>
          <Field label="PREÇO DE VENDA UNITÁRIO">
            <input
              type="number"
              step="0.01"
              value={linha.preco}
              onChange={(e) =>
                setLinha((x) => ({ ...x, preco: e.target.value }))
              }
            />
          </Field>
          <Field label="DESTINO / OBRA">
            <UpperInput
              value={linha.destino}
              onChange={(v) => setLinha((x) => ({ ...x, destino: v }))}
            />
          </Field>
          <Field label="QUANTOS PALLETS PARA ESTE CLIENTE?">
            <input
              type="number"
              min="0"
              value={linha.qtdPallets}
              onChange={(e) =>
                setLinha((x) => ({ ...x, qtdPallets: e.target.value }))
              }
            />
          </Field>
          <Field label="PALLETS EMPRESTADOS AO CLIENTE?">
            <select
              value={linha.palletEmprestado}
              onChange={(e) =>
                setLinha((x) => ({ ...x, palletEmprestado: e.target.value }))
              }
            >
              <option>SIM</option>
              <option>NÃO</option>
            </select>
          </Field>
          <Field label="CONDIÇÃO DE PAGAMENTO">
            <select
              value={linha.condicaoPagamento}
              onChange={(e) =>
                setLinha((x) => ({ ...x, condicaoPagamento: e.target.value }))
              }
            >
              {(data.pagamentos || [])
                .filter((x) => x.ativo !== false)
                .map((p) => (
                  <option key={p.id}>{p.descricao}</option>
                ))}
            </select>
          </Field>
          <button onClick={adicionar}>+ ADICIONAR CLIENTE / VENDA</button>
        </div>
        <div className="cadList">
          {linhas.map((x) => (
            <div className="cadRow" key={x.id}>
              <div>
                <b>
                  {x.cliente} • {x.qtd} SC • {money(x.preco)}
                </b>
                <small>
                  {x.marca} • {x.produto} • {x.destino} • PALLETS:{" "}
                  {Number(x.qtdPallets || 0)} (
                  {x.palletEmprestado === "SIM"
                    ? "EMPRESTADO AO CLIENTE"
                    : "ENTRADA FORTE"}
                  ) • SUBTOTAL {money(Number(x.qtd) * Number(x.preco))}
                </small>
              </div>
              <button
                className="dangerBtn"
                onClick={() => setLinhas((a) => a.filter((z) => z.id !== x.id))}
              >
                REMOVER
              </button>
            </div>
          ))}
        </div>
        <div className="alert">
          <b>TOTAL A DISTRIBUIR:</b>{" "}
          {linhas.reduce((a, x) => a + Number(x.qtd || 0), 0)} SACOS •{" "}
          {money(
            linhas.reduce(
              (a, x) => a + Number(x.qtd || 0) * Number(x.preco || 0),
              0,
            ),
          )}
        </div>
      </div>
      <div className="modalActions">
        <button className="ghost dark" onClick={onClose}>
          CANCELAR
        </button>
        <button onClick={gravar}>
          GRAVAR DISTRIBUIÇÃO / GERAR VENDAS E RELATÓRIO
        </button>
      </div>
    </Modal>
  );
}
function LoadModal({ carga, data, onClose, onGo, onDistribute }) {
  if (!carga) return null;
  const vs = (carga.vendaIds || [])
    .map((id) => data.vendas.find((v) => v.id === id))
    .filter(Boolean);
  return (
    <Modal title={`CARGA ${carga.codigo}`} onClose={onClose} wide>
      <div className="infoGrid">
        <div>
          <b>STATUS</b>
          <span>{carga.status}</span>
        </div>
        <div>
          <b>FASE</b>
          <span>{carga.fase}</span>
        </div>
        <div>
          <b>MOTORISTA</b>
          <span>{carga.motorista}</span>
        </div>
        <div>
          <b>PLACA</b>
          <span>{carga.placa}</span>
        </div>
        <div>
          <b>MARCA</b>
          <span>{carga.marca}</span>
        </div>
        <div>
          <b>PESO</b>
          <span>{(carga.pesoKg / 1000).toFixed(1)} T</span>
        </div>
        <div>
          <b>Nº PEDIDO</b>
          <span>{carga.numeroPedidoFornecedor || "NÃO INFORMADO"}</span>
        </div>
        <div>
          <b>Nº OS</b>
          <span>{carga.numeroOSFornecedor || "NÃO INFORMADA"}</span>
        </div>
        <div>
          <b>NOTA FISCAL</b>
          <span>{carga.numeroNotaFiscal || "PENDENTE"}</span>
        </div>
        <div>
          <b>SALDO SEM DESTINO</b>
          <span>{carga.qtdSemDestino ?? 0} SC</span>
        </div>
      </div>
      <h3>CLIENTES / VENDAS</h3>
      <div className="loadClients">
        {vs.map((v) => (
          <div key={v.id}>
            <b>{v.cliente}</b>
            <span>{v.produto}</span>
            <span>{v.qtd} SC</span>
            <span>{(v.pesoKg / 1000).toFixed(1)} T</span>
          </div>
        ))}
      </div>
      <div className="modalActions">
        <button className="secondary" onClick={onDistribute}>
          DISTRIBUIR NF / GERAR VENDAS
        </button>
        <button onClick={() => onGo("motorista")}>MOTORISTA</button>
        <button onClick={() => onGo("fornecedor")}>FORNECEDOR</button>
        <button onClick={() => onGo("conferencia")}>CONFERÊNCIA</button>
        <button className="ghost dark" onClick={onClose}>
          FECHAR
        </button>
      </div>
    </Modal>
  );
}
function DossieBox({ data, onChange, entityType, entityId, entityName }) {
  const docs = (data.documentos || []).filter(
    (d) => d.entityType === entityType && d.entityId === entityId,
  );
  function add(file) {
    if (!file) return;
    const id = uid("doc");
    putFile(id, file).then(() =>
      onChange((d) => ({
        ...d,
        documentos: [
          ...(d.documentos || []),
          {
            id: uid("dossie"),
            entityType,
            entityId,
            entityName,
            nome: file.name,
            fileId: id,
            tipo: "ANEXO CADASTRAL",
            criadoEm: nowISO(),
            status: "ARQUIVADO",
          },
        ],
      })),
    );
  }
  return (
    <div className="transportBox">
      <b>DOSSIÊ / ANEXOS</b>
      <div className="attachBar">
        <input
          type="file"
          accept=".pdf,.xml,image/*"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              add(f);
              e.target.value = "";
            }
          }}
        />
      </div>
      {docs.length > 0 && <small>{docs.length} ARQUIVO(S) VINCULADO(S)</small>}
    </div>
  );
}
function ModuleAttachBar({ data, onChange, module, refId }) {
  function add(file) {
    if (!file) return;
    const fileId = uid("modfile");
    putFile(fileId, file).then(() =>
      onChange((d) => ({
        ...d,
        documentos: [
          ...(d.documentos || []),
          {
            id: uid("moddoc"),
            entityType: "modulo",
            entityId: refId || module,
            entityName: upper(module),
            nome: file.name,
            fileId,
            tipo: "ANEXO DO MÓDULO",
            criadoEm: nowISO(),
            status: "ARQUIVADO",
          },
        ],
      })),
    );
  }
  return (
    <div className="attachBar moduleAttachBar">
      <b>ANEXAR DOCUMENTO AO MÓDULO:</b>
      <input
        type="file"
        accept=".pdf,.xml,image/*"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) {
            add(f);
            e.target.value = "";
          }
        }}
      />
    </div>
  );
}
const META = {
  clientes: {
    title: "CLIENTES",
    fields: [
      ["nome", "NOME"],
      ["documento", "CPF/CNPJ"],
      ["razaoSocial", "RAZÃO SOCIAL"],
      ["nomeFantasia", "NOME FANTASIA"],
      ["inscricaoEstadual", "INSCRIÇÃO ESTADUAL"],
      ["situacaoCadastral", "SITUAÇÃO CADASTRAL"],
      ["regimeTributario", "REGIME TRIBUTÁRIO"],
      ["optanteSimples", "OPTANTE SIMPLES"],
      ["fonteCadastro", "FONTE CADASTRAL"],
      ["dataAbertura", "DATA DE ABERTURA"],
      ["capitalSocial", "CAPITAL SOCIAL R$", "number"],
      ["atividadePrincipal", "ATIVIDADE PRINCIPAL"],
      ["sociosAdministradores", "SÓCIOS / ADMINISTRADORES"],
      ["representanteLegal", "REPRESENTANTE LEGAL"],
      ["cpfRepresentante", "CPF DO REPRESENTANTE"],
      ["telefone", "TELEFONE"],
      ["whatsapp", "WHATSAPP"],
      ["email", "E-MAIL", "email"],
      ["cep", "CEP"],
      ["logradouro", "LOGRADOURO"],
      ["numero", "NÚMERO"],
      ["bairro", "BAIRRO"],
      ["cidade", "CIDADE"],
      ["uf", "UF"],
      ["contatoResponsavel", "CONTATO RESPONSÁVEL"],
      ["condicaoPagamento", "CONDIÇÃO PADRÃO"],
      ["limiteCredito", "LIMITE DE CRÉDITO R$", "number"],
      ["linkLocalizacao", "LINK DA LOCALIZAÇÃO / MAPA"],
      ["vendedorResponsavelId", "VENDEDOR RESPONSÁVEL — PROTEGIDO"],
      ["observacoes", "OBSERVAÇÕES"],
    ],
  },
  produtos: {
    title: "PRODUTOS",
    fields: [
      ["codigoInterno", "CÓDIGO INTERNO"],
      ["nome", "PRODUTO"],
      ["marca", "MARCA/FORNECEDOR"],
      ["categoria", "CATEGORIA/TIPO"],
      ["pesoKg", "PESO UNITÁRIO KG", "number"],
      ["unidadeVenda", "UNIDADE DE MEDIDA"],
      ["codigoFornecedor", "CÓDIGO/REFERÊNCIA FORNECEDOR"],
      ["ncm", "NCM"],
      ["cest", "CEST"],
      ["custoTon", "CUSTO BASE / TONELADA R$", "number"],
      ["freteTon", "FRETE PADRÃO R$/T (FOB)", "number"],
      ["descontoPct", "DESCONTO %", "number"],
      ["precoVendaSugerido", "PREÇO VENDA SUGERIDO R$", "number"],
      ["margemSugerida", "MARGEM SUGERIDA %", "number"],
      ["precoTabela", "PREÇO DE TABELA R$", "number"],
      ["palletQtd", "QUANTIDADE POR PALLET", "number"],
      ["modalidade", "MODALIDADE CIF/FOB"],
      ["ultimaAtualizacaoCusto", "DATA ÚLTIMA ATUALIZAÇÃO"],
      ["observacoes", "OBSERVAÇÕES"],
    ],
  },
  fornecedores: {
    title: "FORNECEDORES / MARCAS",
    fields: [
      ["nome", "FORNECEDOR/MARCA"],
      ["codigoForte", "CÓDIGO FORTE"],
      ["whatsapp", "WHATSAPP"],
      ["emailPedidos", "E-MAIL DE PEDIDOS", "email"],
      ["emailPallets", "E-MAIL LIBERAÇÃO PALLETS", "email"],
      ["emailBusca", "E-MAIL BUSCA IA", "email"],
      ["limiteCredito", "LIMITE DE CRÉDITO R$", "number"],
      ["formaPagamentoPadrao", "FORMA PADRÃO DE PAGAMENTO"],
    ],
  },
  motoristas: {
    title: "MOTORISTAS / VEÍCULOS",
    fields: [
      ["nome", "MOTORISTA"],
      ["apelido", "APELIDO / NOME DE CHAMADA"],
      ["tipoMotorista", "TIPO DE MOTORISTA"],
      ["cpf", "CPF"],
      ["cnhNumero", "NÚMERO DA CNH"],
      ["cnhCategoria", "CATEGORIA DA CNH"],
      ["cnhValidade", "VALIDADE DA CNH"],
      ["telefone", "TELEFONE"],
      ["proprietario", "PROPRIETÁRIO"],
      ["telefoneProprietario", "TELEFONE PROPRIETÁRIO"],
      ["tipoVeiculo", "TIPO VEÍCULO"],
      ["placa1", "PLACA 1"],
      ["placa2", "PLACA 2"],
      ["placa3", "PLACA 3"],
      ["placa4", "PLACA 4"],
      ["rntrc", "RNTRC/ANTT"],
      ["capacidadeAlvoKg", "CAPACIDADE-ALVO KG", "number"],
      ["capacidadeMaximaKg", "CAPACIDADE MÁXIMA/LEGAL KG", "number"],
      ["chavePix", "CHAVE PIX"],
      ["favorecidoPix", "FAVORECIDO PIX"],
    ],
  },
  pagamentos: {
    title: "FORMAS DE PAGAMENTO",
    fields: [["descricao", "DESCRIÇÃO"]],
  },
  unidades: {
    title: "UNIDADES / FILIAIS",
    fields: [
      ["nome", "UNIDADE"],
      ["cnpj", "CNPJ"],
      ["cidade", "CIDADE"],
      ["uf", "UF"],
      ["linkLocalizacao", "LINK DA LOCALIZAÇÃO / MAPA"],
    ],
  },
  locais: {
    title: "LOCAIS DE CARREGAMENTO",
    fields: [
      ["nome", "LOCAL"],
      ["linkLocalizacao", "LINK DA LOCALIZAÇÃO / MAPA"],
    ],
  },
  rotas: {
    title: "ROTAS / DESTINOS",
    fields: [
      ["nome", "ROTA/DESTINO"],
      ["linkLocalizacao", "LINK DA LOCALIZAÇÃO / MAPA"],
    ],
  },
  fretesVendaBalcao: {
    title: "FRETES — VENDA BALCÃO",
    fields: [
      ["nome", "IDENTIFICAÇÃO DA REGRA"],
      ["produtoId", "PRODUTO / MARCA"],
      ["valorPorSaco", "VALOR DO FRETE POR SACO R$", "number"],
      ["unidade", "UNIDADE / FILIAL"],
      ["motoristaId", "MOTORISTA PADRÃO (OPCIONAL)"],
      ["vigenciaInicio", "INÍCIO DA VIGÊNCIA"],
      ["observacoes", "OBSERVAÇÕES"],
    ],
  },
  caixasEmail: {
    title: "CAIXAS DE E-MAIL DA IA",
    fields: [
      ["email", "E-MAIL", "email"],
      ["fornecedoresTexto", "FORNECEDORES VINCULADOS"],
    ],
  },
  usuarios: {
    title: "USUÁRIOS E PERMISSÕES",
    fields: [
      ["nome", "NOME"],
      ["login", "LOGIN"],
      ["cargo", "CARGO / FUNÇÃO"],
      ["perfil", "PERFIL DE ACESSO"],
      ["comissionado", "COMISSIONADO — SIM/NÃO"],
      ["tipoComissao", "TIPO DE COMISSÃO"],
      ["valorComissao", "PERCENTUAL / VALOR DA COMISSÃO", "number"],
      ["baseComissao", "BASE DE CÁLCULO"],
      ["vigenciaComissao", "INÍCIO DA VIGÊNCIA"],
      ["senha", "SENHA"],
      ["confirmarSenha", "CONFIRMAR SENHA"],
    ],
  },
};
function CadModal({
  type,
  data,
  search,
  setSearch,
  onClose,
  onChange,
  isAdmin,
}) {
  if (type === "usuarios" && !isAdmin) return null;
  const meta = META[type];
  const list = data[type] || [];
  const [edit, setEdit] = useState(null);
  const [f, setF] = useState({});
  const [busy, setBusy] = useState(false);
  const [obraCliente, setObraCliente] = useState({
    nome: "",
    endereco: "",
    cidade: "",
    uf: "",
    referencia: "",
    link: "",
  });
  const [consultaCliente, setConsultaCliente] = useState({
    tipo: "CONSULTA BANCÁRIA",
    instituicao: "",
    data: todayISO(),
    resultado: "",
    limiteSugerido: "",
    validade: "",
    observacoes: "",
  });
  const filtered = list.filter(
    (x) =>
      !norm(search) ||
      Object.values(x).some((v) =>
        norm(Array.isArray(v) ? v.join(" ") : v).includes(norm(search)),
      ),
  );
  const begin = (x) => {
    setEdit(x?.id || "new");
    setF(
      x
        ? {
            ...x,
            senha: "",
            confirmarSenha: "",
            fornecedoresTexto: Array.isArray(x.fornecedores)
              ? x.fornecedores.join(", ")
              : "",
          }
        : {
            ativo: true,
            admin: false,
            permissoes: [],
            perfil: type === "usuarios" ? "CONSULTA" : "",
            comissionado: type === "usuarios" ? "NÃO" : "",
            tipoComissao: type === "usuarios" ? "PERCENTUAL" : "",
            baseComissao: type === "usuarios" ? "VENDA LÍQUIDA" : "",
            modalidade: type === "produtos" ? "CIF" : "",
            senha: "",
            confirmarSenha: "",
          },
    );
  };
  async function lookupClient() {
    const n = String(f.documento || "").replace(/\D/g, "");
    if (n.length !== 14) return alert("INFORME UM CNPJ COM 14 DÍGITOS.");
    try {
      setBusy(true);
      const j = await consultarCnpj(n);
      const ie =
        j.inscricao_estadual ||
        j.inscricao_estadual_normalizada ||
        j.ie ||
        (j.inscricoes_estaduais || []).find((x) => x.ativo !== false)
          ?.inscricao_estadual ||
        (j.inscricoes_estaduais || [])[0]?.inscricao_estadual ||
        "";
      setF((x) => ({
        ...x,
        nome: upper(j.nome_fantasia || j.razao_social || x.nome),
        razaoSocial: upper(j.razao_social || ""),
        nomeFantasia: upper(j.nome_fantasia || ""),
        inscricaoEstadual: upper(ie),
        situacaoCadastral: upper(
          j.descricao_situacao_cadastral || j.situacao_cadastral || "",
        ),
        regimeTributario: upper(
          j.regime_tributario || j.regimeTributario || "",
        ),
        optanteSimples: String(
          j.opcao_pelo_simples ?? j.optante_simples ?? j.optanteSimples ?? "",
        ).toUpperCase(),
        fonteCadastro: upper(j._fonteFiscal || "BRASILAPI / REDESIM"),
        cep: j.cep || "",
        logradouro: upper(j.logradouro || ""),
        numero: upper(j.numero || ""),
        bairro: upper(j.bairro || ""),
        cidade: upper(j.municipio || ""),
        uf: upper(j.uf || ""),
        telefone: j.ddd_telefone_1 || "",
        email: j.email || "",
      }));
      if (!ie)
        alert("CNPJ LOCALIZADO, MAS A FONTE NÃO RETORNOU INSCRIÇÃO ESTADUAL.");
    } catch (e) {
      alert(e.message || "FALHA NA BUSCA DO CNPJ.");
    } finally {
      setBusy(false);
    }
  }
  async function lookupCep() {
    const cep = String(f.cep || "").replace(/\D/g, "");
    if (cep.length !== 8) return alert("INFORME UM CEP COM 8 DÍGITOS.");
    setBusy(true);
    try {
      let j = null;
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 6000);
        const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        if (r.ok) j = await r.json();
      } catch (e) {
        console.warn("ViaCEP indisponível", e);
      }
      if (!j || j.erro) {
        try {
          const r2 = await fetch(`https://brasilapi.com.br/api/cep/v1/${cep}`);
          if (r2.ok) {
            const b = await r2.json();
            j = {
              cep: b.cep,
              logradouro: b.street,
              bairro: b.neighborhood,
              localidade: b.city,
              uf: b.state,
            };
          }
        } catch (e) {
          console.warn("BrasilAPI CEP indisponível", e);
        }
      }
      if (!j || j.erro)
        return alert(
          "CEP NÃO ENCONTRADO OU SERVIÇO DE CEP INDISPONÍVEL. TENTE NOVAMENTE.",
        );
      setF((x) => ({
        ...x,
        cep: j.cep || x.cep,
        logradouro: upper(j.logradouro || x.logradouro || ""),
        bairro: upper(j.bairro || x.bairro || ""),
        cidade: upper(j.localidade || x.cidade || ""),
        uf: upper(j.uf || x.uf || ""),
      }));
      alert("CEP LOCALIZADO. ENDEREÇO PREENCHIDO AUTOMATICAMENTE.");
    } finally {
      setBusy(false);
    }
  }
  function save() {
    if (type === "usuarios" && !isAdmin) return alert("SOMENTE ADMINISTRADOR.");
    if (type === "clientes" && !f.vendedorResponsavelId)
      return alert("SELECIONE O VENDEDOR RESPONSÁVEL PELO CLIENTE.");
    if (type === "motoristas") {
      const obrigatorios = [
        ["nome", "NOME COMPLETO"],
        ["cpf", "CPF"],
        ["telefone", "WHATSAPP/TELEFONE"],
        ["cnhNumero", "CNH"],
        ["cnhCategoria", "CATEGORIA DA CNH"],
        ["cnhValidade", "VALIDADE DA CNH"],
        ["proprietario", "PROPRIETÁRIO/TRANSPORTADORA"],
        ["placa1", "PLACA DO CAVALO"],
        ["rntrc", "RNTRC/ANTT"],
        ["capacidadeAlvoKg", "CAPACIDADE DE CARGA"],
        ["chavePix", "CHAVE PIX"],
        ["favorecidoPix", "FAVORECIDO PIX"],
      ];
      const faltantes = obrigatorios.filter(([k]) => !String(f[k] ?? "").trim());
      if (faltantes.length)
        return alert(
          `CADASTRO DE MOTORISTA INCOMPLETO. PREENCHA: ${faltantes.map(([, l]) => l).join(", ")}.`,
        );
    }
    if (type === "clientes" && edit !== "new" && !isAdmin) {
      const anterior = list.find((x) => x.id === edit);
      if (
        (anterior?.vendedorResponsavelId || "") !==
        (f.vendedorResponsavelId || "")
      )
        return alert(
          "ALTERAÇÃO DE VENDEDOR BLOQUEADA. SOMENTE ADMINISTRADOR PODE TRANSFERIR A CARTEIRA DO CLIENTE.",
        );
    }
    const main = type === "produtos" ? "nome" : meta.fields[0][0];
    if (!f[main]) return alert("PREENCHA O CAMPO PRINCIPAL.");
    let obj = { ...f };
    if (type === "caixasEmail")
      obj.fornecedores = String(f.fornecedoresTexto || "")
        .split(",")
        .map((x) => upper(x.trim()))
        .filter(Boolean);
    for (const [k, l, t] of meta.fields) {
      if (
        !["email", "number"].includes(t) &&
        obj[k] != null &&
        !["senha", "confirmarSenha"].includes(k)
      )
        obj[k] = upper(obj[k]);
    }
    if (type === "usuarios") {
      if (edit === "new" && !f.senha)
        return alert("INFORME A SENHA DO NOVO USUÁRIO.");
      if (f.senha !== f.confirmarSenha) return alert("AS SENHAS NÃO CONFEREM.");
      obj.admin = obj.perfil === "ADMINISTRADOR";
      obj.permissoes = obj.admin
        ? ["*"]
        : obj.perfil === "PERSONALIZADO"
          ? obj.permissoes || []
          : PERFIL_PERMS[obj.perfil] || [];
      if (f.senha) obj.senhaHash = hashSenha(f.senha);
      delete obj.senha;
      delete obj.confirmarSenha;
    }
    if (type === "produtos") {
      obj.custoTon = Number(obj.custoTon || 0);
      obj.pesoKg = Number(obj.pesoKg || 0);
      obj.descontoPct = Number(obj.descontoPct || 0);
      obj.custoLiquidoTon = obj.custoTon * (1 - obj.descontoPct / 100);
      obj.custoLiquidoSaco = obj.custoLiquidoTon * (obj.pesoKg / 1000);
      obj.ultimaAtualizacaoCusto = obj.ultimaAtualizacaoCusto || todayISO();
    }
    const dup = list.find(
      (x) => x.id !== edit && norm(x[main]) === norm(obj[main]),
    );
    if (
      dup &&
      !confirm("JÁ EXISTE UM REGISTRO SEMELHANTE. DESEJA SALVAR MESMO ASSIM?")
    )
      return;
    const newId = edit === "new" ? uid(type.slice(0, 3)) : edit;
    const anteriorCliente =
      type === "clientes" && edit !== "new"
        ? list.find((x) => x.id === edit)
        : null;
    const trocaVendedor = !!(
      anteriorCliente &&
      anteriorCliente.vendedorResponsavelId !== obj.vendedorResponsavelId
    );
    const next =
      edit === "new"
        ? [...list, { ...obj, id: newId }]
        : list.map((x) => (x.id === edit ? { ...x, ...obj } : x));
    onChange((d) => ({
      ...d,
      [type]: next,
      auditoria: trocaVendedor
        ? [
            ...(d.auditoria || []),
            {
              id: uid("aud"),
              acao: "TRANSFERÊNCIA DE VENDEDOR DO CLIENTE",
              referencia: newId,
              detalhes: `${obj.nome || "CLIENTE"}: ${anteriorCliente?.vendedorResponsavelId || "SEM VENDEDOR"} -> ${obj.vendedorResponsavelId}`,
              usuario:
                (d.usuarios || []).find((u) => u.id === d.currentUserId)
                  ?.nome || "ADMINISTRADOR",
              dataHora: nowISO(),
            },
          ]
        : d.auditoria || [],
      documentos: (d.documentos || []).map((doc) =>
        doc.entityType === type && doc.entityId === "new"
          ? {
              ...doc,
              entityId: newId,
              entityName: upper(
                obj.nome || obj.descricao || obj.email || meta.title,
              ),
            }
          : doc,
      ),
    }));
    setEdit(null);
    alert(
      edit === "new"
        ? "CADASTRO SALVO COM SUCESSO."
        : "ALTERAÇÕES SALVAS COM SUCESSO.",
    );
  }
  function addConsultaCliente() {
    if (
      !consultaCliente.tipo ||
      !consultaCliente.data ||
      !consultaCliente.resultado
    )
      return alert("INFORME TIPO, DATA E RESULTADO DA CONSULTA.");
    const reg = {
      ...consultaCliente,
      id: uid("consulta"),
      instituicao: upper(consultaCliente.instituicao),
      resultado: upper(consultaCliente.resultado),
      observacoes: upper(consultaCliente.observacoes),
      limiteSugerido: Number(consultaCliente.limiteSugerido || 0),
      registradaEm: nowISO(),
    };
    setF((x) => ({
      ...x,
      consultasCredito: [...(x.consultasCredito || []), reg],
    }));
    setConsultaCliente({
      tipo: "CONSULTA BANCÁRIA",
      instituicao: "",
      data: todayISO(),
      resultado: "",
      limiteSugerido: "",
      validade: "",
      observacoes: "",
    });
  }
  async function anexarDocumentoCliente(file, tipo = "OUTRO DOCUMENTO") {
    if (!file) return;
    const fileId = uid("clidoc");
    await putFile(fileId, file);
    setF((x) => ({
      ...x,
      documentosCadastro: [
        ...(x.documentosCadastro || []),
        {
          id: uid("docmeta"),
          fileId,
          tipo: upper(tipo),
          nome: file.name,
          mime: file.type,
          tamanho: file.size,
          anexadoEm: nowISO(),
        },
      ],
    }));
    alert("DOCUMENTO ANEXADO AO CADASTRO DO CLIENTE.");
  }
  function addObraCliente() {
    if (!obraCliente.nome)
      return alert("INFORME O NOME/IDENTIFICAÇÃO DA OBRA.");
    setF((x) => ({
      ...x,
      obras: [
        ...(x.obras || []),
        {
          id: uid("obr"),
          ...obraCliente,
          nome: upper(obraCliente.nome),
          endereco: upper(obraCliente.endereco),
          cidade: upper(obraCliente.cidade),
          uf: upper(obraCliente.uf),
          referencia: upper(obraCliente.referencia),
          ativo: true,
        },
      ],
    }));
    setObraCliente({
      nome: "",
      endereco: "",
      cidade: "",
      uf: "",
      referencia: "",
      link: "",
    });
  }
  function toggle(id) {
    onChange((d) => ({
      ...d,
      [type]: (d[type] || []).map((x) =>
        x.id === id ? { ...x, ativo: x.ativo === false ? true : false } : x,
      ),
    }));
  }
  return (
    <Modal title={`CADASTRO — ${meta.title}`} onClose={onClose} wide>
      <div className="cadToolbar">
        <input
          className="uppercase"
          value={search}
          onChange={(e) => setSearch(upper(e.target.value))}
          placeholder="🔎 BUSCAR..."
        />
        <button
          type="button"
          onClick={() => {
            setEdit(null);
            setF({});
            setTimeout(() => begin(null), 0);
          }}
        >
          + NOVO
        </button>
      </div>
      {edit && (
        <div className="editBox">
          <DossieBox
            data={data}
            onChange={onChange}
            entityType={type}
            entityId={edit}
            entityName={f.nome || f.descricao || f.email || meta.title}
          />
          {type === "clientes" && (
            <div className="reportBar">
              <button onClick={lookupClient} disabled={busy}>
                {busy ? "BUSCANDO CNPJ..." : "BUSCAR DADOS PELO CNPJ"}
              </button>
              <span className="note">
                PREENCHA O CPF/CNPJ E CLIQUE PARA CONSULTAR. A IE É PREENCHIDA
                QUANDO A FONTE DISPONIBILIZAR.
              </span>
            </div>
          )}
          <div className="miniGrid">
            {meta.fields.map(([k, l, t]) => (
              <Field key={k} label={l}>
                {type === "motoristas" && k === "tipoMotorista" ? (
                  <select
                    value={f[k] || "TRANSPORTE DE CARGA"}
                    onChange={(e) =>
                      setF((x) => ({ ...x, [k]: e.target.value }))
                    }
                  >
                    <option>TRANSPORTE DE CARGA</option>
                    <option>ENTREGA</option>
                    <option>AMBOS</option>
                  </select>
                ) : type === "usuarios" && k === "cargo" ? (
                  <select
                    value={f.cargo || ""}
                    onChange={(e) =>
                      setF((x) => ({ ...x, cargo: e.target.value }))
                    }
                  >
                    <option value="">SELECIONE...</option>
                    {CARGOS.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                ) : type === "usuarios" && k === "perfil" ? (
                  <select
                    value={f.perfil || "CONSULTA"}
                    onChange={(e) => {
                      const perfil = e.target.value;
                      setF((x) => ({
                        ...x,
                        perfil,
                        permissoes:
                          perfil === "PERSONALIZADO"
                            ? x.permissoes || []
                            : PERFIL_PERMS[perfil] || [],
                      }));
                    }}
                  >
                    {PERFIS.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                ) : type === "usuarios" &&
                  ["senha", "confirmarSenha"].includes(k) ? (
                  <input
                    type="password"
                    value={f[k] || ""}
                    onChange={(e) =>
                      setF((x) => ({ ...x, [k]: e.target.value }))
                    }
                    placeholder={
                      edit === "new"
                        ? "OBRIGATÓRIA"
                        : "PREENCHA SOMENTE PARA REDEFINIR"
                    }
                  />
                ) : type === "usuarios" && k === "comissionado" ? (
                  <select
                    value={f[k] || "NÃO"}
                    onChange={(e) =>
                      setF((x) => ({ ...x, [k]: e.target.value }))
                    }
                  >
                    <option>NÃO</option>
                    <option>SIM</option>
                  </select>
                ) : type === "usuarios" && k === "tipoComissao" ? (
                  <select
                    value={f[k] || "PERCENTUAL"}
                    onChange={(e) =>
                      setF((x) => ({ ...x, [k]: e.target.value }))
                    }
                  >
                    <option>PERCENTUAL</option>
                    <option>VALOR FIXO POR SACO</option>
                    <option>VALOR FIXO POR VENDA</option>
                  </select>
                ) : type === "usuarios" && k === "baseComissao" ? (
                  <select
                    value={f[k] || "VENDA LÍQUIDA"}
                    onChange={(e) =>
                      setF((x) => ({ ...x, [k]: e.target.value }))
                    }
                  >
                    <option>VENDA BRUTA</option>
                    <option>VENDA LÍQUIDA</option>
                    <option>MARGEM / LUCRO</option>
                  </select>
                ) : type === "fornecedores" && k === "formaPagamentoPadrao" ? (
                  <select
                    value={f[k] || ""}
                    onChange={(e) =>
                      setF((x) => ({ ...x, [k]: e.target.value }))
                    }
                  >
                    <option value="">SEM PADRÃO</option>
                    {(data.pagamentos || [])
                      .filter((p) => p.ativo !== false)
                      .map((p) => (
                        <option key={p.id}>{p.descricao}</option>
                      ))}
                  </select>
                ) : type === "fretesVendaBalcao" && k === "produtoId" ? (
                  <select
                    value={f[k] || ""}
                    onChange={(e) =>
                      setF((x) => ({ ...x, [k]: e.target.value }))
                    }
                  >
                    <option value="">SELECIONE...</option>
                    {(data.produtos || [])
                      .filter((p) => p.ativo !== false)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.marca} • {p.nome}
                        </option>
                      ))}
                  </select>
                ) : type === "fretesVendaBalcao" && k === "motoristaId" ? (
                  <select
                    value={f[k] || ""}
                    onChange={(e) =>
                      setF((x) => ({ ...x, [k]: e.target.value }))
                    }
                  >
                    <option value="">SEM MOTORISTA PADRÃO</option>
                    {(data.motoristas || [])
                      .filter(
                        (m) =>
                          m.ativo !== false && motoristaServe(m, "ENTREGA"),
                      )
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nome}
                          {m.apelido ? ` — ${m.apelido}` : ""} • {m.placa1}
                        </option>
                      ))}
                  </select>
                ) : type === "fretesVendaBalcao" && k === "unidade" ? (
                  <select
                    value={f[k] || "GERAL"}
                    onChange={(e) =>
                      setF((x) => ({ ...x, [k]: e.target.value }))
                    }
                  >
                    <option>GERAL</option>
                    {(data.unidades || [])
                      .filter((u) => u.ativo !== false)
                      .map((u) => (
                        <option key={u.id}>{u.nome}</option>
                      ))}
                  </select>
                ) : type === "clientes" && k === "vendedorResponsavelId" ? (
                  <select
                    value={f[k] || ""}
                    disabled={!isAdmin}
                    onChange={(e) =>
                      setF((x) => ({ ...x, [k]: e.target.value }))
                    }
                  >
                    <option value="">SELECIONE O VENDEDOR...</option>
                    {(data.usuarios || [])
                      .filter(
                        (u) =>
                          u.ativo !== false &&
                          (u.comissionado === "SIM" ||
                            String(u.cargo || "").includes("VENDEDOR")),
                      )
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.nome}
                        </option>
                      ))}
                  </select>
                ) : type === "produtos" && k === "unidadeVenda" ? (
                  <select
                    value={f[k] || "UNIDADE"}
                    onChange={(e) =>
                      setF((x) => ({ ...x, [k]: e.target.value }))
                    }
                  >
                    {[
                      "SACO/SACA",
                      "KG",
                      "TONELADA",
                      "LITRO",
                      "UNIDADE",
                      "PEÇA",
                      "EMBALAGEM",
                      "PACOTE",
                      "CAIXA",
                      "FARDO",
                    ].map((u) => (
                      <option key={u}>{u}</option>
                    ))}
                  </select>
                ) : type === "clientes" && k === "cep" ? (
                  <div className="inlineField">
                    <input
                      value={f[k] ?? ""}
                      onChange={(e) =>
                        setF((x) => ({ ...x, [k]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          lookupCep();
                        }
                      }}
                      placeholder="CEP — 8 DÍGITOS"
                    />
                    <button type="button" onClick={lookupCep} disabled={busy}>
                      {busy ? "BUSCANDO..." : "BUSCAR CEP"}
                    </button>
                  </div>
                ) : t === "email" ? (
                  <input
                    type="email"
                    value={f[k] ?? ""}
                    onChange={(e) =>
                      setF((x) => ({ ...x, [k]: e.target.value }))
                    }
                  />
                ) : t === "number" ? (
                  <input
                    type="number"
                    value={f[k] ?? ""}
                    onChange={(e) =>
                      setF((x) => ({ ...x, [k]: e.target.value }))
                    }
                  />
                ) : k === "cnhValidade" ? (
                  <input
                    type="date"
                    value={f[k] ?? ""}
                    onChange={(e) =>
                      setF((x) => ({ ...x, [k]: e.target.value }))
                    }
                  />
                ) : k === "cidade" ? (
                  <CityInput
                    value={f[k] ?? ""}
                    onChange={(v) => setF((x) => ({ ...x, [k]: v }))}
                  />
                ) : k === "modalidade" ? (
                  <select
                    value={f[k] || "CIF"}
                    onChange={(e) =>
                      setF((x) => ({ ...x, [k]: e.target.value }))
                    }
                  >
                    <option>CIF</option>
                    <option>FOB</option>
                  </select>
                ) : (
                  <UpperInput
                    value={f[k] ?? ""}
                    onChange={(v) => setF((x) => ({ ...x, [k]: v }))}
                  />
                )}
              </Field>
            ))}
          </div>
          {type === "clientes" && (
            <div className="transportBox">
              <h3>OBRAS / DESTINOS DO CLIENTE</h3>
              <p className="note">
                CADASTRE VÁRIAS OBRAS NO MESMO CLIENTE. A OBRA PODERÁ SER
                SELECIONADA NO ORÇAMENTO OU NA VENDA BALCÃO.
              </p>
              <div className="miniGrid">
                <Field label="NOME / IDENTIFICAÇÃO DA OBRA">
                  <UpperInput
                    value={obraCliente.nome}
                    onChange={(v) => setObraCliente((x) => ({ ...x, nome: v }))}
                  />
                </Field>
                <Field label="ENDEREÇO COMPLETO">
                  <UpperInput
                    value={obraCliente.endereco}
                    onChange={(v) =>
                      setObraCliente((x) => ({ ...x, endereco: v }))
                    }
                  />
                </Field>
                <Field label="CIDADE">
                  <UpperInput
                    value={obraCliente.cidade}
                    onChange={(v) =>
                      setObraCliente((x) => ({ ...x, cidade: v }))
                    }
                  />
                </Field>
                <Field label="UF">
                  <UpperInput
                    value={obraCliente.uf}
                    onChange={(v) =>
                      setObraCliente((x) => ({ ...x, uf: v.slice(0, 2) }))
                    }
                  />
                </Field>
                <Field label="REFERÊNCIA / OBSERVAÇÃO">
                  <UpperInput
                    value={obraCliente.referencia}
                    onChange={(v) =>
                      setObraCliente((x) => ({ ...x, referencia: v }))
                    }
                  />
                </Field>
                <Field label="LINK DE LOCALIZAÇÃO (MAPS / WAZE)">
                  <input
                    value={obraCliente.link}
                    onChange={(e) =>
                      setObraCliente((x) => ({ ...x, link: e.target.value }))
                    }
                  />
                </Field>
                <button type="button" onClick={addObraCliente}>
                  + ADICIONAR OBRA / DESTINO
                </button>
              </div>
              {(f.obras || []).map((o) => (
                <div className="cadRow" key={o.id}>
                  <div>
                    <b>{o.nome}</b>
                    <small>
                      {o.endereco || "SEM ENDEREÇO"} • {o.cidade || "-"}/
                      {o.uf || "-"} • {o.referencia || ""} •{" "}
                      {o.link || "SEM LINK"}
                    </small>
                  </div>
                  <div className="cadRowActions">
                    <button
                      type="button"
                      onClick={() =>
                        setF((x) => ({
                          ...x,
                          obras: (x.obras || []).map((a) =>
                            a.id === o.id
                              ? {
                                  ...a,
                                  ativo: a.ativo === false ? true : false,
                                }
                              : a,
                          ),
                        }))
                      }
                    >
                      {o.ativo === false ? "REATIVAR" : "INATIVAR"}
                    </button>
                    <button
                      type="button"
                      className="dangerBtn"
                      onClick={() =>
                        setF((x) => ({
                          ...x,
                          obras: (x.obras || []).filter((a) => a.id !== o.id),
                        }))
                      }
                    >
                      EXCLUIR
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {type === "clientes" && (
            <div className="transportBox">
              <h3>CONSULTAS BANCÁRIAS / COMERCIAIS E ANÁLISE DE CRÉDITO</h3>
              <p className="note">
                HISTÓRICO PERMANENTE, SEM SUBSTITUIR OS DADOS CADASTRAIS OU AS
                OBRAS DO CLIENTE.
              </p>
              <div className="miniGrid">
                <Field label="TIPO DE CONSULTA">
                  <select
                    value={consultaCliente.tipo}
                    onChange={(e) =>
                      setConsultaCliente((x) => ({
                        ...x,
                        tipo: e.target.value,
                      }))
                    }
                  >
                    <option>CONSULTA BANCÁRIA</option>
                    <option>SERASA / SCORE</option>
                    <option>REFERÊNCIA COMERCIAL</option>
                    <option>ANÁLISE INTERNA DE CRÉDITO</option>
                    <option>OUTRA CONSULTA</option>
                  </select>
                </Field>
                <Field label="INSTITUIÇÃO / FONTE">
                  <UpperInput
                    value={consultaCliente.instituicao}
                    onChange={(v) =>
                      setConsultaCliente((x) => ({ ...x, instituicao: v }))
                    }
                  />
                </Field>
                <Field label="DATA DA CONSULTA">
                  <input
                    type="date"
                    value={consultaCliente.data}
                    onChange={(e) =>
                      setConsultaCliente((x) => ({
                        ...x,
                        data: e.target.value,
                      }))
                    }
                  />
                </Field>
                <Field label="RESULTADO / SITUAÇÃO">
                  <UpperInput
                    value={consultaCliente.resultado}
                    onChange={(v) =>
                      setConsultaCliente((x) => ({ ...x, resultado: v }))
                    }
                  />
                </Field>
                <Field label="LIMITE SUGERIDO R$">
                  <input
                    type="number"
                    step="0.01"
                    value={consultaCliente.limiteSugerido}
                    onChange={(e) =>
                      setConsultaCliente((x) => ({
                        ...x,
                        limiteSugerido: e.target.value,
                      }))
                    }
                  />
                </Field>
                <Field label="VALIDADE DA CONSULTA">
                  <input
                    type="date"
                    value={consultaCliente.validade}
                    onChange={(e) =>
                      setConsultaCliente((x) => ({
                        ...x,
                        validade: e.target.value,
                      }))
                    }
                  />
                </Field>
                <Field label="OBSERVAÇÕES">
                  <UpperInput
                    value={consultaCliente.observacoes}
                    onChange={(v) =>
                      setConsultaCliente((x) => ({ ...x, observacoes: v }))
                    }
                  />
                </Field>
                <button type="button" onClick={addConsultaCliente}>
                  + REGISTRAR CONSULTA
                </button>
              </div>
              {(f.consultasCredito || []).map((c) => (
                <div className="cadRow" key={c.id}>
                  <div>
                    <b>
                      {c.tipo} • {formatDateBR(c.data)}
                    </b>
                    <small>
                      {c.instituicao || "SEM FONTE"} • {c.resultado} • LIMITE:{" "}
                      {money(c.limiteSugerido || 0)} • VALIDADE:{" "}
                      {c.validade ? formatDateBR(c.validade) : "NÃO INFORMADA"}
                    </small>
                  </div>
                  <button
                    type="button"
                    className="dangerBtn"
                    onClick={() =>
                      setF((x) => ({
                        ...x,
                        consultasCredito: (x.consultasCredito || []).filter(
                          (a) => a.id !== c.id,
                        ),
                      }))
                    }
                  >
                    EXCLUIR
                  </button>
                </div>
              ))}
            </div>
          )}
          {type === "clientes" && (
            <div className="transportBox">
              <h3>DOCUMENTOS E COMPROVAÇÕES DO CLIENTE</h3>
              <p className="note">
                ANEXE FICHA CADASTRAL, CONTRATO SOCIAL, DOCUMENTOS DOS SÓCIOS,
                CONSULTAS, COMPROVANTES E OUTROS ARQUIVOS.
              </p>
              <div className="miniGrid">
                {[
                  "FICHA CADASTRAL",
                  "CONTRATO SOCIAL / ALTERAÇÃO",
                  "DOCUMENTO DE SÓCIO / REPRESENTANTE",
                  "COMPROVANTE DE ENDEREÇO",
                  "CONSULTA BANCÁRIA / COMERCIAL",
                  "COMPROVANTE DE RENDA / FATURAMENTO",
                  "OUTRO DOCUMENTO",
                ].map((tipo) => (
                  <Field key={tipo} label={tipo}>
                    <input
                      type="file"
                      accept=".pdf,.xml,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                      onChange={(e) =>
                        anexarDocumentoCliente(e.target.files?.[0], tipo)
                      }
                    />
                  </Field>
                ))}
              </div>
              {(f.documentosCadastro || []).map((d) => (
                <div className="cadRow" key={d.id}>
                  <div>
                    <b>{d.tipo}</b>
                    <small>
                      {d.nome} •{" "}
                      {d.anexadoEm
                        ? new Date(d.anexadoEm).toLocaleString("pt-BR")
                        : "-"}
                    </small>
                  </div>
                  <div className="cadRowActions">
                    <button type="button" onClick={() => openFile(d.fileId)}>
                      ABRIR
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => downloadFile(d.fileId, d.nome)}
                    >
                      BAIXAR
                    </button>
                    <button
                      type="button"
                      className="dangerBtn"
                      onClick={() =>
                        setF((x) => ({
                          ...x,
                          documentosCadastro: (
                            x.documentosCadastro || []
                          ).filter((a) => a.id !== d.id),
                        }))
                      }
                    >
                      EXCLUIR
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {type === "produtos" && (
            <div className="costPreview">
              <b>
                CUSTO LÍQUIDO / TON:{" "}
                {money(
                  Number(f.custoTon || 0) *
                    (1 - Number(f.descontoPct || 0) / 100),
                )}
              </b>
              <b>
                CUSTO LÍQUIDO / SACO:{" "}
                {money(
                  Number(f.custoTon || 0) *
                    (1 - Number(f.descontoPct || 0) / 100) *
                    (Number(f.pesoKg || 0) / 1000),
                )}
              </b>
            </div>
          )}
          {type === "usuarios" && (
            <>
              <Field label="PERMISSÕES">
                <div className="permGrid">
                  {PERMS.map((p) => (
                    <label key={p}>
                      <input
                        type="checkbox"
                        checked={
                          (f.permissoes || []).includes(p) ||
                          f.permissoes?.includes("*")
                        }
                        disabled={f.perfil !== "PERSONALIZADO"}
                        onChange={(e) =>
                          setF((x) => ({
                            ...x,
                            permissoes: e.target.checked
                              ? [...(x.permissoes || []), p]
                              : (x.permissoes || []).filter((a) => a !== p),
                          }))
                        }
                      />
                      {p}
                    </label>
                  ))}
                </div>
              </Field>
              <p className="note">
                SOMENTE O ADMINISTRADOR PODE CRIAR USUÁRIOS, REDEFINIR SENHAS E
                CONCEDER ACESSOS.
              </p>
            </>
          )}
          <div className="modalActions">
            <button className="ghost dark" onClick={() => setEdit(null)}>
              CANCELAR
            </button>
            <button onClick={save}>
              {edit === "new" ? "SALVAR" : "SALVAR ALTERAÇÕES"}
            </button>
          </div>
        </div>
      )}
      <div className="cadList">
        {filtered.map((x) => (
          <div
            className={`cadRow ${x.ativo === false ? "inactive" : ""}`}
            key={x.id}
          >
            <div>
              <b>{x.nome || x.descricao || x.email}</b>
              <small>
                {Object.entries(x)
                  .filter(
                    ([k, v]) =>
                      typeof v === "string" &&
                      v &&
                      ![
                        "id",
                        "nome",
                        "descricao",
                        "email",
                        "senhaHash",
                      ].includes(k),
                  )
                  .slice(0, 5)
                  .map(([k, v]) => v)
                  .join(" • ")}
              </small>
            </div>
            <div className="cadRowActions">
              <button className="ghost dark" onClick={() => begin(x)}>
                EDITAR
              </button>
              <button
                className={x.ativo === false ? "secondary" : "dangerBtn"}
                onClick={() => toggle(x.id)}
              >
                {x.ativo === false ? "ATIVAR" : "DESATIVAR"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
function ProofModal({ titleId, onClose, onSave }) {
  return (
    <Modal title="ANEXAR COMPROVANTE DO FORNECEDOR" onClose={onClose}>
      <p>
        ANEXE FOTO OU PDF DO COMPROVANTE. O COMPROVANTE FICA VINCULADO AO
        TÍTULO. DEPOIS DO ANEXO, USE LIQUIDAR TÍTULO. SE O TÍTULO JÁ ESTIVER
        CONCILIADO VIA EXTRATO, O DOCUMENTO SERÁ APENAS EVIDÊNCIA COMPLEMENTAR,
        SEM NOVA BAIXA.
      </p>
      <input
        type="file"
        accept=".pdf,image/*"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onSave(titleId, f);
        }}
      />
    </Modal>
  );
}
function Daily({ data }) {
  const totalP = data.pagar.reduce((s, x) => s + Number(x.valor || 0), 0),
    totalR = data.receber.reduce((s, x) => s + Number(x.valor || 0), 0);
  const sec = (t, rows) => (
    <div className="dailySec">
      <b>{t}</b>
      {rows.length ? (
        rows.map((x, i) => (
          <span key={i}>
            {upper(x.fornecedor || x.cliente || "")} • {x.carga || "-"} •{" "}
            {money(x.valor)} • {x.status || "ABERTO"}
          </span>
        ))
      ) : (
        <span>NENHUM</span>
      )}
    </div>
  );
  return (
    <>
      <div className="dailySummary">
        <b>TOTAL A PAGAR: {money(totalP)}</b>
        <b>TOTAL A RECEBER: {money(totalR)}</b>
        <b>SALDO DO DIA: {money(totalR - totalP)}</b>
      </div>
      <div className="dailyGrid">
        {sec("A PAGAR NA DATA", data.pagar)}
        {sec("A RECEBER NA DATA", data.receber)}
        {sec("VENCIDOS EM ABERTO", data.vencidos)}
        {sec("LIQUIDADOS NA DATA", data.liquidados)}
      </div>
    </>
  );
}

function NewCompraForte({ data, onClose, onSave }) {
  const [unidadeId, setUnidadeId] = useState(data.unidades?.[0]?.id || "");
  const [produtoId, setProdutoId] = useState("");
  const [qtd, setQtd] = useState("");
  const [custo, setCusto] = useState("");
  const [itens, setItens] = useState([]);
  const p = data.produtos.find((x) => x.id === produtoId);
  function add() {
    if (!p || Number(qtd) <= 0) return alert("SELECIONE PRODUTO E QUANTIDADE.");
    setItens((a) => [
      ...a,
      {
        id: uid("item"),
        produtoId: p.id,
        produto: p.nome,
        marca: p.marca,
        qtd: Number(qtd),
        pesoKg: Number(qtd) * Number(p.pesoKg || 0),
        custoUnitario: Number(custo || 0),
      },
    ]);
    setProdutoId("");
    setQtd("");
    setCusto("");
  }
  return (
    <Modal title="COMPRA FORTE / REPOSIÇÃO DE ESTOQUE" onClose={onClose} wide>
      <div className="miniGrid">
        <Field label="UNIDADE QUE RECEBERÁ O ESTOQUE">
          <select
            value={unidadeId}
            onChange={(e) => setUnidadeId(e.target.value)}
          >
            {data.unidades
              .filter((x) => x.ativo !== false)
              .map((x) => (
                <option value={x.id} key={x.id}>
                  {x.nome}
                </option>
              ))}
          </select>
        </Field>
        <Field label="PRODUTO / MARCA">
          <select
            value={produtoId}
            onChange={(e) => setProdutoId(e.target.value)}
          >
            <option value="">SELECIONE...</option>
            {data.produtos
              .filter((x) => x.ativo !== false)
              .map((x) => (
                <option value={x.id} key={x.id}>
                  {x.marca} • {x.nome}
                </option>
              ))}
          </select>
        </Field>
        <Field label="QUANTIDADE (SACOS)">
          <input
            type="number"
            value={qtd}
            onChange={(e) => setQtd(e.target.value)}
          />
        </Field>
        <Field label="PESO CALCULADO">
          <input
            readOnly
            value={
              p && qtd
                ? `${((Number(qtd) * Number(p.pesoKg || 0)) / 1000).toFixed(2)} T`
                : "0,00 T"
            }
          />
        </Field>
        <Field label="CUSTO UNITÁRIO POSTO">
          <input
            type="number"
            step="0.01"
            value={custo}
            onChange={(e) => setCusto(e.target.value)}
          />
        </Field>
        <button onClick={add}>+ ADICIONAR AO ESTOQUE</button>
      </div>
      <div className="cadList">
        {itens.map((it) => (
          <div className="cadRow" key={it.id}>
            <div>
              <b>
                {it.marca} • {it.produto}
              </b>
              <small>
                {it.qtd} SACOS • {(it.pesoKg / 1000).toFixed(2)} T • CUSTO{" "}
                {money(it.custoUnitario)}
              </small>
            </div>
            <button
              className="dangerBtn"
              onClick={() => setItens((a) => a.filter((x) => x.id !== it.id))}
            >
              REMOVER
            </button>
          </div>
        ))}
      </div>
      <div className="alert">
        <b>TOTAL PARA ESTOQUE:</b> {itens.reduce((s, x) => s + x.qtd, 0)} SACOS
        • {(itens.reduce((s, x) => s + x.pesoKg, 0) / 1000).toFixed(2)} T
      </div>
      <div className="modalActions">
        <button className="ghost dark" onClick={onClose}>
          CANCELAR
        </button>
        <button onClick={() => onSave({ unidadeId, itens })}>
          GRAVAR COMPRA FORTE
        </button>
      </div>
    </Modal>
  );
}
function NewSale({ data, onClose, onSave, onDataChange }) {
  const [clienteId, setClienteId] = useState("");
  const [destino, setDestino] = useState("");
  const [condicaoPagamento, setCondicaoPagamento] = useState("14 DIAS");
  const [produtoId, setProdutoId] = useState("");
  const [qtd, setQtd] = useState("");
  const [preco, setPreco] = useState("");
  const [itens, setItens] = useState([]);
  const [quick, setQuick] = useState(false);
  const p = (data.produtos || []).find((x) => x.id === produtoId);
  function add() {
    if (!p || !qtd || Number(qtd) <= 0)
      return alert("SELECIONE PRODUTO E QUANTIDADE.");
    const cap = palletCapacity(p),
      qp = cap ? Math.ceil(Number(qtd) / cap) : 0;
    setItens((a) => [
      ...a,
      {
        id: uid("item"),
        produtoId: p.id,
        produto: p.nome,
        marca: p.marca,
        qtd: Number(qtd),
        pesoKg: Number(qtd) * Number(p.pesoKg || 0),
        precoUnitario: Number(preco || 0),
        qtdPallets: qp,
        palletEmprestado: "NÃO",
      },
    ]);
    setProdutoId("");
    setQtd("");
    setPreco("");
  }
  function togglePal(id, v) {
    setItens((a) =>
      a.map((x) => (x.id === id ? { ...x, palletEmprestado: v } : x)),
    );
    alert(
      v === "SIM"
        ? "CONFIRMAÇÃO: CLIENTE PRECISA DOS PALETES DESTE ITEM."
        : "CONFIRMAÇÃO: CLIENTE NÃO PRECISA DOS PALETES DESTE ITEM.",
    );
  }
  if (quick)
    return (
      <Modal title="NOVO CLIENTE" onClose={() => setQuick(false)} wide>
        <ClientQuick
          data={data}
          onClose={() => setQuick(false)}
          onSaved={(c) => {
            onDataChange((d) => ({
              ...d,
              clientes: [...(d.clientes || []), c],
            }));
            setClienteId(c.id);
            setDestino(
              c.cidade ? `${c.cidade}${c.uf ? ` - ${c.uf}` : ""}` : "",
            );
            setCondicaoPagamento(c.condicaoPagamento || "14 DIAS");
            setQuick(false);
          }}
        />
      </Modal>
    );
  return (
    <Modal
      title="NOVO PEDIDO / CLIENTE — VÁRIOS PRODUTOS"
      onClose={onClose}
      wide
    >
      <div className="clientSelectRow">
        <Field label="CLIENTE">
          <select
            value={clienteId}
            onChange={(e) => setClienteId(e.target.value)}
          >
            <option value="">SELECIONE...</option>
            {(data.clientes || [])
              .filter((x) => x.ativo !== false)
              .map((x) => (
                <option value={x.id} key={x.id}>
                  {x.nome}
                </option>
              ))}
          </select>
        </Field>
        <button onClick={() => setQuick(true)}>+ NOVO CLIENTE</button>
      </div>
      <div className="miniGrid">
        <Field label="DESTINO / OBRA">
          <select value={destino} onChange={(e) => setDestino(e.target.value)}>
            <option value="">SELECIONE...</option>
            {(
              (data.clientes || []).find((x) => x.id === clienteId)?.obras || []
            )
              .filter((o) => o.ativo !== false)
              .map((o) => (
                <option
                  key={o.id}
                  value={`${o.nome} — ${o.endereco || ""} ${o.cidade || ""}/${o.uf || ""}`}
                >
                  {o.nome} • {o.endereco || ""} • {o.cidade || ""}/{o.uf || ""}
                </option>
              ))}
            {clienteId &&
              !(data.clientes.find((x) => x.id === clienteId)?.obras || [])
                .length && (
                <option
                  value={`${data.clientes.find((x) => x.id === clienteId)?.cidade || ""} - ${data.clientes.find((x) => x.id === clienteId)?.uf || ""}`}
                >
                  ENDEREÇO PRINCIPAL
                </option>
              )}
          </select>
        </Field>
        <Field label="CONDIÇÃO DE PAGAMENTO">
          <select
            value={condicaoPagamento}
            onChange={(e) => setCondicaoPagamento(e.target.value)}
          >
            {(data.pagamentos || [])
              .filter((x) => x.ativo !== false)
              .map((x) => (
                <option key={x.id}>{x.descricao}</option>
              ))}
          </select>
        </Field>
      </div>
      <h3>PRODUTOS DA VENDA</h3>
      <div className="miniGrid">
        <Field label="PRODUTO">
          <select
            value={produtoId}
            onChange={(e) => setProdutoId(e.target.value)}
          >
            <option value="">SELECIONE...</option>
            {(data.produtos || [])
              .filter((x) => x.ativo !== false)
              .map((x) => (
                <option value={x.id} key={x.id}>
                  {x.marca} • {x.nome}
                </option>
              ))}
          </select>
        </Field>
        <Field label="QUANTIDADE (SACOS)">
          <input
            type="number"
            value={qtd}
            onChange={(e) => setQtd(e.target.value)}
          />
        </Field>
        <Field label="PESO CALCULADO">
          <input
            readOnly
            value={
              p && qtd
                ? `${((Number(qtd) * Number(p.pesoKg || 0)) / 1000).toFixed(2)} T`
                : "0,00 T"
            }
          />
        </Field>
        <Field label="PREÇO UNITÁRIO">
          <input
            type="number"
            step="0.01"
            value={preco}
            onChange={(e) => setPreco(e.target.value)}
          />
        </Field>
        <button onClick={add}>+ ADICIONAR PRODUTO</button>
      </div>
      <div className="cadList">
        {itens.map((it, i) => (
          <div className="cadRow" key={it.id}>
            <div>
              <b>{it.produto}</b>
              <small>
                {it.qtd} SACOS • {(it.pesoKg / 1000).toFixed(2)} T •{" "}
                {money(it.precoUnitario)} • {it.qtdPallets} PALLET(S)
              </small>
            </div>
            <div className="cadRowActions">
              <button
                className={
                  it.palletEmprestado === "SIM" ? "activeChoice" : "ghost dark"
                }
                onClick={() => togglePal(it.id, "SIM")}
              >
                PALLET SIM
              </button>
              <button
                className={
                  it.palletEmprestado === "NÃO" ? "activeChoice" : "ghost dark"
                }
                onClick={() => togglePal(it.id, "NÃO")}
              >
                PALLET NÃO
              </button>
              <button
                className="dangerBtn"
                onClick={() => setItens((a) => a.filter((x) => x.id !== it.id))}
              >
                REMOVER
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="alert">
        <b>TOTAL:</b> {itens.reduce((s, x) => s + Number(x.qtd || 0), 0)} SACOS
        •{" "}
        {(itens.reduce((s, x) => s + Number(x.pesoKg || 0), 0) / 1000).toFixed(
          2,
        )}{" "}
        T
      </div>
      <div className="modalActions">
        <button className="ghost dark" onClick={onClose}>
          CANCELAR
        </button>
        <button
          onClick={() =>
            onSave({ clienteId, destino, condicaoPagamento, itens })
          }
        >
          GRAVAR PEDIDO
        </button>
      </div>
    </Modal>
  );
}

function CadastroIaModal({ data, onChange, currentUser, onClose }) {
  const [tipo, setTipo] = useState("");
  const [documento, setDocumento] = useState("");
  const [nomeInformado, setNomeInformado] = useState("");
  const [nomeDocumento, setNomeDocumento] = useState("");
  const [telefone, setTelefone] = useState("");
  const [arquivos, setArquivos] = useState([]);
  const [analise, setAnalise] = useState(null);
  const digits = String(documento || "").replace(/\D/g, "");
  const base = [...(data.clientes || []), ...(data.motoristas || [])];
  const existente = base.find(
    (x) => String(x.documento || x.cpf || "").replace(/\D/g, "") === digits,
  );
  const validarNumero = (value) => {
    const n = String(value || "").replace(/\D/g, "");
    if (![11, 14].includes(n.length) || /^(\d)\1+$/.test(n)) return false;
    const calc = (baseNum, fatores) => {
      const soma = fatores.reduce(
        (s, f, i) => s + Number(baseNum[i]) * f,
        0,
      );
      const resto = soma % 11;
      return resto < 2 ? 0 : 11 - resto;
    };
    if (n.length === 11) {
      const d1 = calc(n, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
      const d2 = calc(n, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
      return d1 === Number(n[9]) && d2 === Number(n[10]);
    }
    const d1 = calc(n, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    const d2 = calc(n, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    return d1 === Number(n[12]) && d2 === Number(n[13]);
  };
  const compararNomes = () => {
    const a = norm(nomeInformado).split(" ").filter((x) => x.length > 2);
    const b = norm(nomeDocumento).split(" ").filter((x) => x.length > 2);
    if (!a.length || !b.length) return "PENDENTE";
    const comuns = a.filter((x) => b.includes(x)).length;
    return comuns / Math.max(a.length, b.length) >= 0.6 ? "CONFERE" : "DIVERGENTE";
  };
  function analisar() {
    if (!tipo) return alert("INFORME SE O CADASTRO É DE CLIENTE OU MOTORISTA.");
    if (!digits) return alert("INFORME O CPF/CNPJ PARA PESQUISA E CONFERÊNCIA.");
    const numeroValido = validarNumero(digits);
    const nomes = compararNomes();
    const alertas = [];
    if (!numeroValido) alertas.push("CPF/CNPJ COM DÍGITOS VERIFICADORES INVÁLIDOS");
    if (existente) alertas.push(`DOCUMENTO JÁ CADASTRADO: ${existente.nome}`);
    if (nomes === "DIVERGENTE")
      alertas.push("NOME INFORMADO NÃO CONFERE COM O NOME DO DOCUMENTO");
    if (!arquivos.length) alertas.push("NENHUM DOCUMENTO FOI ANEXADO");
    setAnalise({
      numeroValido,
      nomes,
      alertas,
      status:
        !numeroValido || existente || nomes === "DIVERGENTE"
          ? "BLOQUEADO / CONFERÊNCIA ADMINISTRATIVA"
          : nomes === "CONFERE" && arquivos.length
            ? "PRONTO PARA CONFERÊNCIA HUMANA"
            : "PENDENTE DE DOCUMENTOS / DADOS",
    });
  }
  async function anexar(files) {
    const novos = [];
    for (const file of Array.from(files || [])) {
      const fileId = uid("cadia");
      await putFile(fileId, file);
      novos.push({
        id: uid("docia"),
        fileId,
        nome: file.name,
        mime: file.type,
        tamanho: file.size,
        statusIa: "AGUARDANDO EXTRAÇÃO / CONFERÊNCIA DA IA",
        anexadoEm: nowISO(),
      });
    }
    setArquivos((a) => [...a, ...novos]);
    setAnalise(null);
  }
  function salvarPendente() {
    if (!analise) return alert("EXECUTE A CONFERÊNCIA ANTES DE SALVAR.");
    if (existente) return alert("DOCUMENTO JÁ CADASTRADO. ABRA O CADASTRO EXISTENTE PARA ATUALIZAR.");
    const id = uid(tipo === "CLIENTE" ? "cli" : "mot");
    const nome = upper(nomeDocumento || nomeInformado || "CADASTRO PENDENTE");
    const registro =
      tipo === "CLIENTE"
        ? {
            id,
            nome,
            documento: digits,
            telefone,
            whatsapp: telefone,
            vendedorResponsavelId: currentUser?.id || "",
            statusCadastro: analise.status,
            alertasCadastro: analise.alertas,
            documentosCadastro: arquivos,
            ativo: analise.status === "PRONTO PARA CONFERÊNCIA HUMANA",
          }
        : {
            id,
            nome,
            cpf: digits,
            telefone,
            tipoMotorista: "TRANSPORTE DE CARGA",
            statusCadastro: "PENDENTE — COMPLETAR CNH, RNTRC, VEÍCULOS, CAPACIDADE E PIX",
            alertasCadastro: analise.alertas,
            documentosCadastro: arquivos,
            ativo: false,
          };
    onChange((d) => ({
      ...d,
      [tipo === "CLIENTE" ? "clientes" : "motoristas"]: [
        ...(d[tipo === "CLIENTE" ? "clientes" : "motoristas"] || []),
        registro,
      ],
      auditoria: [
        ...(d.auditoria || []),
        {
          id: uid("aud"),
          usuario: currentUser?.nome || "",
          acao: "CADASTRO ASSISTIDO PELA IA CRIADO",
          referencia: id,
          detalhe: `${tipo} • ${nome} • ${digits} • ${analise.status}`,
          dataHora: nowISO(),
        },
      ],
    }));
    alert(
      tipo === "MOTORISTA"
        ? "CADASTRO SALVO COMO PENDENTE. O MOTORISTA NÃO FOI LIBERADO PARA CARGAS."
        : "CADASTRO ASSISTIDO SALVO PARA CONFERÊNCIA.",
    );
    onClose();
  }
  return (
    <Modal title="NOVO CADASTRO COM IA — CELULAR / DESKTOP" onClose={onClose} wide>
      <div className="aiCadastroIntro">
        <b>1. INFORME O TIPO</b>
        <p>Se o tipo não for informado, o sistema exige a escolha antes de analisar.</p>
        <div className="choiceButtons">
          <button className={tipo === "CLIENTE" ? "activeChoice" : "ghost dark"} onClick={() => setTipo("CLIENTE")}>CLIENTE</button>
          <button className={tipo === "MOTORISTA" ? "activeChoice" : "ghost dark"} onClick={() => setTipo("MOTORISTA")}>MOTORISTA</button>
        </div>
      </div>
      <div className="miniGrid aiCadastroFields">
        <Field label="CPF/CNPJ — BUSCA OBRIGATÓRIA">
          <input inputMode="numeric" value={documento} onChange={(e) => { setDocumento(e.target.value); setAnalise(null); }} placeholder="DIGITE OU COLE O CPF/CNPJ" />
        </Field>
        <Field label="NOME INFORMADO PELA PESSOA">
          <UpperInput value={nomeInformado} onChange={(v) => { setNomeInformado(v); setAnalise(null); }} />
        </Field>
        <Field label="NOME LIDO NO DOCUMENTO">
          <UpperInput value={nomeDocumento} onChange={(v) => { setNomeDocumento(v); setAnalise(null); }} />
        </Field>
        <Field label="TELEFONE / WHATSAPP">
          <input inputMode="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
        </Field>
      </div>
      <div className="transportBox">
        <h3>2. ANEXAR DOCUMENTOS</h3>
        <input type="file" multiple accept=".pdf,.xml,image/*" capture="environment" onChange={(e) => { anexar(e.target.files); e.target.value = ""; }} />
        <small>{arquivos.length} DOCUMENTO(S) ANEXADO(S). PDFs E FOTOS FICAM NO DOSSIÊ DO CADASTRO.</small>
      </div>
      <button onClick={analisar}>✦ CONFERIR DOCUMENTO E CADASTRO</button>
      {analise && (
        <div className={`identityCheck ${analise.status.startsWith("BLOQUEADO") ? "blocked" : "ok"}`}>
          <b>{analise.status}</b>
          <span>CPF/CNPJ: {analise.numeroValido ? "VÁLIDO" : "INVÁLIDO"}</span>
          <span>NOMES: {analise.nomes}</span>
          {analise.alertas.map((x) => <strong key={x}>⚠ {x}</strong>)}
          <p>A IA aponta divergências e indícios; a confirmação final permanece humana.</p>
        </div>
      )}
      <div className="modalActions">
        <button className="ghost dark" onClick={onClose}>CANCELAR</button>
        <button onClick={salvarPendente} disabled={!analise || !!existente}>SALVAR NO CADASTRO CORRETO</button>
      </div>
    </Modal>
  );
}

function CertificateCard({ unidade, certificado, busy, onInstall, onRemove }) {
  const [file, setFile] = useState(null);
  const [senha, setSenha] = useState("");
  const validade = certificado?.fimValidade
    ? new Date(certificado.fimValidade).toLocaleDateString("pt-BR")
    : "";
  return (
    <div className={`certificateCard ${certificado?.vencido ? "expired" : certificado ? "installed" : ""}`}>
      <h4>{unidade.nome}</h4>
      <b>{unidade.cnpj}</b>
      {certificado ? (
        <>
          <span>✓ CERTIFICADO A1 INSTALADO</span>
          <small>{certificado.titular || certificado.arquivo}</small>
          <small>VALIDADE: {validade} — {certificado.diasParaVencer} DIA(S)</small>
          <button className="danger" disabled={busy} onClick={() => onRemove(unidade)}>REMOVER / SUBSTITUIR</button>
        </>
      ) : (
        <>
          <input type="file" accept=".pfx,.p12,application/x-pkcs12" onChange={(e)=>setFile(e.target.files?.[0] || null)} />
          <input type="password" autoComplete="new-password" value={senha} onChange={(e)=>setSenha(e.target.value)} placeholder="SENHA DO CERTIFICADO" />
          <button disabled={busy || !file} onClick={async()=>{ await onInstall(unidade,file,senha); setSenha(""); }}>VALIDAR E INSTALAR A1</button>
        </>
      )}
    </div>
  );
}

function Integracoes({ data, onChange, onClose, audit }) {
  const [clientId, setClientId] = useState(data.settings?.gmailClientId || "");
  const [sefazEndpoint, setSefazEndpoint] = useState(
    data.settings?.sefazEndpointSeguro || `${SEFAZ_LOCAL}/api/sefaz/distribuicao`,
  );
  const [sefazAmbiente, setSefazAmbiente] = useState(data.settings?.sefazAmbiente || "1");
  const [certificados, setCertificados] = useState({});
  const [certBusy, setCertBusy] = useState(false);
  const [query, setQuery] = useState(
    data.settings?.gmailQuery ||
      "newer_than:30d has:attachment in:inbox -in:spam -in:trash",
  );
  const [tokens, setTokens] = useState({});
  const [busy, setBusy] = useState(false);
  const caixas = data.caixasEmail || [];
  const imports = (data.gmailImports || [])
    .slice()
    .sort((a, b) =>
      String(b.importadoEm || "").localeCompare(String(a.importadoEm || "")),
    );
  useEffect(() => {
    if (!data.settings?.gmailAutoSync || !Object.keys(tokens).length) return;
    const timer = setInterval(() => syncAll(true), 600000);
    return () => clearInterval(timer);
  }, [data.settings?.gmailAutoSync, tokens, query, caixas.length]);
  useEffect(() => { carregarCertificados(); }, []);
  async function carregarCertificados() {
    try {
      const r = await fetch(`${SEFAZ_LOCAL}/api/certificates`, { cache:"no-store" });
      if (!r.ok) throw new Error();
      const j = await r.json(); setCertificados(j.certificados || {});
    } catch { setCertificados({}); }
  }
  async function instalarCertificado(unidade, file, senha) {
    if (!file) return alert("SELECIONE O ARQUIVO .PFX OU .P12.");
    if (!/\.(pfx|p12)$/i.test(file.name)) return alert("USE UM CERTIFICADO DIGITAL A1 NO FORMATO .PFX OU .P12.");
    try {
      setCertBusy(true);
      const r = await fetch(`${SEFAZ_LOCAL}/api/certificates`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ cnpj:unidade.cnpj, unidade:unidade.nome, arquivo:file.name, senha, pfxBase64:await fileToBase64(file) }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.erro || "CERTIFICADO NÃO INSTALADO.");
      await carregarCertificados(); audit("CERTIFICADO DIGITAL INSTALADO", unidade.id, `${unidade.nome} — ${file.name}`); alert(`CERTIFICADO VALIDADO E INSTALADO PARA ${unidade.nome}.`);
    } catch(e) { alert(e.message || "NÃO FOI POSSÍVEL INSTALAR O CERTIFICADO."); } finally { setCertBusy(false); }
  }
  async function removerCertificado(unidade) {
    if (!confirm(`REMOVER O CERTIFICADO VINCULADO A ${unidade.nome}?`)) return;
    const cnpj=String(unidade.cnpj||"").replace(/\D/g,"");
    const r=await fetch(`${SEFAZ_LOCAL}/api/certificates/${cnpj}`,{method:"DELETE"});
    if(!r.ok) return alert("NÃO FOI POSSÍVEL REMOVER O CERTIFICADO.");
    await carregarCertificados(); audit("CERTIFICADO DIGITAL REMOVIDO", unidade.id, unidade.nome);
  }
  function saveCfg() {
    onChange((d) => ({
      ...d,
      settings: {
        ...d.settings,
        gmailClientId: clientId.trim(),
        gmailQuery: query.trim(),
        sefazEndpointSeguro: sefazEndpoint.trim(),
        sefazAmbiente,
      },
    }));
    alert("CONFIGURAÇÃO DE INTEGRAÇÃO SALVA.");
  }
  function patchBox(id, patch) {
    onChange((d) => ({
      ...d,
      caixasEmail: (d.caixasEmail || []).map((x) =>
        x.id === id ? { ...x, ...patch } : x,
      ),
    }));
  }
  function addBox() {
    onChange((d) => ({
      ...d,
      caixasEmail: [
        ...(d.caixasEmail || []),
        {
          id: uid("mail"),
          email: "",
          descricao: "",
          ativo: true,
          fornecedores: [],
          status: "DESCONECTADO",
          ultimaSincronizacao: "",
        },
      ],
    }));
  }
  function removeBox(id) {
    if (
      !confirm(
        "REMOVER ESTA CAIXA DE E-MAIL DA INTEGRAÇÃO? OS DOCUMENTOS JÁ IMPORTADOS SERÃO MANTIDOS.",
      )
    )
      return;
    onChange((d) => ({
      ...d,
      caixasEmail: (d.caixasEmail || []).filter((x) => x.id !== id),
    }));
    setTokens((t) => {
      const n = { ...t };
      delete n[id];
      return n;
    });
  }
  async function connectBox(box) {
    try {
      setBusy(true);
      const t = await authorizeGmail(clientId.trim());
      const profile = await getGmailProfile(t);
      setTokens((v) => ({ ...v, [box.id]: t }));
      patchBox(box.id, {
        email: profile.emailAddress || box.email,
        status: "CONECTADO",
        conectadoEm: new Date().toISOString(),
        erro: "",
      });
      audit(
        "GMAIL AUTORIZADO",
        box.id,
        `${profile.emailAddress || box.email} — SOMENTE LEITURA`,
      );
      alert(`GMAIL CONECTADO: ${profile.emailAddress || box.email}`);
    } catch (e) {
      patchBox(box.id, { status: "ERRO", erro: String(e.message || e) });
      alert(e.message || "FALHA AO CONECTAR O GMAIL.");
    } finally {
      setBusy(false);
    }
  }
  async function syncBox(box, silent = false) {
    let t = tokens[box.id];
    try {
      if (!t) {
        t = await authorizeGmail(clientId.trim());
        const profile = await getGmailProfile(t);
        setTokens((v) => ({ ...v, [box.id]: t }));
        patchBox(box.id, {
          email: profile.emailAddress || box.email,
          status: "CONECTADO",
          conectadoEm: new Date().toISOString(),
          erro: "",
        });
      }
      const ultima = box.ultimaSincronizacao
        ? new Date(box.ultimaSincronizacao).getTime()
        : 0;
      const after = ultima ? Math.max(0, Math.floor(ultima / 1000) - 900) : 0;
      const consultaIncremental = after ? `${query} after:${after}` : query;
      const itens = await searchGmail(t, consultaIncremental, 100);
      const existing = data.gmailImports || [];
      const knownMessage = new Set(existing.map((x) => x.chaveImportacao));
      const knownNfe = new Set(
        existing.map((x) => x.nfe?.chave).filter(Boolean),
      );
      const knownHash = new Set(
        existing.map((x) => x.hashArquivo).filter(Boolean),
      );
      const novos = [];
      const docs = [];
      for (const item of itens) {
        const chave = `${box.id}:${item.messageId}:${item.attachmentId || item.filename}`;
        if (knownMessage.has(chave)) continue;
        let fileId = "",
          nfe = null,
          hashArquivo = "";
        try {
          if (item.attachmentId) {
            const blob = await downloadGmailAttachment(t, item);
            hashArquivo = await hashBlob(blob);
            if (hashArquivo && knownHash.has(hashArquivo)) continue;
            const file = new File([blob], item.filename || "anexo", {
              type: item.mimeType || blob.type || "application/octet-stream",
            });
            if (/\.xml$/i.test(item.filename || "")) {
              try {
                nfe = await lerXmlNfe(file);
              } catch {}
              if (nfe?.chave && knownNfe.has(nfe.chave)) continue;
            }
            fileId = uid("gmailfile");
            await putFile(fileId, file);
          }
        } catch (e) {
          console.warn("Falha ao baixar anexo Gmail", item.filename, e);
        }
        const rec = {
          id: uid("gimp"),
          chaveImportacao: chave,
          caixaEmailId: box.id,
          caixaEmail: box.email,
          messageId: item.messageId,
          threadId: item.threadId,
          from: item.from,
          subject: item.subject,
          date: item.date,
          filename: item.filename,
          mimeType: item.mimeType,
          tipo: item.tipo,
          fileId,
          hashArquivo,
          importadoEm: new Date().toISOString(),
          status: "IMPORTADO — AGUARDANDO VINCULAÇÃO/CONFERÊNCIA",
          nfe: nfe
            ? (() => {
                const { raw, ...dados } = nfe;
                return dados;
              })()
            : null,
        };
        novos.push(rec);
        if (rec.nfe?.chave) knownNfe.add(rec.nfe.chave);
        if (hashArquivo) knownHash.add(hashArquivo);
        knownMessage.add(chave);
        docs.push({
          id: uid("doc"),
          origem: "GMAIL",
          origemConta: box.email,
          gmailImportId: rec.id,
          tipo: item.tipo,
          nome: item.filename,
          fileId,
          cargaId: "",
          status: "CAIXA DE ENTRADA DA IA — AGUARDANDO VINCULAÇÃO",
          criadoEm: nowISO(),
          nfe: rec.nfe,
        });
      }
      const notasNovas = novos
        .filter((x) => x.nfe)
        .map((x) => ({
          ...x.nfe,
          id: uid("nfe"),
          origem: "GMAIL",
          gmailImportId: x.id,
          documentoXmlId: x.fileId,
          threadId: x.threadId,
          boletos: novos
            .filter(
              (b) =>
                b.threadId === x.threadId && upper(b.tipo).includes("BOLETO"),
            )
            .map((b) => ({
              nome: b.filename,
              fileId: b.fileId,
              gmailImportId: b.id,
            })),
          status: "AGUARDANDO DESTINAÇÃO",
          importadaEm: nowISO(),
        }));
      const agora = new Date().toISOString();
      onChange((d) => ({
        ...d,
        gmailImports: [...(d.gmailImports || []), ...novos],
        documentos: [...(d.documentos || []), ...docs],
        preConferenciaBoletos: [
          ...(d.preConferenciaBoletos || []),
          ...novos.filter((x) => upper(x.tipo).includes("BOLETO") || upper(x.tipo).includes("TITULO"))
            .filter((x) => !(d.preConferenciaBoletos || []).some((p) => p.gmailImportId === x.id))
            .map((x) => ({ id:uid("prebol"), gmailImportId:x.id, documentoId:x.fileId, arquivoNome:x.filename, origem:`GMAIL — ${x.caixaEmail}`, status:"RECEBIDO", fornecedor:"", beneficiarioDocumento:"", nf:"", pedido:"", carga:"", valor:0, valorNf:0, vencimento:"", linhaDigitavel:"", divergencias:["AGUARDANDO LEITURA E CONFERÊNCIA FINANCEIRA"], criadoEm:nowISO(), criadoPor:"SINCRONIZAÇÃO GMAIL" })),
        ],
        notasFiscais: [
          ...(d.notasFiscais || []),
          ...notasNovas.filter(
            (n) =>
              !(d.notasFiscais || []).some(
                (a) => a.chave && a.chave === n.chave,
              ),
          ),
        ],
        caixasEmail: (d.caixasEmail || []).map((x) =>
          x.id === box.id
            ? {
                ...x,
                status: "CONECTADO",
                ultimaSincronizacao: agora,
                erro: "",
              }
            : x,
        ),
        settings: {
          ...d.settings,
          gmailClientId: clientId.trim(),
          gmailQuery: query.trim(),
          ultimaSincronizacaoGmail: agora,
        },
      }));
      audit(
        "SINCRONIZAÇÃO GMAIL",
        box.id,
        `${box.email || "CONTA"}: ${novos.length} ANEXO(S) NOVO(S)`,
      );
      if (!silent)
        alert(
          `SINCRONIZAÇÃO CONCLUÍDA — ${box.email || "GMAIL"}: ${novos.length} ANEXO(S) NOVO(S).`,
        );
      return novos.length;
    } catch (e) {
      patchBox(box.id, { status: "ERRO", erro: String(e.message || e) });
      if (!silent) alert(e.message || "FALHA NA SINCRONIZAÇÃO DO GMAIL.");
      throw e;
    }
  }
  async function syncAll(silent = false) {
    const active = caixas.filter((x) => x.ativo !== false);
    if (!active.length)
      return alert("CADASTRE E ATIVE PELO MENOS UMA CONTA GMAIL.");
    setBusy(true);
    let total = 0,
      ok = 0,
      fail = 0;
    for (const box of active) {
      try {
        total += await syncBox(box, true);
        ok++;
      } catch {
        fail++;
      }
    }
    setBusy(false);
    if (!silent)
      alert(
        `SINCRONIZAÇÃO MULTICONTAS CONCLUÍDA.\nCONTAS OK: ${ok}\nCONTAS COM ERRO: ${fail}\nNOVOS DOCUMENTOS: ${total}`,
      );
  }
  function testarWpp() {
    const m = (data.motoristas || []).find(
      (x) => x.ativo !== false && (x.telefone || x.whatsapp),
    );
    if (!m) return alert("CADASTRE UM MOTORISTA COM TELEFONE/WHATSAPP.");
    let n = String(m.whatsapp || m.telefone || "").replace(/\D/g, "");
    if (n.length <= 11) n = `55${n}`;
    window.open(
      `https://wa.me/${n}?text=${encodeURIComponent("FORTE ATACAREJO — TESTE DE INTEGRAÇÃO DO WHATSAPP DO MOTORISTA.")}`,
      "_blank",
    );
  }
  return (
    <Modal
      title="INTEGRAÇÕES — GMAIL MULTICONTAS / WHATSAPP"
      onClose={onClose}
      wide
    >
      <div className="transportBox">
        <h3>SEFAZ — DISTRIBUIÇÃO DF-E DA MATRIZ E FILIAL</h3>
        <p>
          CONSULTA OS DOIS CNPJS POR SERVIÇO SEGURO, MANTÉM O NSU DE CADA
          ESTABELECIMENTO E BLOQUEIA DUPLICIDADE PELA CHAVE DA NF-E. O
          O CERTIFICADO A1 É VALIDADO PELO SERVIÇO LOCAL DO DESKTOP E GUARDADO
          CRIPTOGRAFADO FORA DO NAVEGADOR. A SENHA NÃO É SALVA NOS DADOS DA TELA.
        </p>
        <div className="certificateGrid">
          {(data.unidades || []).filter(u => u.ativo !== false).map((u) => <CertificateCard key={u.id} unidade={u} certificado={certificados[String(u.cnpj||"").replace(/\D/g,"")]} busy={certBusy} onInstall={instalarCertificado} onRemove={removerCertificado} />)}
        </div>
        <div className="miniGrid">
          <Field label="ENDPOINT SEGURO DO SERVIÇO SEFAZ">
            <input
              value={sefazEndpoint}
              onChange={(e) => setSefazEndpoint(e.target.value)}
              placeholder="HTTPS://SERVIDOR-SEGURO/..."
            />
          </Field>
          <Field label="AMBIENTE SEFAZ">
            <select value={sefazAmbiente} onChange={(e)=>setSefazAmbiente(e.target.value)}><option value="1">PRODUÇÃO</option><option value="2">HOMOLOGAÇÃO / TESTES</option></select>
          </Field>
          <Field label="CNPJS CONSULTADOS">
            <input
              readOnly
              value={
                (data.unidades || [])
                  .map((u) => u.cnpj)
                  .filter(Boolean)
                  .join(" / ") || "CADASTRE OS CNPJS NAS UNIDADES"
              }
            />
          </Field>
          <Field label="ÚLTIMA CONSULTA">
            <input
              readOnly
              value={
                (data.sefazConsultas || []).length
                  ? new Date(
                      data.sefazConsultas[data.sefazConsultas.length - 1]
                        .dataHora,
                    ).toLocaleString("pt-BR")
                  : "NUNCA"
              }
            />
          </Field>
        </div>
      </div>
      <div className="transportBox">
        <h3>GMAIL MULTICONTAS — CAIXA DE ENTRADA DA IA</h3>
        <p>
          CADASTRE QUANTAS CONTAS FOREM NECESSÁRIAS. CADA GMAIL É AUTORIZADO
          INDIVIDUALMENTE VIA GOOGLE OAUTH EM MODO SOMENTE LEITURA. A IA
          CONSOLIDA NF-E/XML, DANFE, BOLETOS, TÍTULOS E COMPROVANTES EM UMA
          ÚNICA FILA E BLOQUEIA DUPLICIDADES ENTRE CONTAS POR MENSAGEM, CHAVE DA
          NF-E E CONTEÚDO DO ARQUIVO.
        </p>
        <div className="miniGrid">
          <Field label="GOOGLE OAUTH CLIENT ID">
            <input
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="...apps.googleusercontent.com"
            />
          </Field>
          <Field label="PESQUISA PADRÃO EM TODAS AS CONTAS">
            <input value={query} onChange={(e) => setQuery(e.target.value)} />
          </Field>
          <Field label="ÚLTIMA SINCRONIZAÇÃO GERAL">
            <input
              readOnly
              value={
                data.settings?.ultimaSincronizacaoGmail
                  ? new Date(
                      data.settings.ultimaSincronizacaoGmail,
                    ).toLocaleString("pt-BR")
                  : "NUNCA"
              }
            />
          </Field>
        </div>
        <div className="linhaBotoes">
          <label>
            <input
              type="checkbox"
              checked={data.settings?.gmailAutoSync !== false}
              onChange={(e) =>
                onChange((d) => ({
                  ...d,
                  settings: {
                    ...d.settings,
                    gmailAutoSync: e.target.checked,
                    gmailIntervaloMinutos: 10,
                  },
                }))
              }
            />{" "}
            AUTOMÁTICA A CADA 10 MINUTOS
          </label>
          <button className="ghost dark" onClick={saveCfg}>
            SALVAR CONFIGURAÇÃO
          </button>
          <button onClick={addBox}>+ ADICIONAR CONTA GMAIL</button>
          <button onClick={syncAll} disabled={busy}>
            {busy ? "SINCRONIZANDO..." : "SINCRONIZAR TODAS AS CONTAS"}
          </button>
        </div>
        <div className="cadList">
          {caixas.map((box, i) => (
            <div className="cadRow" key={box.id}>
              <div style={{ flex: 1 }}>
                <b>
                  CONTA {i + 1} • {box.email || "AGUARDANDO AUTORIZAÇÃO"}
                </b>
                <small>
                  {box.descricao || "GMAIL IA"} • {box.status || "DESCONECTADO"}{" "}
                  • ÚLTIMA:{" "}
                  {box.ultimaSincronizacao
                    ? new Date(box.ultimaSincronizacao).toLocaleString("pt-BR")
                    : "NUNCA"}
                </small>
                {box.erro && <small>ERRO: {box.erro}</small>}
              </div>
              <label>
                <input
                  type="checkbox"
                  checked={box.ativo !== false}
                  onChange={(e) =>
                    patchBox(box.id, { ativo: e.target.checked })
                  }
                />{" "}
                ATIVA
              </label>
              <button onClick={() => connectBox(box)} disabled={busy}>
                CONECTAR / RECONECTAR
              </button>
              <button
                onClick={() => syncBox(box)}
                disabled={busy || box.ativo === false}
              >
                SINCRONIZAR
              </button>
              <button className="dangerBtn" onClick={() => removeBox(box.id)}>
                REMOVER
              </button>
            </div>
          ))}
        </div>
      </div>
      <div className="transportBox">
        <h3>WHATSAPP — MOTORISTAS E FORNECEDORES</h3>
        <p>
          O MODO DIRETO ABRE O WHATSAPP WEB/APLICATIVO JÁ NO CONTATO CADASTRADO.
          A API BUSINESS SERÁ A PRÓXIMA INTEGRAÇÃO.
        </p>
        <div className="linhaBotoes">
          <button onClick={testarWpp}>TESTAR WHATSAPP DO MOTORISTA</button>
        </div>
      </div>
      <div className="transportBox">
        <h3>CAIXA DE ENTRADA DA IA — DOCUMENTOS CONSOLIDADOS</h3>
        <div className="cadList">
          {imports.slice(0, 30).map((x) => (
            <div className="cadRow" key={x.id}>
              <div>
                <b>
                  {x.tipo} • {x.filename}
                </b>
                <small>
                  CONTA: {x.caixaEmail || "LEGADO"} • {x.from} • {x.subject} •{" "}
                  {x.nfe?.numero
                    ? `NF ${x.nfe.numero} • ${money(x.nfe.valorNf)}`
                    : ""}
                </small>
              </div>
              <span>{x.status}</span>
            </div>
          ))}
          {!imports.length && <p>NENHUM DOCUMENTO IMPORTADO AINDA.</p>}
        </div>
      </div>
      <div className="modalActions">
        <button className="ghost dark" onClick={onClose}>
          FECHAR
        </button>
      </div>
    </Modal>
  );
}
function AjudaIa({ tab, onClose, onNavigate }) {
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState("");
  const [action, setAction] = useState(null);
  const nomes = {
    clientes: "CARGA DIRETA",
    balcao: "VENDA BALCÃO",
    planejamento: "PLANEJAMENTO / CARGA SEM DESTINO",
    todasCargas: "TODAS AS CARGAS",
    motorista: "MOTORISTAS / VEÍCULOS",
    saude: "DRE / SAÚDE FINANCEIRA",
    financeiro: "FINANCEIRO",
    conferencia: "CONFERÊNCIA / IA",
    cadastros: "CADASTROS",
    contasPagar: "CONTAS A PAGAR",
    contasReceber: "CONTAS A RECEBER",
    itau: "BANCO ITAÚ",
    estoque: "ESTOQUE",
    patio: "PÁTIO / ESTOQUE",
    fornecedor: "FORNECEDORES / MARCAS",
  };
  const contexto = nomes[tab] || upper(tab || "SISTEMA");
  function responder(texto = q) {
    const pergunta = upper(texto).trim();
    if (!pergunta) return;
    setQ(texto);
    setAction(null);
    let r = `VOCÊ ESTÁ EM ${contexto}. `;
    if (pergunta.includes("CADASTR") && pergunta.includes("MOTORISTA")) {
      r +=
        "PARA CADASTRAR UM MOTORISTA, ABRA CADASTROS / CONFIGURAÇÕES, ENTRE EM MOTORISTAS / VEÍCULOS, CLIQUE + NOVO, INFORME O TIPO DE MOTORISTA (TRANSPORTE DE CARGA, ENTREGA OU AMBOS), PREENCHA OS DADOS DO MOTORISTA E DO VEÍCULO E CLIQUE SALVAR. MOTORISTAS DE ENTREGA APARECEM SOMENTE NOS CAMPOS DE ENTREGA; MOTORISTAS DE TRANSPORTE APARECEM NAS CARGAS.";
      setAction({ label: "IR PARA MOTORISTAS / VEÍCULOS", tab: "motorista" });
    } else if (
      pergunta.includes("PRÓXIMO PASSO") ||
      pergunta.includes("PROXIMO PASSO")
    ) {
      r +=
        tab === "clientes"
          ? "SELECIONE OU CRIE AS VENDAS, MARQUE OS PEDIDOS QUE FORMARÃO A CARGA E CONTINUE PARA SELECIONAR O MOTORISTA."
          : tab === "motorista"
            ? "BUSQUE E SELECIONE UM MOTORISTA DE TRANSPORTE. CONFIRA CAPACIDADE, PLACAS E RNTRC; DEPOIS FORME A CARGA E SIGA PARA O FORNECEDOR."
            : tab === "balcao"
              ? "CONFIRA CLIENTE, ITENS, PAGAMENTO E, SE HOUVER ENTREGA, SELECIONE UM MOTORISTA CLASSIFICADO COMO ENTREGA OU AMBOS. DEPOIS GRAVE A VENDA."
              : "CONFIRA OS CAMPOS OBRIGATÓRIOS E SIGA O BOTÃO DE AÇÃO PRINCIPAL DA TELA.";
    } else if (pergunta.includes("BLOQUEAD")) {
      r +=
        "UM BOTÃO PODE FICAR BLOQUEADO QUANDO FALTA CAMPO OBRIGATÓRIO, DOCUMENTO, PERMISSÃO DO USUÁRIO, LIMITE DE CRÉDITO OU QUANDO UMA ETAPA ANTERIOR AINDA NÃO FOI CONCLUÍDA. CONFIRA AS PENDÊNCIAS EXIBIDAS NA TELA.";
    } else if (pergunta.includes("PREENCH")) {
      r +=
        "PREENCHA PRIMEIRO OS CAMPOS OBRIGATÓRIOS E USE OS CADASTROS EXISTENTES NOS CAMPOS DE SELEÇÃO. CAMPOS FINANCEIROS RESTRITOS NÃO SÃO MOSTRADOS A PERFIS SEM PERMISSÃO.";
    } else if (
      pergunta.includes("O QUE FAÇO") ||
      pergunta.includes("O QUE FACO")
    ) {
      r += `ESTA TELA É O MÓDULO ${contexto}. USE OS CAMPOS DE BUSCA E CADASTROS PARA LOCALIZAR OS REGISTROS, CONFIRA OS DADOS E EXECUTE A AÇÃO PRINCIPAL DO MÓDULO.`;
    } else {
      r += `SUA PERGUNTA FOI: “${pergunta}”. NESTA VERSÃO A AJUDA IA LOCAL RESPONDE ÀS ROTINAS OPERACIONAIS CADASTRADAS. PARA RESPOSTAS GENERATIVAS LIVRES, A INTEGRAÇÃO DA IA EM NUVEM AINDA PRECISA SER CONECTADA NAS INTEGRAÇÕES.`;
    }
    setAnswer(r);
  }
  const preset = (t) => {
    setQ(t);
    responder(t);
  };
  return (
    <Modal title={`AJUDA IA — ${contexto}`} onClose={onClose} wide>
      <div className="transportBox">
        <h3>PERGUNTE À IA SOBRE ESTA TELA</h3>
        <div className="reportBar">
          <button
            className="ghost dark"
            onClick={() => preset("O QUE FAÇO NESTA TELA?")}
          >
            O QUE FAÇO NESTA TELA?
          </button>
          <button
            className="ghost dark"
            onClick={() => preset("COMO PREENCHER ESTE CAMPO?")}
          >
            COMO PREENCHER?
          </button>
          <button
            className="ghost dark"
            onClick={() => preset("POR QUE ESTE BOTÃO ESTÁ BLOQUEADO?")}
          >
            POR QUE ESTÁ BLOQUEADO?
          </button>
          <button
            className="ghost dark"
            onClick={() => preset("QUAL É O PRÓXIMO PASSO?")}
          >
            PRÓXIMO PASSO
          </button>
        </div>
        <textarea
          rows="4"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              responder();
            }
          }}
          placeholder="DIGITE SUA DÚVIDA SOBRE O FORTE VENDAS..."
        />
        <div className="modalActions">
          <button onClick={() => responder()}>PERGUNTAR À IA</button>
        </div>
        <div className="note">
          <b>RESPOSTA CONTEXTUAL</b>
          <br />
          {answer ||
            "DIGITE UMA PERGUNTA E CLIQUE EM PERGUNTAR À IA. ENTER TAMBÉM ENVIA; SHIFT+ENTER QUEBRA A LINHA."}
        </div>
        {action && (
          <div className="modalActions">
            <button
              className="secondary"
              onClick={() => onNavigate?.(action.tab)}
            >
              {action.label}
            </button>
          </div>
        )}
        <p className="muted">
          <b>STATUS:</b> AJUDA IA LOCAL OPERACIONAL ATIVA. IA GENERATIVA EM
          NUVEM: AGUARDANDO INTEGRAÇÃO.
        </p>
      </div>
    </Modal>
  );
}
function TodasCargas({ data }) {
  const [filtro, setFiltro] = useState("TODAS");
  const cargas = (data.cargas || []).slice().sort((a, b) =>
    String(b.criadaEm || b.dataCarregamento || "").localeCompare(String(a.criadaEm || a.dataCarregamento || ""))
  );
  const categoria = (c) => {
    const saldo = Number(c.qtdSemDestino ?? 0);
    if (c.planejamento && (saldo > 0 || !(c.vendaIds || []).length))
      return "SEM DESTINO";
    if (c.destinacao === "D" || c.destinoTipo === "D" || c.tipo === "DIRETA" || c.cargaDireta)
      return "DIRETA";
    return "PARA FORTE";
  };
  const visiveis = filtro === "TODAS" ? cargas : cargas.filter((c) => categoria(c) === filtro);
  return (
    <section className="card">
      <div className="sectionHead"><div><h2>TODAS AS CARGAS</h2><p>CONSULTA DE CARGAS PARA FORTE, SEM DESTINO E DIRETAS.</p></div></div>
      <div className="buttonRow">
        {["TODAS", "PARA FORTE", "SEM DESTINO", "DIRETA"].map((opcao) => (
          <button key={opcao} type="button" className={filtro === opcao ? "activeChoice" : "ghost dark"} onClick={() => setFiltro(opcao)}>{opcao}</button>
        ))}
      </div>
      <div className="cadList">
        {visiveis.length === 0 && <p>NENHUMA CARGA NESTA CATEGORIA.</p>}
        {visiveis.map((c) => (
          <div className="cadRow" key={c.id}>
            <div>
              <b>{c.codigo || c.numeroPedido || "CARGA SEM CÓDIGO"} • {c.marca || c.produto || "PRODUTO NÃO INFORMADO"}</b>
              <small>{categoria(c)} • {c.motorista || "MOTORISTA PENDENTE"} • {Number(c.qtd || 0)} SC • {c.fase || c.status || "PENDENTE"}</small>
            </div>
            <span>{c.status === "AZUL" || c.fase === "FINALIZADA" ? "FINALIZADA" : "PENDENTE"}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function PlanejamentoCargas({ data, onChange, currentUser }) {
  const [motoristaId, setMotoristaId] = useState("");
  const [fornecedorId, setFornecedorId] = useState("");
  const [produtoId, setProdutoId] = useState("");
  const [qtd, setQtd] = useState("");
  const [selecionada, setSelecionada] = useState("");
  function pedidoVoz() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR)
      return alert(
        "RECONHECIMENTO DE VOZ NÃO DISPONÍVEL NESTE NAVEGADOR. USE CHROME/EDGE OU O APP MOBILE.",
      );
    const r = new SR();
    r.lang = "pt-BR";
    r.interimResults = false;
    r.onresult = (e) => {
      const fala = e.results[0][0].transcript;
      const n = norm(fala);
      const nums = fala.match(/\d+/g) || [];
      if (nums.length) setQtd(nums[0]);
      const f = (data.fornecedores || []).find(
        (x) =>
          n.includes(norm(x.nome)) ||
          String(x.marcas || "")
            .split(",")
            .some((m) => m && n.includes(norm(m.trim()))),
      );
      if (f) setFornecedorId(f.id);
      const p = (data.produtos || []).find(
        (x) =>
          n.includes(norm(x.nome)) ||
          (n.includes(norm(x.marca)) &&
            norm(x.nome)
              .split(/\s+/)
              .some((t) => t.length > 2 && n.includes(t))),
      );
      if (p) setProdutoId(p.id);
      const m = (data.motoristas || []).find((x) =>
        norm(`${x.nome || ""} ${x.apelido || ""}`)
          .split(/\s+/)
          .some((t) => t.length > 3 && n.includes(t)),
      );
      if (m) setMotoristaId(m.id);
      alert(
        `IA OUVIU: ${fala}\n\nCONFIRA OS CAMPOS PREENCHIDOS ANTES DE CRIAR O PEDIDO.`,
      );
    };
    r.onerror = () =>
      alert("NÃO FOI POSSÍVEL CAPTURAR A VOZ. TENTE NOVAMENTE.");
    r.start();
  }
  const motoristas = (data.motoristas || []).filter(
      (x) => x.ativo !== false && motoristaServe(x, "TRANSPORTE"),
    ),
    fornecedores = (data.fornecedores || []).filter((x) => x.ativo !== false),
    produtos = (data.produtos || []).filter((x) => x.ativo !== false);
  const abertas = (data.cargas || []).filter(
    (c) => c.status !== "CANCELADA" && c.fase !== "FINALIZADA",
  );
  const pendentes = (data.vendas || []).filter((v) => v.status === "PENDENTE");
  function criar() {
    const m = motoristas.find((x) => x.id === motoristaId),
      f = fornecedores.find((x) => x.id === fornecedorId),
      p = produtos.find((x) => x.id === produtoId);
    if (!m || !f || !p || Number(qtd) <= 0)
      return alert("SELECIONE MOTORISTA, FORNECEDOR, PRODUTO E QUANTIDADE.");
    onChange((d) => {
      const seq = Number(d.settings?.nextCargaSeq || 1),
        codigo = `FC-${String(seq).padStart(4, "0")}`;
      const c = {
        id: uid("c"),
        codigo,
        vendaIds: [],
        marca: p.marca || f.nome,
        fornecedorId: f.id,
        produtoId: p.id,
        produto: p.nome,
        motoristaId: m.id,
        motorista: m.nome,
        placa: m.placa1,
        qtd: Number(qtd),
        pesoKg: Number(qtd) * Number(p.pesoKg || 0),
        qtdSemDestino: Number(qtd),
        status: "VERMELHO",
        fase: "AGUARDANDO DESTINAÇÃO",
        planejamento: true,
        criadaEm: nowISO(),
        criadaPor: currentUser?.nome || "",
      };
      return {
        ...d,
        settings: { ...d.settings, nextCargaSeq: seq + 1 },
        cargas: [...(d.cargas || []), c],
      };
    });
    setQtd("");
    alert("CARGA ANTECIPADA CRIADA. ELA PODE RECEBER VENDAS POSTERIORMENTE.");
  }
  function vincular(v) {
    const c = abertas.find((x) => x.id === selecionada);
    if (!c) return alert("SELECIONE UMA CARGA DISPONÍVEL.");
    if (c.produtoId && v.produtoId && c.produtoId !== v.produtoId)
      return alert("PRODUTO DA VENDA NÃO É COMPATÍVEL COM ESTA CARGA.");
    const ja = (c.vendaIds || []).includes(v.id);
    if (ja) return alert("VENDA JÁ VINCULADA.");
    const usado = (c.vendaIds || [])
      .map((id) => (data.vendas || []).find((x) => x.id === id))
      .filter(Boolean)
      .reduce((s, x) => s + Number(x.qtd || 0), 0);
    const disponivel = Number(c.qtd || 0) - usado;
    if (Number(v.qtd || 0) > disponivel)
      return alert(
        `SALDO INSUFICIENTE NA CARGA. DISPONÍVEL: ${disponivel} SACOS.`,
      );
    onChange((d) => ({
      ...d,
      cargas: d.cargas.map((x) =>
        x.id === c.id
          ? {
              ...x,
              vendaIds: [...(x.vendaIds || []), v.id],
              qtdSemDestino: disponivel - Number(v.qtd || 0),
              fase:
                disponivel - Number(v.qtd || 0) === 0
                  ? "TOTALMENTE DESTINADA"
                  : "PARCIALMENTE DESTINADA",
            }
          : x,
      ),
      vendas: d.vendas.map((x) =>
        x.id === v.id ? { ...x, status: "EM CARGA", cargaId: c.id } : x,
      ),
    }));
  }
  return (
    <section className="card">
      <div className="sectionHead">
        <div>
          <h2>PLANEJAMENTO DE CARGAS</h2>
          <p>
            COMPRE / CONTRATE ANTES DA VENDA E VINCULE AS DEMANDAS DEPOIS. CARGA
            FÍSICA FC E VENDA VEN PERMANECEM SEPARADAS E RASTREÁVEIS.
          </p>
        </div>
      </div>
      <div className="miniGrid">
        <Field label="MOTORISTA">
          <select
            value={motoristaId}
            onChange={(e) => setMotoristaId(e.target.value)}
          >
            <option value="">SELECIONE...</option>
            {motoristas.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nome}
                {x.apelido ? ` — ${x.apelido}` : ""} • {x.placa1}
              </option>
            ))}
          </select>
        </Field>
        <Field label="FORNECEDOR">
          <select
            value={fornecedorId}
            onChange={(e) => setFornecedorId(e.target.value)}
          >
            <option value="">SELECIONE...</option>
            {fornecedores.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nome}
              </option>
            ))}
          </select>
        </Field>
        <Field label="PRODUTO">
          <select
            value={produtoId}
            onChange={(e) => setProdutoId(e.target.value)}
          >
            <option value="">SELECIONE...</option>
            {produtos.map((x) => (
              <option key={x.id} value={x.id}>
                {x.marca} • {x.nome}
              </option>
            ))}
          </select>
        </Field>
        <Field label="QUANTIDADE (SACOS)">
          <input
            type="number"
            value={qtd}
            onChange={(e) => setQtd(e.target.value)}
          />
        </Field>
        <button className="secondary" onClick={pedidoVoz}>
          🎙 CRIAR PEDIDO POR VOZ – IA
        </button>
        <button onClick={criar}>CRIAR CARGA SEM DESTINO</button>
      </div>
      <h3>CARGAS DISPONÍVEIS / AGUARDANDO DESTINAÇÃO</h3>
      <div className="cadList">
        {abertas
          .filter((c) => c.planejamento || c.fase?.includes("DESTIN"))
          .map((c) => (
            <div className="cadRow" key={c.id}>
              <div>
                <b>
                  {c.codigo} • {c.produto || c.marca}
                </b>
                <small>
                  {c.motorista} • {c.qtd} SC • SALDO SEM DESTINO:{" "}
                  {c.qtdSemDestino ?? c.qtd} SC • {c.fase}
                </small>
              </div>
              <button
                className={selecionada === c.id ? "activeChoice" : "ghost dark"}
                onClick={() => setSelecionada(c.id)}
              >
                SELECIONAR
              </button>
            </div>
          ))}
      </div>
      <h3>VENDAS PENDENTES COMPATÍVEIS</h3>
      <div className="cadList">
        {pendentes
          .slice()
          .sort((a, b) =>
            String(opDate(a) || "").localeCompare(String(opDate(b) || "")),
          )
          .map((v) => (
            <div className="cadRow" key={v.id}>
              <div>
                <b>
                  {v.numeroVenda || "SEM Nº"} • {v.cliente}
                </b>
                <small>
                  {opDate(v) || "-"} • {v.produto} • {v.qtd} SC • {v.destino}
                </small>
              </div>
              <button disabled={!selecionada} onClick={() => vincular(v)}>
                VINCULAR À CARGA
              </button>
            </div>
          ))}
      </div>
    </section>
  );
}

function Relatorios({ data }) {
  const [inicio, setInicio] = useState(todayISO());
  const [fim, setFim] = useState(todayISO());
  const [unidadeEstoque, setUnidadeEstoque] = useState(
    data.unidades?.[1]?.nome || data.unidades?.[0]?.nome || "",
  );
  const [marcaEstoque, setMarcaEstoque] = useState("");
  const [produtoEstoqueId, setProdutoEstoqueId] = useState("");
  const by = (rows, getter = rawDate) =>
    (rows || []).filter((x) => inPeriod(x, inicio, fim, getter));
  const pend = by(
    (data.vendas || []).filter((x) => x.status !== "CONCLUÍDA"),
    (x) => String(x.dataOperacao || x.data || x.criadaEm || "").slice(0, 10),
  )
    .slice()
    .sort((a, b) =>
      String(opDate(a) || "").localeCompare(String(opDate(b) || "")),
    );
  const pagar = by(data.contasPagar || [], (x) => x.vencimento)
    .slice()
    .sort((a, b) =>
      String(a.vencimento || "").localeCompare(String(b.vencimento || "")),
    );
  const receber = by(data.contasReceber || [], (x) => x.vencimento)
    .slice()
    .sort((a, b) =>
      String(a.vencimento || "").localeCompare(String(b.vencimento || "")),
    );
  const cargas = by(data.cargas || [], (x) =>
    String(x.criadaEm || x.dataCarregamento || x.data || "").slice(0, 10),
  );
  const vendasBalcao = by(data.vendasBalcao || [], (x) =>
    String(x.dataOperacao || x.data || x.criadoEm || "").slice(0, 10),
  ).filter((x) => x.status !== "ORÇAMENTO");
  const vendasExternas = by(data.vendasExternas || [], (x) =>
    String(x.dataOperacao || x.data || x.criadoEm || "").slice(0, 10),
  );
  const caixas = by(
    data.caixasBalcao || [],
    (x) => x.data || String(x.abertoEm || "").slice(0, 10),
  );
  const paletes = by(
    [
      ...(data.palletPatrimonio || []),
      ...(data.palletClientes || []),
      ...(data.palletFornecedores || []),
    ],
    (x) => String(x.dataHora || x.data || "").slice(0, 10),
  );
  const estoque = by(data.estoqueMovimentos || data.estoqueMov || [], (x) =>
    String(x.dataHora || x.data || "").slice(0, 10),
  );
  const auditoria = by(data.auditoria || [], (x) =>
    String(x.dataHora || "").slice(0, 10),
  );
  const label = periodLabel(inicio, fim);
  const sufixo = `${inicio || "INICIO"}-${fim || "FIM"}`;
  const marcasEstoque = [
    ...new Set(
      (data.produtos || [])
        .filter((p) => p.ativo !== false)
        .map((p) => p.marca)
        .filter(Boolean),
    ),
  ].sort();
  const produtoEstoque = (data.produtos || []).find(
    (p) => p.id === produtoEstoqueId,
  );
  const ledgerCompleto = produtoEstoqueId
    ? buildStockLedger(data, unidadeEstoque, produtoEstoqueId)
    : [];
  const ledgerProduto = ledgerCompleto.filter((x) =>
    inPeriod(x, inicio, fim, (z) =>
      String(z.dataHora || z.data || "").slice(0, 10),
    ),
  );
  const saldoAnterior = (() => {
    if (!produtoEstoqueId || !inicio) return null;
    const anteriores = ledgerCompleto.filter(
      (x) => String(x.dataHora || x.data || "").slice(0, 10) < inicio,
    );
    return anteriores[anteriores.length - 1] || null;
  })();
  const entradasProduto = ledgerProduto.reduce(
    (a, x) => a + Number(x.entrada || 0),
    0,
  );
  const saidasProduto = ledgerProduto.reduce(
    (a, x) => a + Number(x.saida || 0),
    0,
  );
  const saldoFinalProduto = ledgerProduto.length
    ? ledgerProduto[ledgerProduto.length - 1].saldo
    : saldoAnterior?.saldo || 0;
  const custoMedioFinal = ledgerProduto.length
    ? ledgerProduto[ledgerProduto.length - 1].custoMedio
    : saldoAnterior?.custoMedio || 0;
  const extratoPdfRows = [
    ...(saldoAnterior
      ? [
          {
            id: "saldo-anterior",
            data: inicio,
            tipo: "SALDO ANTERIOR",
            referencia: "-",
            entrada: 0,
            saida: 0,
            saldo: saldoAnterior.saldo,
            custoMedio: saldoAnterior.custoMedio,
          },
        ]
      : []),
    ...ledgerProduto,
  ];
  function gerarExtratoProdutoPDF() {
    if (!produtoEstoque)
      return alert("SELECIONE UM PRODUTO PARA GERAR O EXTRATO.");
    pdfTabela(
      `EXTRATO DE ESTOQUE — ${produtoEstoque.marca} — ${produtoEstoque.nome} — ${label}`,
      [
        {
          label: "DATA",
          w: 0.8,
          get: (x) =>
            x.id === "saldo-anterior"
              ? `ANT. ${formatDateBR(inicio)}`
              : formatDateBR(x.dataHora || x.data),
        },
        { label: "DOCUMENTO", w: 1.4, get: (x) => x.referencia || "-" },
        { label: "MOVIMENTO", w: 1.8, get: (x) => x.tipo || "-" },
        {
          label: "ENTRADA",
          w: 0.75,
          get: (x) => (x.entrada ? `${x.entrada} SC` : "-"),
        },
        {
          label: "SAÍDA",
          w: 0.75,
          get: (x) => (x.saida ? `${x.saida} SC` : "-"),
        },
        { label: "SALDO", w: 0.75, get: (x) => `${Number(x.saldo || 0)} SC` },
        {
          label: "CUSTO MÉDIO PONDERADO",
          w: 1.35,
          get: (x) => money(x.custoMedio || 0),
        },
      ],
      extratoPdfRows,
      `EXTRATO-ESTOQUE-${produtoEstoque.id}-${sufixo}.pdf`,
      [
        `ESTOQUE: SALDO ÚNICO FORTE ATACAREJO • DESTINO DE REFERÊNCIA: ${unidadeEstoque}`,
        `PERÍODO: ${label}`,
        `ENTRADAS: ${entradasProduto} SC • SAÍDAS: ${saidasProduto} SC • SALDO FINAL: ${saldoFinalProduto} SC`,
        `CUSTO MÉDIO PONDERADO FINAL: ${money(custoMedioFinal)}`,
      ],
    );
  }
  const tipos = [
    [
      "VENDAS PENDENTES",
      () =>
        pdfTabela(
          `RELATÓRIO — VENDAS PENDENTES — ${label}`,
          [
            { label: "DATA", w: 0.7, get: (x) => opDate(x) || "-" },
            { label: "Nº VENDA", w: 1, get: (x) => x.numeroVenda || "SEM Nº" },
            { label: "CLIENTE", w: 1.5, key: "cliente" },
            { label: "PRODUTO", w: 1.8, key: "produto" },
            { label: "QTD", w: 0.55, get: (x) => `${x.qtd || 0} SC` },
            { label: "DESTINO", w: 1.2, get: (x) => x.destino || "-" },
            {
              label: "PAGAMENTO",
              w: 0.9,
              get: (x) => x.condicaoPagamento || "-",
            },
            { label: "STATUS", w: 0.8, get: (x) => x.status || "-" },
          ],
          pend,
          `RELATORIO-VENDAS-PENDENTES-${sufixo}.pdf`,
          [
            `PERÍODO: ${label}`,
            `TOTAL PENDENTE: ${pend.length} VENDA(S) • ${pend.reduce((s, x) => s + Number(x.qtd || 0), 0)} SACOS`,
          ],
        ),
    ],
    [
      "VENDA BALCÃO",
      () =>
        pdfTabela(
          `RELATÓRIO — VENDA BALCÃO — ${label}`,
          [
            { label: "DATA", w: 0.7, get: (x) => opDate(x) || "-" },
            { label: "Nº VENDA", w: 1, get: (x) => x.numeroVenda || "-" },
            { label: "UNIDADE", w: 1.2, get: (x) => x.unidade || "-" },
            { label: "CLIENTE", w: 1.5, get: (x) => x.cliente || "-" },
            { label: "PAGAMENTO", w: 1, get: (x) => x.pagamento || "-" },
            { label: "TOTAL", w: 0.9, get: (x) => money(x.total || 0) },
            { label: "STATUS", w: 0.8, get: (x) => x.status || "-" },
          ],
          vendasBalcao,
          `RELATORIO-VENDA-BALCAO-${sufixo}.pdf`,
          [
            `PERÍODO: ${label}`,
            `TOTAL VENDIDO: ${money(vendasBalcao.reduce((s, x) => s + Number(x.total || 0), 0))}`,
          ],
        ),
    ],
    [
      "CAIXAS",
      () =>
        pdfTabela(
          `RELATÓRIO — CAIXAS — ${label}`,
          [
            { label: "DATA", w: 0.8, get: (x) => formatDateBR(x.data) || "-" },
            { label: "UNIDADE", w: 1.4, get: (x) => x.unidade || "-" },
            { label: "OPERADOR", w: 1.3, get: (x) => x.operador || "-" },
            {
              label: "ABERTURA",
              w: 1.4,
              get: (x) =>
                x.abertoEm ? new Date(x.abertoEm).toLocaleString("pt-BR") : "-",
            },
            {
              label: "FECHAMENTO",
              w: 1.4,
              get: (x) =>
                x.fechadoEm
                  ? new Date(x.fechadoEm).toLocaleString("pt-BR")
                  : "-",
            },
            {
              label: "SALDO INICIAL",
              w: 1,
              get: (x) => money(x.saldoInicial || 0),
            },
            { label: "VENDAS", w: 1, get: (x) => money(x.totalVendas || 0) },
            { label: "STATUS", w: 0.8, get: (x) => x.status || "-" },
          ],
          caixas,
          `RELATORIO-CAIXAS-${sufixo}.pdf`,
          [
            `PERÍODO: ${label}`,
            `TOTAL DE VENDAS NOS CAIXAS: ${money(caixas.reduce((s, x) => s + Number(x.totalVendas || 0), 0))}`,
          ],
        ),
    ],
    [
      "VENDAS EXTERNAS",
      () =>
        pdfTabela(
          `RELATÓRIO — VENDAS EXTERNAS — ${label}`,
          [
            { label: "DATA", w: 0.8, get: (x) => opDate(x) || "-" },
            { label: "VENDEDOR", w: 1.3, get: (x) => x.vendedor || "-" },
            { label: "CLIENTE", w: 1.5, get: (x) => x.cliente || "-" },
            { label: "DESTINO", w: 1.5, get: (x) => x.destino || "-" },
            { label: "TOTAL", w: 1, get: (x) => money(x.total || 0) },
            { label: "COMISSÃO", w: 1, get: (x) => money(x.comissao || 0) },
            { label: "STATUS", w: 1, get: (x) => x.status || "-" },
          ],
          vendasExternas,
          `RELATORIO-VENDAS-EXTERNAS-${sufixo}.pdf`,
          [
            `PERÍODO: ${label}`,
            `TOTAL: ${money(vendasExternas.reduce((s, x) => s + Number(x.total || 0), 0))}`,
            `COMISSÕES: ${money(vendasExternas.reduce((s, x) => s + Number(x.comissao || 0), 0))}`,
          ],
        ),
    ],
    [
      "CONTAS A PAGAR",
      () =>
        pdfTabela(
          `RELATÓRIO — CONTAS A PAGAR — ${label}`,
          [
            {
              label: "VENCIMENTO",
              w: 0.8,
              get: (x) => formatDateBR(x.vencimento) || x.vencimento || "-",
            },
            { label: "FORNECEDOR", w: 1.35, get: (x) => x.fornecedor || "-" },
            {
              label: "NF / TÍTULO",
              w: 1.05,
              get: (x) => x.titulo || x.nf || "-",
            },
            {
              label: "PEDIDO FORN.",
              w: 1,
              get: (x) => x.numeroPedidoFornecedor || x.pedidoFornecedor || "-",
            },
            { label: "CARGA", w: 0.8, get: (x) => x.carga || x.cargaId || "-" },
            { label: "VALOR", w: 0.85, get: (x) => money(x.valor || 0) },
            { label: "STATUS", w: 0.8, get: (x) => x.status || "ABERTO" },
            {
              label: "LIQUIDAÇÃO",
              w: 1.1,
              get: (x) =>
                x.pagoEm ? new Date(x.pagoEm).toLocaleDateString("pt-BR") : "-",
            },
          ],
          pagar,
          `RELATORIO-CONTAS-A-PAGAR-${sufixo}.pdf`,
          [
            `PERÍODO: ${label}`,
            `TOTAL GERAL: ${money(pagar.reduce((s, x) => s + Number(x.valor || 0), 0))}`,
            `TOTAL EM ABERTO: ${money(pagar.filter((x) => !upper(x.status).includes("PAGO") && !upper(x.status).includes("LIQUIDADO")).reduce((s, x) => s + Number(x.valor || 0), 0))}`,
          ],
        ),
    ],
    [
      "CONTAS A RECEBER",
      () =>
        pdfTabela(
          `RELATÓRIO — CONTAS A RECEBER — ${label}`,
          [
            {
              label: "VENCIMENTO",
              w: 0.8,
              get: (x) => formatDateBR(x.vencimento) || x.vencimento || "-",
            },
            {
              label: "CLIENTE",
              w: 1.4,
              get: (x) => x.cliente || x.origem || "-",
            },
            { label: "Nº VENDA", w: 1, get: (x) => x.numeroVenda || "-" },
            { label: "NF / TÍTULO", w: 1, get: (x) => x.titulo || x.nf || "-" },
            { label: "VALOR", w: 0.9, get: (x) => money(x.valor || 0) },
            { label: "STATUS", w: 0.8, get: (x) => x.status || "ABERTO" },
            {
              label: "RECEBIMENTO",
              w: 1,
              get: (x) =>
                x.recebidoEm
                  ? new Date(x.recebidoEm).toLocaleDateString("pt-BR")
                  : "-",
            },
          ],
          receber,
          `RELATORIO-CONTAS-A-RECEBER-${sufixo}.pdf`,
          [
            `PERÍODO: ${label}`,
            `TOTAL GERAL: ${money(receber.reduce((s, x) => s + Number(x.valor || 0), 0))}`,
          ],
        ),
    ],
    [
      "CARGAS",
      () =>
        pdfTabela(
          `RELATÓRIO — CARGAS — ${label}`,
          [
            {
              label: "DATA",
              w: 0.7,
              get: (x) =>
                opDate(x) ||
                formatDateBR(String(x.criadaEm || "").slice(0, 10)) ||
                "-",
            },
            { label: "CARGA", w: 0.8, key: "codigo" },
            {
              label: "PEDIDO FORN.",
              w: 1,
              get: (x) => x.numeroPedidoFornecedor || "-",
            },
            { label: "MOTORISTA", w: 1.4, get: (x) => x.motorista || "-" },
            { label: "MARCA", w: 1, get: (x) => x.marca || "-" },
            {
              label: "PESO",
              w: 0.7,
              get: (x) => `${(Number(x.pesoKg || 0) / 1000).toFixed(2)} T`,
            },
            {
              label: "FASE / STATUS",
              w: 1.4,
              get: (x) => x.fase || x.status || "-",
            },
          ],
          cargas,
          `RELATORIO-CARGAS-${sufixo}.pdf`,
          [`PERÍODO: ${label}`, `TOTAL DE CARGAS: ${cargas.length}`],
        ),
    ],
    [
      "PALETES",
      () =>
        pdfSimple(
          `RELATÓRIO — PALETES — ${label}`,
          [
            `PERÍODO: ${label}`,
            ...paletes.map(
              (x) =>
                `${formatDateBR(x.dataHora || x.data)} | ${x.nome || "FORTE"} | ${x.origem || "-"} | ${x.movimento || "-"} | ${x.quantidade || 0} | ${x.documento || "-"}`,
            ),
          ],
          `RELATORIO-PALETES-${sufixo}.pdf`,
        ),
    ],
    [
      "ESTOQUE / MOVIMENTAÇÃO",
      () =>
        pdfSimple(
          `RELATÓRIO — MOVIMENTAÇÃO DE ESTOQUE — ${label}`,
          [
            `PERÍODO: ${label}`,
            ...estoque.map(
              (x) =>
                `${formatDateBR(x.dataHora || x.data)} | ${x.unidade || "-"} | ${x.marca || "-"} | ${x.produto || "-"} | ${x.tipo || x.movimento || "-"} | ${x.quantidade || 0} | ${x.referencia || "-"}`,
            ),
          ],
          `RELATORIO-ESTOQUE-${sufixo}.pdf`,
        ),
    ],
    [
      "AUDITORIA",
      () =>
        pdfSimple(
          `RELATÓRIO — AUDITORIA — ${label}`,
          [
            `PERÍODO: ${label}`,
            ...auditoria.map(
              (x) =>
                `${x.dataHora ? new Date(x.dataHora).toLocaleString("pt-BR") : "-"} | ${x.usuario || "-"} | ${x.acao || "-"} | ${x.cargaId || "-"} | ${x.detalhe || "-"}`,
            ),
          ],
          `RELATORIO-AUDITORIA-${sufixo}.pdf`,
        ),
    ],
  ];
  return (
    <section className="card">
      <div className="sectionHead">
        <div>
          <h2>CENTRAL DE RELATÓRIOS</h2>
          <p>
            TODOS OS RELATÓRIOS PODEM SER CONSULTADOS POR UM ÚNICO DIA OU POR
            INTERVALO DE DATAS.
          </p>
        </div>
      </div>
      <div className="transportBox">
        <h3>PERÍODO DO RELATÓRIO</h3>
        <div className="reportBar">
          <label>
            DE{" "}
            <input
              type="date"
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
            />
          </label>
          <label>
            ATÉ{" "}
            <input
              type="date"
              value={fim}
              onChange={(e) => setFim(e.target.value)}
            />
          </label>
          <button
            className="ghost dark"
            onClick={() => {
              setInicio(todayISO());
              setFim(todayISO());
            }}
          >
            HOJE
          </button>
          <button
            className="ghost dark"
            onClick={() => {
              const d = new Date();
              d.setDate(d.getDate() - 1);
              const v = d.toISOString().slice(0, 10);
              setInicio(v);
              setFim(v);
            }}
          >
            ONTEM
          </button>
          <button
            className="ghost dark"
            onClick={() => {
              const d = new Date();
              setInicio(
                `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`,
              );
              setFim(todayISO());
            }}
          >
            ESTE MÊS
          </button>
          <button
            className="ghost dark"
            onClick={() => {
              setInicio("");
              setFim("");
            }}
          >
            TODO HISTÓRICO
          </button>
        </div>
        <p className="note">
          <b>PERÍODO SELECIONADO:</b> {label}. Para consultar somente o dia 17,
          escolha dia 17 nos dois campos.
        </p>
      </div>
      <div className="transportBox">
        <div className="sectionHead">
          <div>
            <h3>RELATÓRIO DE ESTOQUE POR PRODUTO</h3>
            <p>
              SELECIONE O PRODUTO PARA VER O EXTRATO COMPLETO EM TELA: ENTRADAS,
              SAÍDAS, SALDO E CUSTO MÉDIO PONDERADO.
            </p>
          </div>
          {produtoEstoque && (
            <button onClick={gerarExtratoProdutoPDF}>
              IMPRIMIR EXTRATO EM PDF
            </button>
          )}
        </div>
        <div className="miniGrid">
          <Field label="DESTINO INFORMATIVO (SALDO ÚNICO)">
            <select
              value={unidadeEstoque}
              onChange={(e) => setUnidadeEstoque(e.target.value)}
            >
              {(data.unidades || []).map((u) => (
                <option key={u.id}>{u.nome}</option>
              ))}
            </select>
          </Field>
          <Field label="MARCA / FORNECEDOR">
            <select
              value={marcaEstoque}
              onChange={(e) => {
                setMarcaEstoque(e.target.value);
                setProdutoEstoqueId("");
              }}
            >
              <option value="">TODAS / SELECIONE...</option>
              {marcasEstoque.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </Field>
          <Field label="PRODUTO">
            <select
              value={produtoEstoqueId}
              onChange={(e) => setProdutoEstoqueId(e.target.value)}
            >
              <option value="">SELECIONE O PRODUTO...</option>
              {(data.produtos || [])
                .filter(
                  (p) =>
                    p.ativo !== false &&
                    (!marcaEstoque || p.marca === marcaEstoque),
                )
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.marca} • {p.nome}
                  </option>
                ))}
            </select>
          </Field>
        </div>
        {produtoEstoque && (
          <>
            <div className="palletSummary four">
              <div>
                <b>ENTRADAS NO PERÍODO</b>
                <strong>{entradasProduto} SC</strong>
              </div>
              <div>
                <b>SAÍDAS NO PERÍODO</b>
                <strong>{saidasProduto} SC</strong>
              </div>
              <div>
                <b>SALDO FINAL</b>
                <strong>{saldoFinalProduto} SC</strong>
              </div>
              <div>
                <b>CUSTO MÉDIO PONDERADO</b>
                <strong>{money(custoMedioFinal)}</strong>
              </div>
            </div>
            <div className="stockReportLedger">
              <b>DATA</b>
              <b>DOCUMENTO / REFERÊNCIA</b>
              <b>MOVIMENTO</b>
              <b>ENTRADA</b>
              <b>SAÍDA</b>
              <b>SALDO</b>
              <b>CUSTO MÉDIO PONDERADO</b>
              {saldoAnterior && (
                <div className="rowContents stockOpening">
                  <span>ANT. {formatDateBR(inicio)}</span>
                  <span>-</span>
                  <span>SALDO ANTERIOR</span>
                  <span>-</span>
                  <span>-</span>
                  <strong>{saldoAnterior.saldo} SC</strong>
                  <strong>{money(saldoAnterior.custoMedio)}</strong>
                </div>
              )}
              {ledgerProduto.map((x) => (
                <div className="rowContents" key={x.id}>
                  <span>{formatDateBR(x.dataHora || x.data)}</span>
                  <span>{x.referencia || "-"}</span>
                  <span>{x.tipo || "-"}</span>
                  <b>{x.entrada ? `${x.entrada} SC` : "-"}</b>
                  <b>{x.saida ? `${x.saida} SC` : "-"}</b>
                  <strong>{x.saldo} SC</strong>
                  <strong>{money(x.custoMedio)}</strong>
                </div>
              ))}
            </div>
            {ledgerProduto.length === 0 && !saldoAnterior && (
              <p className="muted">
                NENHUMA MOVIMENTAÇÃO ENCONTRADA PARA ESTE PRODUTO NO PERÍODO
                SELECIONADO.
              </p>
            )}
          </>
        )}
      </div>
      <div className="cadGrid">
        {tipos.map(([nome, gerar]) => (
          <button key={nome} onClick={gerar}>
            <b>{nome}</b>
            <small>GERAR PDF DO PERÍODO</small>
          </button>
        ))}
      </div>
    </section>
  );
}

function Pallets({ data, onChange, audit }) {
  const [tipo, setTipo] = useState("FORNECEDOR");
  const [nome, setNome] = useState("");
  const [origem, setOrigem] = useState("");
  const [qtd, setQtd] = useState("");
  const [mov, setMov] = useState("ENTRADA");
  const [doc, setDoc] = useState("");
  const all = [
    ...(data.palletPatrimonio || []).map((x) => ({
      ...x,
      conta: "PATRIMÔNIO FORTE",
    })),
    ...(data.palletClientes || []).map((x) => ({ ...x, conta: "CLIENTE" })),
    ...(data.palletFornecedores || []).map((x) => ({
      ...x,
      conta: "FORNECEDOR",
    })),
  ].sort((a, b) =>
    String(a.dataHora || "").localeCompare(String(b.dataHora || "")),
  );
  function signed(x) {
    const m = upper(x.movimento);
    return m.includes("DEVOLU") || m.includes("SAÍDA") || m.includes("VENDA")
      ? -Number(x.quantidade || 0)
      : Number(x.quantidade || 0);
  }
  const patrimonio = (data.palletPatrimonio || []).reduce(
    (a, x) => a + signed(x),
    0,
  );
  const cli = data.palletClientes || [],
    forn = data.palletFornecedores || [];
  const saldoCliente = (n) =>
    cli.filter((x) => x.nome === n).reduce((a, x) => a + signed(x), 0);
  const saldoFornecedor = (n) =>
    forn.filter((x) => x.nome === n).reduce((a, x) => a + signed(x), 0);
  const clientes = [...new Set(cli.map((x) => x.nome))],
    fornecedores = [...new Set(forn.map((x) => x.nome))];
  function registrar() {
    if (!qtd || Number(qtd) <= 0)
      return alert("INFORME A QUANTIDADE DE PALETES.");
    if (tipo !== "PATRIMÔNIO" && !nome) return alert("SELECIONE A CONTA.");
    const item = {
      id: uid("pal"),
      nome: upper(nome || "FORTE ATACAREJO"),
      origem: upper(origem || nome || "PATRIMÔNIO FORTE"),
      quantidade: Number(qtd),
      movimento: mov,
      documento: upper(doc),
      dataHora: new Date().toISOString(),
    };
    onChange((d) =>
      tipo === "PATRIMÔNIO"
        ? { ...d, palletPatrimonio: [...(d.palletPatrimonio || []), item] }
        : tipo === "CLIENTE"
          ? { ...d, palletClientes: [...(d.palletClientes || []), item] }
          : {
              ...d,
              palletFornecedores: [...(d.palletFornecedores || []), item],
            },
    );
    audit("MOVIMENTAÇÃO DE PALETES", "", `${tipo} ${nome} ${mov} ${qtd}`);
    setQtd("");
    setDoc("");
    alert("MOVIMENTAÇÃO DE PALETES REGISTRADA NO CONTA-CORRENTE.");
  }
  function ledger(rows, key) {
    let saldo = 0;
    return rows
      .filter((x) => !key || x.nome === key)
      .slice()
      .sort((a, b) => String(a.dataHora).localeCompare(String(b.dataHora)))
      .map((x) => ({ ...x, saldo: (saldo += signed(x)) }));
  }
  const fornecedorLedger = ledger(
      forn,
      nome && tipo === "FORNECEDOR" ? nome : null,
    ),
    clienteLedger = ledger(cli, nome && tipo === "CLIENTE" ? nome : null);
  const shown =
    tipo === "FORNECEDOR"
      ? fornecedorLedger
      : tipo === "CLIENTE"
        ? clienteLedger
        : ledger(data.palletPatrimonio || []);
  return (
    <section className="card">
      <div className="sectionHead">
        <div>
          <h2>PALETES — CONTA-CORRENTE</h2>
          <p>
            FORNECEDOR → FORTE → CLIENTE → COLETA → FORTE → DEVOLUÇÃO AO
            FORNECEDOR.
          </p>
        </div>
        <button
          onClick={() =>
            pdfSimple(
              "RELATÓRIO DE PALETES",
              all.map(
                (x) =>
                  `${new Date(x.dataHora).toLocaleString("pt-BR")} | ${x.conta} | ${x.nome} | ${x.origem || "-"} | ${x.movimento} | ${x.quantidade} | ${x.documento || "-"}`,
              ),
              "RELATORIO-PALETES.pdf",
            )
          }
        >
          GERAR RELATÓRIO PDF
        </button>
      </div>
      <div className="palletSummary four">
        <div>
          <b>PATRIMÔNIO PRÓPRIO FORTE</b>
          <strong>{patrimonio} PALLET(S)</strong>
        </div>
        <div>
          <b>COM CLIENTES</b>
          <strong>
            {clientes.reduce((a, n) => a + saldoCliente(n), 0)} PALLET(S)
          </strong>
        </div>
        <div>
          <b>DEVIDO A FORNECEDORES</b>
          <strong>
            {fornecedores.reduce((a, n) => a + saldoFornecedor(n), 0)} PALLET(S)
          </strong>
        </div>
        <div>
          <b>FORNECEDORES COM SALDO</b>
          <strong>
            {fornecedores.filter((n) => saldoFornecedor(n) !== 0).length}
          </strong>
        </div>
      </div>
      <h3>NOVA MOVIMENTAÇÃO</h3>
      <div className="palletForm ledgerForm">
        <Field label="CONTA">
          <select
            value={tipo}
            onChange={(e) => {
              setTipo(e.target.value);
              setNome("");
            }}
          >
            <option value="PATRIMÔNIO">PATRIMÔNIO FORTE</option>
            <option value="CLIENTE">CLIENTE / COMODATO</option>
            <option value="FORNECEDOR">FORNECEDOR / OBRIGAÇÃO</option>
          </select>
        </Field>
        {tipo !== "PATRIMÔNIO" && (
          <Field label={tipo}>
            <select value={nome} onChange={(e) => setNome(e.target.value)}>
              <option value="">SELECIONE...</option>
              {(tipo === "CLIENTE"
                ? data.clientes || []
                : data.fornecedores || []
              )
                .filter((x) => x.ativo !== false)
                .map((x) => (
                  <option key={x.id}>{x.nome}</option>
                ))}
            </select>
          </Field>
        )}
        <Field label="ORIGEM / FORNECEDOR DO PALLET">
          <UpperInput
            value={origem}
            onChange={setOrigem}
            placeholder="EX.: NACIONAL / CSN / PATRIMÔNIO FORTE"
          />
        </Field>
        <Field label="MOVIMENTO">
          <select value={mov} onChange={(e) => setMov(e.target.value)}>
            <option>ENTRADA</option>
            <option>EMPRÉSTIMO</option>
            <option>DEVOLUÇÃO</option>
            <option>SAÍDA / VENDA</option>
          </select>
        </Field>
        <Field label="QUANTIDADE">
          <input
            type="number"
            min="1"
            value={qtd}
            onChange={(e) => setQtd(e.target.value)}
          />
        </Field>
        <Field label="NF / CARGA / PROTOCOLO">
          <UpperInput value={doc} onChange={setDoc} />
        </Field>
        <button onClick={registrar}>REGISTRAR</button>
      </div>
      <div className="palletColumns">
        <div>
          <h3>CONTA-CORRENTE POR CLIENTE</h3>
          {clientes.map((n) => (
            <div className="palletRow" key={n}>
              <b>{n}</b>
              <span>SALDO: {saldoCliente(n)} PALLET(S)</span>
              <button
                className="ghost dark"
                onClick={() => {
                  setTipo("CLIENTE");
                  setNome(n);
                  setMov("DEVOLUÇÃO");
                }}
              >
                GERAR COLETA
              </button>
            </div>
          ))}
        </div>
        <div>
          <h3>CONTA-CORRENTE POR FORNECEDOR</h3>
          {fornecedores.map((n) => (
            <div className="palletRow" key={n}>
              <b>{n}</b>
              <span>SALDO FORTE DEVEDORA: {saldoFornecedor(n)} PALLET(S)</span>
              <button
                className="ghost dark"
                onClick={() => {
                  setTipo("FORNECEDOR");
                  setNome(n);
                  setMov("DEVOLUÇÃO");
                }}
              >
                DEVOLVER / BAIXAR
              </button>
            </div>
          ))}
        </div>
      </div>
      <div className="transportBox">
        <h3>EXTRATO DA CONTA SELECIONADA</h3>
        <div className="palletLedger">
          <b>DATA/HORA</b>
          <b>CONTA</b>
          <b>ORIGEM</b>
          <b>MOVIMENTO</b>
          <b>ENTRADA/SAÍDA</b>
          <b>SALDO</b>
          <b>DOCUMENTO</b>
          {shown.map((x) => (
            <div className="rowContents" key={x.id}>
              <span>{new Date(x.dataHora).toLocaleString("pt-BR")}</span>
              <span>{x.nome}</span>
              <span>{x.origem || "-"}</span>
              <span>{x.movimento}</span>
              <span>
                {signed(x) > 0
                  ? `+${Math.abs(signed(x))}`
                  : `-${Math.abs(signed(x))}`}
              </span>
              <strong>{x.saldo}</strong>
              <span>{x.documento || "-"}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
