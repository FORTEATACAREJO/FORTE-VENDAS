import React from 'react';
import {Hero,Metrics,Shortcuts} from './ForteUI.jsx';
import './workspace-navigation.css';
export default function HomeCompactV47({navigation,canSell,canBuy,onNavigate,onSale,onPurchase,data={}}){
 return <div><Hero title="Forte Vendas" description="Pedidos, compras e cargas em uma operação integrada."/><Shortcuts items={[...(canSell?[{label:'Venda Balcão',description:'Caixa, orçamento e venda rápida',icon:'money',primary:true,onClick:()=>onNavigate('balcao')},{label:'Nova Venda',description:'Pedido do cliente com destino definido',icon:'plus',onClick:onSale}]:[]),...(canBuy?[{label:'Nova Compra',description:'Pedido ao fornecedor',icon:'box',primary:true,onClick:onPurchase}]:[])]}/><nav className="operations-sales-tabs" aria-label="Painéis de trabalho">{navigation.main.filter(item=>item.id!=='home').map(item=><button key={item.id} type="button" onClick={()=>onNavigate(item.id)}>{item.label}</button>)}</nav><Metrics items={[{label:'Vendas em aberto',value:(data.vendas||[]).filter(x=>!['CONCLUIDA','CANCELADA','EXCLUIDA'].includes(x.status)).length,icon:'file'},{label:'Cargas cadastradas',value:(data.cargas||[]).length,icon:'truck'}]}/></div>;
}
