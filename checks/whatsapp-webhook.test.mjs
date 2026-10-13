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
