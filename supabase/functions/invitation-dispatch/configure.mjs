export const INVITE_TEMPLATE_NAME = 'forte_acesso_convite';
export const INVITE_TEMPLATE_BODY = 'Olá, {{1}}! A Forte Atacarejo convida você a criar seu acesso. Seu perfil será definido pela administração após análise. Preencha o cadastro pelo link: {{2}} Depois de concluir o cadastro, aguarde a análise da administração.';

export function inviteTemplateDefinition() {
  return {name:INVITE_TEMPLATE_NAME,language:'pt_BR',category:'MARKETING',parameter_format:'POSITIONAL',components:[{type:'BODY',text:INVITE_TEMPLATE_BODY,example:{body_text:[['Convidado','https://forte-vendas.onrender.com/?cadastro=convite']]}}]};
}

// Only numeric diagnostics are exposed. Meta messages can contain request values.
export function metaDiagnostic(payload, httpStatus) {
  const parts = [];
  if (Number.isInteger(payload?.error?.code)) parts.push('código '+payload.error.code);
  if (Number.isInteger(payload?.error?.error_subcode)) parts.push('subcódigo '+payload.error.error_subcode);
  if (!parts.length && Number.isInteger(httpStatus)) parts.push('HTTP '+httpStatus);
  return parts.length ? ' ('+parts.join(', ')+')' : '';
}

export async function configureInvitationBusiness({actor,token,phone,waba,version,fetcher=fetch,persist}) {
  const t=String(token||'').trim(),p=String(phone||'').trim(),w=String(waba||'').trim();
  if(t.length<30 || t.length>4096 || /\s/.test(t) || !/^\d+$/.test(p) || !/^\d+$/.test(w)) throw Error('Credenciais: informe token completo sem espaços, ID do número e ID da conta Business.');
  const auth={Authorization:'Bearer '+t};
  const response=await fetcher(`https://graph.facebook.com/${version}/${w}/phone_numbers?fields=id&limit=100`,{headers:auth,signal:AbortSignal.timeout(15000)});
  const numbers=await response.json();
  if(!response.ok) throw Error('Credenciais: a Meta não validou a conta e o número'+metaDiagnostic(numbers,response.status)+'.');
  if(!numbers.data?.some(item=>item.id===p)) throw Error('Credenciais: o número informado não pertence à conta Business.');

  // Persist only after validating the token/account/phone relationship. Template approval
  // is independent and must not discard credentials the Master has just supplied.
  await persist({p_actor:actor,p_token:t,p_phone:p,p_waba:w,p_template:INVITE_TEMPLATE_NAME});
  const saved=(status,message)=>({credentials_saved:true,template_name:INVITE_TEMPLATE_NAME,template_status:status,message});
  let templates;
  try {
    const queried=await fetcher(`https://graph.facebook.com/${version}/${w}/message_templates?name=${INVITE_TEMPLATE_NAME}&fields=name,status,language`,{headers:auth,signal:AbortSignal.timeout(15000)});
    templates=await queried.json();
    if(!queried.ok) return saved('UNVERIFIED','Credenciais verificadas e salvas. A Meta não permitiu consultar os modelos'+metaDiagnostic(templates,queried.status)+'. Confira a permissão de gerenciamento do WhatsApp Business. O envio continua bloqueado.');
  } catch {
    return saved('UNVERIFIED','Credenciais verificadas e salvas. Não foi possível consultar o modelo na Meta. Atualize o status antes de tentar novamente. O envio continua bloqueado.');
  }
  const existing=templates.data?.find(item=>item.name===INVITE_TEMPLATE_NAME && item.language==='pt_BR');
  if(existing?.status) return saved(existing.status,existing.status==='APPROVED'?'Business configurado para os convites de todos os sistemas.':`Credenciais verificadas e salvas. Situação do modelo: ${existing.status}. O envio depende da aprovação pela Meta.`);
  try {
    const created=await fetcher(`https://graph.facebook.com/${version}/${w}/message_templates`,{method:'POST',headers:{...auth,'Content-Type':'application/json'},body:JSON.stringify(inviteTemplateDefinition()),signal:AbortSignal.timeout(20000)});
    const result=await created.json();
    if(!created.ok) return saved('CREATION_REJECTED','Credenciais verificadas e salvas. A Meta recusou a criação do modelo de convite'+metaDiagnostic(result,created.status)+'. O envio continua bloqueado; confira o modelo e as permissões na Meta.');
    const status=result.status||'PENDING';
    return saved(status,status==='APPROVED'?'Business configurado e modelo aprovado para os convites.':'Credenciais verificadas e salvas. Modelo enviado à Meta; aguarde a aprovação antes de enviar os convites.');
  } catch {
    return saved('UNVERIFIED','Credenciais verificadas e salvas. A resposta da criação do modelo não foi confirmada. Atualize o status antes de tentar novamente. Nenhum convite foi enviado.');
  }
}
