import http from "node:http";
import https from "node:https";
import crypto from "node:crypto";

const port = Number(process.env.PORT || 10000);
const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Configuração ausente: ${name}`);
  return value.replaceAll("\\n", "\n");
};
const send = (res, status, body, type = "application/json; charset=utf-8", headers = {}) => {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store", ...headers });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
};
const readBody = (req) => new Promise((resolve, reject) => {
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
    if (body.length > 2_000_000) req.destroy();
  });
  req.on("end", () => resolve(body));
  req.on("error", reject);
});
const encrypt = (payload, password) => {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(password, salt, 32);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload)), cipher.final()]);
  return {
    version: 1,
    algorithm: "aes-256-gcm+scrypt",
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
};
const activateCertificate = async () => {
  const token = required("ITAU_ACTIVATION_TOKEN");
  const csr = required("ITAU_CSR");
  const response = await fetch("https://sts.itau.com.br/seguranca/v1/certificado/solicitacao", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "text/plain" },
    body: csr,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Itaú recusou a ativação (${response.status}).`);
  const begin = text.indexOf("-----BEGIN CERTIFICATE-----");
  if (begin < 1) throw new Error("Retorno do Itaú sem certificado reconhecível.");
  const clientSecret = text.slice(0, begin).trim().split(/\s+/).at(-1);
  const certificate = text.slice(begin).trim();
  if (!clientSecret || !certificate.includes("-----END CERTIFICATE-----")) throw new Error("Retorno incompleto do Itaú.");
  return { clientSecret, certificate, activatedAt: new Date().toISOString() };
};
const setupPage = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Ativação Itaú</title><style>body{font-family:Arial;background:#f3f6f9;display:grid;place-items:center;min-height:100vh}.box{background:#fff;padding:28px;border-radius:14px;box-shadow:0 12px 35px #1233;max-width:520px}input,button{box-sizing:border-box;width:100%;padding:12px;margin-top:12px}button{background:#0b5cab;color:#fff;border:0;border-radius:8px;font-weight:bold}</style><div class="box"><h1>Ativação segura Itaú</h1><p>Esta operação gera o certificado mTLS e baixa um pacote criptografado. A chave e o token não são exibidos.</p><input id="key" type="password" autocomplete="off" placeholder="Chave temporária de instalação"><button id="go">ATIVAR CERTIFICADO</button><p id="status"></p></div><script>go.onclick=async()=>{go.disabled=true;status.textContent='Ativando…';try{const r=await fetch('/admin/activate',{method:'POST',headers:{'x-setup-key':key.value}});if(!r.ok)throw new Error(await r.text());const blob=await r.blob(),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='itau-certificate-package.enc.json';a.click();status.textContent='Certificado gerado e pacote criptografado baixado.'}catch(e){status.textContent='Falha: '+e.message}finally{go.disabled=false}}</script></html>`;

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url, "https://forte-itau-api.onrender.com");
    if (requestUrl.pathname === "/webhooks/whatsapp" && req.method === "GET") {
      const mode = requestUrl.searchParams.get("hub.mode");
      const token = requestUrl.searchParams.get("hub.verify_token");
      const challenge = requestUrl.searchParams.get("hub.challenge");
      if (mode === "subscribe" && token === required("WHATSAPP_VERIFY_TOKEN")) {
        return send(res, 200, challenge || "", "text/plain; charset=utf-8");
      }
      return send(res, 403, { error: "Falha na verificação do webhook" });
    }
    if (requestUrl.pathname === "/webhooks/whatsapp" && req.method === "POST") {
      const raw = await readBody(req);
      let payload = {};
      try { payload = raw ? JSON.parse(raw) : {}; } catch {}
      console.log("WhatsApp webhook recebido", JSON.stringify(payload));
      return send(res, 200, "EVENT_RECEIVED", "text/plain; charset=utf-8");
    }
    if (req.method === "GET" && req.url === "/health") {
      const configured = Boolean(process.env.ITAU_CLIENT_ID && process.env.ITAU_CLIENT_SECRET && process.env.ITAU_CERTIFICATE && process.env.ITAU_PRIVATE_KEY);
      return send(res, configured ? 200 : 503, { service: "forte-itau-api", configured });
    }
    if (req.method === "GET" && req.url === "/setup") return send(res, 200, setupPage, "text/html; charset=utf-8");
    if (req.method === "POST" && req.url === "/admin/activate") {
      const supplied = req.headers["x-setup-key"] || "";
      const expected = required("ITAU_SETUP_KEY");
      if (supplied.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return send(res, 403, { error: "Acesso negado" });
      await readBody(req);
      const result = await activateCertificate();
      const encrypted = encrypt({ ...result, privateKey: required("ITAU_PRIVATE_KEY"), clientId: required("ITAU_CLIENT_ID") }, expected);
      return send(res, 200, encrypted, "application/json", { "content-disposition": "attachment; filename=itau-certificate-package.enc.json" });
    }
    if (req.method === "POST" && req.url === "/oauth/token") {
      const clientId = required("ITAU_CLIENT_ID");
      const clientSecret = required("ITAU_CLIENT_SECRET");
      const agent = new https.Agent({ cert: required("ITAU_CERTIFICATE"), key: required("ITAU_PRIVATE_KEY"), minVersion: "TLSv1.2" });
      const body = new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret });
      const response = await fetch("https://sts.itau.com.br/api/oauth/token", { method: "POST", body, dispatcher: agent });
      return send(res, response.status, await response.text());
    }
    return send(res, 404, { error: "Não encontrado" });
  } catch (error) {
    console.error(error.message);
    return send(res, 500, { error: "Falha segura na integração Itaú" });
  }
});

server.listen(port, "0.0.0.0", () => console.log(`Forte Itaú API ativa na porta ${port}`));
