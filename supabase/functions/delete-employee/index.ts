import { createClient } from "npm:@supabase/supabase-js@2.57.0";

const allowed = new Set(["https://forte-vendas.onrender.com","http://localhost:5178"]);
const headers = {"Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Content-Type":"application/json","Cache-Control":"no-store"};
const reply=(origin:string,status:number,body:Record<string,unknown>)=>new Response(JSON.stringify(body),{status,headers:{...headers,"Access-Control-Allow-Origin":origin}});
const digits=(v:unknown)=>String(v??"").replace(/\D/g,"");

Deno.serve(async (request)=>{
  const origin=request.headers.get("origin")||"";
  if(request.method==="OPTIONS") return allowed.has(origin)?new Response(null,{status:204,headers:{...headers,"Access-Control-Allow-Origin":origin}}):new Response(null,{status:403});
  if(request.method!=="POST"||!allowed.has(origin)) return new Response(null,{status:403});
  try{
    const url=Deno.env.get("SUPABASE_URL")!;
    const serviceRole=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader=request.headers.get("authorization")||"";
    const token=authHeader.replace(/^Bearer\s+/i,"").trim();
    if(!token) return reply(origin,401,{error:"SESSÃO NÃO IDENTIFICADA."});
    const admin=createClient(url,serviceRole,{auth:{persistSession:false,autoRefreshToken:false}});
    const caller=await admin.auth.getUser(token);
    if(caller.error||!caller.data.user) return reply(origin,401,{error:"SESSÃO INVÁLIDA."});
    const callerProfile=await admin.from("fc_perfis").select("user_id,nome,cpf,email,perfil,ativo").eq("user_id",caller.data.user.id).maybeSingle();
    const role=String(callerProfile.data?.perfil||"").toUpperCase();
    if(!callerProfile.data?.ativo||!["ADMINISTRADOR","ADMIN","MASTER"].includes(role)) return reply(origin,403,{error:"SOMENTE ADMIN OU MASTER PODE EXCLUIR CADASTROS."});

    const body=await request.json();
    const cpf=digits(body.cpf);
    const email=String(body.email||"").trim().toLowerCase();
    if(!cpf&&!email) return reply(origin,400,{error:"INFORME CPF OU E-MAIL DO CADASTRO."});
    let query=admin.from("fc_perfis").select("user_id,nome,cpf,email,perfil,ativo");
    query=cpf?query.eq("cpf",cpf):query.eq("email",email);
    const target=await query.maybeSingle();
    if(target.error) return reply(origin,500,{error:"NÃO FOI POSSÍVEL LOCALIZAR O CADASTRO."});
    if(!target.data) return reply(origin,200,{deleted:true,authDeleted:false,message:"CADASTRO LOCAL LIBERADO PARA EXCLUSÃO; NÃO HAVIA PERFIL CORRESPONDENTE NO SUPABASE."});
    if(target.data.user_id===caller.data.user.id) return reply(origin,409,{error:"VOCÊ NÃO PODE EXCLUIR O PRÓPRIO CADASTRO."});
    const targetRole=String(target.data.perfil||"").toUpperCase();
    if(targetRole==="MASTER"&&role!=="MASTER") return reply(origin,403,{error:"SOMENTE MASTER PODE EXCLUIR OUTRO MASTER."});
    if(targetRole==="MASTER"&&target.data.ativo!==false){
      const masters=await admin.from("fc_perfis").select("user_id",{count:"exact",head:true}).eq("perfil","MASTER").eq("ativo",true);
      if((masters.count||0)<=1) return reply(origin,409,{error:"O ÚLTIMO MASTER ATIVO NÃO PODE SER EXCLUÍDO."});
    }

    await admin.from("fc_usuarios_pendentes").delete().eq("auth_user_id",target.data.user_id);
    const profileDelete=await admin.from("fc_perfis").delete().eq("user_id",target.data.user_id);
    if(profileDelete.error) return reply(origin,500,{error:"NÃO FOI POSSÍVEL REMOVER O PERFIL DO USUÁRIO."});
    const authDelete=await admin.auth.admin.deleteUser(target.data.user_id);
    if(authDelete.error) return reply(origin,500,{error:"O PERFIL FOI REMOVIDO, MAS O ACESSO AUTH NÃO PÔDE SER EXCLUÍDO. REVISE O AUTH DO SUPABASE."});
    return reply(origin,200,{deleted:true,authDeleted:true,message:"CADASTRO E ACESSO EXCLUÍDOS DEFINITIVAMENTE."});
  }catch{
    return reply(origin,500,{error:"NÃO FOI POSSÍVEL CONCLUIR A EXCLUSÃO."});
  }
});