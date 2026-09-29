import assert from "node:assert/strict";
import test from "node:test";
import {
  OFFER_ACTIVE_TTL_SECONDS,
  OFFER_PENDING_WINDOW_SECONDS,
  buildOfferActivationWindow,
  buildOfferTiming,
  decideOfferAck,
  decideOfferAcceptance,
  offerTerminalStatusForReleaseReason,
  offerUsesPresentationAck,
  terminalStatusForReason,
} from "./offer-lifecycle.ts";

const T0 = Date.parse("2026-09-19T12:00:00.000Z");
const baseContext = (over = {}) => ({
  offeredToRef: "driver-a",
  driverId: "driver-a",
  repartidorAsignadoRef: null,
  dispatchStatus: "offered",
  now: new Date(T0),
  ...over,
});

test("los 14s son la ventana de respuesta, no la de entrega", () => {
  assert.equal(OFFER_ACTIVE_TTL_SECONDS, 14);
  assert.ok(OFFER_PENDING_WINDOW_SECONDS > OFFER_ACTIVE_TTL_SECONDS);
});

test("TEST 1-3: la latencia de entrega NO descuenta la ventana de respuesta", () => {
  const created = new Date(T0);
  const timing = buildOfferTiming("mandado", created, "offer-1");

  // La oferta nace PENDING_DELIVERY: la ventana de 14s no ha empezado.
  assert.equal(timing.status, "pending_delivery");
  assert.equal(timing.expiresAt, new Date(T0 + OFFER_PENDING_WINDOW_SECONDS * 1000).toISOString());

  // Llega al repartidor con 0s, 3s o 10s de latencia: al presentarla, la
  // ventana SIEMPRE es de 14s completos desde el ACK.
  for (const latencySeconds of [0, 3, 10]) {
    const ackAt = new Date(T0 + latencySeconds * 1000);
    const activation = buildOfferActivationWindow(ackAt);
    const remaining = (Date.parse(activation.expiresAt) - ackAt.getTime()) / 1000;
    assert.equal(remaining, 14);
    assert.notEqual(activation.expiresAt, timing.expiresAt);
  }
});

test("una oferta de restaurante tambien nace PENDING y usa ACK (nunca 600 s)", () => {
  const timing = buildOfferTiming("restaurant", new Date(T0), "offer-r");
  assert.equal(timing.status, "pending_delivery");
  // La ventana de ENTREGA es corta (45 s), no los 600 s del TTL de WhatsApp.
  assert.equal(timing.expiresAt, new Date(T0 + OFFER_PENDING_WINDOW_SECONDS * 1000).toISOString());
  assert.ok(OFFER_PENDING_WINDOW_SECONDS * 1000 < 600_000);
  assert.equal(offerUsesPresentationAck("restaurant"), true);
  assert.equal(offerUsesPresentationAck("mandado"), true);
});

test("TEST 10: un segundo OFFER_SHOWN no reinicia el temporizador", () => {
  const firstExpires = new Date(T0 + 14_000).toISOString();
  const decision = decideOfferAck(
    baseContext({
      offerStatus: "active",
      deliveryOfertaExpiresAt: firstExpires,
      now: new Date(T0 + 5_000),
    })
  );
  assert.deepEqual(decision, { action: "already_active", expiresAt: firstExpires });
});

test("OFFER_SHOWN sobre una oferta pending la activa una sola vez", () => {
  const decision = decideOfferAck(
    baseContext({
      offerStatus: "pending_delivery",
      deliveryOfertaExpiresAt: new Date(T0 + OFFER_PENDING_WINDOW_SECONDS * 1000).toISOString(),
      offerDeliveryDeadlineAt: new Date(T0 + OFFER_PENDING_WINDOW_SECONDS * 1000).toISOString(),
    })
  );
  assert.deepEqual(decision, { action: "activate" });
});

test("OFFER_SHOWN sobre una oferta no entregada a tiempo se rechaza", () => {
  const decision = decideOfferAck(
    baseContext({
      offerStatus: "pending_delivery",
      offerDeliveryDeadlineAt: new Date(T0 - 1_000).toISOString(),
      now: new Date(T0),
    })
  );
  assert.equal(decision.action, "rejected");
});

test("OFFER_SHOWN sobre una oferta activa vencida se rechaza", () => {
  const decision = decideOfferAck(
    baseContext({
      offerStatus: "active",
      deliveryOfertaExpiresAt: new Date(T0 - 1).toISOString(),
    })
  );
  assert.equal(decision.action, "rejected");
});

test("OFFER_SHOWN de otro repartidor u orden ya asignada se rechaza", () => {
  assert.equal(
    decideOfferAck(baseContext({ driverId: "driver-b", offerStatus: "pending_delivery" })).action,
    "rejected"
  );
  assert.equal(
    decideOfferAck(baseContext({ repartidorAsignadoRef: "driver-a", offerStatus: "active" })).action,
    "rejected"
  );
  assert.equal(
    decideOfferAck(baseContext({ dispatchStatus: "waiting_for_driver", offerStatus: "pending_delivery" })).action,
    "rejected"
  );
});

test("TEST 4-5: aceptar dentro de la ventana es válido", () => {
  const ok = decideOfferAcceptance(
    baseContext({
      offerStatus: "active",
      deliveryOfertaExpiresAt: new Date(T0 + 9_000).toISOString(),
    })
  );
  assert.deepEqual(ok, { ok: true, alreadyAssigned: false });

  const justInTime = decideOfferAcceptance(
    baseContext({
      offerStatus: "active",
      deliveryOfertaExpiresAt: new Date(T0 + 1).toISOString(),
    })
  );
  assert.equal(justInTime.ok, true);
});

test("TEST 6: aceptar después de expiresAt es rechazado por el backend", () => {
  const decision = decideOfferAcceptance(
    baseContext({
      offerStatus: "active",
      deliveryOfertaExpiresAt: new Date(T0 - 1_000).toISOString(),
    })
  );
  assert.equal(decision.ok, false);
  assert.match(decision.error, /expir/i);
});

test("TEST 11-12: EXPIRED/CANCELLED nunca se aceptan; el mismo repartidor es idempotente", () => {
  assert.equal(
    decideOfferAcceptance(baseContext({ offerStatus: "expired" })).ok,
    false
  );
  assert.equal(
    decideOfferAcceptance(baseContext({ offerStatus: "cancelled" })).ok,
    false
  );
  assert.deepEqual(
    decideOfferAcceptance(baseContext({ repartidorAsignadoRef: "driver-a" })),
    { ok: true, alreadyAssigned: true }
  );
  assert.equal(
    decideOfferAcceptance(baseContext({ repartidorAsignadoRef: "driver-b" })).ok,
    false
  );
});

test("aceptar una oferta pending es válido (respuesta antes del ACK)", () => {
  const decision = decideOfferAcceptance(baseContext({ offerStatus: "pending_delivery" }));
  assert.deepEqual(decision, { ok: true, alreadyAssigned: false });
});

test("TEST 12: cancelar mientras está ACTIVE la invalida para ACK y aceptación", () => {
  const cancelContext = baseContext({
    offerStatus: "cancelled",
    deliveryOfertaExpiresAt: new Date(T0 + 9_000).toISOString(),
  });
  assert.equal(decideOfferAck(cancelContext).action, "rejected");
  assert.equal(decideOfferAcceptance(cancelContext).ok, false);
});

test("motivo terminal mapea a estado de oferta", () => {
  assert.equal(terminalStatusForReason("offer_cancelled"), "cancelled");
  assert.equal(terminalStatusForReason("driver_rejected_offer"), "rejected");
  assert.equal(terminalStatusForReason("offer_expired"), "expired");
});

test("TEST 7-9: solo los motivos de oferta marcan estado terminal", () => {
  assert.equal(offerTerminalStatusForReleaseReason("offer_expired"), "expired");
  assert.equal(offerTerminalStatusForReleaseReason("offer_expired_orphan"), "expired");
  assert.equal(offerTerminalStatusForReleaseReason("driver_rejected_offer"), "rejected");
  assert.equal(offerTerminalStatusForReleaseReason("offer_cancelled"), "cancelled");
  assert.equal(offerTerminalStatusForReleaseReason("driver_fin"), "cancelled");
  // Vuelta a la cola sin resultado de oferta → sin estado terminal.
  assert.equal(offerTerminalStatusForReleaseReason("no_drivers_available"), null);
  assert.equal(offerTerminalStatusForReleaseReason("redispatch"), null);
  assert.equal(offerTerminalStatusForReleaseReason("dispatch_mode_manual"), null);
});
