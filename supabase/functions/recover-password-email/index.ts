import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const allowedOrigins = new Set([
  "https://forte-vendas.onrender.com",
  "https://forte-financeiro.onrender.com",
  "https://forte-venda-externa.onrender.com",
  "https://forte-carga-direta.onrender.com",
  "http://localhost:5178",
]);

const genericMessage =
  "Se o cadastro existir e possuir e-mail, o link para criar uma nova senha será enviado.";

function headers(origin: string) {
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin)
      ? origin
      : "https://forte-vendas.onrender.com",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    Vary: "Origin",
  };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  const responseHeaders = headers(origin);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: responseHeaders });
  }

  if (req.method !== "POST" || (origin && !allowedOrigins.has(origin))) {
    return new Response(JSON.stringify({ error: "Requisição não permitida." }), {
      status: 403,
      headers: responseHeaders,
    });
  }

  try {
    const { identificador = "" } = await req.json();
    const normalized = String(identificador).trim().toLowerCase();
    if (!normalized) {
      return new Response(JSON.stringify({ message: genericMessage }), {
        status: 200,
        headers: responseHeaders,
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const query = admin.from("fc_perfis").select("email").eq("ativo", true);
    const { data } = normalized.includes("@")
      ? await query.ilike("email", normalized).maybeSingle()
      : await query.eq("cpf", normalized.replace(/\D/g, "")).maybeSingle();

    const email = String(data?.email ?? "").trim().toLowerCase();
    if (email) {
      const client = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      await client.auth.resetPasswordForEmail(email, {
        redirectTo: "https://forte-vendas.onrender.com/",
      });
    }
  } catch {
    // A resposta permanece genérica para não revelar se o cadastro existe.
  }

  return new Response(JSON.stringify({ message: genericMessage }), {
    status: 200,
    headers: responseHeaders,
  });
});
