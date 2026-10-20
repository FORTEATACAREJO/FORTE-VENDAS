export const documentTemplates={FORNECEDOR:'forte_pedido_fornecedor_pdf',ORDEM_MOTORISTA:'forte_ordem_carregamento_pdf'};
export async function readBusiness(db,env){
 const r=await db.rpc('shared_invite_business_read');if(r.error)throw Error('Não foi possível consultar a configuração Business existente.');const c=r.data||{};
 return {token:c.token||env('WHATSAPP_ACCESS_TOKEN'),phone:c.phone_id||env('WHATSAPP_PHONE_ID')||env('WHATSAPP_PHONE_NUMBER_ID'),waba:c.waba_id||env('WHATSAPP_WABA_ID')||env('WHATSAPP_BUSINESS_ACCOUNT_ID'),version:env('WHATSAPP_GRAPH_VERSION')||'v26.0'};
}
export function compatibleDocumentTemplate(t){
 const body=t?.components?.find(c=>c.type==='BODY'),header=t?.components?.find(c=>c.type==='HEADER');
 const params=[...String(body?.text||'').matchAll(/\{\{([^}]+)\}\}/g)].map(x=>x[1]);
 return t?.status==='APPROVED'&&t.language==='pt_BR'&&header?.format==='DOCUMENT'&&JSON.stringify([...new Set(params)].sort())==='["1","2"]'&&t.parameter_format!=='NAMED'&&!t.components.some(c=>c.type==='BUTTONS');
}
export async function requireDocumentTemplate(config,kind,env,fetcher=fetch){
 const name=env('WHATSAPP_TEMPLATE_'+kind)||documentTemplates[kind];
 if(!config.token||!config.phone||!config.waba)throw Error('A configuração Business existente está incompleta.');
 const r=await fetcher(`https://graph.facebook.com/${config.version}/${config.waba}/message_templates?name=${encodeURIComponent(name)}&fields=name,status,language,components,parameter_format`,{headers:{Authorization:'Bearer '+config.token},signal:AbortSignal.timeout(15000)});const out=await r.json();
 if(!r.ok)throw Error('Não foi possível verificar o modelo de PDF na Meta (HTTP '+r.status+').');
 const t=out.data?.find(t=>t.name===name&&t.language==='pt_BR');if(!compatibleDocumentTemplate(t))throw Error('Modelo de PDF '+name+' ainda não está aprovado ou compatível na Meta. O modelo de convite é separado; mantenha as credenciais existentes.');return name;
}
