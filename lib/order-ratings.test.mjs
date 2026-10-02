import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRatingDocumentId,
  counterpartRole,
  isOrderRateable,
  isSeriousIncident,
  ratingSubmitLabel,
  reasonsFor,
  sanitizeReasons,
  validateRatingSubmission,
} from "./order-ratings.ts";

test("Los 5 niveles tienen intro (cliente y repartidor)", () => {
  for (const level of [1, 2, 3, 4, 5]) {
    assert.ok(validateRatingSubmission({ role: "customer", rating: level }).ok);
    assert.ok(validateRatingSubmission({ role: "driver", rating: level }).ok);
  }
});

test("El nivel 5 no ofrece motivos; 4/3/2/1 sí", () => {
  assert.equal(reasonsFor("customer", 5).length, 0);
  assert.equal(reasonsFor("driver", 5).length, 0);
  for (const level of [1, 2, 3, 4]) {
    assert.ok(reasonsFor("customer", level).length > 0);
    assert.ok(reasonsFor("driver", level).length > 0);
  }
});

test("Cada rol recibe su PROPIO catálogo (sin mezclar motivos)", () => {
  const customerCodes = new Set(reasonsFor("customer", 3).map((r) => r.code));
  const driverCodes = new Set(reasonsFor("driver", 3).map((r) => r.code));
  // El motivo más característico de cada lado no existe en el otro.
  assert.ok(customerCodes.has("delivery_difficulty"));
  assert.ok(!driverCodes.has("delivery_difficulty"));
  assert.ok(driverCodes.has("hard_to_locate"));
  assert.ok(!customerCodes.has("hard_to_locate"));
});

test("Al bajar de nivel se descartan motivos incompatibles", () => {
  // "late" pertenece al nivel 3 del cliente; "late_minor" al 4.
  const codes = ["late", "late_minor", "other"];
  assert.deepEqual(sanitizeReasons("customer", 3, codes), ["late", "other"]);
  assert.deepEqual(sanitizeReasons("customer", 4, codes), ["late_minor", "other"]);
  // Al volver a 5 se limpia todo.
  assert.deepEqual(sanitizeReasons("customer", 5, codes), []);
});

test("Motivos duplicados o de otro rol se descartan", () => {
  assert.deepEqual(sanitizeReasons("customer", 3, ["late", "late", "hard_to_locate"]), ["late"]);
});

test("Incidente grave: solo en ciertos motivos y genera reporte", () => {
  assert.equal(isSeriousIncident("customer", 1, ["not_delivered"]), true);
  assert.equal(isSeriousIncident("customer", 1, ["other"]), false);
  assert.equal(isSeriousIncident("customer", 2, ["inappropriate_conduct"]), true);
  assert.equal(isSeriousIncident("customer", 2, ["unkind"]), false);
  assert.equal(isSeriousIncident("driver", 1, ["threats"]), true);
  assert.equal(isSeriousIncident("driver", 3, ["slow_response"]), false);
});

test("El botón cambia de texto con incidente grave", () => {
  assert.equal(ratingSubmitLabel(false), "Enviar evaluación");
  assert.equal(ratingSubmitLabel(true), "Enviar evaluación y reporte");
});

test("validateRatingSubmission normaliza y deriva el incidente (nunca confía del cliente)", () => {
  const result = validateRatingSubmission({
    role: "customer",
    rating: 1,
    reasons: ["not_delivered", "late", "other"], // "late" no pertenece al nivel 1
    comment: "  El pedido   nunca llegó  ",
    incidentDescription: "Esperé una hora y nadie llegó.",
    requestContact: true,
  });
  assert.ok(result.ok);
  assert.deepEqual(result.value.reasons, ["not_delivered", "other"]);
  assert.equal(result.value.comment, "El pedido nunca llegó");
  assert.equal(result.value.hasSeriousIncident, true);
  assert.equal(result.value.reportRequested, true);
  assert.equal(result.value.requestContact, true);

  // Con un comentario no grave, la descripción ampliada se descarta.
  const mild = validateRatingSubmission({
    role: "driver",
    rating: 3,
    reasons: ["slow_response"],
    incidentDescription: "texto que no aplica",
    requestContact: true,
  });
  assert.ok(mild.ok);
  assert.equal(mild.value.incidentDescription, null);
  assert.equal(mild.value.requestContact, false);
  assert.equal(mild.value.reportRequested, false);
});

test("Calificaciones inválidas se rechazan", () => {
  for (const bad of [0, 6, 2.5, "x", null, undefined, NaN]) {
    const result = validateRatingSubmission({ role: "customer", rating: bad });
    assert.equal(result.ok, false);
  }
});

test("El comentario se recorta al máximo permitido", () => {
  const result = validateRatingSubmission({
    role: "customer",
    rating: 5,
    comment: "a".repeat(5000),
  });
  assert.ok(result.ok);
  assert.equal(result.value.comment.length, 1000);
});

test("Id determinista por (orden, rol) e independencia de direcciones", () => {
  assert.equal(buildRatingDocumentId("order-1", "customer"), "orderRating-order-1-customer");
  assert.equal(buildRatingDocumentId("order-1", "driver"), "orderRating-order-1-driver");
  // Misma orden, distinto rol → ids distintos (almacenamiento independiente).
  assert.notEqual(
    buildRatingDocumentId("order-1", "customer"),
    buildRatingDocumentId("order-1", "driver")
  );
  assert.equal(counterpartRole("customer"), "driver");
  assert.equal(counterpartRole("driver"), "customer");
});

test("Solo órdenes entregadas y no canceladas son evaluables", () => {
  assert.equal(isOrderRateable({ deliveredAt: "2026-10-01T00:00:00.000Z" }), true);
  assert.equal(isOrderRateable({ orderStatus: "delivered" }), true);
  assert.equal(isOrderRateable({ orderStatus: "completed" }), true);
  assert.equal(isOrderRateable({}), false);
  assert.equal(isOrderRateable({ orderStatus: "cancelled", deliveredAt: "2026-10-01T00:00:00.000Z" }), false);
  assert.equal(isOrderRateable({ deliveredAt: "2026-10-01T00:00:00.000Z", cancelledAt: "2026-10-01T00:00:00.000Z" }), false);
});
