import {test} from 'node:test';import assert from 'node:assert/strict';
import {receiveInbox,listInbox,replyWindow} from '../supabase/functions/order-communications/inbox.mjs';
import {inboxAction} from '../supabase/functions/order-communications/inbox-actions.mjs';
const now=Date.now(),at=new Date(now).toISOString();
const value={metadata:{phone_number_id:'business'},contacts:[{wa_id:'5561999999999',profile:{name:'Contato de teste'}}],messages:[{id:'meta-1',from:'5561999999999',timestamp:String(Math.floor(now/1000)),type:'text',text:{body:'Orçamento de teste'}}]};
test('captura desconhecidos sem perder mensagem, evita duplicação e reabre conversa resolvida',()=>{
 const s={};receiveInbox(s,value,at);receiveInbox(s,value,at);assert.equal(s.whatsappInboxMessages.length,1);assert.equal(listInbox(s,{filter:'DESCONHECIDOS'}).total,1);assert.equal(listInbox(s).unread,1);
 s.whatsappInboxThreads[0].readAt=at;assert.equal(listInbox(s).unread,0);s.whatsappInboxThreads[0].state='RESOLVIDA';receiveInbox(s,{...value,messages:[{...value.messages[0],id:'meta-2'}]},new Date(now+1000).toISOString());assert.equal(s.whatsappInboxThreads[0].state,'PENDENTE');assert.equal(listInbox(s).unread,1);
});
test('PDF, áudio, imagem, botão e tipo não suportado ficam visíveis; papéis podem coincidir',()=>{
 const s={clientes:[{id:'c',nome:'CLIENTE',telefone:'5561999999999'}],motoristas:[{id:'m',nome:'MOTORISTA',whatsapp:'5561999999999'}]};
 for(const type of ['document','audio','image','button','unsupported'])receiveInbox(s,{...value,messages:[{...value.messages[0],id:type,text:undefined,type,[type]:type==='button'?{text:'Sim'}:{id:'media-'+type,mime_type:'application/pdf',filename:'teste.pdf'}}]},at);
 assert.equal(s.whatsappInboxMessages.length,5);assert.equal(s.whatsappInboxMessages.find(m=>m.type==='audio').mediaId,'media-audio');assert.equal(listInbox(s,{filter:'CLIENTES'}).total,1);assert.equal(listInbox(s,{filter:'MOTORISTAS'}).total,1);assert.equal(listInbox(s,{filter:'DESCONHECIDOS'}).total,0);
});
test('retornos fora de ordem preservam leitura e conteúdo; janela fecha em 24 horas',()=>{
 const s={};receiveInbox(s,value,at);const id=s.whatsappInboxThreads[0].id;assert(replyWindow(s,id,now));assert(!replyWindow(s,id,now+25*3600000));
 s.whatsappInboxMessages.push({id:'out',providerId:'provider-out',direction:'OUT',text:'preservar',state:'SENT'});
 receiveInbox(s,{statuses:[{id:'provider-out',status:'read',timestamp:'100'},{id:'provider-out',status:'sent',timestamp:'101'},{id:'provider-out',status:'failed',timestamp:'102'}]},at);assert.equal(s.whatsappInboxMessages.at(-1).state,'READ');assert.equal(s.whatsappInboxMessages.at(-1).text,'preservar');
});
function fixture(){let stored=receiveInbox({},value,at),sends=0;return {get state(){return stored;},get sends(){return sends;},args:{db:{},profile:{empresa_id:'company'},user:{id:'operator'},env:()=>'',rowFor:async()=>({estado:structuredClone(stored)}),persist:async(_db,_id,row)=>{stored=structuredClone(row.estado);},readBusiness:async()=>({token:'fixture-only',phone:'business',version:'v26.0'}),fetcher:async()=>{sends++;return {ok:true,json:async()=>({messages:[{id:'sent-id'}]})};}},threadId:stored.whatsappInboxThreads[0].id};}
test('claim e resposta têm persistência antes da Meta, idempotência e bloqueio de referência alterada',async()=>{
 const f=fixture(),body={action:'INBOX_REPLY',threadId:f.threadId,text:'Resposta de teste',commandId:'00000000-0000-4000-8000-000000000001'};const first=await inboxAction({...f.args,body});assert.equal(first.message.state,'SENT');await inboxAction({...f.args,body});assert.equal(f.sends,1);await assert.rejects(()=>inboxAction({...f.args,body:{...body,text:'outro'}}),/outra resposta/);
});
test('timeout não reenvia, não permite novo envio até reconciliar e falha de gravação não chama Meta',async()=>{
 const f=fixture(),body={action:'INBOX_REPLY',threadId:f.threadId,text:'Teste',commandId:'00000000-0000-4000-8000-000000000002'};
 const args={...f.args,fetcher:async()=>{throw Error('timeout');}};assert.equal((await inboxAction({...args,body})).message.state,'UNCERTAIN');await inboxAction({...args,body});await assert.rejects(()=>inboxAction({...args,body:{...body,commandId:'00000000-0000-4000-8000-000000000003'}}),/incerto/);
 const g=fixture();await assert.rejects(()=>inboxAction({...g.args,persist:async()=>{throw Error('conflito');},body:{...body,threadId:g.threadId}}),/conflito/);assert.equal(g.sends,0);
});
test('vínculo desconhecido e conversa de outra empresa são recusados; notas não viram mensagem externa',async()=>{
 const f=fixture();await assert.rejects(()=>inboxAction({...f.args,body:{action:'INBOX_MESSAGES',threadId:'outro'}}),/não encontrada/);await assert.rejects(()=>inboxAction({...f.args,body:{action:'INBOX_UPDATE',threadId:f.threadId,link:{type:'carga',id:'inexistente'}}}),/Vínculo/);
 await inboxAction({...f.args,body:{action:'INBOX_UPDATE',threadId:f.threadId,note:'Conferência interna',claim:true}});assert.equal(f.state.whatsappInboxMessages.at(-1).direction,'NOTE');assert.equal(f.state.whatsappInboxThreads[0].assignedTo,'operator');assert.equal(f.sends,0);
});
