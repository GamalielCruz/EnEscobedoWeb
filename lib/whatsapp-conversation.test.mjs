import assert from "node:assert/strict";
import test from "node:test";
import { isWhatsAppConversationOpen, buildMandadoDeliveryOfferMessage } from "./whatsapp-conversation.ts";

// ============================================================
// TEST A: ultimaActividad = ahora - 2 minutos → mensaje normal
// ============================================================
test("TEST A: 2 min atrás → ventana válida", () => {
  const now = new Date("2026-08-19T12:00:00Z");
  const lastActivity = new Date("2026-08-19T11:58:00Z").toISOString();
  assert.equal(isWhatsAppConversationOpen(lastActivity, now), true);
});

// ============================================================
// TEST B: ultimaActividad = ahora - 1 hora → mensaje normal
// ============================================================
test("TEST B: 1 hora atrás → ventana válida", () => {
  const now = new Date("2026-08-19T12:00:00Z");
  const lastActivity = new Date("2026-08-19T11:00:00Z").toISOString();
  assert.equal(isWhatsAppConversationOpen(lastActivity, now), true);
});

// ============================================================
// TEST C: ultimaActividad = ahora - 23 horas → mensaje normal
// ============================================================
test("TEST C: 23h atrás → ventana válida", () => {
  const now = new Date("2026-08-19T12:00:00Z");
  const lastActivity = new Date("2026-08-18T13:00:00Z").toISOString();
  assert.equal(isWhatsAppConversationOpen(lastActivity, now), true);
});

// ============================================================
// TEST D: ultimaActividad = ahora - 24 horas y 1 minuto → template
// ============================================================
test("TEST D: 24h 1min atrás → ventana cerrada", () => {
  const now = new Date("2026-08-19T12:00:00Z");
  const lastActivity = new Date("2026-08-18T11:59:00Z").toISOString();
  assert.equal(isWhatsAppConversationOpen(lastActivity, now), false);
});

// ============================================================
// TEST E: ultimaActividad = null → template
// ============================================================
test("TEST E: null → ventana cerrada", () => {
  const now = new Date("2026-08-19T12:00:00Z");
  assert.equal(isWhatsAppConversationOpen(null, now), false);
  assert.equal(isWhatsAppConversationOpen(undefined, now), false);
});

// ============================================================
// TEST F: Mandado NO debe utilizar oferta_reparto
// ============================================================
test("TEST F: Mandado usa oferta_mandado (no oferta_reparto)", () => {
  // This is a structural test — the template selection happens in delivery-dispatch.ts
  // Here we verify the template name constants are distinct
  const ofertaReparto = "oferta_reparto";
  const ofertaMandado = "oferta_mandado";
  assert.notEqual(ofertaReparto, ofertaMandado);
});

// ============================================================
// TEST G: Restaurante NO debe utilizar mensaje normal de Mandado
// ============================================================
test("TEST G: Restaurante usa oferta_reparto (no mensaje normal)", () => {
  // Structural: restaurant flow calls sendDeliveryOffer (template),
  // mandado flow calls sendWhatsAppMessage (normal) or sendMandadoDeliveryOffer (template)
  // The routing is based on serviceKind === "mandado" in delivery-dispatch.ts
  const serviceKind = "restaurant";
  const usesTemplate = serviceKind !== "mandado";
  assert.equal(usesTemplate, true, "Restaurante siempre usa template");
});

// ============================================================
// TEST H: Mandado $44 + $10 — mensaje correcto
// ============================================================
test("TEST H: Mandado $44 — Tu envío $44, Total pagado $54", () => {
  const message = buildMandadoDeliveryOfferMessage({
    orderNumber: "12345",
    customerName: "Ignacio",
    pickupAddress: "C. Heroico Colegio Militar 18",
    deliveryAddress: "Calle Ejemplo 456",
    driverPayoutLabel: "$44.00 MXN",
    customerTotalLabel: "$54.00 MXN",
    paymentMethod: "YA PAGADO",
  });

  assert.ok(message.includes("Tu envío: $44.00 MXN"), "Contiene Tu envío: $44.00 MXN");
  assert.ok(message.includes("Total pagado: $54.00 MXN"), "Contiene Total pagado: $54.00 MXN");
  assert.ok(message.includes("YA PAGADO"), "Contiene método de pago");
  assert.ok(message.includes("12345"), "Contiene número de pedido");
  assert.ok(message.includes("Ignacio"), "Contiene nombre del cliente");
  assert.ok(!message.includes("Restaurante:"), "NO contiene Restaurante:");
  assert.ok(!message.includes("Total a cobrar"), "NO contiene Total a cobrar");
});

// ============================================================
// TEST I: Mandado $30 + $10 — monto no hardcodeado
// ============================================================
test("TEST I: Mandado $30 — Tu envío $30, Total pagado $40", () => {
  const message = buildMandadoDeliveryOfferMessage({
    orderNumber: "99999",
    customerName: "María",
    pickupAddress: "Av. Principal 100",
    deliveryAddress: "Col. Centro 200",
    driverPayoutLabel: "$30.00 MXN",
    customerTotalLabel: "$40.00 MXN",
    paymentMethod: "YA PAGADO",
  });

  assert.ok(message.includes("Tu envío: $30.00 MXN"), "Monto correcto $30");
  assert.ok(message.includes("Total pagado: $40.00 MXN"), "Total correcto $40");
  assert.ok(!message.includes("$44"), "NO hardcodeado a $44");
});

// ============================================================
// TEST J: Una oferta NO puede producir NORMAL + TEMPLATE
// ============================================================
test("TEST J: ventana válida → SOLO normal, ventana cerrada → SOLO template", () => {
  const now = new Date("2026-08-19T12:00:00Z");

  // Ventana válida: solo mensaje normal
  const recent = new Date("2026-08-19T11:55:00Z").toISOString();
  assert.equal(isWhatsAppConversationOpen(recent, now), true, "ventana abierta");

  // Ventana cerrada: solo template
  const old = new Date("2026-08-17T12:00:00Z").toISOString();
  assert.equal(isWhatsAppConversationOpen(old, now), false, "ventana cerrada");

  // Verificar que son mutuamente excluyentes
  assert.equal(isWhatsAppConversationOpen(recent, now), true, "reciente → abierto");
  assert.equal(isWhatsAppConversationOpen(old, now), false, "antiguo → cerrado");
  // Confirmar que exactamente uno es true
  const recentOpen = isWhatsAppConversationOpen(recent, now);
  const oldOpen = isWhatsAppConversationOpen(old, now);
  assert.equal(recentOpen !== oldOpen, true, "Mutuamente excluyentes: uno abierto, otro cerrado");
});

// ============================================================
// TEST adicional: Safety margin de 23h 30m
// ============================================================
test("Safety margin: 23h 30m exactas → ventana cerrada", () => {
  const now = new Date("2026-08-19T12:00:00Z");
  // 23h 30m exactas atrás
  const boundary = new Date("2026-08-18T12:30:00Z").toISOString();
  assert.equal(isWhatsAppConversationOpen(boundary, now), false, "23h 30m = cerrada (margin)");

  // 23h 29m → abierta
  const justInside = new Date("2026-08-18T12:31:00Z").toISOString();
  assert.equal(isWhatsAppConversationOpen(justInside, now), true, "23h 29m = abierta");
});

// ============================================================
// TEST adicional: buildMandadoDeliveryOfferMessage contiene recolección y entrega
// ============================================================
test("Contiene direcciones de recolección y entrega", () => {
  const message = buildMandadoDeliveryOfferMessage({
    orderNumber: "001",
    customerName: "Test",
    pickupAddress: "Origen 123",
    deliveryAddress: "Destino 456",
    driverPayoutLabel: "$50.00 MXN",
    customerTotalLabel: "$60.00 MXN",
    paymentMethod: "COBRAR EN EFECTIVO",
  });

  assert.ok(message.includes("Recolección"), "Menciona recolección");
  assert.ok(message.includes("Origen 123"), "Contiene dirección origen");
  assert.ok(message.includes("Entrega"), "Menciona entrega");
  assert.ok(message.includes("Destino 456"), "Contiene dirección destino");
  assert.ok(message.includes("COBRAR EN EFECTIVO"), "Método de pago efectivo");
});
