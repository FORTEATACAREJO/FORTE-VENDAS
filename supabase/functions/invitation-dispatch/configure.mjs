import {fixedSender,accessToken} from '../_shared/whatsapp-business.mjs';
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

export async function configureInvitationBusiness({actor,token,phone,waba,version,templateName=INVITE_TEMPLATE_NAME,fetcher=fetch,persist}) {
  const t=accessToken(token),{phone:p,waba:w}=fixedSender(phone,waba);
  if(!/^[a-z0-9_]{1,512}$/.test(templateName)) throw Error('Modelo WhatsApp inválido no servidor.');
  const auth={Authorization:'Bearer '+t};
  let response;try{response=await fetcher(`https://graph.facebook.com/${version}/${w}/phone_numbers?fields=id&limit=100`,{headers:auth,signal:AbortSignal.timeout(15000)});
  }catch{throw Error('Não foi possível validar o token na Meta. Tente novamente.');}
  let numbers;try{numbers=await response.json();}catch{throw Error('Resposta inválida da Meta ao validar o token.');}
  if(!response.ok) throw Error('Credenciais: a Meta não validou a conta e o número'+metaDiagnostic(numbers,response.status)+'.');
  if(!numbers.data?.some(item=>item.id===p)) throw Error('Credenciais: o número informado não pertence à conta Business.');

  // Persist only after validating the token/account/phone relationship. Template approval
  // is independent and must not discard credentials the Master has just supplied.
  await persist({p_actor:actor,p_token:t,p_phone:p,p_waba:w,p_template:templateName});
  const saved=(status,message)=>({credentials_saved:true,template_name:templateName,template_status:status,message});
  let templates;
  try {
    const queried=await fetcher(`https://graph.facebook.com/${version}/${w}/message_templates?name=${templateName}&fields=name,status,language`,{headers:auth,signal:AbortSignal.timeout(15000)});
    templates=await queried.json();
    if(!queried.ok) return saved('UNVERIFIED','Credenciais verificadas e salvas. A Meta não permitiu consultar os modelos'+metaDiagnostic(templates,queried.status)+'. Confira a permissão de gerenciamento do WhatsApp Business. O envio continua bloqueado.');
  } catch {
    return saved('UNVERIFIED','Credenciais verificadas e salvas. Não foi possível consultar o modelo na Meta. Atualize o status antes de tentar novamente. O envio continua bloqueado.');
  }
  const existing=templates.data?.find(item=>item.name===templateName && item.language==='pt_BR');
  if(existing?.status) return saved(existing.status,existing.status==='APPROVED'?'Business configurado para os convites de todos os sistemas.':`Credenciais verificadas e salvas. Situação do modelo: ${existing.status}. O envio depende da aprovação pela Meta.`);
  return saved('NOT_FOUND','Credenciais verificadas e salvas. O modelo configurado não foi encontrado na Meta. Confira o modelo aprovado antes de enviar; nenhum modelo foi criado ou alterado.');
}
