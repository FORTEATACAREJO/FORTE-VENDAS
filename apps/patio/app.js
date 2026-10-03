let client,model=null,generation=0,promptInstall=null,busy=false;
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const quantity=v=>v==null?'—':Number(v).toLocaleString('pt-BR',{maximumFractionDigits:6});
const message=text=>{document.getElementById('patio-status').textContent=text;};
addEventListener('beforeinstallprompt',event=>{event.preventDefault();promptInstall=event;});
async function rpc(name,args){const result=await client.rpc(name,args);if(result.error)throw new Error(/permission denied|jwt|row-level security/i.test(result.error.message)?'Acesso não autorizado. Confira a sessão e sua aprovação.':result.error.message||'Não foi possível gravar. Confira a conexão.');return result.data;}
function render(){
 const select=document.getElementById('caixa');select.innerHTML='<option value="">Selecione o caixa aberto</option>'+(model?.caixas||[]).map(cx=>`<option value="${escape(cx.id)}">${escape(cx.data)} • ${escape(cx.unidade)} • ${escape(cx.operador)}</option>`).join('');select.value=model?.caixaId||'';
 const box=document.getElementById('produtos');
 box.innerHTML=(model?.itens||[]).map((it,index)=>`<article class="card"><b>${escape(it.marca)} • ${escape(it.produto)}</b><p>Estoque único: ${quantity(it.total)} | Bloqueado: ${quantity(it.bloqueado)}<br>Disponível para contar: <strong>${quantity(it.disponivel)} ${escape(it.unidade)}</strong></p>${it.inconsistente?'<p class="diff">Estoque ou reserva inconsistente. O fechamento ficará bloqueado até a revisão dos movimentos e orçamentos.</p>':''}<label>Contagem física<input id="contagem-${index}" inputmode="decimal" autocomplete="off" value="${it.contagem==null?'':escape(it.contagem)}" placeholder="Informe a quantidade contada"></label><button data-gravar="${index}" ${busy?'disabled':''}>GRAVAR CONTAGEM</button><p class="${it.contagem!=null&&it.atual&&Number(it.diferenca)===0?'zero':'diff'}">${it.contagem==null?'Contagem pendente':!it.atual?'Estoque ou orçamento mudou: conte novamente':'Diferença: '+quantity(it.diferenca)}</p>${it.gravadoEm?`<small>Última contagem: ${escape(it.conferente)} • ${escape(new Date(it.gravadoEm).toLocaleString('pt-BR'))}</small>`:''}</article>`).join('');
 box.querySelectorAll('button[data-gravar]').forEach(button=>button.onclick=()=>saveCount(Number(button.dataset.gravar)));
 document.getElementById('finalizar').disabled=busy||!model?.caixaId;
 if(model?.caixaId)message(model.liberado?'TODOS OS PRODUTOS CONFERIDOS. O caixa pode ser fechado no Forte Vendas.':`${model.totalProdutos} produto(s) • ${model.pendentes} pendente(s) • ${model.divergencias} diferença(s) • ${model.desatualizados} contagem(ns) desatualizada(s). Fechamento bloqueado.`);
 else message(model?.caixas?.length?'Selecione um caixa e conte todos os produtos de revenda.':'Nenhum caixa aberto. Abra o caixa no Forte Vendas antes de iniciar.');
}
async function refresh(caixa=document.getElementById('caixa').value){
 if(busy)return;
 const token=generation;busy=true;message('Atualizando estoque e contagens…');
 document.getElementById('caixa').disabled=true;document.getElementById('atualizar').disabled=true;
 document.querySelectorAll('[data-gravar]').forEach(b=>b.disabled=true);document.getElementById('finalizar').disabled=true;
 try{const result=await rpc('fc_patio_status',{p_caixa:caixa||null});if(token!==generation)return;model=result;render();}
 catch(error){if(token===generation)message(error.message);}
 finally{if(token===generation){busy=false;document.getElementById('caixa').disabled=false;document.getElementById('atualizar').disabled=false;document.querySelectorAll('[data-gravar]').forEach(b=>b.disabled=false);document.getElementById('finalizar').disabled=!model?.caixaId;}}
}
async function saveCount(index){
 if(busy||!model?.caixaId)return;
 const raw=document.getElementById('contagem-'+index).value.trim().replace(',','.');
 if(!/^\d+(?:\.\d{1,6})?$/.test(raw)||Number(raw)>1e12)return message('Informe a quantidade contada, não negativa, com até seis casas decimais. Campo vazio não é zero.');
 const item=model.itens[index],token=generation;busy=true;document.querySelectorAll('[data-gravar]').forEach(b=>b.disabled=true);message('Gravando a contagem…');
 document.getElementById('caixa').disabled=true;document.getElementById('atualizar').disabled=true;document.getElementById('finalizar').disabled=true;
 try{const result=await rpc('fc_patio_contar',{p_caixa:model.caixaId,p_produto:item.produtoId,p_contagem:Number(raw),p_base:item.base});if(token!==generation)return;model={...model,...result};render();}
 catch(error){if(token===generation)message(error.message);}
 finally{if(token===generation){busy=false;document.getElementById('caixa').disabled=false;document.getElementById('atualizar').disabled=false;document.querySelectorAll('[data-gravar]').forEach(b=>b.disabled=false);document.getElementById('finalizar').disabled=!model?.caixaId;}}
}
export function stopPatio(){++generation;model=null;busy=false;document.getElementById('produtos').replaceChildren();document.getElementById('caixa').disabled=false;document.getElementById('atualizar').disabled=false;}
export async function startPatio(connection){
 stopPatio();client=connection;
 document.getElementById('caixa').onchange=()=>refresh();
 document.getElementById('atualizar').onclick=()=>refresh();
 document.getElementById('finalizar').onclick=()=>refresh();
 document.getElementById('compartilhar').onclick=async()=>{const data={title:document.title,text:'Forte Operador de Pátio',url:location.href};try{if(navigator.share)await navigator.share(data);else{await navigator.clipboard.writeText(location.href);message('Link do aplicativo copiado. Cada pessoa acessa com seu próprio CPF.');}}catch{message('Compartilhamento não concluído.');}};
 document.getElementById('instalar').onclick=async()=>{if(promptInstall){await promptInstall.prompt();await promptInstall.userChoice;promptInstall=null;}else message(/iphone|ipad|ipod/i.test(navigator.userAgent)?'Use Compartilhar > Adicionar à Tela de Início.':'Use Instalar aplicativo no navegador.');};
 await refresh('');
}
