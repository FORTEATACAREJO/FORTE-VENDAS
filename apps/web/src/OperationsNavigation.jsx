import {salesAreaFor,visibleSalesAreas} from './operations-navigation.mjs';
import './operations-navigation.css';
export function OperationsMenu({canAccess,onNavigate}){
 const areas=visibleSalesAreas(canAccess);
 return <section className="operations-home"><header><h2>OPERAÇÃO</h2><p>Vendas, compras e pallets, com as cargas em um único painel logístico.</p></header><nav aria-label="Painéis de trabalho" className="operations-menu">{areas.map(area=><button type="button" key={area.id} onClick={()=>onNavigate(area.entry)}><strong>{area.title}</strong><span>{area.description}</span></button>)}</nav></section>;
}
export function OperationContextNav({screen,canAccess,onNavigate}){
 const area=salesAreaFor(screen);if(!area||!canAccess(screen))return null;
 const tools=(area.more||[]).filter(([id])=>canAccess(id));
 return <nav className="operations-context" aria-label="Painéis da operação"><div className="operations-sales-tabs">{visibleSalesAreas(canAccess).map(a=><button type="button" key={a.id} aria-current={area.id===a.id?'page':undefined} onClick={()=>onNavigate(a.entry)}>{a.title}</button>)}</div>{tools.length>0&&<details><summary>Ferramentas de {area.title.toLowerCase()}</summary><div>{tools.map(([id,label])=><button type="button" key={id} aria-current={id===screen?'page':undefined} onClick={()=>onNavigate(id)}>{label}</button>)}</div></details>}</nav>;
}
