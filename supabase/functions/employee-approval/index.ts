import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const caller = createClient(url, anon, {
      global: { headers: { Authorization: request.headers.get("Authorization") || "" } },
    });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) throw new Error("SESSÃO INVÁLIDA.");

    const admin = createClient(url, service);
    const { data: adminProfile } = await admin.from("fc_perfis")
      .select("empresa_id,perfil,ativo").eq("user_id", user.id).single();
    if (!adminProfile?.ativo || !["MASTER", "ADMINISTRADOR"].includes(adminProfile.perfil)) {
      throw new Error("OPERAÇÃO EXCLUSIVA DE ADMIN OU MASTER.");
    }

    const body = request.method === "POST" ? await request.json() : {};
    const action = String(body.action || "LIST").toUpperCase();
    if (action === "LIST") {
      const { data, error } = await admin.from("fc_usuarios_pendentes")
        .select("id,nome,cpf,email,whatsapp,cargo,perfil,status,enviado_em,created_at,auth_user_id")
        .eq("empresa_id", adminProfile.empresa_id)
        .in("status", ["PRE_CADASTRO", "EM_ANALISE"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return Response.json({ ok: true, pending: data || [] }, { headers: cors });
    }

    const id = String(body.id || "");
    if (!id) throw new Error("CADASTRO NÃO INFORMADO.");
    const { data: pending, error: pendingError } = await admin.from("fc_usuarios_pendentes")
      .select("id,auth_user_id,status").eq("id", id)
      .eq("empresa_id", adminProfile.empresa_id).single();
    if (pendingError || !pending?.auth_user_id) throw new Error("CADASTRO PENDENTE NÃO LOCALIZADO.");

    if (action === "APPROVE") {
      if (pending.status !== "EM_ANALISE") throw new Error("O FUNCIONÁRIO AINDA NÃO ENVIOU O CADASTRO COMPLETO.");
      const now = new Date().toISOString();
      const { error: profileError } = await admin.from("fc_perfis").update({ ativo: true })
        .eq("user_id", pending.auth_user_id).eq("empresa_id", adminProfile.empresa_id);
      if (profileError) throw profileError;
      const { error } = await admin.from("fc_usuarios_pendentes").update({
        status: "APROVADO", analisado_por: user.id, analisado_em: now,
      }).eq("id", id);
      if (error) throw error;
      return Response.json({ ok: true, message: "FUNCIONÁRIO APROVADO E ACESSO LIBERADO." }, { headers: cors });
    }

    if (action === "REJECT") {
      const { error } = await admin.from("fc_usuarios_pendentes").update({
        status: "RECUSADO", analisado_por: user.id, analisado_em: new Date().toISOString(),
      }).eq("id", id);
      if (error) throw error;
      await admin.from("fc_perfis").update({ ativo: false }).eq("user_id", pending.auth_user_id);
      return Response.json({ ok: true, message: "CADASTRO RECUSADO. ACESSO MANTIDO BLOQUEADO." }, { headers: cors });
    }
    throw new Error("AÇÃO INVÁLIDA.");
  } catch (error) {
    return Response.json({ ok: false, error: String(error?.message || error) }, { status: 400, headers: cors });
  }
});
