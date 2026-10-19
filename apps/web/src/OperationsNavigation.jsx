import {salesAreaFor,visibleSalesAreas} from './operations-navigation.mjs';
import './operations-navigation.css';
export function OperationsMenu({canAccess,onNavigate}){
 const areas=visibleSalesAreas(canAccess);
 return <section className="operations-home"><header><h2>VENDAS E COMPRAS</h2><p>Escolha a operação. As etapas ficam juntas dentro de cada área.</p><span>{areas.length} ÁREAS</span></header><nav aria-label="Áreas de vendas e compras" className="operations-menu">{areas.map(area=><button type="button" key={area.id} onClick={()=>onNavigate(area.entry)}><strong>{area.title}</strong><span>{area.description}</span><small>ABRIR ÁREA →</small></button>)}</nav></section>;
}
export function OperationContextNav({screen,canAccess,onNavigate}){
 const area=salesAreaFor(screen);if(!area||!canAccess(screen))return null;
 if(area.id==='loads'){
  const more=area.more.filter(([id])=>canAccess(id)),flow=area.screens.filter(([id])=>canAccess(id)),inFlow=flow.some(([id])=>id===screen);
  return <nav className="operations-context" aria-label="Operações de compras e cargas">{inFlow?<p>Pedido ao fornecedor → Carregamento → Documentos e pagamento</p>:flow.length>0&&<button type="button" className="secondary" onClick={()=>onNavigate(flow[0][0])}>← FLUXO DA CARGA</button>}{more.length>0&&<details><summary>Mais operações{!inFlow?' • '+more.find(([id])=>id===screen)?.[1]:''}</summary><div>{more.map(([id,label])=><button type="button" key={id} aria-current={id===screen?'page':undefined} onClick={()=>onNavigate(id)}>{label}</button>)}</div></details>}</nav>;
 }
 const screens=area.screens.filter(([id])=>canAccess(id));if(screens.length<2)return null;
 return <nav className="operations-context operations-sales-tabs" aria-label="Etapas de pedidos e vendas">{screens.map(([id,label])=><button type="button" key={id} aria-current={id===screen?'page':undefined} onClick={()=>onNavigate(id)}>{label}</button>)}</nav>;
}
