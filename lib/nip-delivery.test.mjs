import assert from "node:assert/strict";
import test from "node:test";
import { createDeliveryPin, isDeliveryPinValid, revealDeliveryPin } from "./delivery-pin.ts";
import {
  NIP_REGENERATION_LIMIT,
  buildNipResendIdempotencyKey,
  canRequestDeliveryPin,
  getDeliveryPinBlockReason,
  mapMetaMessageStatus,
  planNipResend,
  resolveNextClaimStatus,
  resolveNextNipStatus,
  resolveNipDeliveryStatus,
  resolveNipStatusFromClaimStatus,
  resolveRegeneration,
} from "./nip-delivery.ts";

process.env.DELIVERY_PIN_SECRET = "0123456789abcdef0123456789abcdef";

// ── PASO 1: gate de entrega ─────────────────────────────────────────

test("1. NIP off → la entrega se completa normalmente (no se pide código)", () => {
  assert.equal(
    canRequestDeliveryPin({ serviceKind: "mandado", mandadoEntregaSegura: false, nipDeliveryStatus: "not_required" }),
    false
  );
  assert.equal(
    canRequestDeliveryPin({ serviceKind: "mandado", mandadoEntregaSegura: false, deliveryVerificationMethod: "pin" }),
    false
  );
});

test("2. NIP on + nipDeliveryStatus pending → NO se puede pedir/validar el NIP", () => {
  assert.equal(
    canRequestDeliveryPin({ serviceKind: "mandado", mandadoEntregaSegura: true, nipDeliveryStatus: "pending" }),
    false
  );
});

test("3. NIP on + nipDeliveryStatus failed → NO se puede pedir/validar el NIP", () => {
  assert.equal(
    canRequestDeliveryPin({ serviceKind: "mandado", mandadoEntregaSegura: true, nipDeliveryStatus: "failed" }),
    false
  );
  assert.equal(
    canRequestDeliveryPin({ serviceKind: "mandado", mandadoEntregaSegura: true, nipDeliveryStatus: "expired" }),
    false
  );
});

test("4. NIP on + nipDeliveryStatus delivered → SÍ se puede pedir el NIP", () => {
  assert.equal(
    canRequestDeliveryPin({ serviceKind: "mandado", mandadoEntregaSegura: true, nipDeliveryStatus: "delivered" }),
    true
  );
});

test("legado sin nipDeliveryStatus: mandado con NIP = pending (sin evidencia de entrega, gate cerrado)", () => {
  // Criterio seguro documentado: NUNCA se inventa que el NIP fue entregado.
  assert.equal(
    resolveNipDeliveryStatus({ serviceKind: "mandado", mandadoEntregaSegura: true }),
    "pending"
  );
  assert.equal(
    canRequestDeliveryPin({ serviceKind: "mandado", mandadoEntregaSegura: true }),
    false
  );
  assert.equal(resolveNipDeliveryStatus({ serviceKind: "mandado", mandadoEntregaSegura: false }), "not_required");
});

test("restaurantes conservan su flujo actual (el gate de mandados no aplica)", () => {
  assert.equal(
    canRequestDeliveryPin({ deliveryVerificationMethod: "pin", deliveryVerificationStatus: "pending" }),
    true
  );
  assert.equal(canRequestDeliveryPin({ deliveryVerificationMethod: "not_required" }), false);
});

test("9. Mensaje delivered pero NIP EXPIrado → NO se permite la validación (AJUSTE 3: expiración independiente)", () => {
  const now = new Date("2026-02-01T00:00:00.000Z");
  const expirado = {
    serviceKind: "mandado",
    mandadoEntregaSegura: true,
    nipDeliveryStatus: "delivered",
    deliveryPinExpiresAt: "2026-01-30T00:00:00.000Z",
  };
  assert.equal(canRequestDeliveryPin(expirado, now), false);
  assert.equal(getDeliveryPinBlockReason(expirado, now), "expired");
  // Vigente → el delivered sí abre el gate.
  const vigente = {
    serviceKind: "mandado",
    mandadoEntregaSegura: true,
    nipDeliveryStatus: "delivered",
    deliveryPinExpiresAt: "2026-02-02T00:00:00.000Z",
  };
  assert.equal(canRequestDeliveryPin(vigente, now), true);
  assert.equal(getDeliveryPinBlockReason(vigente, now), null);
});

test("block reason distingue no_delivered de expired", () => {
  const now = new Date("2026-02-01T00:00:00.000Z");
  assert.equal(
    getDeliveryPinBlockReason({ serviceKind: "mandado", mandadoEntregaSegura: true, nipDeliveryStatus: "sent" }, now),
    "not_delivered"
  );
  assert.equal(
    getDeliveryPinBlockReason({ serviceKind: "mandado", mandadoEntregaSegura: false }, now),
    null
  );
  assert.equal(
    getDeliveryPinBlockReason({ deliveryVerificationMethod: "pin", deliveryVerificationStatus: "pending" }, now),
    null // restaurante: sin gate
  );
});

// ── PASO 5: política de regeneración y reenvío ──────────────────────

test("6. Reenviar NIP vigente → reutiliza el MISMO NIP (acción resend, sin regenerar)", () => {
  const now = new Date("2026-02-01T00:00:00.000Z");
  const plan = planNipResend({ deliveryPinExpiresAt: "2026-02-02T00:00:00.000Z" }, now);
  assert.deepEqual(plan, { ok: true, action: "resend" });
});

test("7. NIP expirado → el reenvío regenera e invalida el anterior (nuevo hash/ciphertext)", () => {
  const now = new Date("2026-02-01T00:00:00.000Z");
  const plan = planNipResend({ deliveryPinExpiresAt: "2026-01-30T00:00:00.000Z" }, now);
  assert.deepEqual(plan, { ok: true, action: "regenerate" });

  // La regeneración produce un NIP distinto: el anterior deja de validar.
  const pin1 = createDeliveryPin("ORD-1", now);
  const pin2 = createDeliveryPin("ORD-1", now);
  const value1 = revealDeliveryPin(pin1.deliveryPinCiphertext);
  const value2 = revealDeliveryPin(pin2.deliveryPinCiphertext);
  assert.notEqual(pin1.deliveryPinHash, pin2.deliveryPinHash);
  assert.notEqual(pin1.deliveryPinCiphertext, pin2.deliveryPinCiphertext);
  assert.notEqual(value1, value2);
  // El NIP anterior ya no valida contra el hash nuevo.
  assert.equal(isDeliveryPinValid("ORD-1", value1, pin2.deliveryPinHash), false);
  assert.equal(isDeliveryPinValid("ORD-1", value2, pin2.deliveryPinHash), true);
});

test("8. Regeneración repetida → respeta cooldown y límite", () => {
  const now = new Date("2026-02-01T00:00:00.000Z");
  // Cooldown activo.
  assert.deepEqual(
    resolveRegeneration({ deliveryPinRegenCount: 1, deliveryPinRegenCooldownUntil: "2026-02-01T00:05:00.000Z" }, now),
    { ok: false, reason: "cooldown" }
  );
  // Cooldown pasado → permitido.
  assert.deepEqual(
    resolveRegeneration({ deliveryPinRegenCount: 1, deliveryPinRegenCooldownUntil: "2026-01-31T00:00:00.000Z" }, now),
    { ok: true }
  );
  // Límite alcanzado.
  assert.deepEqual(
    resolveRegeneration({ deliveryPinRegenCount: NIP_REGENERATION_LIMIT }, now),
    { ok: false, reason: "limit" }
  );
  // El reenvío con NIP expirado respeta el mismo límite.
  const plan = planNipResend(
    { deliveryPinExpiresAt: "2026-01-30T00:00:00.000Z", deliveryPinRegenCount: NIP_REGENERATION_LIMIT },
    now
  );
  assert.deepEqual(plan, { ok: false, reason: "regen_limit" });
});

test("reenvío con cooldown de reenvío activo → bloqueado", () => {
  const now = new Date("2026-02-01T00:00:00.000Z");
  assert.deepEqual(
    planNipResend({ deliveryPinExpiresAt: "2026-02-02T00:00:00.000Z", nipResendCooldownUntil: "2026-02-01T00:01:00.000Z" }, now),
    { ok: false, reason: "resend_cooldown" }
  );
});

test("10. Doble reenvío del mismo NIP → misma llave de idempotencia (el claim deduplica)", () => {
  const key = buildNipResendIdempotencyKey("order-1", "2026-02-01T00:00:00.000Z");
  assert.equal(key, buildNipResendIdempotencyKey("order-1", "2026-02-01T00:00:00.000Z"));
  // Una regeneración cambia la versión del NIP → llave nueva (reenvío legítimo).
  assert.notEqual(key, buildNipResendIdempotencyKey("order-1", "2026-02-01T00:10:00.000Z"));
  // Distintas órdenes → llaves distintas.
  assert.notEqual(key, buildNipResendIdempotencyKey("order-2", "2026-02-01T00:00:00.000Z"));
});

test("12. Meta failed → estado de envío fallido SIN marcar el NIP como entregado", () => {
  assert.equal(mapMetaMessageStatus("failed"), "failed");
  assert.equal(resolveNipStatusFromClaimStatus("failed"), "failed");
  assert.notEqual(resolveNipStatusFromClaimStatus("failed"), "delivered");
  assert.equal(resolveNextClaimStatus("sent", "failed"), "failed");
  // Con nipDeliveryStatus failed el gate permanece cerrado.
  assert.equal(
    canRequestDeliveryPin({ serviceKind: "mandado", mandadoEntregaSegura: true, nipDeliveryStatus: "failed" }),
    false
  );
});

// ── PASO 2: estados de mensajes de Meta ─────────────────────────────

test("5. Meta status delivered → ClaimStatus delivered (no confundir con el 200 del endpoint)", () => {
  assert.equal(mapMetaMessageStatus("delivered"), "delivered");
  assert.equal(mapMetaMessageStatus("sent"), "sent");
  assert.equal(mapMetaMessageStatus("queued"), "sent");
  assert.equal(mapMetaMessageStatus("read"), "read");
});

test("6. delivered repetido de Meta → operación idempotente (mismo estado, sin re-aplicar)", () => {
  assert.equal(resolveNextClaimStatus("delivered", "delivered"), "delivered");
  assert.equal(resolveNextClaimStatus("sent", "sent"), "sent");
});

test("7. Meta status failed → ClaimStatus failed", () => {
  assert.equal(mapMetaMessageStatus("failed"), "failed");
  assert.equal(resolveNextClaimStatus("sent", "failed"), "failed");
  assert.equal(resolveNextClaimStatus("pending", "failed"), "failed");
});

test("estados desconocidos de Meta no rompen el webhook (se ignoran)", () => {
  assert.equal(mapMetaMessageStatus("deleted"), null);
  assert.equal(mapMetaMessageStatus(""), null);
  assert.equal(mapMetaMessageStatus(null), null);
  assert.equal(resolveNextClaimStatus("pending", null), null);
});

test("nunca se degrada el estado del claim (delivered → sent se ignora)", () => {
  assert.equal(resolveNextClaimStatus("delivered", "sent"), null);
  assert.equal(resolveNextClaimStatus("delivered", "read"), "read"); // read es hacia adelante
  assert.equal(resolveNextClaimStatus("failed", "delivered"), null); // failed es terminal
});

test("read también abre el gate del NIP (implica delivered)", () => {
  assert.equal(resolveNipStatusFromClaimStatus("read"), "delivered");
  assert.equal(resolveNipStatusFromClaimStatus("delivered"), "delivered");
  assert.equal(resolveNipStatusFromClaimStatus("sent"), "sent");
  assert.equal(resolveNipStatusFromClaimStatus("failed"), "failed");
  assert.equal(resolveNipStatusFromClaimStatus("pending"), null);
});

test("nipDeliveryStatus de la orden: forward-only e idempotente", () => {
  assert.equal(resolveNextNipStatus("sent", "delivered"), "delivered");
  assert.equal(resolveNextNipStatus("delivered", "delivered"), "delivered");
  assert.equal(resolveNextNipStatus("delivered", "sent"), null); // no degrada
  assert.equal(resolveNextNipStatus("delivered", "failed"), null); // no degrada
  assert.equal(resolveNextNipStatus("failed", "delivered"), null); // failed terminal
  assert.equal(resolveNextNipStatus("pending", "sent"), "sent");
});
