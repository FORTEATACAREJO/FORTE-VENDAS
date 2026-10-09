import http from "node:http";
import https from "node:https";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const port = Number(process.env.PORT || 10000);
const safeError = (code, message, status = 500) => Object.assign(new Error(message), { code, publicMessage: message, status });
const authorize = (req) => {
  const expected = Buffer.from(required("ITAU_SETUP_KEY"));
  const supplied = Buffer.from(String(req.headers["x-setup-key"] || ""));
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
};
const configurationStatus = () => ({
  activationMissing: ["ITAU_CLIENT_ID", "ITAU_PRIVATE_KEY", "ITAU_ACTIVATION_TOKEN"].filter(name => !process.env[name]?.trim()),
  authenticationMissing: ["ITAU_CLIENT_ID", "ITAU_CLIENT_SECRET", "ITAU_CERTIFICATE", "ITAU_PRIVATE_KEY"].filter(name => !process.env[name]?.trim()),
});

const required = (name) => {
  const value = process.env[name];
  if (!value) throw safeError("MISSING_CONFIGURATION", `Configuração ausente: ${name}`);
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
const generateCsr = () => {
  const privateKey = required("ITAU_PRIVATE_KEY");
  let key;
  try { key = crypto.createPrivateKey(privateKey); }
  catch { throw safeError("INVALID_PRIVATE_KEY", "ITAU_PRIVATE_KEY inválida ou em formato incorreto"); }
  if (key.asymmetricKeyType !== "rsa" || key.asymmetricKeyDetails.modulusLength < 2048) throw safeError("INVALID_PRIVATE_KEY", "A chave Itaú precisa ser RSA com pelo menos 2048 bits");
  const clientId = required("ITAU_CLIENT_ID").trim();
  if (!/^[A-Za-z0-9._-]+$/.test(clientId)) throw safeError("INVALID_CLIENT_ID", "Client ID inválido; use o valor decifrado fornecido pelo Itaú.");
  const subject = "/CN=" + clientId + "/OU=FORTE ATACAREJO LTDA/L=CALDAS NOVAS/ST=GO/C=BR";
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "forte-itau-csr-"));
  let result;
  try {
    const keyPath = path.join(directory, "private.pem");
    fs.writeFileSync(keyPath, privateKey, { mode: 0o600 });
    result = spawnSync("openssl", ["req", "-new", "-sha512", "-key", keyPath, "-subj", subject], {
      encoding: "utf8", timeout: 10000, maxBuffer: 100000,
    });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
  if (result.error || result.status !== 0 || !result.stdout?.includes("-----BEGIN CERTIFICATE REQUEST-----"))
    throw safeError("CSR_GENERATION_FAILED", "Não foi possível gerar CSR; confira a chave privada e o OpenSSL no servidor.");
  return result.stdout.trim();
};
const validateCsr = (csr) => {
  const check = spawnSync("openssl", ["req", "-verify", "-noout", "-subject", "-nameopt", "sep_multiline,sname"], {
    input: csr, encoding: "utf8", timeout: 10000, maxBuffer: 100000,
  });
  if (check.error || check.status !== 0) throw safeError("INVALID_CSR", "CSR inválido; confira o arquivo configurado.");
  const cn = check.stdout.match(/^\s*CN\s*=\s*(.+)$/m)?.[1]?.trim();
  if (cn !== required("ITAU_CLIENT_ID").trim()) throw safeError("CSR_CLIENT_ID_MISMATCH", "O CN do CSR precisa ser igual ao Client ID do Itaú. Remova o CSR antigo para gerar o correto.");
  const pub = spawnSync("openssl", ["req", "-pubkey", "-noout"], { input: csr, encoding: "utf8", timeout: 10000, maxBuffer: 100000 });
  if (pub.error || pub.status !== 0) throw safeError("INVALID_CSR", "Não foi possível validar a chave pública do CSR.");
  const encode = key => crypto.createPublicKey(key).export({ type: "spki", format: "der" });
  if (!encode(pub.stdout).equals(encode(required("ITAU_PRIVATE_KEY")))) throw safeError("CSR_KEY_MISMATCH", "O CSR não corresponde à chave privada configurada.");
};
const requestToken = () => new Promise((resolve, reject) => {
  const clientId = required("ITAU_CLIENT_ID").trim();
  const clientSecret = required("ITAU_CLIENT_SECRET").trim();
  const certificate = required("ITAU_CERTIFICATE");
  const privateKey = required("ITAU_PRIVATE_KEY");
  const cert = new crypto.X509Certificate(certificate);
  if (!cert.checkPrivateKey(crypto.createPrivateKey(privateKey))) throw safeError("CERTIFICATE_KEY_MISMATCH", "O certificado Itaú não corresponde à chave privada configurada.");
  if (Date.parse(cert.validTo) <= Date.now()) throw safeError("CERTIFICATE_EXPIRED", "O certificado Itaú está vencido.");
  const body = new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }).toString();
  const request = https.request("https://sts.itau.com.br/api/oauth/token", {
    method: "POST", cert: certificate, key: privateKey, minVersion: "TLSv1.2",
    headers: { "content-type": "application/x-www-form-urlencoded", "content-length": Buffer.byteLength(body) },
  }, response => {
    let data = "";
    response.setEncoding("utf8");
    response.on("data", chunk => { data += chunk; if (data.length > 100000) response.destroy(); });
    response.on("error", reject);
    response.on("end", () => {
      if (response.statusCode < 200 || response.statusCode >= 300) return reject(safeError("ITAU_AUTH_REJECTED", "Itaú recusou a autenticação (HTTP " + response.statusCode + "). Confira Client ID, Client Secret e certificado.", 502));
      try {
        const payload = JSON.parse(data);
        if (!payload.access_token) throw new Error("missing token");
        resolve(payload);
      } catch { reject(safeError("INVALID_AUTH_RESPONSE", "O Itaú retornou uma resposta de autenticação incompleta.", 502)); }
    });
  });
  request.setTimeout(20000, () => request.destroy(safeError("ITAU_TIMEOUT", "O Itaú não respondeu no prazo. Tente novamente.", 504)));
  request.on("error", reject);
  request.end(body);
});

const activateCertificate = async () => {
  const token = required("ITAU_ACTIVATION_TOKEN").replace(/\s+/g, "");
  if (!token || /[^\x21-\x7e]/.test(token)) throw safeError("INVALID_ACTIVATION_TOKEN", "Token de ativação inválido; confira o valor decifrado no Render");
  const csr = process.env.ITAU_CSR?.trim() ? required("ITAU_CSR").trim() : generateCsr();
  validateCsr(csr);
  const response = await fetch("https://sts.itau.com.br/seguranca/v1/certificado/solicitacao", {
    method: "POST",
    signal: AbortSignal.timeout(20000),
    headers: { authorization: `Bearer ${token}`, "content-type": "text/plain" },
    body: csr,
  });
  const text = await response.text();
  if (!response.ok) throw safeError("ITAU_ACTIVATION_REJECTED", `Itaú recusou a ativação (HTTP ${response.status}). Confira se o token está decifrado, válido e pertence ao mesmo Client ID.`, 502);
  const begin = text.indexOf("-----BEGIN CERTIFICATE-----");
  if (begin < 1) throw safeError("INVALID_CERTIFICATE_RESPONSE", "Retorno do Itaú sem certificado reconhecível.", 502);
  const clientSecret = text.slice(0, begin).trim().split(/\s+/).at(-1);
  const certificate = text.slice(begin).trim();
  if (!clientSecret || !certificate.includes("-----END CERTIFICATE-----")) throw safeError("INVALID_CERTIFICATE_RESPONSE", "Retorno incompleto do Itaú.", 502);
  return { clientSecret, certificate, activatedAt: new Date().toISOString() };
};
const setupPage = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Ativação Itaú</title><style>body{font-family:Arial;background:#f3f6f9;display:grid;place-items:center;min-height:100vh}.box{background:#fff;padding:28px;border-radius:14px;box-shadow:0 12px 35px #1233;max-width:520px}input,button{box-sizing:border-box;width:100%;padding:12px;margin-top:12px}button{background:#0b5cab;color:#fff;border:0;border-radius:8px;font-weight:bold}</style><div class="box"><h1>Ativação segura Itaú</h1><p>Esta operação gera o certificado mTLS e baixa um pacote criptografado. A chave e o token não são exibidos.</p><input id="key" type="password" autocomplete="off" placeholder="Chave temporária de instalação"><button id="check">VERIFICAR CONFIGURAÇÃO</button><button id="go">ATIVAR CERTIFICADO</button><button id="test">TESTAR AUTENTICAÇÃO</button><p id="status"></p></div><script>document.getElementById('go').addEventListener('click',async()=>{const button=document.getElementById('go');const message=document.getElementById('status');const secret=document.getElementById('key').value;if(!secret){message.textContent='Informe a chave de instalação.';return;}button.disabled=true;message.textContent='Solicitando ativação ao servidor…';try{const r=await fetch('/admin/activate',{method:'POST',headers:{'x-setup-key':secret}});if(!r.ok){let detail='Erro HTTP '+r.status;try{const data=await r.json();detail=data.error||detail;}catch{}throw new Error(detail);}const blob=await r.blob();const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='itau-certificate-package.enc.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);message.textContent='Certificado gerado. Guarde o pacote criptografado; o certificado e o Client Secret ainda precisam ser instalados no servidor.';}catch(e){message.textContent='Falha na ativação: '+e.message;}finally{button.disabled=false;}});document.getElementById('check').onclick=async()=>{const message=document.getElementById('status');try{const r=await fetch('/admin/status',{headers:{'x-setup-key':document.getElementById('key').value}});const data=await r.json();if(!r.ok)throw new Error(data.error);message.textContent='Ativação: '+(data.activationMissing.length?'faltam '+data.activationMissing.join(', '):'CSR validado')+'. Autenticação: '+(data.authenticationMissing.length?'faltam '+data.authenticationMissing.join(', '):'credenciais presentes; execute o teste')+'.';}catch(e){message.textContent=e.message;}};document.getElementById('test').onclick=async()=>{const message=document.getElementById('status');message.textContent='Testando autenticação no Itaú…';try{const r=await fetch('/admin/test-auth',{method:'POST',headers:{'x-setup-key':document.getElementById('key').value}});const data=await r.json();if(!r.ok)throw new Error(data.error);message.textContent='Autenticação confirmada pelo Itaú.';}catch(e){message.textContent=e.message;}};</script></html>`;

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
      if (!authorize(req)) return send(res, 403, { error: "Acesso negado" });
      const expected = required("ITAU_SETUP_KEY");
      await readBody(req);
      const result = await activateCertificate();
      const encrypted = encrypt({ ...result, privateKey: required("ITAU_PRIVATE_KEY"), clientId: required("ITAU_CLIENT_ID") }, expected);
      return send(res, 200, encrypted, "application/json", { "content-disposition": "attachment; filename=itau-certificate-package.enc.json" });
    }
    if (req.method === "GET" && req.url === "/admin/status") {
      if (!authorize(req)) return send(res, 403, { error: "Acesso negado" });
      const status = configurationStatus();
      if (!status.activationMissing.length) {
        validateCsr(process.env.ITAU_CSR?.trim() ? required("ITAU_CSR").trim() : generateCsr());
        status.csrValid = true;
      }
      return send(res, 200, status);
    }
    if (req.method === "POST" && (req.url === "/oauth/token" || req.url === "/admin/test-auth")) {
      if (!authorize(req)) return send(res, 403, { error: "Acesso negado" });
      const payload = await requestToken();
      return send(res, 200, req.url === "/admin/test-auth" ? { authenticated: true, expiresIn: payload.expires_in } : payload);
    }
    return send(res, 404, { error: "Não encontrado" });
  } catch (error) {
    // Never print raw third-party error messages: they may contain bearer tokens or private data.
    console.error("Falha na requisição", { name: error?.name || "Error", code: error?.code || error?.cause?.code || "INTEGRATION_ERROR" });
    return send(res, error?.publicMessage ? error.status : 500, { error: error?.publicMessage || "Falha segura na integração Itaú", code: error?.publicMessage ? error.code : "INTEGRATION_ERROR" });
  }
});

server.listen(port, "0.0.0.0", () => console.log(`Forte Itaú API ativa na porta ${port}`));

export { server, generateCsr, validateCsr, requestToken };

