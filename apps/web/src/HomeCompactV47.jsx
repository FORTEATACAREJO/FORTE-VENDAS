import React from 'react';
import {Hero, Metrics, Shortcuts} from './ForteUI.jsx';
import './workspace-navigation.css';
export default function HomeCompactV47({navigation,canSell,onNavigate,onSale,data={}}){
 const shortcut=item=>({label:item.label,description:item.description,icon:item.icon,onClick:()=>onNavigate(item.id)});
 return <div><Hero title="Venda mais, construa grandes resultados!" description="Clientes, pedidos, cargas e estoque em um só lugar."/><Metrics items={[{label:'Pedidos pendentes',value:(data.vendas||[]).filter(x=>x.status==='PENDENTE').length,icon:'file'},{label:'Clientes',value:(data.clientes||[]).length,icon:'users'},{label:'Cargas cadastradas',value:(data.cargas||[]).length,icon:'truck'},{label:'Produtos',value:(data.produtos||[]).length,icon:'box'}]}/><Shortcuts items={[...(canSell?[{label:'Nova venda',description:'Balcão ou carga direta',icon:'plus',primary:true,onClick:onSale}]:[]),...navigation.main.filter(item=>item.id!=='home').map(shortcut)]}/>{navigation.more.length>0&&<details className="workspace-more"><summary>Mais opções · cadastros, relatórios e conexões</summary><Shortcuts items={navigation.more.map(shortcut)}/></details>}</div>
}
