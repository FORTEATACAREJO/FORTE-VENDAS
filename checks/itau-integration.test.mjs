import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import https from "node:https";
import { EventEmitter } from "node:events";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";

process.env.PORT = "0";
process.env.ITAU_SETUP_KEY = "local-test-key";
process.env.ITAU_CLIENT_ID = "test-client-id";
process.env.ITAU_PRIVATE_KEY = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" });
const { server, generateCsr, validateCsr, requestToken } = await import("../itau-server.mjs");
await new Promise(resolve => server.listening ? resolve() : server.once("listening", resolve));
const origin = "http://127.0.0.1:" + server.address().port;
test.after(() => new Promise(resolve => server.close(resolve)));
test("JavaScript da tela de configuração é válido", async () => {
  const page = await (await fetch(origin + "/setup")).text();
  new vm.Script(page.match(/<script>([\s\S]*?)<\/script>/)[1]);
});

test("CSR usa Client ID, assinatura SHA512 e a chave existente", () => {
  const csr = generateCsr();
  validateCsr(csr);
  const parsed = spawnSync("openssl", ["req", "-text", "-noout"], { input: csr, encoding: "utf8" });
  assert.match(parsed.stdout, /CN\s*=\s*test-client-id/);
  assert.match(parsed.stdout, /sha512WithRSAEncryption/);
  process.env.ITAU_CLIENT_ID = "another-client";
  assert.throws(() => validateCsr(csr), { code: "CSR_CLIENT_ID_MISMATCH" });
  process.env.ITAU_CLIENT_ID = "test-client-id";
  const original = process.env.ITAU_PRIVATE_KEY;
  process.env.ITAU_PRIVATE_KEY = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" });
  assert.throws(() => validateCsr(csr), { code: "CSR_KEY_MISMATCH" });
  process.env.ITAU_PRIVATE_KEY = original;
});
test("rotas de token e diagnóstico exigem chave, incluindo caracteres multibyte", async () => {
  for (const path of ["/oauth/token", "/admin/test-auth", "/admin/status"]) {
    const r = await fetch(origin + path, { method: path.endsWith("status") ? "GET" : "POST", headers: { "x-setup-key": "á".repeat(14) } });
    assert.equal(r.status, 403);
  }
});
test("diagnóstico lista somente nomes ausentes e valida CSR", async () => {
  process.env.ITAU_ACTIVATION_TOKEN = "test-activation";
  const r = await fetch(origin + "/admin/status", { headers: { "x-setup-key": process.env.ITAU_SETUP_KEY } });
  assert.equal(r.status, 200);
  const data = await r.json();
  assert.equal(data.csrValid, true);
  assert.deepEqual(data.authenticationMissing, ["ITAU_CLIENT_SECRET", "ITAU_CERTIFICATE"]);
  assert.doesNotMatch(JSON.stringify(data), /PRIVATE KEY|test-activation|test-client-id/);
});
test("autenticação envia certificado por HTTPS nativo e formulário correto", async () => {
  process.env.ITAU_CLIENT_SECRET = "local-secret";
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "forte-itau-test-"));
  let cert;
  try {
    const keyPath = path.join(directory, "private.pem");
    fs.writeFileSync(keyPath, process.env.ITAU_PRIVATE_KEY, { mode: 0o600 });
    cert = spawnSync("openssl", ["req", "-new", "-x509", "-key", keyPath, "-subj", "/CN=test-client-id", "-days", "1"], { encoding: "utf8" });
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  assert.equal(cert.status, 0);
  process.env.ITAU_CERTIFICATE = cert.stdout;
  const original = https.request;
  let statusCode = 200;
  https.request = (url, options, callback) => {
    assert.equal(url, "https://sts.itau.com.br/api/oauth/token");
    assert.equal(options.cert, process.env.ITAU_CERTIFICATE);
    assert.equal(options.key, process.env.ITAU_PRIVATE_KEY);
    assert.equal(options.headers["content-type"], "application/x-www-form-urlencoded");
    const req = new EventEmitter();
    req.setTimeout = () => {};
    req.end = body => {
      assert.equal(new URLSearchParams(body).get("client_secret"), "local-secret");
      const response = new EventEmitter();
      response.statusCode = statusCode;
      response.setEncoding = () => {};
      callback(response);
      queueMicrotask(() => { response.emit("data", statusCode === 200 ? JSON.stringify({ access_token: "mock-access", expires_in: 300 }) : "sensitive upstream text"); response.emit("end"); });
    };
    return req;
  };
  try {
    assert.equal((await requestToken()).access_token, "mock-access");
    const r = await fetch(origin + "/admin/test-auth", { method: "POST", headers: { "x-setup-key": process.env.ITAU_SETUP_KEY } });
    assert.deepEqual(await r.json(), { authenticated: true, expiresIn: 300 });
    statusCode = 401;
    await assert.rejects(requestToken(), error => error.code === "ITAU_AUTH_REJECTED" && !error.message.includes("sensitive"));
  } finally { https.request = original; }
});
