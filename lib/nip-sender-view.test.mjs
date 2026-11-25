// Tests del view model de la experiencia del remitente en /orders
// (lib/nip-sender-view.ts). Ejecutar: node --experimental-strip-types --test lib/nip-sender-view.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildNipSenderView, maskPhone } from "./nip-sender-view.ts";

const NOW = new Date("2026-02-01T00:00:00.000Z");
const FUTURE = new Date("2026-02-02T00:00:00.000Z"); // dentro del TTL de 24 h
const EXPIRED = new Date("2026-01-25T00:00:00.000Z"); // hace >24 h

const baseOrder = {
  serviceKind: "mandado",
  mandadoEntregaSegura: true,
  deliveryVerificationMethod: "pin",
  deliveryVerificationStatus: "pending",
  deliveryPinExpiresAt: FUTURE.toISOString(),
  deliveryPinRegenCount: 0,
};

test("1. sender + delivered → muestra el código al remitente", () => {
  const view = buildNipSenderView(
    { ...baseOrder, mandadoNipRecipient: "sender", nipDeliveryStatus: "delivered" },
    NOW
  );
  assert.equal(view.channel, "sender");
  assert.equal(view.showPinToSender, true);
  assert.equal(view.statusLabel, "Entregado");
});

test("2. recipient + delivered → NUNCA muestra el código al remitente", () => {
  const view = buildNipSenderView(
    { ...baseOrder, mandadoNipRecipient: "recipient", nipDeliveryStatus: "delivered" },
    NOW
  );
  assert.equal(view.channel, "recipient");
  assert.equal(view.showPinToSender, false);
  assert.equal(view.statusLabel, "Entregado");
});

test("3. recipient + failed → muestra reenvío (y sin código)", () => {
  const view = buildNipSenderView(
    { ...baseOrder, mandadoNipRecipient: "recipient", nipDeliveryStatus: "failed" },
    NOW
  );
  assert.equal(view.status, "failed");
  assert.equal(view.showPinToSender, false);
  assert.equal(view.canResend, true);
  assert.match(view.title, /No pudimos entregar el código/);
});

test("4. pending → no marca entregado", () => {
  const view = buildNipSenderView(
    { ...baseOrder, mandadoNipRecipient: "recipient", nipDeliveryStatus: "pending" },
    NOW
  );
  assert.equal(view.status, "pending");
  assert.equal(view.statusLabel, "Pendiente");
  assert.notEqual(view.statusLabel, "Entregado", "pending nunca se presenta como entregado");
  assert.equal(view.showPinToSender, false);
  assert.match(view.title, /pendiente/i);
  assert.match(view.message, /preparando/i);
  // Reenvío válido en pending: el NIP está vigente y el backend lo permite
  // (envía el código ahora). La UI nunca afirma que ya fue entregado.
  assert.equal(view.canResend, true);
});

test("5. expired → ofrece regenerar (nuevo código)", () => {
  const view = buildNipSenderView(
    { ...baseOrder, mandadoNipRecipient: "sender", nipDeliveryStatus: "delivered", deliveryPinExpiresAt: EXPIRED.toISOString() },
    NOW
  );
  assert.equal(view.status, "expired");
  assert.equal(view.statusLabel, "Expirado");
  assert.equal(view.canRegenerate, true);
  assert.equal(view.canResend, false);
  assert.match(view.title, /expiró/);
});

test("6. cooldown → bloquea el reenvío correctamente", () => {
  const cooldownUntil = new Date(NOW.getTime() + 90_000).toISOString();
  const view = buildNipSenderView(
    { ...baseOrder, mandadoNipRecipient: "sender", nipDeliveryStatus: "delivered", nipResendCooldownUntil: cooldownUntil },
    NOW
  );
  assert.equal(view.canResend, false);
  assert.ok(view.resendCooldownSeconds > 0, "debe quedar cooldown restante");
  assert.ok(view.resendCooldownSeconds <= 90, "cooldown máximo 90 s");
});

test("7. reenvío → reutiliza el NIP vigente (action resend, sin regenerar)", () => {
  const view = buildNipSenderView(
    { ...baseOrder, mandadoNipRecipient: "sender", nipDeliveryStatus: "failed" },
    NOW
  );
  // NIP vigente + cooldown libre → canResend (reutiliza), canRegenerate false.
  assert.equal(view.canResend, true);
  assert.equal(view.canRegenerate, false);
});

test("8. reenvío doble → idempotente (el estado no cambia por repetir la vista)", () => {
  const order = { ...baseOrder, mandadoNipRecipient: "recipient", nipDeliveryStatus: "delivered" };
  const first = buildNipSenderView(order, NOW);
  const second = buildNipSenderView(order, NOW);
  assert.deepEqual(second, first);
  assert.equal(second.statusLabel, "Entregado");
});

test("9. recipient → teléfono parcialmente oculto (******1234)", () => {
  assert.equal(maskPhone("+5215512341234"), "******1234");
  assert.equal(maskPhone("5512341234"), "******1234");
  assert.equal(maskPhone(null), undefined);
  const view = buildNipSenderView(
    { ...baseOrder, mandadoNipRecipient: "recipient", nipDeliveryStatus: "delivered", mandadoRecipientPhone: "+5215512341234" },
    NOW
  );
  assert.equal(view.recipientPhoneMasked, "******1234");
});

test("10. sender fallback → explica la responsabilidad al remitente", () => {
  const view = buildNipSenderView(
    {
      ...baseOrder,
      mandadoNipRecipient: "sender",
      mandadoRecipientWhatsAppDeclared: false,
      nipDeliveryStatus: "delivered",
    },
    NOW
  );
  assert.equal(view.fallbackToSender, true);
  assert.match(view.message, /no utiliza WhatsApp/i);
  assert.match(view.message, /proporcionárselo al destinatario/i);
  assert.equal(view.showPinToSender, true, "canal remitente: el código sí se muestra");
});

test("legado sin canal: mandado sin mandadoNipRecipient → sender (comportamiento actual)", () => {
  const view = buildNipSenderView(
    { ...baseOrder, nipDeliveryStatus: "delivered" },
    NOW
  );
  assert.equal(view.channel, "sender");
});

test("sin NIP requerido → no_pin, sin acciones", () => {
  const view = buildNipSenderView(
    { serviceKind: "mandado", mandadoEntregaSegura: false, deliveryVerificationMethod: "not_required", deliveryVerificationStatus: "not_required" },
    NOW
  );
  assert.equal(view.status, "no_pin");
  assert.equal(view.canResend, false);
  assert.equal(view.canRegenerate, false);
  assert.equal(view.showPinToSender, false);
});

test("verificado → muestra 'Entrega verificada' aunque el mensaje haya fallado antes", () => {
  const view = buildNipSenderView(
    { ...baseOrder, mandadoNipRecipient: "recipient", nipDeliveryStatus: "failed", deliveryVerificationStatus: "verified" },
    NOW
  );
  assert.equal(view.status, "verified");
  assert.equal(view.statusLabel, "Verificado");
  assert.match(view.title, /verificada/);
});
