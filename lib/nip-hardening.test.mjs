import assert from "node:assert/strict";
import test from "node:test";
import {
  NIP_REGENERATION_LIMIT,
  buildNipResendIdempotencyKey,
  canRequestDeliveryPin,
  deriveNipIncidentType,
  effectiveNipStatus,
  getDeliveryPinBlockReason,
  planNipResend,
  resolveRegeneration,
} from "./nip-delivery.ts";
import { resolveMandadoNipChannel } from "./mandado-nip-channel.ts";
import { buildNipSenderView } from "./nip-sender-view.ts";

const SENDER_MX = "4421234567";
const RECIPIENT_MX = "4421112233";

process.env.DELIVERY_PIN_SECRET = "0123456789abcdef0123456789abcdef";

const NOW = new Date("2026-02-01T00:00:00.000Z");

const ORDER = (overrides = {}) => ({
  serviceKind: "mandado",
  mandadoEntregaSegura: true,
  nipDeliveryStatus: "delivered",
  deliveryPinExpiresAt: "2026-02-02T00:00:00.000Z", // vigente por defecto
  ...overrides,
});

// ── 1. delivered persistido + TTL expirado: NUNCA se permite la validación ──

test("delivered persistido + TTL expirado → gate cerrado Y view de /orders dice 'Expirado'", () => {
  const order = ORDER({ deliveryPinExpiresAt: "2026-01-30T00:00:00.000Z" });
  // La misma evaluación canónica, compartida por los tres consumidores.
  assert.equal(effectiveNipStatus(order, NOW), "expired");
  assert.equal(canRequestDeliveryPin(order, NOW), false);
  assert.equal(getDeliveryPinBlockReason(order, NOW), "expired");
  // /orders NO puede afirmar que el código está entregado si expiró.
  const view = buildNipSenderView(order, NOW);
  assert.equal(view.status, "expired");
  assert.equal(view.showPinToSender, false);
  assert.match(view.title, /expir/i);
});

test("delivered + TTL vigente → gate abierto y view 'Entregado'", () => {
  const order = ORDER();
  assert.equal(effectiveNipStatus(order, NOW), "delivered");
  assert.equal(canRequestDeliveryPin(order, NOW), true);
  assert.equal(getDeliveryPinBlockReason(order, NOW), null);
  const view = buildNipSenderView(order, NOW);
  assert.equal(view.status, "delivered");
});

test("pending → misma evaluación en gate y view (sin afirmar entrega)", () => {
  const order = ORDER({ nipDeliveryStatus: "pending" });
  assert.equal(effectiveNipStatus(order, NOW), "pending");
  assert.equal(canRequestDeliveryPin(order, NOW), false);
  assert.equal(getDeliveryPinBlockReason(order, NOW), "not_delivered");
  const view = buildNipSenderView(order, NOW);
  assert.equal(view.status, "pending");
  assert.equal(view.title, "Código pendiente de entrega");
  assert.equal(view.showPinToSender, false);
});

test("failed → view 'Error' y gate bloqueado (sin NIP marcado como entregado)", () => {
  const order = ORDER({ nipDeliveryStatus: "failed" });
  assert.equal(effectiveNipStatus(order, NOW), "failed");
  assert.equal(canRequestDeliveryPin(order, NOW), false);
  assert.equal(getDeliveryPinBlockReason(order, NOW), "not_delivered");
  const view = buildNipSenderView(order, NOW);
  assert.equal(view.status, "failed");
  // Canal sender (default del helper): el remitente es el receptor del código,
  // así que sí puede verlo (CASO 5); en canal recipient NUNCA.
  assert.equal(view.showPinToSender, true);
  const recipientView = buildNipSenderView(ORDER({ nipDeliveryStatus: "failed", mandadoNipRecipient: "recipient" }), NOW);
  assert.equal(recipientView.showPinToSender, false);
});

test("verificado es terminal: gana sobre delivered y sobre el TTL expirado", () => {
  const order = ORDER({
    deliveryVerificationStatus: "verified",
    deliveryPinExpiresAt: "2026-01-30T00:00:00.000Z",
  });
  assert.equal(effectiveNipStatus(order, NOW), "verified");
  const view = buildNipSenderView(order, NOW);
  assert.equal(view.status, "verified");
  assert.equal(view.title, "Entrega verificada");
});

// ── A: gate `verified` terminal e idempotente (revisión) ────────────

test("A. verified NUNCA bloquea el gate (ni con TTL expirado) y es idempotente ante repetición", () => {
  const order = ORDER({
    deliveryVerificationStatus: "verified",
    deliveryPinExpiresAt: "2026-01-30T00:00:00.000Z", // expirado: aun así verified gana
  });
  // Repetición: varias evaluaciones seguidas → siempre verified (idempotente).
  for (let i = 0; i < 3; i++) {
    assert.equal(effectiveNipStatus(order, NOW), "verified");
  }
  assert.equal(getDeliveryPinBlockReason(order, NOW), null);
  assert.equal(canRequestDeliveryPin(order, NOW), true);
  // Con delivered + TTL vigente pero ya verificado → verified (no delivered).
  const verificadoVigente = ORDER({ deliveryVerificationStatus: "verified" });
  assert.equal(effectiveNipStatus(verificadoVigente, NOW), "verified");
  assert.equal(getDeliveryPinBlockReason(verificadoVigente, NOW), null);
});

test("A. verified gana sobre locked y sobre failed persistido", () => {
  const locked = ORDER({ deliveryVerificationStatus: "verified", deliveryPinLockedUntil: "2099-01-01T00:00:00.000Z" });
  assert.equal(effectiveNipStatus(locked, NOW), "verified");
  assert.equal(getDeliveryPinBlockReason(locked, NOW), null);
  const conFailed = ORDER({ deliveryVerificationStatus: "verified", nipDeliveryStatus: "failed" });
  assert.equal(effectiveNipStatus(conFailed, NOW), "verified");
  assert.equal(getDeliveryPinBlockReason(conFailed, NOW), null);
});

test("A. pendiente/failed sin verificar siguen bloqueando (verified es el único terminal)", () => {
  assert.equal(getDeliveryPinBlockReason(ORDER({ nipDeliveryStatus: "pending" }), NOW), "not_delivered");
  assert.equal(getDeliveryPinBlockReason(ORDER({ nipDeliveryStatus: "failed" }), NOW), "not_delivered");
  // locked + delivered: el gate abre (el código sí llegó); el bloqueo por
  // intentos se aplica en la validación (deliveryPinLockedUntil), no en el gate.
  assert.equal(getDeliveryPinBlockReason(ORDER({ deliveryVerificationStatus: "locked", nipDeliveryStatus: "delivered" }), NOW), null);
  // locked sin delivered → bloqueado.
  assert.equal(getDeliveryPinBlockReason(ORDER({ deliveryVerificationStatus: "locked", nipDeliveryStatus: "pending" }), NOW), "not_delivered");
});

// ── B: responsable ≠ canal en la vista del remitente ────────────────

test("B. la vista del remitente usa el canal EFECTIVO (nipDeliveryChannel), no el responsable", () => {
  // Canal efectivo destinatario (aunque el responsable legado diga sender) → mensajes de destinatario.
  const view = buildNipSenderView(
    ORDER({ mandadoNipRecipient: "sender", nipDeliveryChannel: "whatsapp_recipient", mandadoRecipientName: "María", mandadoRecipientPhone: "5215512345678" }),
    NOW
  );
  assert.equal(view.channel, "recipient");
  assert.equal(view.showPinToSender, false);
  assert.equal(view.recipientPhoneMasked, "******5678");
  // Canal efectivo remitente (aunque el responsable diga recipient) → mensajes de remitente.
  const viewSender = buildNipSenderView(
    ORDER({ mandadoNipRecipient: "recipient", nipDeliveryChannel: "whatsapp_sender" }),
    NOW
  );
  assert.equal(viewSender.channel, "sender");
  assert.equal(viewSender.showPinToSender, true);
  // `none` (sin canal entregable) cae al responsable/legado; la situación real
  // la transmite el estado del mensaje (pending → sin afirmar entrega).
  const viewNone = buildNipSenderView(ORDER({ nipDeliveryChannel: "none", nipDeliveryStatus: "pending" }), NOW);
  assert.equal(viewNone.status, "pending");
  assert.equal(viewNone.showPinToSender, false);
});

// ── Invariantes: restaurantes y lógica financiera intactos ───────────

test("restaurantes NO se ven afectados por los campos de canal del NIP de mandados", () => {
  // Un pedido de restaurante con campos de canal de mandado presentes se comporta
  // exactamente igual: sin gate de mandados, sin estado de NIP.
  const restaurant = {
    serviceKind: "restaurant",
    deliveryVerificationMethod: "pin",
    deliveryVerificationStatus: "pending",
    nipDeliveryChannel: "whatsapp_recipient",
    nipDeliveryPhone: "4421112233",
  };
  // Método pin pendiente: el flujo de restaurante se conserva exactamente igual
  // (pending, sin gate de mandados, pide el NIP como hoy) — los campos de canal
  // de mandado no cambian nada.
  assert.equal(effectiveNipStatus(restaurant, NOW), "pending");
  assert.equal(getDeliveryPinBlockReason(restaurant, NOW), null); // conserva su flujo
  assert.equal(canRequestDeliveryPin(restaurant, NOW), true); // método pin pendiente como hoy
  // Sin método pin → nunca pide NIP, aunque existan campos de canal.
  const sinPin = { serviceKind: "restaurant", deliveryVerificationMethod: "not_required", nipDeliveryChannel: "whatsapp_recipient" };
  assert.equal(effectiveNipStatus(sinPin, NOW), "no_pin");
  assert.equal(canRequestDeliveryPin(sinPin, NOW), false);
});

test("la decisión de canal NO depende de ni altera campos financieros (settlement/stripe intactos)", () => {
  // resolveMandadoNipChannel recibe solo datos de contacto/canal; pasar campos
  // financieros no cambia la decisión (no los lee) y nada del NIP toca totales.
  const channel = resolveMandadoNipChannel({
    pinEnabled: true, senderPhone: SENDER_MX, recipientName: "María", recipientPhone: RECIPIENT_MX,
    recipientWhatsAppDeclared: true,
  });
  assert.deepEqual(channel, { ok: true, channel: "recipient" });
  // El view model ignora totales: la vista con campos financieros es IDÉNTICA
  // a la vista sin ellos (los campos financieros no tocan el ciclo del NIP).
  const withFin = buildNipSenderView(ORDER({ totalPrice: 99999, settlementStatus: "ready" }), NOW);
  const withoutFin = buildNipSenderView(ORDER(), NOW);
  assert.deepEqual(withFin, withoutFin);
});

// ── 2. Cooldowns y límites (mismos valores que usa el backend) ──

test("reenvío respeta el cooldown de 60 s y reutiliza el NIP vigente (no regenera)", () => {
  assert.deepEqual(
    planNipResend({ deliveryPinExpiresAt: "2026-02-02T00:00:00.000Z" }, NOW),
    { ok: true, action: "resend" }
  );
  assert.deepEqual(
    planNipResend(
      { deliveryPinExpiresAt: "2026-02-02T00:00:00.000Z", nipResendCooldownUntil: "2026-02-01T00:01:00.000Z" },
      NOW
    ),
    { ok: false, reason: "resend_cooldown" }
  );
});

test("regeneración respeta cooldown de 10 min y límite de 3 por pedido", () => {
  assert.deepEqual(
    resolveRegeneration({ deliveryPinRegenCount: 1, deliveryPinRegenCooldownUntil: "2026-02-01T00:05:00.000Z" }, NOW),
    { ok: false, reason: "cooldown" }
  );
  assert.deepEqual(resolveRegeneration({ deliveryPinRegenCount: NIP_REGENERATION_LIMIT }, NOW), {
    ok: false,
    reason: "limit",
  });
  assert.deepEqual(
    planNipResend(
      { deliveryPinExpiresAt: "2026-01-30T00:00:00.000Z", deliveryPinRegenCount: NIP_REGENERATION_LIMIT },
      NOW
    ),
    { ok: false, reason: "regen_limit" }
  );
});

test("doble reenvío → misma llave de idempotencia; regeneración → llave nueva", () => {
  const key = buildNipResendIdempotencyKey("o1", "2026-02-01T00:00:00.000Z");
  assert.equal(key, buildNipResendIdempotencyKey("o1", "2026-02-01T00:00:00.000Z"));
  assert.notEqual(key, buildNipResendIdempotencyKey("o1", "2026-02-01T00:10:00.000Z"));
});

// ── 3. El view model ofrece exactamente lo que permite la política ──

test("NIP expirado → /orders ofrece 'Generar nuevo código' (no 'Reenviar')", () => {
  const view = buildNipSenderView(
    ORDER({
      deliveryPinExpiresAt: "2026-01-30T00:00:00.000Z",
      deliveryPinRegenCount: 0,
      deliveryPinRegenCooldownUntil: "2026-01-31T00:00:00.000Z",
    }),
    NOW
  );
  assert.equal(view.status, "expired");
  assert.equal(view.canResend, false);
  assert.equal(view.canRegenerate, true);
});

test("límite de regeneraciones alcanzado → ni regenerar, con aviso claro", () => {
  const view = buildNipSenderView(
    ORDER({ deliveryPinExpiresAt: "2026-01-30T00:00:00.000Z", deliveryPinRegenCount: NIP_REGENERATION_LIMIT }),
    NOW
  );
  assert.equal(view.canRegenerate, false);
  assert.equal(view.regenLimitReached, true);
});

test("cooldown de reenvío activo → canResend false y segundos restantes en la vista", () => {
  const view = buildNipSenderView(
    ORDER({ nipResendCooldownUntil: "2026-02-01T00:00:30.000Z" }),
    NOW
  );
  assert.equal(view.canResend, false);
  assert.ok(view.resendCooldownSeconds > 0 && view.resendCooldownSeconds <= 30);
});

// ── 4. Canal recipient: el NIP nunca se revela al remitente ──

test("canal recipient + delivered → nunca muestra el NIP al remitente; teléfono enmascarado", () => {
  const view = buildNipSenderView(
    ORDER({
      mandadoNipRecipient: "recipient",
      mandadoRecipientPhone: "5215512345678",
      mandadoRecipientName: "María",
    }),
    NOW
  );
  assert.equal(view.channel, "recipient");
  assert.equal(view.status, "delivered");
  assert.equal(view.showPinToSender, false);
  assert.equal(view.recipientPhoneMasked, "******5678");
});

// ── 5. Incidencias separadas (Dispatch Center) ──

test("tipos de incidencia separados: expired / not_delivered / no_whatsapp", () => {
  assert.equal(deriveNipIncidentType({}, "expired"), "expired");
  assert.equal(deriveNipIncidentType({ mandadoNipRecipient: "recipient" }, "not_delivered"), "not_delivered");
  // Canal remitente porque el destinatario declaró no usar WhatsApp.
  assert.equal(
    deriveNipIncidentType(
      { mandadoNipRecipient: "sender", mandadoRecipientWhatsAppDeclared: false },
      "not_delivered"
    ),
    "no_whatsapp"
  );
  // Canal remitente con destinatario con WhatsApp declarado → not_delivered.
  assert.equal(
    deriveNipIncidentType({ mandadoNipRecipient: "sender", mandadoRecipientWhatsAppDeclared: true }, "not_delivered"),
    "not_delivered"
  );
  // Legado sin campos → canal sender sin declaración → not_delivered (seguro).
  assert.equal(deriveNipIncidentType({}, "not_delivered"), "not_delivered");
});

test("fallback sender + delivered → la vista explica la responsabilidad al remitente", () => {
  const view = buildNipSenderView(
    ORDER({
      mandadoNipRecipient: "sender",
      mandadoRecipientWhatsAppDeclared: false,
    }),
    NOW
  );
  assert.equal(view.channel, "sender");
  assert.equal(view.fallbackToSender, true);
  assert.ok(view.senderResponsibilityNote);
  assert.match(view.senderResponsibilityNote, /comunicar el código al destinatario/);
});
