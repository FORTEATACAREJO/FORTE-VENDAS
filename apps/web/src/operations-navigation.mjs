// Navigation groups only. Original screen IDs and their authorization stay in App.
export const SALES_AREAS=[
 {id:'sales',title:'PEDIDOS E VENDAS',description:'Receber pedidos, vender com destino definido e acompanhar entregas.',screens:[['painelUnicoVendas','Pedidos'],['clientes','Venda direta'],['diretas','Entregas e notas']]},
 {id:'counter',title:'VENDA BALCÃO',description:'Vender, organizar entregas e acompanhar o caixa do balcão.',screens:[['balcao','Venda balcão']]},
 {id:'external',title:'VENDAS EXTERNAS',description:'Receber pedidos e propostas dos representantes.',screens:[['externas','Vendas externas']]},
 {id:'loads',title:'COMPRAS E CARGAS',description:'Pedido ao fornecedor, motorista, carregamento, documentos e pagamento.',screens:[['painelCargas','Acompanhar cargas'],['comprasFornecedor','Pedido ao fornecedor'],['ordensCarregamento','Carregamento']],more:[['planejamento','Planejar carga'],['painelCompras','Notas de compra'],['compraForte','Reposição de estoque'],['todasCargas','Consultar todas as cargas']]}
];
export const areaScreens=area=>[...area.screens,...(area.more||[])];
export const salesAreaFor=screen=>SALES_AREAS.find(area=>areaScreens(area).some(([id])=>id===screen));
export const visibleSalesAreas=canAccess=>SALES_AREAS.map(area=>({...area,entry:areaScreens(area).find(([id])=>canAccess(id))?.[0]})).filter(area=>area.entry);
export const salesBottomTab=screen=>salesAreaFor(screen)?.id==='loads'?'painelCargas':salesAreaFor(screen)?'group:vendas':screen;
