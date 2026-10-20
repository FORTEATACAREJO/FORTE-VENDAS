const money=n=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const date=n=>n?new Date(n).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'—';
function renderPDF(jsPDF,title,sections,{generatedAt=new Date().toISOString(),primaryReference='',primaryLabel='PEDIDO OFICIAL DO FORNECEDOR'}={}){
 const d=new jsPDF();let y=0;
 function page(){if(y)d.addPage();d.setFillColor(22,42,58);d.rect(0,0,210,34,'F');d.setTextColor(255);d.setFontSize(16);d.text('FORTE ATACAREJO LTDA',14,14);d.setFontSize(10);d.text(title,14,23);d.setFillColor(228,111,30);d.rect(0,34,210,2,'F');d.setTextColor(22,42,58);y=45;if(primaryReference){d.setFont('helvetica','bold');d.setFontSize(10);d.text(primaryLabel,14,y);y+=9;d.setFontSize(22);for(const ref of d.splitTextToSize(primaryReference,180)){d.text(ref,14,y);y+=9;}y+=6;}}
 function line(value,bold=false){d.setFontSize(bold?11:9);d.setFont('helvetica',bold?'bold':'normal');const lines=d.splitTextToSize(String(value??'—'),180);for(const t of lines){if(y>273)page();d.text(t,14,y);y+=5;}y+=2;}
 page();line('Gerado em '+date(generatedAt));
 for(const section of sections){if(y>251)page();d.setFillColor(237,242,246);d.rect(12,y-4,186,8,'F');line(section.title,true);for(const row of section.rows)line(row,/^(Placas:|Pallets:)/.test(row));y+=4;}
 const total=d.getNumberOfPages();for(let n=1;n<=total;n++){d.setPage(n);d.setFontSize(8);d.setTextColor(85);d.text('Forte Atacarejo • (34) 99920-9335',14,288);d.text(n+' / '+total,190,288,{align:'right'});}
 return d;
}
export function purchaseDocument(jsPDF,order,driver=false){
 const official=String(order.numeroPedidoFornecedor||'').trim();
 if(driver&&!official)throw new Error('Confirme o número oficial do pedido do fornecedor antes de gerar a ordem.');
 const identity=['Ordem interna / carga: '+(order.numero||order.codigo||order.id),'Fornecedor: '+order.fornecedor,'Unidade compradora: '+order.unidade,'RETIRAR EM: '+(order.localCarregamento||order.origem),'Destino: '+order.destino,'Data de carregamento: '+(order.dataCarregamento||'A definir')];
 const transport=['Motorista: '+(order.motorista||'A definir'),'Placas: '+(order.placas||[]).join(' / '),'Pallets: '+order.regraPallets+' • '+order.palletQuantidade,...['cpf','cnhNumero','rntrc'].filter(k=>order.motoristaSnapshot?.[k]).map(k=>({cpf:'CPF',cnhNumero:'CNH',rntrc:'RNTRC'})[k]+': '+order.motoristaSnapshot[k]),...(order.justificativaPallets?['Observação de pallets: '+order.justificativaPallets]:[]),...(order.liberacaoPalletsFornecedor?.evidencia?['Autorização de pallets do fornecedor: '+order.liberacaoPalletsFornecedor.evidencia]:[])];
 return renderPDF(jsPDF,driver?'ORDEM DE CARREGAMENTO':'ESPELHO DO PEDIDO AO FORNECEDOR',[
 {title:'Identificação',rows:driver?identity:[...identity,'Pedido fornecedor: '+(official||'Aguardando retorno'),'Código cliente Forte no fornecedor: '+(order.codigoFornecedor||order.fornecedorSnapshot?.codigoCliente||order.fornecedorSnapshot?.codigoForte||'Não informado')]},
 {title:'Transporte e pallets',rows:driver?transport:[...transport,'Pagamento: '+(order.pagamento||order.condicaoFornecedor||'—'),'Modalidade: '+order.modalidadeFrete,'Tipo de compra: '+(order.modalidadeCompra||'PADRAO')]},
 {title:'Itens do pedido',rows:(order.itens||[]).map(i=>i.produto+' • '+i.qtd+' unidades • '+Number(i.pesoKg/1000).toLocaleString('pt-BR')+' t'+(driver?'':' • Unitário '+money(i.custoUnitario)+' • Total '+money(i.total)))},
 {title:'Totais',rows:['Quantidade: '+(order.itens||[]).reduce((a,i)=>a+Number(i.qtd),0),'Peso: '+Number(order.pesoKg/1000).toLocaleString('pt-BR')+' t',...(driver?[]:['Total da compra: '+money((order.itens||[]).reduce((a,i)=>a+Number(i.total),0))])]}
 ],{primaryReference:driver?official:String(order.codigoFornecedor||order.fornecedorSnapshot?.codigoCliente||order.fornecedorSnapshot?.codigoForte||'Não informado'),primaryLabel:driver?'PEDIDO OFICIAL DO FORNECEDOR':'NOSSO CÓDIGO NESTE FORNECEDOR'});
}
