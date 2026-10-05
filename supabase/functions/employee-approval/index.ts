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
      .select("empresa_id,perfil,ativo,status_aprovacao,must_change_password").eq("user_id", user.id).single();
    if (!adminProfile?.ativo || adminProfile.status_aprovacao !== "APROVADO" || adminProfile.must_change_password || !["MASTER", "ADMINISTRADOR"].includes(adminProfile.perfil)) {
      throw new Error("OPERAÇÃO EXCLUSIVA DE ADMIN OU MASTER.");
    }

    const body = request.method === "POST" ? await request.json() : {};
    const action = String(body.action || "LIST").toUpperCase();
    if (action === "LIST") {
      const { data, error } = await admin.from("fc_usuarios_pendentes")
        .select("id,nome,cpf,email,whatsapp,cargo,perfil,status,enviado_em,created_at,auth_user_id")
        .eq("empresa_id", adminProfile.empresa_id)
        .in("status", ["CADASTRO_PENDENTE", "PREENCHIMENTO_OBRIGATORIO", "AGUARDANDO_APROVACAO"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return Response.json({ ok: true, pending: data || [] }, { headers: cors });
    }

    const id = String(body.id || "");
    if (!id) throw new Error("CADASTRO NÃO INFORMADO.");
    if (["APPROVE","REJECT"].includes(action)) {
      const { data, error } = await admin.rpc("employee_review_with_role", {
        p_pending:id,p_actor:user.id,p_action:action,p_role:String(body.role || "").trim()
      });
      if(error) throw error;
      return Response.json(data,{headers:cors});
    }
    throw new Error("AÇÃO INVÁLIDA.");
  } catch (error) {
    return Response.json({ ok: false, error: String(error?.message || error) }, { status: 400, headers: cors });
  }
});

