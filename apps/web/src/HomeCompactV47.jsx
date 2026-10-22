import React from 'react';
import {Icon} from './ForteUI.jsx';
import './workspace-navigation.css';
import './home-shortcuts.css';

export const CENTRAL_FORTE_URL = 'https://site-forte-atacarejo.onrender.com/central.html';

export default function HomeCompactV47({navigation,canSell,canBuy,canAccess,onNavigate,onSale,onPurchase,onBudget,onLoad,unread=0,data={}}){
 const allowed = (screen,action='visualizar') => canAccess ? canAccess(screen,action) : navigation.main.some(item=>item.id===screen||item.screens?.includes(screen));
 const shortcuts = [
  {label:'Central Forte',description:'Acessar os sistemas',icon:'grid',href:CENTRAL_FORTE_URL,tone:'central'},
  ...(allowed('whatsapp')?[{label:'WhatsApp',description:'Mensagens e respostas',icon:'chat',onClick:()=>onNavigate('whatsapp'),tone:'whatsapp',badge:unread}]:[]),
  ...(canSell&&allowed('balcao','editar')?[{label:'Venda balcão',description:'Caixa e venda rápida',icon:'money',onClick:()=>onNavigate('balcao')},...(onBudget?[{label:'Novo orçamento',description:'Preparar cotação',icon:'file',onClick:onBudget}]:[])]:[]),
  ...(canSell&&allowed('comprasFornecedor','editar')?[{label:'Nova venda',description:'Pedido do cliente',icon:'plus',onClick:onSale}]:[]),
  ...(canBuy&&allowed('comprasFornecedor','editar')?[{label:'Nova compra',description:'Pedido ao fornecedor',icon:'box',onClick:onPurchase}]:[]),
  ...(allowed('planejamento','editar')&&onLoad?[{label:'Nova carga',description:'Planejar carregamento',icon:'truck',onClick:onLoad}]:[]),
  ...(allowed('paletes')?[{label:'Pallets',description:'Conferir e distribuir',icon:'box',onClick:()=>onNavigate('paletes')}]:[])
 ];
 const summaries = [
  ...(allowed('painelUnicoVendas')?[{label:'Vendas em aberto',value:(data.vendas||[]).filter(x=>!['CONCLUIDA','CONCLUÍDA','CANCELADA','EXCLUIDA'].includes(x.status)).length,screen:'painelUnicoVendas',icon:'file'}]:[]),
  ...(allowed('painelCargas')?[{label:'Cargas cadastradas',value:(data.cargas||[]).length,screen:'painelCargas',icon:'truck'}]:[])
 ];
 return <div className="forte-home">
  <div className="home-heading"><h2>O que vamos fazer?</h2><p>Acesse sua operação com um toque.</p></div>
  <nav className="home-shortcuts" aria-label="Atalhos principais">
   {shortcuts.map(item=>{const content=<><span className="home-shortcut-icon"><Icon name={item.icon}/></span><span className="home-shortcut-copy"><b>{item.label}</b><small>{item.description}</small></span>{item.badge>0&&<span className="home-unread" aria-label={`${item.badge} mensagens não lidas`}>{item.badge>99?'99+':item.badge}</span>}</>;return item.href?<a key={item.label} className={`home-shortcut ${item.tone||''}`} href={item.href}>{content}</a>:<button key={item.label} type="button" className={`home-shortcut ${item.tone||''}`} onClick={item.onClick}>{content}</button>;})}
  </nav>
  {navigation.main.length>1&&<section className="home-panels"><h3>Painéis de trabalho</h3><nav className="home-panel-links" aria-label="Painéis de trabalho">{navigation.main.filter(item=>item.id!=='home').map(item=><button key={item.id} type="button" onClick={()=>onNavigate(item.id)}><Icon name={item.icon}/>{item.label}</button>)}</nav></section>}
  {summaries.length>0&&<section className="home-summary" aria-label="Resumo da operação">{summaries.map(item=><button key={item.screen} type="button" onClick={()=>onNavigate(item.screen)}><Icon name={item.icon}/><span><strong>{item.value}</strong><span>{item.label}</span></span><span aria-hidden="true">›</span></button>)}</section>}
 </div>;
}
