import { useMemo, useState } from "react";

const norm = (v) => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const money = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const allSales = (data) => [...(data.vendas || []), ...(data.vendasBalcao || []), ...(data.vendasExternas || [])];

export function SalesPanel({ data }) {
  const [query, setQuery] = useState("");
  const [unit, setUnit] = useState("");
  const rows = useMemo(() => allSales(data).filter((v) => {
    const hay = [v.numeroVenda, v.cliente, v.nomeFantasia, v.documento, v.nf, v.numeroPedido, v.produto, v.cidade, v.vendedor].map(norm).join(" ");
    return (!query || hay.includes(norm(query))) && (!unit || v.unidade === unit);
  }), [data, query, unit]);
  const totals = rows.reduce((a, v) => {
    const sale = Number(v.total || v.valorTotal || (Number(v.qtd || 0) * Number(v.precoVenda || v.precoUnitario || 0)));
    const cost = Number(v.custoTotal || (Number(v.qtd || 0) * Number(v.custoCompraUnitario || v.custoUnitario || 0)));
    const freight = Number(v.freteTotal || v.frete || 0);
    a.sales += sale; a.cost += cost; a.freight += freight; return a;
  }, { sales: 0, cost: 0, freight: 0 });
  const profit = totals.sales - totals.cost - totals.freight;
  const exportCsv = () => {
    const head = ["Venda","Data","Cliente","Cidade","Vendedor","Produto","Quantidade","Custo","Venda","Frete","Total","Lucro","Status"];
    const body = rows.map(v => {
      const total = Number(v.total || v.valorTotal || 0), cost = Number(v.custoTotal || 0), freight = Number(v.freteTotal || v.frete || 0);
      return [v.numeroVenda || v.id, v.data || v.criadoEm, v.cliente || v.nomeFantasia, v.cidade, v.vendedor, v.produto, v.qtd, cost, v.precoVenda || v.precoUnitario, freight, total, total-cost-freight, v.status];
    });
    const csv = [head, ...body].map(r => r.map(x => `"${String(x ?? "").replaceAll('"','""')}"`).join(";")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\ufeff"+csv], {type:"text/csv"})); a.download = "painel-vendas.csv"; a.click(); URL.revokeObjectURL(a.href);
  };
  return <section className="card salesPanel"><div className="sectionHead"><div><h2>PAINEL DE VENDAS</h2><p>UMA VENDA POR LINHA • VISÃO GERENCIAL</p></div><button onClick={exportCsv}>EXPORTAR CSV / EXCEL</button></div>
    <div className="salesFilters"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar venda, cliente, CPF/CNPJ, NF, pedido ou produto"/><select value={unit} onChange={e=>setUnit(e.target.value)}><option value="">TODAS AS UNIDADES</option>{[...new Set(allSales(data).map(v=>v.unidade).filter(Boolean))].map(x=><option key={x}>{x}</option>)}</select></div>
    <div className="salesKpis"><div><small>VENDAS</small><b>{money(totals.sales)}</b></div><div><small>CUSTO</small><b>{money(totals.cost)}</b></div><div><small>FRETE</small><b>{money(totals.freight)}</b></div><div><small>LUCRO</small><b>{money(profit)}</b></div><div><small>MARGEM</small><b>{totals.sales ? (profit/totals.sales*100).toFixed(2) : "0,00"}%</b></div><div><small>REGISTROS</small><b>{rows.length}</b></div></div>
    <div className="salesTableWrap"><table className="salesTable"><thead><tr><th>VENDA</th><th>DATA</th><th>CLIENTE / CIDADE</th><th>VENDEDOR</th><th>PRODUTO</th><th>QTD.</th><th>CUSTO</th><th>VENDA</th><th>FRETE</th><th>TOTAL</th><th>LUCRO</th><th>STATUS</th></tr></thead><tbody>{rows.map((v,i)=>{const total=Number(v.total||v.valorTotal||0), cost=Number(v.custoTotal||0), freight=Number(v.freteTotal||v.frete||0);return <tr key={`${v.id}-${i}`}><td>{v.numeroVenda||v.id}</td><td>{v.data||"-"}</td><td><b>{v.cliente||v.nomeFantasia||"-"}</b><small>{v.cidade||""}</small></td><td>{v.vendedor||"-"}</td><td>{v.produto||"-"}</td><td>{v.qtd||0}</td><td>{money(cost)}</td><td>{money(v.precoVenda||v.precoUnitario)}</td><td>{money(freight)}</td><td>{money(total)}</td><td>{money(total-cost-freight)}</td><td>{v.status||"-"}</td></tr>})}</tbody></table></div>
  </section>;
}

export function CounterSalesPanel({ data }) {
  const [query, setQuery] = useState("");
  const rows = (data.vendasBalcao || []).filter(v => [v.numeroVenda,v.cliente,v.nomeFantasia,v.produto,v.status].map(norm).join(" ").includes(norm(query)));
  const total = rows.reduce((s,v)=>s+Number(v.total||v.valorTotal||0),0);
  return <section className="card counterPanel"><div className="sectionHead"><div><h2>PAINEL VENDAS BALCÃO</h2><p>VISÃO OPERACIONAL — SEM CUSTO, LUCRO OU MARGEM</p></div></div><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar venda, cliente ou produto"/><div className="counterKpis"><div><small>VENDAS</small><b>{rows.length}</b></div><div><small>TOTAL VENDIDO</small><b>{money(total)}</b></div><div><small>EM ABERTO</small><b>{rows.filter(v=>!/(PAGO|LIQUIDADO|RECEBIDO)/.test(String(v.status))).length}</b></div></div><div className="salesTableWrap"><table className="salesTable"><thead><tr><th>VENDA</th><th>DATA</th><th>CLIENTE</th><th>PRODUTOS</th><th>QUANTIDADE</th><th>TOTAL</th><th>PAGAMENTO</th><th>STATUS</th></tr></thead><tbody>{rows.map((v,i)=><tr key={`${v.id}-${i}`}><td>{v.numeroVenda||v.id}</td><td>{v.data||"-"}</td><td>{v.cliente||v.nomeFantasia||"-"}</td><td>{v.produto||"-"}</td><td>{v.qtd||0}</td><td>{money(v.total||v.valorTotal)}</td><td>{v.formaPagamento||v.pagamento||"-"}</td><td>{v.status||"-"}</td></tr>)}</tbody></table></div></section>;
}
