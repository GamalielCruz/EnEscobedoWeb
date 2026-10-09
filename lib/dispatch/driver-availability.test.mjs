import assert from "node:assert/strict";
import test from "node:test";
import {
  canEndSession,
  deriveTripStatus,
  isEligibleForNewOffers,
  isSessionValid,
  nextStateAfterDelivery,
} from "./driver-availability.ts";

const T0 = Date.parse("2026-09-19T12:00:00.000Z");

// ── deriveTripStatus ───────────────────────────────────────────────

test("sin orden y sin oferta → idle", () => {
  assert.equal(deriveTripStatus([], false), "idle");
});

test("sin orden y con oferta vigente → offering", () => {
  assert.equal(deriveTripStatus([], true), "offering");
});

test("mandado: assigned → en_route_to_pickup", () => {
  assert.equal(
    deriveTripStatus([{ serviceKind: "mandado", dispatchStatus: "accepted", mandadoState: "assigned" }], false),
    "en_route_to_pickup"
  );
});

test("mandado: pickup_arrival → at_pickup", () => {
  assert.equal(
    deriveTripStatus([{ serviceKind: "mandado", dispatchStatus: "accepted", mandadoState: "pickup_arrival" }], false),
    "at_pickup"
  );
});

test("mandado: en_route → delivery", () => {
  assert.equal(
    deriveTripStatus([{ serviceKind: "mandado", dispatchStatus: "accepted", mandadoState: "en_route" }], false),
    "delivery"
  );
});

test("mandado: destination_arrival → at_delivery", () => {
  assert.equal(
    deriveTripStatus([{ serviceKind: "mandado", dispatchStatus: "at_door", mandadoState: "destination_arrival" }], false),
    "at_delivery"
  );
});

test("mandado: delivered → completed", () => {
  assert.equal(
    deriveTripStatus([{ serviceKind: "mandado", dispatchStatus: "completed", mandadoState: "delivered" }], false),
    "completed"
  );
});

test("restaurante: accepted → en_route_to_pickup y at_door → at_delivery", () => {
  assert.equal(
    deriveTripStatus([{ serviceKind: "restaurant", dispatchStatus: "accepted" }], false),
    "en_route_to_pickup"
  );
  assert.equal(
    deriveTripStatus([{ serviceKind: "restaurant", dispatchStatus: "at_door" }], false),
    "at_delivery"
  );
});

test("una orden activa manda sobre una oferta (defensiva)", () => {
  assert.equal(
    deriveTripStatus([{ serviceKind: "restaurant", dispatchStatus: "accepted" }], true),
    "en_route_to_pickup"
  );
});

// ── canEndSession: la regla fundamental ───────────────────────────

test("con servicio activo NO se puede terminar la sesión", () => {
  for (const trip of ["en_route_to_pickup", "at_pickup", "delivery", "at_delivery"]) {
    const decision = canEndSession(trip);
    assert.equal(decision.ok, false, `trip=${trip} debe bloquear la desconexión`);
    assert.ok(decision.reason);
  }
});

test("idle y offering SÍ permiten terminar la sesión", () => {
  assert.equal(canEndSession("idle").ok, true);
  assert.equal(canEndSession("offering").ok, true);
});

// ── isSessionValid ────────────────────────────────────────────────

test("sesión abierta (sin disponibleHasta) con disponible=true es válida", () => {
  assert.equal(
    isSessionValid({ disponible: true, disponibleHasta: null }, new Date(T0)),
    true
  );
});

test("sesión vencida no es válida", () => {
  assert.equal(
    isSessionValid(
      { disponible: true, disponibleHasta: new Date(T0 - 1000).toISOString() },
      new Date(T0)
    ),
    false
  );
});

test("sesión con disponible=false no es válida aunque la fecha no haya pasado", () => {
  assert.equal(
    isSessionValid(
      { disponible: false, disponibleHasta: new Date(T0 + 60_000).toISOString() },
      new Date(T0)
    ),
    false
  );
});

// ── isEligibleForNewOffers: ambos ejes cuentan ────────────────────

const eligibleDriver = {
  disponible: true,
  estadoDisponibilidad: "available",
  disponibleHasta: new Date(T0 + 60 * 60 * 1000).toISOString(),
  bloqueado: false,
  motivoDesconexion: null,
  aceptaNuevasOfertas: true,
};

test("disponible + idle + intención + sesión vigente → elegible", () => {
  assert.equal(
    isEligibleForNewOffers({ driver: eligibleDriver, tripStatus: "idle", now: new Date(T0) }),
    true
  );
});

test("un repartidor con orden activa NO es elegible aunque esté disponible", () => {
  assert.equal(
    isEligibleForNewOffers({ driver: eligibleDriver, tripStatus: "en_route_to_pickup", now: new Date(T0) }),
    false
  );
});

test("un repartidor que dejó de recibir pedidos NO es elegible", () => {
  assert.equal(
    isEligibleForNewOffers(
      { driver: { ...eligibleDriver, aceptaNuevasOfertas: false }, tripStatus: "idle", now: new Date(T0) }
    ),
    false
  );
});

test("sesión vencida NO es elegible", () => {
  assert.equal(
    isEligibleForNewOffers(
      { driver: { ...eligibleDriver, disponibleHasta: new Date(T0 - 1000).toISOString() }, tripStatus: "idle", now: new Date(T0) }
    ),
    false
  );
});

test("pausado o bloqueado NO es elegible", () => {
  assert.equal(
    isEligibleForNewOffers(
      { driver: { ...eligibleDriver, motivoDesconexion: "admin_paused" }, tripStatus: "idle", now: new Date(T0) }
    ),
    false
  );
  assert.equal(
    isEligibleForNewOffers(
      { driver: { ...eligibleDriver, bloqueado: true }, tripStatus: "idle", now: new Date(T0) }
    ),
    false
  );
});

test("campo ausente (drivers existentes) se trata como intención positiva", () => {
  assert.equal(
    isEligibleForNewOffers(
      { driver: { ...eligibleDriver, aceptaNuevasOfertas: undefined }, tripStatus: "idle", now: new Date(T0) }
    ),
    true
  );
});

// ── nextStateAfterDelivery ────────────────────────────────────────

test("sin intención de más pedidos → OFFLINE al completar (aunque la sesión siga vigente)", () => {
  assert.equal(
    nextStateAfterDelivery({ hasRemainingOrders: false, aceptaNuevasOfertas: false, sessionValid: true }),
    "offline"
  );
});

test("con intención y sesión vigente → AVAILABLE", () => {
  assert.equal(
    nextStateAfterDelivery({ hasRemainingOrders: false, aceptaNuevasOfertas: true, sessionValid: true }),
    "available"
  );
});

test("con intención y sesión vencida → OFFLINE (la sesión nunca se extiende sola)", () => {
  assert.equal(
    nextStateAfterDelivery({ hasRemainingOrders: false, aceptaNuevasOfertas: true, sessionValid: false }),
    "offline"
  );
});

test("con órdenes restantes → busy (multi-orden futuro)", () => {
  assert.equal(
    nextStateAfterDelivery({ hasRemainingOrders: true, aceptaNuevasOfertas: false, sessionValid: false }),
    "busy"
  );
});
