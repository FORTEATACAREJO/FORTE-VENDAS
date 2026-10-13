import http from "node:http";
import crypto from "node:crypto";

const port = Number(process.env.PORT || 10000);
const webhookPaths = new Set(["/webhook", "/webhooks/whatsapp"]);
const upstreams = () => {
  const endpoints = [process.env.WHATSAPP_FISCAL_WEBHOOK_URL || "https://xmfpvvmvdkepmnvtdoio.supabase.co/functions/v1/whatsapp-fiscal/webhook"];
  if (process.env.WHATSAPP_VENDAS_WEBHOOK_ENABLED === "true") {
    endpoints.push(process.env.WHATSAPP_VENDAS_WEBHOOK_URL || "https://gtwecfyffjszghnvtlzr.supabase.co/functions/v1/order-communications/webhook");
  }
  if (process.env.WHATSAPP_FRETE_WEBHOOK_ENABLED === "true" && process.env.WHATSAPP_FRETE_WEBHOOK_URL) {
    endpoints.push(process.env.WHATSAPP_FRETE_WEBHOOK_URL);
  }
  return endpoints;
};
const reply = (res, status, body, contentType = "application/json; charset=utf-8") => {
  res.writeHead(status, { "content-type": contentType, "cache-control": "no-store" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
};
const readBody = req => new Promise((resolve, reject) => {
  const chunks = [];
  let size = 0;
  req.on("data", chunk => {
    size += chunk.length;
    if (size > 2_000_000) {
      reject(Object.assign(new Error("Payload too large"), { status: 413 }));
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on("end", () => resolve(Buffer.concat(chunks)));
  req.on("error", reject);
});
const validSignature = (raw, header, secret) => {
  if (!secret || !/^sha256=[a-f0-9]{64}$/i.test(header)) return false;
  const expected = Buffer.from("sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex"));
  const supplied = Buffer.from(header);
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
};

const audit = (stage, fields = {}) => console.info("whatsapp_webhook", JSON.stringify({ stage, ...fields }));

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://localhost");
  if (req.method === "GET" && url.pathname === "/health") {
    return reply(res, 200, { service: "forte-whatsapp-api", configured: Boolean(process.env.WHATSAPP_APP_SECRET && process.env.WHATSAPP_VERIFY_TOKEN) });
  }
  if (!webhookPaths.has(url.pathname)) return reply(res, 404, { error: "Não encontrado" });
  if (req.method === "GET") {
    const expected = process.env.WHATSAPP_VERIFY_TOKEN;
    const supplied = url.searchParams.get("hub.verify_token") || "";
    const mode = url.searchParams.get("hub.mode");
    const challenge = url.searchParams.get("hub.challenge");
    if (expected && mode === "subscribe" && supplied.length === expected.length &&
        crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected)) && challenge !== null) {
      audit("verification_accepted");
      return reply(res, 200, challenge, "text/plain; charset=utf-8");
    }
    audit("verification_rejected");
    return reply(res, 403, { error: "Verificação recusada" });
  }
  if (req.method !== "POST") return reply(res, 405, { error: "Método não permitido" });
  try {
    const raw = await readBody(req);
    const secret = process.env.WHATSAPP_APP_SECRET;
    if (!secret) { audit("configuration_missing"); return reply(res, 503, { error: "Webhook não configurado" }); }
    if (!validSignature(raw, String(req.headers["x-hub-signature-256"] || ""), secret)) {
      audit("signature_rejected");
      return reply(res, 403, { error: "Assinatura inválida" });
    }
    audit("signature_accepted", { bytes: raw.length });
    const results = await Promise.all(upstreams().map(async (endpoint, index) => {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", "x-hub-signature-256": String(req.headers["x-hub-signature-256"]) },
        body: raw,
        signal: AbortSignal.timeout(15000),
      });
      audit("upstream_response", { destination: index === 0 ? "fiscal" : (index === 1 && process.env.WHATSAPP_VENDAS_WEBHOOK_ENABLED === "true" ? "vendas" : "frete"), status: response.status });
      return response.ok;
    }));
    if (results.some(ok => !ok)) { audit("upstream_rejected"); return reply(res, 502, { error: "Integração indisponível" }); }
    audit("delivered");
    return reply(res, 200, "EVENT_RECEIVED", "text/plain; charset=utf-8");
  } catch (error) {
    console.error("Falha webhook WhatsApp", { code: error?.code || "WEBHOOK_ERROR" });
    return reply(res, error?.status || 502, { error: "Falha no processamento do webhook" });
  }
});
if (process.env.NODE_ENV !== "test") server.listen(port, "0.0.0.0", () => console.log("Forte WhatsApp API iniciada"));
export { server, validSignature };
