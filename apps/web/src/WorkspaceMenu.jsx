import {Icon} from './ForteUI.jsx';
import {workspaceItemActive} from './workspace-navigation.mjs';
import './workspace-navigation.css';
export default function WorkspaceMenu({navigation,screen,group,onNavigate}){
 const button=item=><button type="button" key={item.id} aria-current={workspaceItemActive(item,screen,group)?'page':undefined} className={workspaceItemActive(item,screen,group)?'sideActive':''} onClick={()=>onNavigate(item.id)}><Icon name={item.icon}/><span>{item.label}</span></button>;
 return <nav className="workspace-drawer-nav" aria-label="Áreas do Forte Vendas"><div className="workspace-primary">{navigation.main.map(button)}</div>{navigation.more.length>0&&<details key={group} open={navigation.more.some(item=>workspaceItemActive(item,screen,group))||undefined}><summary>Mais opções</summary><div>{navigation.more.map(button)}</div></details>}</nav>;
}
