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
    const { data: profile } = await admin.from("fc_perfis").select("empresa_id,perfil")
      .eq("user_id", user.id).eq("ativo", true).single();
    if (!profile || !["MASTER", "ADMINISTRADOR"].includes(profile.perfil)) {
      throw new Error("OPERAÇÃO EXCLUSIVA DE ADMIN OU MASTER.");
    }

    const body = await request.json();
    const nome = String(body.nome || "").trim().split(/\s+/)[0];
    const whatsapp = normalizePhone(body.whatsapp);
    if (nome.length < 2 || !/^55\d{10,11}$/.test(whatsapp)) {
      throw new Error("INFORME SOMENTE O PRIMEIRO NOME E UM WHATSAPP VÁLIDO COM DDD.");
    }

    const existing = await admin.from("fc_usuarios_pendentes").select("id,status")
      .eq("empresa_id", profile.empresa_id).in("whatsapp", [whatsapp, whatsapp.slice(2)])
      .not("status", "in", "(RECUSADO,APROVADO)").maybeSingle();
    const id = existing.data?.id || crypto.randomUUID();
    const { error } = await admin.from("fc_usuarios_pendentes").upsert({
      id,
      empresa_id: profile.empresa_id,
      nome,
      perfil: "CONSULTA",
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
