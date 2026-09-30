import { createClient } from "npm:@supabase/supabase-js@2.57.0";

const allowed = new Set([
  "https://forte-vendas.onrender.com",
  "https://forte-financeiro.onrender.com",
  "https://forte-venda-externa.onrender.com",
  "https://forte-carga-direta.onrender.com",
  "http://localhost:5178",
]);

const baseHeaders = {
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

const respond = (origin: string, status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...baseHeaders, "Access-Control-Allow-Origin": origin },
  });

const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");
const normalizePhone = (value: unknown) => {
  let phone = digits(value).replace(/^0+/, "");
  if (/^\d{10,11}$/.test(phone)) phone = `55${phone}`;
  return phone;
};
const normalizeName = (value: unknown) =>
  String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

const sha256 = async (value: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  )
    .map((part) => part.toString(16).padStart(2, "0"))
    .join("");

const cpfIsValid = (cpf: string) => {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  for (const length of [9, 10]) {
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(cpf[index]) * (length + 1 - index);
    }
    let digit = (sum * 10) % 11;
    if (digit === 10) digit = 0;
    if (digit !== Number(cpf[length])) return false;
  }
  return true;
};

const passwordIsValid = (password: string) => /^\d{6}$/.test(password);

Deno.serve(async (request) => {
  const origin = request.headers.get("origin") || "";
  if (request.method === "OPTIONS") {
    return allowed.has(origin)
      ? new Response(null, {
          status: 204,
          headers: { ...baseHeaders, "Access-Control-Allow-Origin": origin },
        })
      : new Response(null, { status: 403 });
  }
  if (request.method !== "POST" || !allowed.has(origin)) {
    return new Response(null, { status: 403 });
  }

  try {
    const body = await request.json();
    const nome = String(body.nome ?? "").trim().replace(/\s+/g, " ");
    const cpf = digits(body.cpf);
    const emailInformado = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const whatsapp = normalizePhone(body.whatsapp);

    if (nome.length < 5 || !nome.includes(" ")) {
      return respond(origin, 400, { error: "INFORME O NOME COMPLETO." });
    }
    if (!cpfIsValid(cpf)) {
      return respond(origin, 400, { error: "CPF INVÁLIDO." });
    }
    if (!/^55\d{10,11}$/.test(whatsapp)) {
      return respond(origin, 400, {
        error: "WHATSAPP INVÁLIDO. INFORME DDD E NÚMERO.",
      });
    }
    if (emailInformado && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInformado)) {
      return respond(origin, 400, { error: "E-MAIL INVÁLIDO." });
    }
    if (!passwordIsValid(password)) {
      return respond(origin, 400, {
        error:
          "A SENHA DEVE TER EXATAMENTE SEIS NÚMEROS.",
      });
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const ip = (request.headers.get("x-forwarded-for") || "")
      .split(",")[0]
      .trim() || "unknown";
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const [ipHash, cpfHash] = await Promise.all([sha256(ip), sha256(cpf)]);

    const { count } = await admin
      .from("fc_primeiro_acesso_tentativas")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash)
      .gte("criado_em", since);
    if ((count || 0) >= 8) {
      await admin
        .from("fc_primeiro_acesso_tentativas")
        .insert({ ip_hash: ipHash, cpf_hash: cpfHash, status: "BLOQUEADO" });
      return respond(origin, 429, {
        error: "MUITAS TENTATIVAS. AGUARDE UMA HORA.",
      });
    }

    const existing = await admin
      .from("fc_perfis")
      .select("user_id,nome,email,whatsapp,ativo,trocar_senha")
      .eq("cpf", cpf)
      .maybeSingle();

    if (existing.data) {
      const profile = existing.data;
      const authUser = await admin.auth.admin.getUserById(profile.user_id);
      const canClaim =
        !authUser.error &&
        Boolean(authUser.data.user) &&
        !authUser.data.user.last_sign_in_at &&
        profile.trocar_senha === true;
      const detailsMatch =
        emailInformado.length > 0 &&
        emailInformado === String(profile.email ?? "").trim().toLowerCase() &&
        whatsapp === normalizePhone(profile.whatsapp) &&
        normalizeName(nome) === normalizeName(profile.nome);

      if (!canClaim || !detailsMatch) {
        await admin.from("fc_primeiro_acesso_tentativas").insert({
          ip_hash: ipHash,
          cpf_hash: cpfHash,
          status: "RECUSADO",
        });
        return respond(origin, 409, {
          error: canClaim
            ? "OS DADOS NÃO CONFEREM COM O CONVITE. CONFIRA NOME, E-MAIL E WHATSAPP."
            : "CPF JÁ CADASTRADO. USE ENTRAR OU RECUPERAR SENHA.",
        });
      }

      const updated = await admin.auth.admin.updateUserById(profile.user_id, {
        password,
        email_confirm: true,
        user_metadata: {
          ...(authUser.data.user.user_metadata || {}),
          nome: profile.nome,
          cpf,
          whatsapp,
          primeiro_acesso_concluido: true,
        },
      });
      if (updated.error) {
        return respond(origin, 503, {
          error: "NÃO FOI POSSÍVEL ATIVAR O PRIMEIRO ACESSO.",
        });
      }
      const profileUpdate = await admin
        .from("fc_perfis")
        .update({ trocar_senha: false, updated_at: new Date().toISOString() })
        .eq("user_id", profile.user_id);
      if (profileUpdate.error) {
        return respond(origin, 503, {
          error: "NÃO FOI POSSÍVEL CONCLUIR O PRIMEIRO ACESSO.",
        });
      }

      await admin.from("fc_primeiro_acesso_tentativas").insert({
        ip_hash: ipHash,
        cpf_hash: cpfHash,
        status: "ATIVADO",
      });
      const client = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const login = await client.auth.signInWithPassword({
        email: String(profile.email).toLowerCase(),
        password,
      });
      if (login.error || !login.data.session) {
        return respond(origin, 201, { created: true });
      }
      return respond(origin, 201, {
        created: true,
        access_token: login.data.session.access_token,
        refresh_token: login.data.session.refresh_token,
      });
    }

    // Novos usuários só podem prosseguir quando um Admin/Master tiver criado
    // previamente o convite. O Forte Frete possui fluxo próprio e não usa
    // esta função.
    const nationalWhatsapp = whatsapp.startsWith("55") ? whatsapp.slice(2) : whatsapp;
    const pendingInvite = await admin
      .from("fc_usuarios_pendentes")
      .select("id,empresa_id,nome,perfil,regras,whatsapp,email,cargo,status,auth_user_id")
      .eq("cpf", cpf)
      .in("whatsapp", [whatsapp, nationalWhatsapp])
      .in("status", ["CADASTRO_PENDENTE", "CONVITE_ENVIADO"])
      .is("auth_user_id", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const invite = pendingInvite.data;
    const invitedFirstName = normalizeName(invite?.nome).split(" ")[0];
    const informedFirstName = normalizeName(nome).split(" ")[0];
    if (
      pendingInvite.error ||
      !invite ||
      !invitedFirstName ||
      (invite.email && String(invite.email).toLowerCase() !== emailInformado) ||
      invitedFirstName !== informedFirstName
    ) {
      await admin.from("fc_primeiro_acesso_tentativas").insert({
        ip_hash: ipHash,
        cpf_hash: cpfHash,
        status: "SEM_CONVITE",
      });
      return respond(origin, 403, {
        error: "ACESSO SOMENTE POR CONVITE. SOLICITE O CONVITE AO ADMINISTRADOR.",
      });
    }

    const email = emailInformado || `cpf.${cpf}@acesso.forte.internal`;

    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nome, cpf, whatsapp, pre_cadastro: true },
    });
    const userId = created.data.user?.id;
    if (created.error || !userId) {
      return respond(origin, 409, {
        error:
          "NÃO FOI POSSÍVEL CRIAR O ACESSO. CONFIRA SE O E-MAIL JÁ ESTÁ CADASTRADO.",
      });
    }

    const profile = await admin.from("fc_perfis").insert({
      user_id: userId,
      empresa_id: invite.empresa_id,
      nome,
      perfil: invite.perfil || "CONSULTA",
      permissoes: invite.regras?.permissoes || {},
      ativo: false,
      trocar_senha: false,
      cpf,
      email,
      whatsapp,
      documento_conferido: false,
    });
    const pending = await admin.from("fc_usuarios_pendentes").update({
      nome,
      regras: { ...(invite.regras || {}), origem: "CONVITE", acesso_modulos: false },
      status: "PRE_CADASTRO",
      auth_user_id: userId,
      cpf,
      email: emailInformado || null,
      whatsapp,
    }).eq("id", invite.id).is("auth_user_id", null);
    if (profile.error || pending.error) {
      await admin.auth.admin.deleteUser(userId);
      return respond(origin, 503, {
        error: "NÃO FOI POSSÍVEL CONCLUIR O PRÉ-CADASTRO.",
      });
    }

    await admin.from("fc_primeiro_acesso_tentativas").insert({
      ip_hash: ipHash,
      cpf_hash: cpfHash,
        status: "CONVITE_ACEITO",
    });
    const client = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const login = await client.auth.signInWithPassword({ email, password });
    if (login.error || !login.data.session) {
      return respond(origin, 201, { created: true });
    }
    return respond(origin, 201, {
      created: true,
      access_token: login.data.session.access_token,
      refresh_token: login.data.session.refresh_token,
    });
  } catch {
    return respond(origin, 503, {
      error: "NÃO FOI POSSÍVEL CONCLUIR O PRÉ-CADASTRO.",
    });
  }
});

