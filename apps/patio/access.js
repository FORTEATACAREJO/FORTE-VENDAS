import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.116.0';
import {startAccess} from './access-standard.js';
const client=createClient('https://gtwecfyffjszghnvtlzr.supabase.co','sb_publishable_RP8g0VoZdWh8e9R7Nb9mYw_GSXjSuD3',{auth:{storage:localStorage,persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const content=document.getElementById('protected-content'),root=document.getElementById('access');let patioModule=null;
root.textContent='';
const access=startAccess({client,app:'patio',content,onBlocked:()=>patioModule?.stopPatio()});
access.ready.then(async()=>{patioModule=await import('./app.js');await patioModule.startPatio(client);root.innerHTML='<section class="access-card compact"><strong>Acesso autorizado ao Pátio</strong><button id="signout">SAIR</button></section>';root.querySelector('button').onclick=()=>client.auth.signOut()});

