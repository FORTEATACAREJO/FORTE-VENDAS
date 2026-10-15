export const DRIVER_TEMPLATE_NAME='forte_convite_motorista';

export function chooseInvitationTemplate(source,generic,driver) {
  return source==='nkynfboqwfxhhxcsrawl'&&driver?.status==='APPROVED'&&driverTemplateCompatibility(driver).compatible?driver:generic;
}

export function driverTemplateCompatibility(template) {
  const fail=reason=>({compatible:false,reason});
  if(!template)return fail('NOT_FOUND');
  if(template.name!==DRIVER_TEMPLATE_NAME||template.language!=='pt_BR')return fail('IDENTITY_MISMATCH');
  if(template.parameter_format && template.parameter_format!=='POSITIONAL')return fail('PARAMETER_FORMAT');
  const components=template.components||[],body=components.find(c=>c.type==='BODY');
  const parameters=[...new Set([...String(body?.text||'').matchAll(/\{\{(\d+)\}\}/g)].map(m=>m[1]))];
  if(!body||parameters.length!==1||parameters[0]!=='1'||!(/motorista/i.test(body.text)&&/Forte Frete/i.test(body.text)))return fail('BODY_PARAMETERS');
  if(components.some(c=>c.type==='HEADER'&&(c.format!=='TEXT'||/\{\{/.test(c.text||''))))return fail('HEADER_PARAMETERS');
  const buttons=components.find(c=>c.type==='BUTTONS')?.buttons||[];
  if(buttons.length!==1||buttons[0].type!=='URL')return fail('BUTTON_COMPONENTS');
  const raw=buttons[0].url||'';
  if(!raw.endsWith('{{1}}')||[...raw.matchAll(/\{\{/g)].length!==1)return fail('BUTTON_NOT_PERSONALIZED');
  try{
    const url=new URL(raw.replace('{{1}}','DYNAMIC_INVITE_CODE'));
    if(url.origin!=='https://forte-frete.onrender.com'||url.pathname!=='/'||url.hash||url.username||url.password||
      url.searchParams.get('cadastro')!=='convite'||url.searchParams.get('convite')!=='1'||url.searchParams.get('codigo')!=='DYNAMIC_INVITE_CODE'||
      [...url.searchParams.keys()].some(key=>!['cadastro','convite','codigo'].includes(key))||[...url.searchParams.keys()].length!==3)return fail('BUTTON_DESTINATION');
  }catch{return fail('BUTTON_DESTINATION');}
  return {compatible:true,reason:'COMPATIBLE'};
}

export function driverInvitationPayload(template,invitation) {
  if(template?.status!=='APPROVED'||!driverTemplateCompatibility(template).compatible)throw Error('O modelo do motorista não está aprovado ou não corresponde ao convite individual.');
  const link=new URL(invitation.link),code=link.searchParams.get('codigo');
  if(link.origin!=='https://forte-frete.onrender.com'||link.pathname!=='/'||link.searchParams.get('cadastro')!=='convite'||link.searchParams.get('convite')!=='1'||!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(code||''))throw Error('Link individual do convite inválido.');
  return {messaging_product:'whatsapp',to:invitation.to,type:'template',template:{name:DRIVER_TEMPLATE_NAME,language:{code:'pt_BR'},components:[{type:'body',parameters:[{type:'text',text:invitation.name}]},{type:'button',sub_type:'url',index:'0',parameters:[{type:'text',text:code}]}]}};
}
