import assert from "node:assert/strict";
import test from "node:test";
import {
  isValidWhatsAppPhone,
  resolveMandadoNipChannel,
  resolveNipDeliveryTarget,
} from "./mandado-nip-channel.ts";
import { planMandadoArrival } from "./mandado-arrival.ts";

const SENDER = "4421234567";
const RECIPIENT_PHONE = "4421112233";

test("NIP apagado → sin canal (channel null), nunca bloquea", () => {
  assert.deepEqual(
    resolveMandadoNipChannel({ pinEnabled: false, senderPhone: null, recipientName: "", recipientPhone: "" }),
    { ok: true, channel: null }
  );
});

test("1. Destinatario identificado + WhatsApp declarado → NIP al destinatario (regla 1)", () => {
  assert.deepEqual(
    resolveMandadoNipChannel({
      pinEnabled: true, senderPhone: SENDER, recipientName: "María", recipientPhone: RECIPIENT_PHONE, recipientWhatsAppDeclared: true,
    }),
    { ok: true, channel: "recipient" }
  );
});

test("4. Remitente sin WhatsApp + destinatario con WhatsApp declarado → NIP al destinatario", () => {
  assert.deepEqual(
    resolveMandadoNipChannel({
      pinEnabled: true, senderPhone: null, recipientName: "María", recipientPhone: RECIPIENT_PHONE, recipientWhatsAppDeclared: true,
    }),
    { ok: true, channel: "recipient" }
  );
});

test("2. Destinatario sin WhatsApp + remitente ACEPTA el fallback → NIP al remitente (regla 2)", () => {
  assert.deepEqual(
    resolveMandadoNipChannel({
      pinEnabled: true, senderPhone: SENDER, recipientName: "María", recipientPhone: RECIPIENT_PHONE,
      recipientWhatsAppDeclared: false, senderFallbackAccepted: true,
    }),
    { ok: true, channel: "sender" }
  );
});

test("3. Destinatario sin WhatsApp + remitente NO acepta el fallback → NIP no permitido", () => {
  const result = resolveMandadoNipChannel({
    pinEnabled: true, senderPhone: SENDER, recipientName: "María", recipientPhone: RECIPIENT_PHONE,
    recipientWhatsAppDeclared: false, senderFallbackAccepted: false,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /Confirma que recibirás el código/i);
  // Sin el campo (undefined) también se considera no aceptado.
  const sinCampo = resolveMandadoNipChannel({
    pinEnabled: true, senderPhone: SENDER, recipientName: "María", recipientPhone: RECIPIENT_PHONE,
    recipientWhatsAppDeclared: false,
  });
  assert.equal(sinCampo.ok, false);
});

test("5. Ningún canal WhatsApp válido → NIP bloqueado (regla 4)", () => {
  // Destinatario sin WhatsApp + remitente inválido (aunque acepte el fallback).
  const sinRemitente = resolveMandadoNipChannel({
    pinEnabled: true, senderPhone: "123", recipientName: "María", recipientPhone: RECIPIENT_PHONE,
    recipientWhatsAppDeclared: false, senderFallbackAccepted: true,
  });
  assert.equal(sinRemitente.ok, false);
  // Sin destinatario y remitente inválido.
  const sinCanal = resolveMandadoNipChannel({
    pinEnabled: true, senderPhone: "123", recipientName: "", recipientPhone: "",
  });
  assert.equal(sinCanal.ok, false);
});

test("8b. NIP activado con destinatario incompleto (sin nombre o teléfono inválido) → rechazar", () => {
  const sinNombre = resolveMandadoNipChannel({
    pinEnabled: true, senderPhone: SENDER, recipientName: "", recipientPhone: RECIPIENT_PHONE, recipientWhatsAppDeclared: true,
  });
  assert.equal(sinNombre.ok, false);
  const telefonoInvalido = resolveMandadoNipChannel({
    pinEnabled: true, senderPhone: SENDER, recipientName: "María", recipientPhone: "123", recipientWhatsAppDeclared: true,
  });
  assert.equal(telefonoInvalido.ok, false);
});

test("regla 3: sin destinatario identificado + flujo explícito del remitente + remitente con WhatsApp → canal sender", () => {
  assert.deepEqual(
    resolveMandadoNipChannel({
      pinEnabled: true, senderPhone: SENDER, recipientName: "", recipientPhone: "", explicitNipRecipient: "sender",
    }),
    { ok: true, channel: "sender" }
  );
  // El flujo explícito NO permite saltarse la regla 4 (remitente sin WhatsApp válido).
  const sinRemitente = resolveMandadoNipChannel({
    pinEnabled: true, senderPhone: "", recipientName: "", recipientPhone: "", explicitNipRecipient: "sender",
  });
  assert.equal(sinRemitente.ok, false);
});

test("isValidWhatsAppPhone: 10 dígitos MX o 11-15 con lada; rechaza formatos inválidos", () => {
  assert.equal(isValidWhatsAppPhone("4421234567"), true);
  assert.equal(isValidWhatsAppPhone("524421234567"), true); // 52 + 10
  assert.equal(isValidWhatsAppPhone("442-123-4567"), true); // se normaliza
  assert.equal(isValidWhatsAppPhone(""), false);
  assert.equal(isValidWhatsAppPhone("123"), false);
  assert.equal(isValidWhatsAppPhone(null), false);
});

// ── Endurecimiento B: responsable del NIP ≠ canal efectivo ───────────

test("B. resolveNipDeliveryTarget: canal efectivo + teléfono destino según el responsable", () => {
  // Responsable destinatario → canal WhatsApp del destinatario + su teléfono.
  assert.deepEqual(
    resolveNipDeliveryTarget("recipient", { senderPhone: SENDER, recipientPhone: RECIPIENT_PHONE }),
    { deliveryChannel: "whatsapp_recipient", deliveryPhone: RECIPIENT_PHONE }
  );
  // Responsable remitente → canal WhatsApp del remitente + su teléfono.
  assert.deepEqual(
    resolveNipDeliveryTarget("sender", { senderPhone: SENDER, recipientPhone: RECIPIENT_PHONE }),
    { deliveryChannel: "whatsapp_sender", deliveryPhone: SENDER }
  );
  // Destinatario sin teléfono → estado explícito "none" (sin canal entregable).
  assert.deepEqual(
    resolveNipDeliveryTarget("recipient", { senderPhone: SENDER, recipientPhone: "" }),
    { deliveryChannel: "none" }
  );
  // Sin NIP (channel null) → none.
  assert.deepEqual(
    resolveNipDeliveryTarget(null, { senderPhone: SENDER, recipientPhone: RECIPIENT_PHONE }),
    { deliveryChannel: "none" }
  );
});

test("B. Escenario 1: destinatario con WhatsApp → responsable destinatario + canal whatsapp_recipient", () => {
  const channel = resolveMandadoNipChannel({
    pinEnabled: true, senderPhone: SENDER, recipientName: "María", recipientPhone: RECIPIENT_PHONE,
    recipientWhatsAppDeclared: true,
  });
  assert.deepEqual(channel, { ok: true, channel: "recipient" });
  assert.deepEqual(
    resolveNipDeliveryTarget(channel.channel, { senderPhone: SENDER, recipientPhone: RECIPIENT_PHONE }),
    { deliveryChannel: "whatsapp_recipient", deliveryPhone: RECIPIENT_PHONE }
  );
});

test("B. Escenario 2: destinatario sin WhatsApp + fallback aceptado → responsable remitente + canal whatsapp_sender", () => {
  const channel = resolveMandadoNipChannel({
    pinEnabled: true, senderPhone: SENDER, recipientName: "María", recipientPhone: RECIPIENT_PHONE,
    recipientWhatsAppDeclared: false, senderFallbackAccepted: true,
  });
  assert.deepEqual(channel, { ok: true, channel: "sender" });
  assert.deepEqual(
    resolveNipDeliveryTarget(channel.channel, { senderPhone: SENDER, recipientPhone: RECIPIENT_PHONE }),
    { deliveryChannel: "whatsapp_sender", deliveryPhone: SENDER }
  );
});

test("B. Escenario 3: sin canal WhatsApp disponible → NIP bloqueado (nunca se fuerza un canal inexistente)", () => {
  const channel = resolveMandadoNipChannel({
    pinEnabled: true, senderPhone: "", recipientName: "", recipientPhone: "",
  });
  assert.equal(channel.ok, false); // no se ofrece NIP obligatorio sin canal
  const target = resolveNipDeliveryTarget(null, { senderPhone: "", recipientPhone: "" });
  assert.equal(target.deliveryChannel, "none");
});

test("B. planMandadoArrival usa el canal EFECTIVO persistido (nipDeliveryChannel) sobre el responsable", () => {
  // Canal efectivo destinatario → NIP al destinatario aunque el responsable legado diga sender.
  const plan = planMandadoArrival({
    serviceKind: "mandado", mandadoEntregaSegura: true,
    mandadoNipRecipient: "sender", nipDeliveryChannel: "whatsapp_recipient",
  });
  assert.deepEqual(plan.nipChannel, "recipient");
  // Canal efectivo remitente → NIP al remitente aunque el responsable diga recipient.
  const planSender = planMandadoArrival({
    serviceKind: "mandado", mandadoEntregaSegura: true,
    mandadoNipRecipient: "recipient", nipDeliveryChannel: "whatsapp_sender",
  });
  assert.deepEqual(planSender.nipChannel, "sender");
  // Legado sin canal efectivo → cae al responsable; sin ambos → sender.
  const legacy = planMandadoArrival({ serviceKind: "mandado", mandadoEntregaSegura: true, mandadoNipRecipient: "recipient" });
  assert.deepEqual(legacy.nipChannel, "recipient");
  const sinNada = planMandadoArrival({ serviceKind: "mandado", mandadoEntregaSegura: true });
  assert.deepEqual(sinNada.nipChannel, "sender");
  // Sin Entrega segura → nunca NIP.
  const sinPin = planMandadoArrival({ serviceKind: "mandado", mandadoEntregaSegura: false, nipDeliveryChannel: "whatsapp_recipient" });
  assert.equal(sinPin.sendOrdenPorCompletar, false);
  assert.equal(sinPin.nipChannel, null);
});
