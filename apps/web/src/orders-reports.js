import {jsPDF} from 'jspdf';
const money=n=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const date=n=>n?new Date(n).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'—';
export function reportPDF(title,sections,{generatedAt=new Date().toISOString()}={}){
 const d=new jsPDF();let y=0;
 function page(){if(y)d.addPage();d.setFillColor(22,42,58);d.rect(0,0,210,34,'F');d.setTextColor(255);d.setFontSize(16);d.text('FORTE ATACAREJO',14,14);d.setFontSize(10);d.text(title,14,23);d.setFillColor(228,111,30);d.rect(0,34,210,2,'F');d.setTextColor(22,42,58);y=45;}
 function line(value,bold=false){d.setFontSize(bold?11:9);d.setFont('helvetica',bold?'bold':'normal');const lines=d.splitTextToSize(String(value??'—'),180);for(const t of lines){if(y>273)page();d.text(t,14,y);y+=5;}y+=2;}
 page();line('Gerado em '+date(generatedAt));
 for(const section of sections){if(y>251)page();d.setFillColor(237,242,246);d.rect(12,y-4,186,8,'F');line(section.title,true);for(const row of section.rows)line(row);y+=4;}
 const total=d.getNumberOfPages();for(let n=1;n<=total;n++){d.setPage(n);d.setFontSize(8);d.setTextColor(85);d.text('Forte Atacarejo • (34) 99920-9335',14,288);d.text(n+' / '+total,190,288,{align:'right'});}
 return d;
}
export function purchaseReport(order,driver=false){return reportPDF(driver?'ORDEM DE CARREGAMENTO':'ESPELHO DO PEDIDO AO FORNECEDOR',[
 {title:'Identificação • '+(order.numero||order.codigo),rows:['Referência: '+order.id,'Pedido fornecedor: '+(order.numeroPedidoFornecedor||'Aguardando retorno'),'Fornecedor: '+order.fornecedor,'Unidade compradora: '+order.unidade,'Expedição: '+(order.origem||order.localCarregamento),'Destino: '+order.destino]},
 {title:'Transporte e condições',rows:['Motorista: '+(order.motorista||'A definir'),'Placas: '+(order.placas||[]).join(' / '),'Pagamento: '+(order.pagamento||order.condicaoFornecedor||'—'),'Modalidade: '+order.modalidadeFrete,'Pallets: '+order.regraPallets+' • '+order.palletQuantidade]},
 {title:'Itens do pedido',rows:(order.itens||[]).map(i=>i.produto+' • '+i.qtd+' unidades • '+Number(i.pesoKg/1000).toLocaleString('pt-BR')+' t'+(driver?'':' • Unitário '+money(i.custoUnitario)+' • Total '+money(i.total)))},
 {title:'Totais',rows:['Quantidade: '+(order.itens||[]).reduce((a,i)=>a+Number(i.qtd),0),'Peso: '+Number(order.pesoKg/1000).toLocaleString('pt-BR')+' t',...(driver?[]:['Total da compra: '+money((order.itens||[]).reduce((a,i)=>a+Number(i.total),0))])]}
 ]);}
export function loadReport(data,c){return reportPDF('DOSSIÊ DA CARGA • '+c.codigo,[
 {title:'Carga e pedido',rows:[c.codigo+' • '+c.fase,'Fornecedor: '+c.fornecedor,'Pedido: '+(c.numeroPedidoFornecedor||'Aguardando'),'Motorista: '+(c.motorista||'A definir'),'Placas: '+(c.placas||[]).join(' / '),'Destino: '+c.destino]},
 {title:'Distribuição aos clientes',rows:(data.vendas||[]).filter(v=>(c.vendaIds||[]).includes(v.id)).map(v=>v.numeroVenda+' • '+v.cliente+' • '+v.qtd+' de '+v.produto)},
 {title:'Documentos vinculados',rows:(data.documentos||[]).filter(d=>d.cargaId===c.id).map(d=>d.categoria+' • '+d.filename+' • '+d.validationStatus)},
 {title:'Histórico de ajustes',rows:[...(c.ajustes||[]).map(a=>date(a.at)+' • '+a.motivo),...(data.vendas||[]).filter(v=>v.cargaId===c.id).flatMap(v=>(v.ajustes||[]).map(a=>v.numeroVenda+' • '+a.antes+' para '+a.depois+' • '+date(a.at)+' • '+a.motivo))]}
 ]);}
export function salesReport(groups){return reportPDF('PAINEL DE PEDIDOS DE VENDA',groups.map(g=>({title:g.numero+' • '+g.cliente,rows:g.rows.map(v=>v.produto+' • '+v.qtd+' unidades • '+money(v.totalGeral)+' • '+v.status+' • '+(v.cargaId||'Carga a definir'))})));}
export function receiptReport(j){if(!j.reply)throw new Error('Não existe resposta do cliente.');return reportPDF('REGISTRO DE CONFIRMAÇÃO DE ENTREGA',[{title:'Identificação',rows:['Pedido: '+j.reference,'Carga: '+j.cargaId,'Cliente: '+(j.cliente||j.clienteId),'Telefone respondente: '+j.reply.from,'Mensagem original: '+j.providerId,'Resposta: '+j.reply.providerId,'Recebido em: '+date(j.reply.receivedAt)]},{title:'Resposta registrada: '+j.reply.answer,rows:j.reply.items.map(i=>i.qtd+' de '+i.produto)},{title:'Registro comercial',rows:['Resposta vinculada à mensagem original e à quantidade apresentada ao cliente. Este registro preserva a resposta recebida; não substitui automaticamente o canhoto fiscal.']}]);}
