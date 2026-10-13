import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { validSignature, server } from "../whatsapp-server.mjs";

test("Meta HMAC signature accepts authentic payload", () => {
  const body = Buffer.from('{"object":"whatsapp_business_account"}');
  const signature = "sha256=" + crypto.createHmac("sha256", "test-secret").update(body).digest("hex");
  assert.equal(validSignature(body, signature, "test-secret"), true);
  assert.equal(validSignature(Buffer.from("{}"), signature, "test-secret"), false);
  assert.equal(validSignature(body, "sha256=wrong", "test-secret"), false);
  assert.equal(validSignature(body, signature, ""), false);
});
test("GET verification and unsigned POST", async () => {
  process.env.WHATSAPP_VERIFY_TOKEN = "local-verify-token";
  process.env.WHATSAPP_APP_SECRET = "local-app-secret";
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  try {
    const verified = await fetch(base + "/webhook?hub.mode=subscribe&hub.verify_token=local-verify-token&hub.challenge=12345");
    assert.equal(verified.status, 200);
    assert.equal(await verified.text(), "12345");
    const rejected = await fetch(base + "/webhook?hub.mode=subscribe&hub.verify_token=bad&hub.challenge=12345");
    assert.equal(rejected.status, 403);
    const unsigned = await fetch(base + "/webhook", { method: "POST", body: "{}", headers: { "content-type": "application/json" } });
    assert.equal(unsigned.status, 403);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test("signed POST is forwarded and audited without leaking content", async () => {
  process.env.WHATSAPP_APP_SECRET = "local-app-secret";
  process.env.WHATSAPP_VENDAS_WEBHOOK_ENABLED = "false";
  const originalFetch = globalThis.fetch;
  const originalInfo = console.info;
  const logs = [];
  let forwarded = 0;
  globalThis.fetch = async (_url, options) => {
    forwarded++;
    assert.equal(options.method, "POST");
    return { ok: true, status: 200 };
  };
  console.info = (...args) => logs.push(args.join(" "));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const raw = JSON.stringify({ object: "whatsapp_business_account", secret_test_marker: "DO_NOT_LOG_123" });
  const signature = "sha256=" + crypto.createHmac("sha256", "local-app-secret").update(raw).digest("hex");
  try {
    const response = await originalFetch("http://127.0.0.1:" + port + "/webhook", {
      method: "POST", body: raw,
      headers: { "content-type": "application/json", "x-hub-signature-256": signature },
    });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "EVENT_RECEIVED");
    assert.equal(forwarded, 1);
    assert.ok(logs.some(line => line.includes('"stage":"signature_accepted"')));
    assert.ok(logs.some(line => line.includes('"stage":"upstream_response"')));
    assert.ok(logs.some(line => line.includes('"stage":"delivered"')));
    assert.ok(!logs.join(" ").includes("DO_NOT_LOG_123"));
    assert.ok(!logs.join(" ").includes(signature));
  } finally {
    await new Promise(resolve => server.close(resolve));
    globalThis.fetch = originalFetch;
    console.info = originalInfo;
  }
});
