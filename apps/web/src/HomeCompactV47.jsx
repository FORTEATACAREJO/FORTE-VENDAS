import React from"react";

export default function HomeCompactV47({groups,canIntegrations,onOpen,onGmail,onFinance}){
 const visible=groups;
 return <div className="dashboardGroups"><section className="dashboardGroup"><div className="dashboardGroupHead"><div><h2>PAINEL PRINCIPAL</h2><p>ACESSOS ORGANIZADOS POR ÁREA. AS FUNÇÕES DETALHADAS APARECEM SOMENTE DEPOIS QUE O GRUPO É ABERTO.</p></div><span>{visible.length} ÁREAS</span></div><nav className="tabs mega moduleCards dashboardCards groupedCards">{visible.map((g,i)=><button key={g.id} onClick={()=>onOpen(g.id)}><div className="moduleNumber">{i+1}</div><span>{g.title}</span><small>{g.subtitle}</small><em>ABRIR ÁREA</em></button>)}</nav></section>{canIntegrations&&<section className="dashboardGroup integrationsGroup"><div className="dashboardGroupHead"><div><h2>INTEGRAÇÕES</h2><p>ATALHOS ÚNICOS PARA AS CONEXÕES EXTERNAS.</p></div></div><div className="integrationCards"><button onClick={onGmail}><b>GMAIL / WHATSAPP</b><small>SINCRONIZAÇÃO E STATUS</small></button><button onClick={onFinance}><b>BANCOS / CARTÕES</b><small>CONCILIAÇÃO E IMPORTAÇÃO</small></button></div></section>}</div>
}
