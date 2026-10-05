import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const normalizePhone = (value: unknown) => {
  let phone = String(value ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (/^\d{10,11}$/.test(phone)) phone = `55${phone}`;
  return phone;
};

const cpfIsValid=(cpf:string)=>{if(!/^\d{11}$/.test(cpf)||/^(\d)\1{10}$/.test(cpf))return false;for(const n of[9,10]){let sum=0;for(let i=0;i<n;i++)sum+=Number(cpf[i])*(n+1-i);if((sum*10%11)%10!==Number(cpf[n]))return false}return true};
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: request.headers.get("Authorization") || "" } },
    });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) throw new Error("SESSÃO INVÁLIDA.");

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: profile } = await admin.from("fc_perfis").select("empresa_id,perfil,status_aprovacao,trocar_senha,must_change_password")
      .eq("user_id", user.id).eq("ativo", true).single();
    if (!profile || profile.status_aprovacao !== "APROVADO" || profile.trocar_senha || profile.must_change_password || !["MASTER", "ADMINISTRADOR"].includes(profile.perfil)) {
      throw new Error("OPERAÇÃO EXCLUSIVA DE ADMIN OU MASTER.");
    }

    const body = await request.json();
    const roles=["MASTER","ADMINISTRADOR","OPERADOR_GERAL","OPERADOR_PATIO","MOTORISTA","VENDEDOR_EXTERNO","VENDEDOR_INTERNO"];
    const perfil=body.perfil === undefined ? "OPERADOR_GERAL" : String(body.perfil||"").trim();
    if(!roles.includes(perfil)) throw new Error("SELECIONE UM PERFIL VÁLIDO.");
    if(["MASTER","ADMINISTRADOR"].includes(perfil)&&profile.perfil!=="MASTER") throw new Error("SOMENTE MASTER PODE CONCEDER ESTE PERFIL.");
    const nome = String(body.nome || "").trim().split(/\s+/)[0];
    const whatsapp = normalizePhone(body.whatsapp);
    const cpf = String(body.cpf||"").replace(/\D/g, "");
    const email = String(body.email||"").trim().toLowerCase();
    if (nome.length < 2 || !cpfIsValid(cpf) || !/^55\d{10,11}$/.test(whatsapp)) {
      throw new Error("INFORME NOME, CPF E WHATSAPP VÁLIDOS.");
    }

    const existing = await admin.from("fc_usuarios_pendentes").select("id,status")
      .eq("empresa_id", profile.empresa_id).eq("cpf", cpf)
      .in("status", ["CADASTRO_PENDENTE","PREENCHIMENTO_OBRIGATORIO","AGUARDANDO_APROVACAO"]).maybeSingle();
    const id = existing.data?.id || crypto.randomUUID();
    const { error } = await admin.from("fc_usuarios_pendentes").upsert({
      id,
      empresa_id: profile.empresa_id,
      nome, cpf, email: email||null,
      perfil,
      regras: { origem: "CONVITE", completarCadastro: true, criarSenha: true },
      status: "CADASTRO_PENDENTE",
      whatsapp,
      cargo: "A DEFINIR PELO ADMINISTRADOR",
      enviado_em: new Date().toISOString(),
    });
    if (error) throw error;

    const publicUrl = "https://forte-vendas.onrender.com/?convite=1";
    const message = `Olá, ${nome}. Você recebeu um convite da Forte Atacarejo. Abra o link, complete seu cadastro e crie sua senha. O acesso será liberado após aprovação do administrador: ${publicUrl}`;
    return Response.json({
      ok: true,
      whatsappUrl: `https://wa.me/${whatsapp}?text=${encodeURIComponent(message)}`,
      message: "CONVITE PREPARADO. ENVIE PELO WHATSAPP.",
    }, { headers: cors });
  } catch (error) {
    return Response.json({ ok: false, error: String(error?.message || error) }, { status: 400, headers: cors });
  }
});
