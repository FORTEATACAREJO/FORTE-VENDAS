import {customerName} from './customer-name.js';
import {parseMoneyInput,roundMoney,isClosedTitle} from './financial.js';
export const normalize=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim();
export const todayBrazil=(date=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
export function dayNumber(v){if(!/^\d{4}-\d{2}-\d{2}$/.test(String(v)))return null;const n=Date.parse(v+'T00:00:00Z');return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===v?n/86400000:null;}
const amount=v=>{const n=parseMoneyInput(v);return Number.isFinite(n)&&n>=0?n:null;};
export function collectionReport(data,filters={},today=todayBrazil()){
 const rows=[],pending=[],closed=[];const day=dayNumber(today);
 for(const b of data.boletosClientes||[]){
  if(b.banco&&!/ITAU|341/.test(normalize(b.banco)))continue;
  const original=amount(b.valor),due=dayNumber(b.vencimento),status=normalize(b.status);
  if(isClosedTitle(b)||/^(BAIXADO|BAIXADA|REJEITADO|REJEITADA)(\b|\/)/.test(status)){closed.push(b);continue;}
  const received=amount(b.valorRecebido??0),open=b.saldoAberto!=null?amount(b.saldoAberto):(original!=null&&received!=null?roundMoney(Math.max(0,original-received)):null);
  if(open===0)continue;
  if(/^(AGUARDANDO EMISSAO|SOLICITACAO DE EMISSAO)/.test(status)||!String(b.nossoNumero??'').trim()||original==null||original<=0||open==null||due==null){pending.push(b);continue;}
  const client=(data.clientes||[]).find(c=>c.id===b.clienteId);
  const name=customerName(b,data.clientes||[])||'Cliente não identificado',legal=client?.razaoSocial||client?.nome||b.cliente||'';
  const days=Math.max(0,day-due),situation=due<day?'VENCIDO':due===day?'VENCE HOJE':'A VENCER';
  rows.push({...b,name,legal,original,open,days,situation,clientKey:b.clienteId||normalize(legal||name),dda:b.dda===true||normalize(b.dda)==='SIM'?'SIM':b.dda===false||normalize(b.dda)==='NAO'?'NÃO':'—'});
 }
 const query=normalize(filters.query);const selected=rows.filter(r=>(!query||normalize([r.name,r.legal,r.nossoNumero,r.seuNumero,r.numeroVenda].join(' ')).includes(query))&&(!filters.client||r.clientKey===filters.client)&&(!filters.start||r.vencimento>=filters.start)&&(!filters.end||r.vencimento<=filters.end)&&(!filters.status||filters.status==='ABERTOS'||r.situation===filters.status));
 selected.sort((a,b)=>filters.group? a.name.localeCompare(b.name,'pt-BR')||a.clientKey.localeCompare(b.clientKey)||a.vencimento.localeCompare(b.vencimento):a.vencimento.localeCompare(b.vencimento)||a.name.localeCompare(b.name,'pt-BR'));
 const total=list=>roundMoney(list.reduce((s,r)=>s+r.open,0));
 const groups=Object.values(selected.reduce((g,r)=>{g[r.clientKey]??={key:r.clientKey,name:r.name,count:0,open:0,overdue:0};g[r.clientKey].count++;g[r.clientKey].open=roundMoney(g[r.clientKey].open+r.open);if(r.days)g[r.clientKey].overdue=roundMoney(g[r.clientKey].overdue+r.open);return g;},{})).sort((a,b)=>b.overdue-a.overdue||a.name.localeCompare(b.name,'pt-BR'));
 return {today,rows:selected,pending,closed,groups,clients:[...new Map(rows.map(r=>[r.clientKey,{key:r.clientKey,name:r.name}])).values()].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')),totals:{count:selected.length,open:total(selected),overdue:total(selected.filter(r=>r.days>0)),dueToday:total(selected.filter(r=>r.situation==='VENCE HOJE')),future:total(selected.filter(r=>r.situation==='A VENCER'))},aging:[['1 a 7 dias',1,7],['8 a 30 dias',8,30],['31 a 60 dias',31,60],['Mais de 60 dias',61,Infinity]].map(([label,min,max])=>({label,count:selected.filter(r=>r.days>=min&&r.days<=max).length,total:total(selected.filter(r=>r.days>=min&&r.days<=max))}))};
}
