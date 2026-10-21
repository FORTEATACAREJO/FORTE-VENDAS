// Preserve original route IDs and permissions; expose three work panels and one logistics panel.
export function workspaceNavigation(canGroup,canScreen,unread=0){
 const item=(id,label,description,icon,screens=[],groups=[])=>({id,label,description,icon,screens,groups});
 const main=[item('home','Início','Resumo da operação','home',['home'])];
 if(canScreen('painelUnicoVendas'))main.push(item('painelUnicoVendas','Vendas','Pedidos, vendas externas, documentos e histórico','file',['painelUnicoVendas','clientes','diretas','balcao','externas']));
 if(canScreen('painelCompras'))main.push(item('painelCompras','Compras','Pedidos ao fornecedor e destino das notas','box',['painelCompras','comprasFornecedor','compraForte']));
 if(canScreen('paletes'))main.push(item('paletes','Pallets','Notas, distribuição, estoque e contas correntes','box',['paletes']));
 if(canScreen('painelCargas'))main.push(item('painelCargas','Cargas','Um painel logístico por carga','truck',['painelCargas','ordensCarregamento','planejamento','todasCargas']));
 const tools=[
 ['vendas','Outras operações de venda','Balcão e representantes','file'],
 ['patio','Estoque do galpão','Consulta do estoque físico','box'],
 ['logistica','Operação logística','Ferramentas operacionais','truck'],
 ['conferencia','Conferência de documentos','Anexos e divergências','check'],
 ['financeiro','Financeiro e cobranças','Contas, boletos e tesouraria','money'],
 ['cobrancas','Cobranças','Boletos de clientes','money'],
 ['fornecedores','Fornecedores','Cadastros e condições comerciais','box'],
 ['cadastros','Cadastros e usuários','Clientes, produtos e acessos','users'],
 ['relatorios','Relatórios','Consulta e desempenho','file'],
 ['integracoes','Integrações','WhatsApp, Gmail, bancos e cartões','grid']
 ];
 const more=tools.filter(([g])=>canGroup(g)&&!(g==='cobrancas'&&canGroup('financeiro'))).map(([g,label,description,icon])=>item('group:'+g,label,description,icon,[],g==='financeiro'?['financeiro','cobrancas']:[g]));
 if(canScreen('whatsapp'))more.unshift(item('whatsapp','WhatsApp — Central'+(unread?' ('+unread+')':''),'Conversas, respostas e anexos','users',['whatsapp']));
 return{main,more};
}
export function workspaceItemActive(item,screen,group){
 if(item.id===screen||item.screens.includes(screen))return true;
 if(['whatsapp','painelUnicoVendas','clientes','diretas','balcao','externas','painelCompras','comprasFornecedor','compraForte','paletes','painelCargas','ordensCarregamento','planejamento','todasCargas'].includes(screen))return false;
 return item.groups.includes(group);
}
