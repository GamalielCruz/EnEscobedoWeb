import assert from "node:assert/strict";
import test from "node:test";
import { createDeliveryPin, isDeliveryPinValid, revealDeliveryPin } from "./delivery-pin.ts";

process.env.DELIVERY_PIN_SECRET = "0123456789abcdef0123456789abcdef";

test("creates a six-digit encrypted PIN and validates only the correct value", () => {
  const record = createDeliveryPin("ORDER-1", new Date("2026-01-01T00:00:00.000Z"));
  const pin = revealDeliveryPin(record.deliveryPinCiphertext);
  assert.match(pin, /^\d{6}$/);
  assert.notEqual(record.deliveryPinHash, pin);
  assert.equal(isDeliveryPinValid("ORDER-1", pin, record.deliveryPinHash), true);
  assert.equal(isDeliveryPinValid("ORDER-1", pin === "000000" ? "000001" : "000000", record.deliveryPinHash), false);
});
