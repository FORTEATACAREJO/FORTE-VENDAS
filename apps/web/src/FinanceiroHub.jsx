import {useMemo,useState} from "react";
import {jsPDF} from "jspdf";
import PreConferenciaBoletos from "./PreConferenciaBoletos.jsx";

const moeda=v=>Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const dataBR=v=>v?new Date(String(v).length===10?v+"T12:00:00":v).toLocaleString("pt-BR"):"-";
const soma=rows=>rows.reduce((a,x)=>a+Number(x.valor||0),0);
const escapeCsv=v=>'"'+String(v??"").replace(/"/g,'""')+'"';
export default function FinanceiroHub({data,onChange,currentUser}){
 const [aba,setAba]=useState("FECHAMENTOS");
 const [dia,setDia]=useState(new Date().toISOString().slice(0,10));
 const [caixaId,setCaixaId]=useState("");
 const fechamentos=(data.caixasBalcao||[]).filter(x=>x.status==="FECHADO").slice().sort((a,b)=>String(b.fechadoEm||"").localeCompare(String(a.fechadoEm||"")));
 const doDia=fechamentos.filter(x=>x.data===dia);
 const caixa=fechamentos.find(x=>x.id===caixaId)||doDia[0]||null;
 const estoque=caixa?.estoqueSnapshot||[];
 const [produtoAberto,setProdutoAberto]=useState(null);
 const posicaoEstoque=useMemo(()=>{const movimentos=data.estoqueMov||[];const vendas=[...(data.vendas||[]),...(data.vendasBalcao||[])];return (data.produtos||[]).filter(p=>p.ativo!==false).map(p=>{let inicial=0,entradas=0,saidas=0;const detalhes=[];const lista=movimentos.filter(m=>m.produtoId===p.id).slice().sort((a,b)=>String(a.data||a.dataHora||"").localeCompare(String(b.data||b.dataHora||""))||String(a.dataHora||"").localeCompare(String(b.dataHora||"")));for(const m of lista){const dataMov=String(m.data||m.dataHora||"").slice(0,10);if(!dataMov||dataMov>dia)continue;const tipo=String(m.tipo||"");const q=Number(m.quantidade||0);const delta=tipo.startsWith("ENTRADA")?q:tipo.startsWith("SAÍDA")?-q:Number(m.ajuste??q);if(dataMov<dia){inicial+=delta;continue}if(delta>=0)entradas+=delta;else saidas-=delta;const venda=vendas.find(v=>v.id===m.vendaId);const cliente=(data.clientes||[]).find(c=>c.id===(m.clienteId||venda?.clienteId));detalhes.push({id:m.id||String(detalhes.length),hora:String(m.dataHora||m.data||""),tipo,entrada:Math.max(0,delta),saida:Math.max(0,-delta),referencia:m.referencia||m.numeroNotaFiscal||"-",destino:m.destinoOperacional||m.unidade||"-",cliente:venda?.cliente||cliente?.nome||m.nomeComprador||"-",usuario:m.usuario||"-",teste:!!m.teste})}let saldo=inicial;const linhas=detalhes.map(m=>({...m,saldo:(saldo+=m.entrada-m.saida)}));return {id:p.id,produto:p.nome||p.descricao||"PRODUTO",marca:p.marca||"",inicial,entradas,saidas,final:saldo,linhas}}).sort((a,b)=>a.produto.localeCompare(b.produto,"pt-BR"))},[data.estoqueMov,data.produtos,data.vendas,data.vendasBalcao,data.clientes,dia]);
 const imprimirEstoque=(selecionado)=>{const produtos=selecionado?[selecionado]:posicaoEstoque;const pdf=new jsPDF();let y=18;const linha=(txt)=>{const partes=pdf.splitTextToSize(String(txt),185);if(y+partes.length*5>280){pdf.addPage();y=18}pdf.text(partes,12,y);y+=Math.max(5,partes.length*5)};pdf.setFontSize(15);linha("FORTE FINANCEIRO - MOVIMENTACAO DE ESTOQUE");pdf.setFontSize(9);linha("Data operacional: "+dataBR(dia)+" | Emitido: "+new Date().toLocaleString("pt-BR"));linha("Posicao calculada dos lancamentos registrados. Consulte o fechamento do caixa para a fotografia definitiva.");for(const p of produtos){if(y>245){pdf.addPage();y=18}y+=4;pdf.setFontSize(12);linha(p.produto+" | "+p.marca);pdf.setFontSize(9);linha("Saldo inicial: "+p.inicial+" | Entradas: "+p.entradas+" | Saidas: "+p.saidas+" | SALDO FINAL: "+p.final);if(!p.linhas.length)linha("Sem movimentacao nesta data.");for(const m of p.linhas){linha((m.hora.includes("T")?m.hora.split("T")[1].slice(0,5):"--:--")+" | "+m.tipo+" | +"+m.entrada+" / -"+m.saida+" | Saldo "+m.saldo);linha("   Cliente: "+m.cliente+" | Ref.: "+m.referencia+" | Local: "+m.destino+(m.teste?" | TESTE":""))}linha("Conferencia: ______________________________________________")}pdf.save("FORTE-ESTOQUE-"+dia+(selecionado?"-"+String(selecionado.produto).replace(/[^a-z0-9]+/gi,"-").slice(0,35):"-TODOS")+".pdf")};
 const receber=(data.contasReceber||[]).filter(x=>!["PAGO","LIQUIDADO","CANCELADO"].includes(String(x.status||"").toUpperCase()));
 const pagar=(data.contasPagar||[]).filter(x=>!["PAGO","LIQUIDADO","CANCELADO"].includes(String(x.status||"").toUpperCase()) && (!x.preConferenciaId || (data.preConferenciaBoletos||[]).some(b=>b.id===x.preConferenciaId&&b.status==="INCORPORADO AO CONTAS A PAGAR")));
 const cartoes=(data.vendasBalcao||[]).filter(x=>x.status==="CONCLUÍDA"&&/CARTÃO|CARTAO|CRÉDITO|CREDITO|DÉBITO|DEBITO/i.test(String(x.pagamento||"")));
 const pendentes=(data.preConferenciaBoletos||[]).filter(x=>!["INCORPORADO AO CONTAS A PAGAR","REJEITADO/CANCELADO"].includes(x.status));
 const baixarCsv=()=>{
  if(!caixa?.estoqueSnapshot)return;
  const linhas=[["DATA","FECHADO EM","UNIDADE","PRODUTO","SALDO INICIAL","ENTRADAS","SAIDAS","SALDO FINAL"],...estoque.map(x=>[caixa.data,caixa.fechadoEm,caixa.unidade,x.produto,x.saldoInicial,x.entradas,x.saidas,x.saldoFinal])];
  const blob=new Blob(["\uFEFF"+linhas.map(row=>row.map(escapeCsv).join(";")).join("\r\n")],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="ESTOQUE-FECHAMENTO-"+caixa.data+".csv";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 const imprimirPdf=()=>{
  if(!caixa)return;
  const pdf=new jsPDF();let y=18;
  const linha=(texto)=>{const partes=pdf.splitTextToSize(String(texto),185);if(y+partes.length*6>280){pdf.addPage();y=18}pdf.text(partes,12,y);y+=Math.max(6,partes.length*6)};
  pdf.setFontSize(16);linha("FORTE FINANCEIRO - FECHAMENTO DIARIO");
  pdf.setFontSize(10);linha("Data: "+dataBR(caixa.data)+" | Unidade: "+(caixa.unidade||"-"));
  linha("Fechado em: "+dataBR(caixa.fechadoEm)+" | Responsavel: "+(caixa.fechadoPor||"-"));
  linha("Caixa: "+caixa.id+" | Status: "+caixa.status);
  linha("Saldo inicial: "+moeda(caixa.saldoInicial)+" | Vendas: "+moeda(caixa.totalVendas));
  linha("Esperado: "+moeda(caixa.saldoEsperado)+" | Contado: "+moeda(caixa.saldoContado)+" | Diferenca: "+moeda(caixa.diferenca));
  if(caixa.justificativa)linha("Justificativa: "+caixa.justificativa);
  linha("FORMAS DE PAGAMENTO");
  Object.entries(caixa.porForma||{}).forEach(([forma,valor])=>linha(forma+": "+moeda(valor)));
  linha("VENDAS DO CAIXA - DETALHAMENTO");
  const vendas=(data.vendasBalcao||[]).filter(v=>(caixa.vendaIds||[]).includes(v.id));
  vendas.forEach(v=>{linha((v.numeroVenda||v.id)+" | "+(v.cliente||"-")+" | "+(v.pagamento||"-")+" | "+moeda(v.total));(v.itens||[]).forEach(it=>linha("  "+(it.produto||it.nome||it.produtoId)+" | "+Number(it.qtd||0)+" SC | "+moeda(it.subtotal||Number(it.qtd||0)*Number(it.precoUnitario||0))))});
  linha("ESTOQUE POR PRODUTO - POSICAO CONGELADA NO FECHAMENTO");
  if(!caixa.estoqueSnapshot)linha("Fechamento antigo sem posicao historica de estoque; nao reconstruir com saldo atual.");
  estoque.forEach(x=>linha((x.produto||x.produtoId)+" | Inicial "+x.saldoInicial+" | Entrada "+x.entradas+" | Saida "+x.saidas+" | Final "+x.saldoFinal));
  linha("TITULOS COM VENCIMENTO NO DIA - POSICAO NO FECHAMENTO");
  if(!caixa.titulosSnapshot)linha("Fechamento antigo sem fotografia historica dos titulos.");
  (caixa.titulosSnapshot?.receber||[]).forEach(x=>linha("A RECEBER | "+(x.cliente||"-")+" | "+moeda(x.valor)+" | "+(x.status||"-")));
  (caixa.titulosSnapshot?.pagar||[]).forEach(x=>linha("A PAGAR | "+(x.fornecedor||"-")+" | "+moeda(x.valor)+" | "+(x.status||"-")));
  linha("Conferencia: ______________________________________________");
  pdf.save("FORTE-FINANCEIRO-"+caixa.data+"-"+String(caixa.id).slice(-6)+".pdf");
 };
 return <main className="main" style={{maxWidth:1300,margin:"auto",padding:20}}>
   <header className="header dashboardHeader"><div><h1>FORTE FINANCEIRO</h1><small>CONTAS, CARTÕES, ESTOQUE E FECHAMENTO DIÁRIO • {currentUser?.nome}</small></div><a className="secondary" href="/">ABRIR FORTE VENDAS</a></header>
   <nav className="tabs" style={{display:"flex",flexWrap:"wrap",gap:8,margin:"20px 0"}}>{["FECHAMENTOS","ESTOQUE","A RECEBER","A PAGAR","CARTÕES","VALIDAR BOLETOS"].map(x=><button type="button" key={x} onClick={()=>setAba(x)} className={aba===x?"activeChoice":"ghost dark"}>{x}</button>)}</nav>
   <section className="palletSummary four"><div><b>A RECEBER</b><strong>{moeda(soma(receber))}</strong></div><div><b>A PAGAR VALIDADO</b><strong>{moeda(soma(pagar))}</strong></div><div><b>BOLETOS EM ANÁLISE</b><strong>{pendentes.length}</strong></div><div><b>CAIXAS FECHADOS</b><strong>{fechamentos.length}</strong></div></section>
   {aba==="ESTOQUE"&&<section className="card"><h2>ESTOQUE POR PRODUTO</h2><p>Selecione o produto para ver entradas, vendas, ajustes, cliente, referência e saldo de cada movimentação no dia.</p><div className="miniGrid"><label>DATA <input type="date" value={dia} onChange={e=>{setDia(e.target.value);setProdutoAberto(null)}}/></label><button type="button" onClick={()=>imprimirEstoque(null)}>GERAR PDF CONSOLIDADO</button></div>{!posicaoEstoque.length?<p>NENHUM PRODUTO CADASTRADO NO ESTOQUE.</p>:<div style={{overflowX:"auto",marginTop:16}}><table style={{width:"100%"}}><thead><tr><th>PRODUTO</th><th>MARCA</th><th>INICIAL</th><th>ENTRADAS</th><th>SAÍDAS</th><th>SALDO FINAL</th></tr></thead><tbody>{posicaoEstoque.map(p=><tr key={p.id}><td><button type="button" className="linkButton" onClick={()=>setProdutoAberto(produtoAberto===p.id?null:p.id)} aria-expanded={produtoAberto===p.id}>{p.produto}</button></td><td>{p.marca}</td><td>{p.inicial}</td><td>{p.entradas}</td><td>{p.saidas}</td><td><b>{p.final}</b></td></tr>)}</tbody></table></div>}{produtoAberto&&(()=>{const p=posicaoEstoque.find(x=>x.id===produtoAberto);return p?<div className="card" style={{marginTop:18}}><h3>{p.produto} — MOVIMENTAÇÕES DE {dataBR(dia)}</h3><p>SALDO INICIAL {p.inicial} • ENTRADAS {p.entradas} • SAÍDAS {p.saidas} • SALDO FINAL <b>{p.final}</b></p><button type="button" onClick={()=>imprimirEstoque(p)}>GERAR PDF DESTE PRODUTO</button>{!p.linhas.length?<p>SEM MOVIMENTAÇÃO NESTA DATA.</p>:<div style={{overflowX:"auto",marginTop:12}}><table style={{width:"100%"}}><thead><tr><th>HORA</th><th>TIPO</th><th>CLIENTE</th><th>REFERÊNCIA</th><th>LOCAL</th><th>ENTRADA</th><th>SAÍDA</th><th>SALDO</th></tr></thead><tbody>{p.linhas.map(m=><tr key={m.id}><td>{m.hora.includes("T")?m.hora.split("T")[1].slice(0,5):"-"}</td><td>{m.tipo}{m.teste?" • TESTE":""}</td><td>{m.cliente}</td><td>{m.referencia}</td><td>{m.destino}</td><td>{m.entrada||"-"}</td><td>{m.saida||"-"}</td><td><b>{m.saldo}</b></td></tr>)}</tbody></table></div>}</div>:null})()}<p>Este relatório reflete os lançamentos disponíveis no momento da emissão. O fechamento do caixa guarda a posição definitiva registrada naquele fechamento.</p></section>}
   {aba==="FECHAMENTOS"&&<section className="card"><h2>FECHAMENTO DIÁRIO E ESTOQUE</h2><p>O RELATÓRIO USA O REGISTRO DO CAIXA FECHADO. CADA UNIDADE TEM SEU PRÓPRIO FECHAMENTO.</p>
    <div className="miniGrid"><label>DATA<input type="date" value={dia} onChange={e=>{setDia(e.target.value);setCaixaId("")}}/></label><label>CAIXA<select value={caixaId||caixa?.id||""} onChange={e=>setCaixaId(e.target.value)}><option value="">SELECIONE...</option>{doDia.map(x=><option value={x.id} key={x.id}>{x.unidade} • {dataBR(x.fechadoEm)}</option>)}</select></label><button type="button" disabled={!caixa} onClick={imprimirPdf}>GERAR PDF DO DIA</button><button type="button" disabled={!caixa?.estoqueSnapshot} onClick={baixarCsv}>BAIXAR PLANILHA CSV</button></div>
    {!caixa?<p>NENHUM CAIXA FECHADO NESTA DATA.</p>:<><div className="financialRow"><b>{caixa.unidade}</b><span>FECHADO {dataBR(caixa.fechadoEm)}</span><span>VENDAS {moeda(caixa.totalVendas)}</span><span>DIFERENÇA {moeda(caixa.diferenca)}</span></div>{!caixa.estoqueSnapshot?<div className="alert warn">ESTE CAIXA FOI FECHADO ANTES DA CAPTURA DO ESTOQUE. O SALDO ATUAL NÃO SUBSTITUI O SALDO HISTÓRICO.</div>:<div style={{overflowX:"auto"}}><table style={{width:"100%"}}><thead><tr><th>PRODUTO</th><th>INICIAL</th><th>ENTRADAS</th><th>SAÍDAS</th><th>FINAL</th></tr></thead><tbody>{estoque.map(x=><tr key={x.produtoId}><td>{x.produto}</td><td>{x.saldoInicial}</td><td>{x.entradas}</td><td>{x.saidas}</td><td><b>{x.saldoFinal}</b></td></tr>)}</tbody></table></div>}</>}
   </section>}
   {aba==="A RECEBER"&&<section className="card"><h2>CONTAS A RECEBER</h2>{receber.map(x=><div className="financialRow" key={x.id}><b>{x.cliente||x.titulo||"CLIENTE"}</b><span>{dataBR(x.vencimento)}</span><strong>{moeda(x.valor)}</strong><span>{x.status}</span></div>)}</section>}
   {aba==="A PAGAR"&&<section className="card"><h2>CONTAS A PAGAR VALIDADAS</h2>{pagar.map(x=><div className="financialRow" key={x.id}><b>{x.fornecedor||x.favorecido||"FORNECEDOR"}</b><span>{dataBR(x.vencimento)}</span><strong>{moeda(x.valor)}</strong><span>{x.status}</span></div>)}</section>}
   {aba==="CARTÕES"&&<section className="card"><h2>VENDAS EM CARTÃO</h2><p>VALORES BRUTOS. CONFIRA LIQUIDAÇÕES E TAXAS NA CONCILIAÇÃO DO ADQUIRENTE.</p>{cartoes.map(x=><div className="financialRow" key={x.id}><b>{x.numeroVenda||x.cliente||"VENDA"}</b><span>{dataBR(x.data)}</span><span>{x.pagamento}</span><strong>{moeda(x.total)}</strong></div>)}</section>}
   {aba==="VALIDAR BOLETOS"&&<PreConferenciaBoletos data={data} onChange={onChange} currentUser={currentUser}/>}
 </main>;
}
