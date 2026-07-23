import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { verifyWhatsAppSignature } from "./whatsapp-webhook.ts";

test("WhatsApp sólo acepta el cuerpo firmado con el app secret", () => {
  const body = '{"entry":[]}';
  const secret = "test-secret";
  const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

  assert.equal(verifyWhatsAppSignature(body, signature, secret), true);
  assert.equal(verifyWhatsAppSignature(`${body} `, signature, secret), false);
  assert.equal(verifyWhatsAppSignature(body, null, secret), false);
});
