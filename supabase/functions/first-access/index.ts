import { createClient } from "npm:@supabase/supabase-js@2.57.0";

const allowed = new Set([
  "https://forte-vendas.onrender.com",
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

const passwordIsValid = (password: string) =>
  password.length >= 9 &&
  password.length <= 128 &&
  /[A-Z]/.test(password) &&
  /[a-z]/.test(password) &&
  /\d/.test(password) &&
  /[^A-Za-z0-9]/.test(password) &&
  !/(012|123|234|345|456|567|678|789|987|876|765|654|543|432|321|210)/.test(
    password,
  );

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
          "A SENHA PRECISA TER 9 CARACTERES, MAIÚSCULA, MINÚSCULA, NÚMERO E SÍMBOLO.",
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

    const email = emailInformado || `cpf.${cpf}@acesso.forte.internal`;
    const empresa = await admin
      .from("fc_empresas")
      .select("id")
      .eq("ativo", true)
      .limit(1)
      .single();
    if (empresa.error) {
      return respond(origin, 503, {
        error: "CADASTRO TEMPORARIAMENTE INDISPONÍVEL.",
      });
    }

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
      empresa_id: empresa.data.id,
      nome,
      perfil: "CONSULTA",
      permissoes: {},
      ativo: false,
      trocar_senha: false,
      cpf,
      email,
      whatsapp,
      documento_conferido: false,
    });
    const pending = await admin.from("fc_usuarios_pendentes").insert({
      empresa_id: empresa.data.id,
      nome,
      perfil: "CONSULTA",
      regras: { origem: "PRIMEIRO_ACESSO", acesso_modulos: false },
      status: "PRE_CADASTRO",
      auth_user_id: userId,
      cpf,
      email: emailInformado || null,
      whatsapp,
    });
    if (profile.error || pending.error) {
      await admin.auth.admin.deleteUser(userId);
      return respond(origin, 503, {
        error: "NÃO FOI POSSÍVEL CONCLUIR O PRÉ-CADASTRO.",
      });
    }

    await admin.from("fc_primeiro_acesso_tentativas").insert({
      ip_hash: ipHash,
      cpf_hash: cpfHash,
      status: "CRIADO",
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
