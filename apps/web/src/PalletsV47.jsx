import React,{useMemo,useState}from"react";

const up=v=>String(v||"").trim().toUpperCase();
const id=()=>`pal-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
const now=()=>new Date().toISOString();
const signed=(m,local)=>m.destino===local?Number(m.quantidade||0):m.origem===local?-Number(m.quantidade||0):0;

export default function PalletsV47({data,onChange,audit,currentUser}){
 const fornecedores=(data.fornecedores||[]).filter(x=>x.ativo!==false);
 const motoristas=(data.motoristas||[]).filter(x=>x.ativo!==false);
 const locais=useMemo(()=>["GALPÃO MONTE CARMELO","GALPÃO CALDAS NOVAS","EM TRÂNSITO",...fornecedores.map(x=>`FORNECEDOR: ${up(x.nome)}`),"CLIENTE / COMODATO","BAIXA DEFINITIVA"],[fornecedores]);
 const [form,setForm]=useState({tipo:"COMPRA",origem:"MERCADO / TERCEIRO",destino:"GALPÃO MONTE CARMELO",fornecedor:"",motorista:"",quantidade:"",custoUnitario:"",documento:"",observacao:""});
 const movimentos=data.palletMovimentosV47||[];
 const [mostrarClientes,setMostrarClientes]=useState(false);
 const clientes=(data.clientes||[]).filter(x=>x.ativo!==false);
 const [cliente,setCliente]=useState("");
 const legadoClientes=data.palletClientes||[];
 const clienteNome=x=>up(x.cliente||x.nomeCliente||"");
 const legadoSinal=x=>/DEVOLU|SAÍDA|VENDA/.test(up(x.movimento))?-Number(x.quantidade||0):Number(x.quantidade||0);
 const saldoCliente=nome=>legadoClientes.filter(x=>up(x.nome)===up(nome)).reduce((s,x)=>s+legadoSinal(x),0)+movimentos.filter(x=>clienteNome(x)===up(nome)).reduce((s,x)=>s+(x.destino==="CLIENTE / COMODATO"?Number(x.quantidade||0):0)-(x.origem==="CLIENTE / COMODATO"?Number(x.quantidade||0):0),0);
 const nomesClientes=[...new Set([...clientes.map(x=>x.nome),...legadoClientes.map(x=>x.nome),...movimentos.map(x=>x.cliente)].filter(Boolean))].sort((a,b)=>a.localeCompare(b,"pt-BR"));
 const legadoPatrimonio=(data.palletPatrimonio||[]).reduce((s,m)=>s+Number(m.quantidade||m.qtd||0)*(String(m.tipo||"").includes("SAÍDA")||String(m.tipo||"").includes("VENDA")?-1:1),0);
 const patrimonio=legadoPatrimonio+movimentos.reduce((s,m)=>s+(m.afetaPatrimonio?Number(m.quantidade||0)*(m.tipo==="COMPRA"||m.tipo==="AJUSTE DE ENTRADA"?1:-1):0),0);
 const saldo=local=>movimentos.reduce((s,m)=>s+signed(m,local),0);
 const registrar=()=>{
  const q=Number(form.quantidade||0);if(q<=0)return alert("INFORME A QUANTIDADE DE PALLETS.");
  if(["COMPRA","VENDA"].includes(form.tipo)&&!form.documento)return alert("INFORME A NOTA FISCAL DA COMPRA OU VENDA DE PALLETS.");
  if(["COMODATO A CLIENTE","RETORNO"].includes(form.tipo)&&!cliente)return alert("SELECIONE O CLIENTE PARA O CONTA-CORRENTE.");
  const origem=form.tipo==="COMPRA"?"FORA DO PATRIMÔNIO":form.tipo==="RETORNO"?"CLIENTE / COMODATO":form.origem;
  const destino=form.tipo==="VENDA"?"BAIXA DEFINITIVA":form.tipo==="COMODATO A CLIENTE"?"CLIENTE / COMODATO":form.destino;
  if(form.tipo==="RETORNO"&&saldoCliente(cliente)<q)return alert(`RETORNO BLOQUEADO: ${cliente} POSSUI ${saldoCliente(cliente)} PALLET(S) EM COMODATO.`);
  if(!["COMPRA","AJUSTE DE ENTRADA"].includes(form.tipo)&&saldo(origem)<q)return alert(`MOVIMENTO BLOQUEADO: SALDO DISPONÍVEL EM ${origem}: ${saldo(origem)} PALLET(S).`);
  const movimento={id:id(),...form,cliente:["COMODATO A CLIENTE","RETORNO"].includes(form.tipo)?cliente:"",origem,destino,quantidade:q,custoUnitario:Number(form.custoUnitario||0),valorTotal:q*Number(form.custoUnitario||0),afetaPatrimonio:["COMPRA","VENDA","PERDA / AVARIA","AJUSTE DE ENTRADA","AJUSTE DE SAÍDA"].includes(form.tipo),dataHora:now(),usuario:currentUser?.nome||""};
  onChange(d=>({...d,palletMovimentosV47:[...(d.palletMovimentosV47||[]),movimento],auditoria:[...(d.auditoria||[]),{id:id(),acao:"MOVIMENTAÇÃO PATRIMONIAL DE PALLETS",detalhe:`${form.tipo} • ${q} • ${origem} → ${destino} • ${form.documento||"SEM DOCUMENTO"}`,usuario:currentUser?.nome||"",dataHora:now()}]}));
  audit?.("MOVIMENTAÇÃO PATRIMONIAL DE PALLETS","",`${form.tipo} ${q} ${origem} ${destino}`);setForm(x=>({...x,quantidade:"",custoUnitario:"",documento:"",observacao:""}));alert("MOVIMENTAÇÃO REGISTRADA. PATRIMÔNIO E LOCALIZAÇÃO FORAM ATUALIZADOS SEM DUPLICIDADE.");
 };
 const set=(k,v)=>setForm(x=>({...x,[k]:v}));
 return <section className="card"><div className="sectionHead"><div><h2>PALLETS — PATRIMÔNIO E LOCALIZAÇÕES</h2><p>COMPRA E VENDA ALTERAM O PATRIMÔNIO. ENVIO, RETIRADA, COMODATO E RETORNO ALTERAM SOMENTE A LOCALIZAÇÃO.</p></div></div>
 <div className="palletSummary four"><div><b>PATRIMÔNIO TOTAL FORTE</b><strong>{patrimonio} PALLET(S)</strong><small>{legadoPatrimonio} VINDO DO HISTÓRICO ANTERIOR</small></div><div><b>NOS FORNECEDORES</b><strong>{locais.filter(x=>x.startsWith("FORNECEDOR:")).reduce((s,x)=>s+saldo(x),0)} PALLET(S)</strong></div><div><b>NOS GALPÕES</b><strong>{saldo("GALPÃO MONTE CARMELO")+saldo("GALPÃO CALDAS NOVAS")} PALLET(S)</strong></div><div><b>EM TRÂNSITO</b><strong>{saldo("EM TRÂNSITO")} PALLET(S)</strong></div></div>
 <button type="button" className="secondary" onClick={()=>setMostrarClientes(x=>!x)}>{mostrarClientes?"OCULTAR CONTA-CORRENTE DE PALLETS DOS CLIENTES":"CONTA-CORRENTE DE PALLETS DOS CLIENTES"}</button>
 {mostrarClientes&&<div className="transportBox"><h3>CONTA-CORRENTE DE PALLETS POR CLIENTE</h3>{nomesClientes.length===0&&<p>AINDA NÃO HÁ CLIENTES COM MOVIMENTAÇÃO DE PALLETS.</p>}{nomesClientes.map(nome=><div className="palletRow" key={nome}><b>{nome}</b><strong>SALDO: {saldoCliente(nome)} PALLET(S)</strong><button type="button" className="ghost dark" onClick={()=>setCliente(nome)}>SELECIONAR</button></div>)}<h3>EXTRATO {cliente?`— ${cliente}`:"— SELECIONE UM CLIENTE"}</h3>{cliente&&[...legadoClientes.filter(x=>up(x.nome)===up(cliente)).map(x=>({id:x.id||`${x.dataHora}-${x.documento}`,dataHora:x.dataHora,tipo:x.movimento,quantidade:legadoSinal(x),documento:x.documento})),...movimentos.filter(x=>clienteNome(x)===up(cliente)).map(x=>({id:x.id,dataHora:x.dataHora,tipo:x.tipo,quantidade:x.destino==="CLIENTE / COMODATO"?Number(x.quantidade||0):-Number(x.quantidade||0),documento:x.documento}))].sort((a,b)=>String(a.dataHora||"").localeCompare(String(b.dataHora||""))).map(x=><div className="palletRow" key={x.id}><span>{x.dataHora?new Date(x.dataHora).toLocaleString("pt-BR"):"-"}</span><b>{x.tipo}</b><span>{x.quantidade>0?"+":""}{x.quantidade} PALLET(S)</span><small>{x.documento||"SEM DOCUMENTO"}</small></div>)}</div>}
 <div className="transportBox"><h3>NOVA MOVIMENTAÇÃO</h3><div className="miniGrid">
 <label>TIPO<select value={form.tipo} onChange={e=>set("tipo",e.target.value)}><option>COMPRA</option><option>TRANSFERÊNCIA</option><option>UTILIZAÇÃO EM CARGA</option><option>COMODATO A CLIENTE</option><option>RETORNO</option><option>VENDA</option><option>PERDA / AVARIA</option><option>AJUSTE DE ENTRADA</option><option>AJUSTE DE SAÍDA</option></select></label>
 <label>ORIGEM<select value={form.origem} disabled={form.tipo==="COMPRA"} onChange={e=>set("origem",e.target.value)}>{locais.filter(x=>x!=="BAIXA DEFINITIVA").map(x=><option key={x}>{x}</option>)}</select></label>
 <label>DESTINO<select value={form.destino} disabled={form.tipo==="VENDA"} onChange={e=>set("destino",e.target.value)}>{locais.filter(x=>x!=="BAIXA DEFINITIVA").map(x=><option key={x}>{x}</option>)}</select></label>
 {["COMODATO A CLIENTE","RETORNO"].includes(form.tipo)&&<label>CLIENTE<select value={cliente} onChange={e=>setCliente(e.target.value)}><option value="">SELECIONE O CLIENTE...</option>{clientes.map(x=><option key={x.id} value={x.nome}>{x.nome}</option>)}</select></label>}
 <label>FORNECEDOR<select value={form.fornecedor} onChange={e=>set("fornecedor",e.target.value)}><option value="">NÃO SE APLICA / SELECIONE...</option>{fornecedores.map(x=><option key={x.id}>{x.nome}</option>)}</select></label>
 <label>MOTORISTA<select value={form.motorista} onChange={e=>set("motorista",e.target.value)}><option value="">NÃO SE APLICA / SELECIONE...</option>{motoristas.map(x=><option key={x.id}>{x.nome}</option>)}</select></label>
 <label>QUANTIDADE<input type="number" min="1" value={form.quantidade} onChange={e=>set("quantidade",e.target.value)}/></label>
 <label>CUSTO UNITÁRIO<input type="number" min="0" step="0.01" value={form.custoUnitario} onChange={e=>set("custoUnitario",e.target.value)}/></label>
 <label>NF / CARGA / PROTOCOLO<input value={form.documento} onChange={e=>set("documento",up(e.target.value))}/></label>
 <label>OBSERVAÇÃO<input value={form.observacao} onChange={e=>set("observacao",up(e.target.value))}/></label><button onClick={registrar}>REGISTRAR MOVIMENTO</button></div></div>
 <div className="palletColumns"><div><h3>SALDO POR FORNECEDOR</h3>{locais.filter(x=>x.startsWith("FORNECEDOR:")).map(x=><div className="palletRow" key={x}><b>{x.replace("FORNECEDOR: ","")}</b><span>{saldo(x)} PALLET(S) DISPONÍVEIS</span></div>)}</div><div><h3>SALDO POR LOCALIZAÇÃO</h3>{locais.filter(x=>!x.startsWith("FORNECEDOR:")&&x!=="BAIXA DEFINITIVA").map(x=><div className="palletRow" key={x}><b>{x}</b><span>{saldo(x)} PALLET(S)</span></div>)}</div></div>
 <div className="transportBox"><h3>CONTA-CORRENTE</h3><div className="palletLedger"><b>DATA</b><b>TIPO</b><b>ORIGEM</b><b>DESTINO</b><b>QTD.</b><b>DOCUMENTO</b><b>MOTORISTA</b>{movimentos.slice().reverse().map(x=><div className="rowContents" key={x.id}><span>{new Date(x.dataHora).toLocaleString("pt-BR")}</span><b>{x.tipo}</b><span>{x.origem}</span><span>{x.destino}</span><strong>{x.quantidade}</strong><span>{x.documento||"-"}</span><span>{x.motorista||"-"}</span></div>)}</div></div></section>;
}
