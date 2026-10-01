import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.57.4';
const client=createClient('https://gtwecfyffjszghnvtlzr.supabase.co','sb_publishable_T7OUUD1cqIxMhll4UUSsyBQPFB_TLcx',{auth:{storage:sessionStorage,persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
const digits=v=>String(v||'').replace(/\D/g,'');
const root=document.getElementById('access'),content=document.getElementById('protected-content');
const isSite=document.body.dataset.app==='site';
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let sequence=0;
function login(message=''){
 content.hidden=true;
 root.innerHTML=`<section class="access-card"><h1>${isSite?'ADMINISTRAÇÃO DO SITE':'FORTE OPERADOR DE PÁTIO'}</h1><p>Acesso pelo cadastro Forte Vendas</p><form id="login-form"><label>CPF<input name="cpf" inputmode="numeric" autocomplete="username" maxlength="14" required></label><label>Senha de seis números<input name="password" type="password" inputmode="numeric" autocomplete="current-password" minlength="6" maxlength="6" pattern="[0-9]{6}" required></label><button>ENTRAR</button></form><p role="status" id="access-status">${escape(message)}</p><a href="https://forte-vendas.onrender.com/">Criar ou recuperar minha senha</a>${isSite?'<p><a href="/">Voltar ao site</a></p>':''}</section>`;
 document.getElementById('login-form').onsubmit=async event=>{
  event.preventDefault();const form=event.currentTarget,cpf=digits(form.elements.cpf.value),password=form.elements.password.value,status=document.getElementById('access-status');
  if(!/^\d{11}$/.test(cpf)||!/^\d{6}$/.test(password)){status.textContent='Informe CPF e senha de seis números.';return;}
  form.querySelector('button').disabled=true;status.textContent='Entrando…';
  try{const {data,error}=await client.functions.invoke('login-cpf',{body:{cpf,password}});if(error||!data?.access_token)throw Error('Não foi possível entrar. Confira CPF e senha.');
   const result=await client.auth.setSession({access_token:data.access_token,refresh_token:data.refresh_token});if(result.error)throw result.error;form.elements.password.value='';await authorize();
  }catch(error){status.textContent=error.message||'Não foi possível entrar.';form.querySelector('button').disabled=false;}
 };
}
export function hasAccess(profile,site){
 if(!profile?.ativo||profile.trocar_senha)return false;
 const role=String(profile.perfil||'').toUpperCase();
 return site?role==='MASTER':(['MASTER','ADMINISTRADOR'].includes(role)||/PATIO|PÁTIO|CONFERENTE/.test(role)||profile.permissoes?.patio===true||profile.permissoes?.PATIO===true);
}
async function authorize(){
 const current=++sequence;content.hidden=true;root.textContent='Conferindo acesso…';
 const {data:{user},error}=await client.auth.getUser();if(current!==sequence)return;if(error||!user){login();return;}
 const result=await client.from('fc_perfis').select('nome,cpf,email,whatsapp,perfil,ativo,trocar_senha,permissoes').eq('user_id',user.id).maybeSingle();if(current!==sequence)return;
 const p=result.data;if(result.error||!hasAccess(p,isSite)){login(p?.trocar_senha?'Crie ou recupere sua senha no Forte Vendas antes de entrar.':'Seu cadastro não tem acesso autorizado a esta área.');return;}
 root.innerHTML=`<section class="access-card compact"><strong>${escape(p.nome)} • ${escape(p.perfil)}</strong><button id="signout">SAIR</button></section>`;
 document.getElementById('signout').onclick=async()=>{++sequence;content.hidden=true;await client.auth.signOut();login();};
 if(isSite){document.getElementById('master-profile').textContent=`${p.nome}\nCPF: ${p.cpf}\nWhatsApp: ${p.whatsapp}\nE-mail: ${p.email}`;}
 content.hidden=false;
 if(!isSite&&!content.dataset.loaded){await import('./app.js');content.dataset.loaded='true';}
}
client.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){++sequence;content.hidden=true;login();}});
authorize().catch(()=>login('Não foi possível conferir seu acesso. Tente novamente.'));
