const digits=v=>String(v||'').replace(/\D/g,'');
const timestamp=v=>{const n=Number(v);return Number.isFinite(n)&&n>0?new Date(n*1000).toISOString():null;};
export function receiveInbox(state,value,now=new Date().toISOString()){
 const threads=state.whatsappInboxThreads||=[],messages=state.whatsappInboxMessages||[],events=state.whatsappInboxEvents||[];
 for(const message of value.messages||[]){
  if(!message.id||messages.some(m=>m.providerId===message.id))continue;
  const from=digits(message.from);if(!/^[0-9]{8,16}$/.test(from))continue;
  const id=String(value.metadata?.phone_number_id||'')+':'+from;
  let thread=threads.find(t=>t.id===id);if(!thread){thread={id,phone:from,state:'PENDENTE',labels:[],createdAt:now,readAt:null,assignedTo:null,links:[]};threads.push(thread);}
  const at=timestamp(message.timestamp)||now;
  const contact=(value.contacts||[]).find(c=>digits(c.wa_id)===from);
  if(contact?.profile?.name)thread.name=String(contact.profile.name).slice(0,200);
  const media=message[message.type];
  const text=message.text?.body||message.button?.text||message.interactive?.button_reply?.title||message.interactive?.list_reply?.title||media?.caption||'';
  messages.push({id:message.id,providerId:message.id,threadId:id,direction:'IN',type:message.type||'unsupported',text:String(text).slice(0,10000),at,receivedAt:now,contextId:message.context?.id||null,mediaId:media?.id||null,mime:media?.mime_type||null,filename:media?.filename||null,state:'RECEIVED',unsupported:message.type==='unsupported',rawMessage:structuredClone(message)});
  if(!thread.lastAt||at>thread.lastAt){thread.lastAt=at;thread.preview=String(text||'['+(message.type||'mensagem')+']').slice(0,150);}
  if(thread.state==='RESOLVIDA')thread.state='PENDENTE';
 }
 for(const status of value.statuses||[]){
  if(!status.id||!['sent','delivered','read','failed'].includes(status.status))continue;
  const id=status.id+':'+status.status+':'+status.timestamp;
  if(!events.some(e=>e.id===id))events.push({id,providerId:status.id,state:status.status.toUpperCase(),at:timestamp(status.timestamp)||now});
 }
 applyInboxStatuses(messages,events);
 state.whatsappInboxThreads=threads;state.whatsappInboxMessages=messages;state.whatsappInboxEvents=events;
 return state;
}
export function applyInboxStatuses(messages,events){
 const rank={SENDING:0,UNCERTAIN:0,FAILED:0,SENT:1,DELIVERED:2,READ:3};
 for(const event of events){const message=messages.find(m=>m.direction==='OUT'&&m.providerId===event.providerId);if(!message)continue;if(event.state==='FAILED'){if(!['DELIVERED','READ'].includes(message.state))message.state='FAILED';}else if((rank[event.state]||0)>(rank[message.state]||0))message.state=event.state;}
}
export function listInbox(state,{query='',filter='TODAS',offset=0}={}){
 const term=String(query).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().slice(0,100);
 const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const matches=(collection,phone)=>collection.filter(c=>digits(c.whatsapp||c.telefone||c.celular)===phone).map(c=>({id:c.id,name:c.nome||c.razaoSocial||'',phone}));
 const all=(state.whatsappInboxThreads||[]).map(t=>{const found={clientes:matches(state.clientes||[],t.phone),motoristas:matches(state.motoristas||[],t.phone),fornecedores:matches(state.fornecedores||[],t.phone)};return {...t,matches:found,unread:(state.whatsappInboxMessages||[]).filter(m=>m.threadId===t.id&&m.direction==='IN'&&(!t.readAt||m.receivedAt>t.readAt)).length};});
 const selected=all.filter(t=>(!term||norm([t.name,t.phone,t.preview,...Object.values(t.matches).flat().map(m=>m.name)].join(' ')).includes(term)||(state.whatsappInboxMessages||[]).some(m=>m.threadId===t.id&&norm(m.text).includes(term)))&&(filter==='TODAS'||filter==='NAO_LIDAS'&&t.unread>0||filter==='DESCONHECIDOS'&&!Object.values(t.matches).some(a=>a.length)||filter==='CLIENTES'&&t.matches.clientes.length||filter==='MOTORISTAS'&&t.matches.motoristas.length||filter==='FORNECEDORES'&&t.matches.fornecedores.length||filter===t.state));
 selected.sort((a,b)=>String(b.lastAt||'').localeCompare(String(a.lastAt||'')));
 return {threads:selected.slice(offset,offset+100),total:selected.length,unread:all.reduce((n,t)=>n+t.unread,0)};
}
export function replyWindow(state,threadId,now=Date.now()){
 const last=(state.whatsappInboxMessages||[]).filter(m=>m.threadId===threadId&&m.direction==='IN').map(m=>Date.parse(m.at)).filter(Number.isFinite).sort((a,b)=>b-a)[0];
 return Boolean(last&&last<=now&&now-last<24*60*60*1000);
}
