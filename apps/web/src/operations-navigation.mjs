// Legacy screens remain accessible as tools; these are the only work-panel destinations.
export const SALES_AREAS=[
 {id:'sales',title:'VENDAS',description:'Uma planilha para pedidos, clientes, documentos e histórico.',screens:[['painelUnicoVendas','Vendas']],more:[['externas','Vendas externas'],['balcao','Venda balcão'],['clientes','Clientes e venda direta'],['diretas','Entregas e notas']]},
 {id:'purchases',title:'COMPRAS',description:'Pedido ao fornecedor e destino das notas recebidas.',screens:[['painelCompras','Compras']],more:[['comprasFornecedor','Novo pedido ao fornecedor'],['compraForte','Reposição de estoque']]},
 {id:'pallets',title:'PALLETS',description:'Notas, distribuição, estoque e contas correntes.',screens:[['paletes','Pallets']]},
 {id:'loads',title:'CARGAS',description:'Uma linha por carga com suas vendas e etapas logísticas.',screens:[['painelCargas','Cargas']],more:[['ordensCarregamento','Ordem de carregamento'],['planejamento','Planejar carga'],['todasCargas','Consulta histórica de cargas']]}
];
export const areaScreens=area=>[...area.screens,...(area.more||[])];
export const salesAreaFor=screen=>SALES_AREAS.find(area=>areaScreens(area).some(([id])=>id===screen));
export const visibleSalesAreas=canAccess=>SALES_AREAS.map(area=>({...area,entry:area.screens.find(([id])=>canAccess(id))?.[0]||area.more?.find(([id])=>canAccess(id))?.[0]})).filter(area=>area.entry);
export const salesBottomTab=screen=>salesAreaFor(screen)?.screens[0][0]||screen;
