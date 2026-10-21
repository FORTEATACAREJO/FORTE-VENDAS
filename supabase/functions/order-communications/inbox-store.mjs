import {receiveInbox} from './inbox.mjs';
const keys=['whatsappInboxThreads','whatsappInboxMessages','whatsappInboxEvents','whatsappInboxAudit'];
export async function inboxRowFor(db,empresa){
 let result=await db.from('whatsapp_inbox_state').select('estado,versao').eq('empresa_id',empresa).maybeSingle();
 if(result.error)throw Error('Armazenamento da Central WhatsApp indisponível.');
 if(!result.data){const created=await db.from('whatsapp_inbox_state').upsert({empresa_id:empresa,estado:{},versao:0},{onConflict:'empresa_id',ignoreDuplicates:true});if(created.error)throw Error('Não foi possível iniciar a caixa de mensagens.');result=await db.from('whatsapp_inbox_state').select('estado,versao').eq('empresa_id',empresa).single();if(result.error)throw Error('Caixa de mensagens indisponível.');}
 const contacts=await db.from('fc_app_state').select('estado').eq('empresa_id',empresa).single();if(contacts.error)throw Error('Não foi possível conferir os vínculos comerciais.');
 const source=contacts.data.estado,reference={};
 for(const key of ['clientes','motoristas','fornecedores','vendas','comprasFornecedor','cargas','vendasBalcao'])reference[key]=source[key]||[];
 return {estado:{...reference,...result.data.estado},versao:result.data.versao};
}
export async function persistInbox(db,empresa,row){
 const estado={};for(const key of keys)estado[key]=row.estado[key]||[];
 const result=await db.from('whatsapp_inbox_state').update({estado,versao:row.versao+1,updated_at:new Date().toISOString()}).eq('empresa_id',empresa).eq('versao',row.versao).select('versao');
 if(result.error||result.data?.length!==1)throw Error('Outro atendente atualizou a conversa. Atualize antes de continuar.');
 row.versao++;
}
export async function captureInbox(db,empresa,value){
 for(let attempt=0;attempt<3;attempt++){
  const row=await inboxRowFor(db,empresa),before=JSON.stringify(row.estado);receiveInbox(row.estado,value);
  if(JSON.stringify(row.estado)===before)return;
  try{await persistInbox(db,empresa,row);return;}catch(error){if(attempt===2)throw error;}
 }
}
