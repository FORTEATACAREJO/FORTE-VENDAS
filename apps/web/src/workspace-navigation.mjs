// Group related entry points without changing screen IDs or authorization rules.
export function workspaceNavigation(canGroup, canScreen) {
 const item=(id,label,description,icon,screens,groups=[])=>({id,label,description,icon,screens,groups});
 const main=[item('home','Início','Resumo da operação','home',['home'])];
 if(canGroup('vendas'))main.push(item('group:vendas','Vendas e compras','Pedidos, balcão e vendas externas','file',[],['vendas']));
 if(canScreen('painelCargas'))main.push(item('painelCargas','Cargas','Fornecedor, motorista, documentos e frete','truck',['painelCargas','comprasFornecedor','ordensCarregamento','planejamento','painelCompras','compraForte','todasCargas']));
 if(canGroup('patio')||canGroup('logistica'))main.push(item(canGroup('patio')?'group:patio':'group:logistica','Estoque e paletes','Estoque do galpão e movimentação física','box',['estoque','paletes'],['patio','logistica']));
 if(canGroup('conferencia'))main.push(item('group:conferencia','Conferência de documentos','Anexos, análise e divergências','check',['conferencia'],['conferencia']));
 if(canGroup('financeiro'))main.push(item('group:financeiro','Financeiro e cobranças','Contas, boletos e tesouraria','money',[],['financeiro','cobrancas']));
 else if(canGroup('cobrancas'))main.push(item('group:cobrancas','Cobranças','Boletos de clientes','money',['itau'],['cobrancas']));
 const more=[
 ['fornecedores','Fornecedores','Cadastros e condições comerciais','box'],
 ['cadastros','Cadastros e usuários','Clientes, produtos, acesso e configurações','users'],
 ['relatorios','Relatórios','Consulta e desempenho da operação','file'],
 ['integracoes','Integrações','WhatsApp, Gmail, bancos e cartões','grid']
 ].filter(([group])=>canGroup(group)).map(([group,label,description,icon])=>item('group:'+group,label,description,icon,[],[group]));
 return {main,more};
}
export function workspaceItemActive(item,screen,group){
 if(item.id===screen||item.screens.includes(screen))return true;
 // Cargas has its own entry; do not also select Vendas for the same screen.
 if(item.id==='group:vendas'&&['painelCargas','comprasFornecedor','ordensCarregamento','planejamento','painelCompras','compraForte','todasCargas'].includes(screen))return false;
 return item.groups.includes(group);
}
