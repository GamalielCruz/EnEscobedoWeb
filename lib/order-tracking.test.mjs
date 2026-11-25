import assert from "node:assert/strict";
import test from "node:test";

import {
  canCustomerCancel,
  customerPhaseHint,
  customerPhaseLabel,
  deriveCustomerPhase,
  prolongedSearchCopy,
  trackingAnnouncement,
} from "./order-tracking.ts";

test("orden de delivery sin repartidor → searching", () => {
  assert.equal(
    deriveCustomerPhase({ orderType: "delivery", dispatchStatus: "waiting_for_driver" }),
    "searching",
  );
  assert.equal(
    deriveCustomerPhase({ orderType: "delivery", dispatchStatus: "offered" }),
    "searching",
  );
});

test("pago pendiente de una orden delivery → searching (no estado técnico)", () => {
  assert.equal(deriveCustomerPhase({ orderType: "delivery", orderStatus: "pending" }), "searching");
});

test("oferta activa con repartidor asignado → accepted", () => {
  assert.equal(
    deriveCustomerPhase({ orderType: "delivery", dispatchStatus: "accepted", hasAssignedDriver: true }),
    "accepted",
  );
});

test("shipped (repartidor con orden) → accepted", () => {
  assert.equal(
    deriveCustomerPhase({ orderType: "delivery", orderStatus: "shipped", hasAssignedDriver: true }),
    "accepted",
  );
});

test("mandado con recolección confirmada → pickup_arrival y en_route según banderas", () => {
  const base = { serviceKind: "mandado", orderType: "delivery", dispatchStatus: "accepted" };
  assert.equal(deriveCustomerPhase({ ...base, mandadoPickupAtDoor: true, mandadoEnRuta: false }), "pickup_arrival");
  assert.equal(deriveCustomerPhase({ ...base, mandadoPickupAtDoor: true, mandadoEnRuta: true }), "en_route");
  // en_route sin recolección es estado inválido en el driver: no se deriva aquí.
  assert.equal(deriveCustomerPhase({ ...base, mandadoEnRuta: true }), "accepted");
});

test("pickup / click&collect nunca busca repartidor → accepted", () => {
  assert.equal(
    deriveCustomerPhase({ orderType: "pickup", dispatchStatus: "not_required", orderStatus: "pending" }),
    "accepted",
  );
});

test("estados terminales: cancelled y delivered", () => {
  assert.equal(deriveCustomerPhase({ orderStatus: "cancelled" }), "cancelled");
  assert.equal(deriveCustomerPhase({ orderStatus: "delivered" }), "delivered");
  assert.equal(deriveCustomerPhase({ orderStatus: "picked_up" }), "delivered");
});

test("labels y hints son humanos, sin unidades de tiempo", () => {
  const labels = ["searching", "accepted", "pickup_arrival", "en_route", "delivered", "cancelled"].map(
    (phase) => customerPhaseLabel(phase),
  );
  for (const label of labels) {
    assert.ok(label.length > 0);
    assert.ok(!/segundos?|minutos?|tiempo restante|restante/i.test(label), `label con tiempo: ${label}`);
  }
  assert.equal(customerPhaseLabel("searching"), "Buscando repartidor");
  assert.match(customerPhaseHint("searching"), /acepte/);
});

test("cancelación: permitida buscando/asignado; bloqueada en ruta y terminales", () => {
  assert.equal(canCustomerCancel({ phase: "searching" }), true);
  assert.equal(canCustomerCancel({ phase: "accepted" }), true);
  assert.equal(canCustomerCancel({ phase: "pickup_arrival" }), false);
  assert.equal(canCustomerCancel({ phase: "en_route" }), false);
  assert.equal(canCustomerCancel({ phase: "cancelled" }), false);
  assert.equal(canCustomerCancel({ phase: "delivered" }), false);
  assert.equal(canCustomerCancel({ phase: "searching", orderStatus: "cancelled" }), false);
});

test("aviso de búsqueda prolongada solo en searching, sin números", () => {
  assert.equal(prolongedSearchCopy({ phase: "accepted" }), null);
  const long = prolongedSearchCopy({ phase: "searching" });
  assert.ok(long);
  assert.ok(!/\d+\s*(s|seg|min)/i.test(`${long.message} ${long.hint}`));
  const none = prolongedSearchCopy({ phase: "searching", noDrivers: true });
  assert.match(none.message, /no hay repartidores/i);
});

test("anuncio accesible = label semántico", () => {
  assert.equal(trackingAnnouncement("searching"), "Buscando repartidor");
});
