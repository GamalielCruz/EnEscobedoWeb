import assert from "node:assert/strict";
import test from "node:test";
import {
  createDeliveryPin,
  isDeliveryPinValid,
  orderRequiresDeliveryPin,
  revealDeliveryPin,
} from "./delivery-pin.ts";

process.env.DELIVERY_PIN_SECRET = "0123456789abcdef0123456789abcdef";

test("creates a six-digit encrypted PIN and validates only the correct value", () => {
  const record = createDeliveryPin("ORDER-1", new Date("2026-01-01T00:00:00.000Z"));
  const pin = revealDeliveryPin(record.deliveryPinCiphertext);
  assert.match(pin, /^\d{6}$/);
  assert.notEqual(record.deliveryPinHash, pin);
  assert.equal(isDeliveryPinValid("ORDER-1", pin, record.deliveryPinHash), true);
  assert.equal(isDeliveryPinValid("ORDER-1", pin === "000000" ? "000001" : "000000", record.deliveryPinHash), false);
});

test("mandado con Entrega segura activa SIEMPRE requiere NIP, sin importar el metodo de verificacion", () => {
  assert.equal(
    orderRequiresDeliveryPin({ serviceKind: "mandado", mandadoEntregaSegura: true }),
    true
  );
  assert.equal(
    orderRequiresDeliveryPin({
      serviceKind: "mandado",
      mandadoEntregaSegura: true,
      deliveryVerificationMethod: "not_required",
      deliveryVerificationStatus: "not_required",
    }),
    true
  );
});

test("mandado con Entrega segura desactivada NUNCA requiere NIP, aunque exista NIP almacenado (bug fix)", () => {
  const record = createDeliveryPin("ORDER-2", new Date("2026-01-01T00:00:00.000Z"));
  assert.equal(
    orderRequiresDeliveryPin({
      serviceKind: "mandado",
      mandadoEntregaSegura: false,
      deliveryPinHash: record.deliveryPinHash,
      deliveryPinCiphertext: record.deliveryPinCiphertext,
      deliveryVerificationMethod: "pin",
      deliveryVerificationStatus: "pending",
    }),
    false
  );
});

test("restaurante requiere NIP solo si el metodo pin esta pendiente", () => {
  assert.equal(
    orderRequiresDeliveryPin({ deliveryVerificationMethod: "pin", deliveryVerificationStatus: "pending" }),
    true
  );
  assert.equal(
    orderRequiresDeliveryPin({ deliveryVerificationMethod: "not_required", deliveryVerificationStatus: "not_required" }),
    false
  );
  assert.equal(orderRequiresDeliveryPin({}), false);
});
