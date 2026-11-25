import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_RATING,
  RATING_INTRO,
  RATING_WINDOW_HOURS,
  RATING_WINDOW_SIZE,
  RATING_LEVELS,
  RATING_PROMPT,
  RATING_REPORT_OPTION_LABEL,
  buildRatingDocumentId,
  counterpartRole,
  isOrderRateable,
  isRatingWindowOpen,
  isSeriousIncident,
  ratingHasReasons,
  ratingSubmitLabel,
  reputationWindowLabel,
  reasonsFor,
  sanitizeReasons,
  summarizeRatings,
  summarizeReputation,
  validateRatingSubmission,
} from "./order-ratings.ts";

test("Solo existen 3 niveles y el 3 viene preseleccionado", () => {
  assert.deepEqual(RATING_LEVELS, [1, 2, 3]);
  assert.equal(DEFAULT_RATING, 3);
  for (const level of [1, 2, 3]) {
    assert.ok(validateRatingSubmission({ role: "customer", rating: level }).ok);
    assert.ok(validateRatingSubmission({ role: "driver", rating: level }).ok);
  }
});

test("El 3★ no ofrece motivos; el 2★ y el 1★ sí", () => {
  assert.equal(ratingHasReasons(3), false);
  assert.equal(ratingHasReasons(2), true);
  assert.equal(ratingHasReasons(1), true);
  assert.equal(reasonsFor("customer", 3).length, 0);
  assert.equal(reasonsFor("driver", 3).length, 0);
  assert.ok(reasonsFor("customer", 2).length > 0);
  assert.ok(reasonsFor("customer", 1).length > 0);
  assert.ok(reasonsFor("driver", 2).length > 0);
  assert.ok(reasonsFor("driver", 1).length > 0);
});

test("Los motivos del cliente son exactamente los solicitados", () => {
  assert.deepEqual(
    reasonsFor("customer", 2).map((r) => r.label),
    [
      "La entrega tardó más de lo esperado.",
      "Hubo poca comunicación.",
      "El trato pudo ser mejor.",
      "No se siguieron mis instrucciones.",
      "El pedido llegó en malas condiciones.",
      "Otro motivo.",
    ]
  );
  assert.deepEqual(
    reasonsFor("customer", 1).map((r) => r.label),
    [
      "Mi pedido no fue entregado.",
      "Hubo un problema importante con la entrega.",
      "El repartidor tuvo una actitud irrespetuosa.",
      "El pedido llegó dañado o manipulado incorrectamente.",
      "No se respetaron mis instrucciones.",
      "Tuve un problema de seguridad.",
      "Otro motivo.",
    ]
  );
});

test("Los motivos del repartidor son exactamente los solicitados", () => {
  assert.deepEqual(
    reasonsFor("driver", 2).map((r) => r.label),
    [
      "El cliente tardó en responder.",
      "La dirección necesitó aclaraciones.",
      "Las instrucciones no fueron claras.",
      "El cliente no estuvo disponible al llegar.",
      "Hubo dificultades de comunicación.",
      "Otro motivo.",
    ]
  );
  assert.deepEqual(
    reasonsFor("driver", 1).map((r) => r.label),
    [
      "El cliente no respondió a mis llamadas o mensajes.",
      "La dirección era incorrecta.",
      "El cliente tuvo una conducta irrespetuosa.",
      "El cliente no estuvo disponible para recibir el pedido.",
      "Hubo una situación incómoda o conflictiva.",
      "Se presentó una situación que comprometió mi seguridad.",
      "Otro motivo.",
    ]
  );
});

test("Copy de la pregunta inicial e intro por rol/nivel", () => {
  assert.equal(RATING_PROMPT.customer, "¿Cómo fue tu experiencia?");
  assert.equal(RATING_PROMPT.driver, "¿Cómo fue tu experiencia con el cliente?");
  assert.equal(RATING_INTRO.customer[3], "¡Gracias! Nos alegra que todo haya salido bien.");
  assert.equal(RATING_INTRO.customer[2], "¿Qué podríamos mejorar?");
  assert.equal(
    RATING_INTRO.customer[1],
    "Lamentamos que tu experiencia no haya sido la esperada. ¿Qué ocurrió?"
  );
  assert.equal(RATING_INTRO.driver[3], "¡Excelente! Gracias por completar tu entrega.");
  assert.equal(RATING_INTRO.driver[2], "¿Hubo algún inconveniente durante la entrega?");
  assert.equal(
    RATING_INTRO.driver[1],
    "Lamentamos que esta entrega no haya salido como esperabas. ¿Qué ocurrió?"
  );
});

test("Cada rol recibe su PROPIO catálogo (sin mezclar motivos)", () => {
  const customerCodes = new Set(reasonsFor("customer", 1).map((r) => r.code));
  const driverCodes = new Set(reasonsFor("driver", 1).map((r) => r.code));
  assert.ok(customerCodes.has("not_delivered"));
  assert.ok(!driverCodes.has("not_delivered"));
  assert.ok(driverCodes.has("wrong_address"));
  assert.ok(!customerCodes.has("wrong_address"));
});

test("Al cambiar de nivel se descartan motivos incompatibles (y 3★ limpia todo)", () => {
  const codes = ["late", "not_delivered", "other"];
  assert.deepEqual(sanitizeReasons("customer", 2, codes), ["late", "other"]);
  assert.deepEqual(sanitizeReasons("customer", 1, codes), ["not_delivered", "other"]);
  // Volver a 3 estrellas limpia por completo los motivos.
  assert.deepEqual(sanitizeReasons("customer", 3, codes), []);
});

test("Motivos duplicados o de otro rol se descartan", () => {
  assert.deepEqual(sanitizeReasons("customer", 2, ["late", "late", "wrong_address"]), ["late"]);
});

test("Incidente grave: solo en ciertos motivos del 1★ y genera reporte", () => {
  assert.equal(isSeriousIncident("customer", 1, ["not_delivered"]), true);
  assert.equal(isSeriousIncident("customer", 1, ["safety_problem"]), true);
  assert.equal(isSeriousIncident("customer", 1, ["other"]), false);
  assert.equal(isSeriousIncident("customer", 1, ["serious_delivery_problem"]), false);
  assert.equal(isSeriousIncident("driver", 1, ["safety_compromised"]), true);
  assert.equal(isSeriousIncident("driver", 1, ["disrespectful_customer"]), true);
  assert.equal(isSeriousIncident("driver", 1, ["no_response"]), false);
  // El 2★ nunca habilita reporte.
  assert.equal(isSeriousIncident("customer", 2, ["late"]), false);
  assert.equal(isSeriousIncident("driver", 2, ["slow_response"]), false);
});

test("La opción secundaria de incidente grave existe para ambos roles", () => {
  assert.equal(RATING_REPORT_OPTION_LABEL.customer, "Solicitar ayuda de ElMenu");
  assert.equal(RATING_REPORT_OPTION_LABEL.driver, "Reportar a administración (privado)");
});

test("El botón dice Listo en 3★ y Enviar evaluación en 1★/2★", () => {
  assert.equal(ratingSubmitLabel(3), "Listo");
  assert.equal(ratingSubmitLabel(2), "Enviar evaluación");
  assert.equal(ratingSubmitLabel(1), "Enviar evaluación");
  assert.equal(ratingSubmitLabel(null), "Enviar evaluación");
});

test("Una evaluación de 3★ se guarda sin motivos ni comentario obligatorio", () => {
  const result = validateRatingSubmission({
    role: "customer",
    rating: 3,
    reasons: ["late"], // motivo de 2★: se descarta al ser 3★
  });
  assert.ok(result.ok);
  assert.equal(result.value.rating, 3);
  assert.deepEqual(result.value.reasons, []);
  assert.equal(result.value.comment, null);
  assert.equal(result.value.hasSeriousIncident, false);
  assert.equal(result.value.reportRequested, false);
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

  // Con un motivo no grave, la descripción ampliada se descarta.
  const mild = validateRatingSubmission({
    role: "driver",
    rating: 2,
    reasons: ["slow_response"],
    incidentDescription: "texto que no aplica",
    requestContact: true,
  });
  assert.ok(mild.ok);
  assert.equal(mild.value.incidentDescription, null);
  assert.equal(mild.value.requestContact, false);
  assert.equal(mild.value.reportRequested, false);
});

test("Calificaciones inválidas se rechazan (0, 4 y superiores)", () => {
  for (const bad of [0, 4, 5, 2.5, "x", null, undefined, NaN]) {
    const result = validateRatingSubmission({ role: "customer", rating: bad });
    assert.equal(result.ok, false);
  }
});

test("El comentario se recorta al máximo permitido", () => {
  const result = validateRatingSubmission({
    role: "customer",
    rating: 3,
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

test("La ventana de evaluación dura 72 horas desde la entrega", () => {
  assert.equal(RATING_WINDOW_HOURS, 72);
  const now = new Date("2026-10-04T12:00:00.000Z").getTime();
  const hoursAgo = (h) => new Date(now - h * 60 * 60 * 1000).toISOString();

  assert.equal(isRatingWindowOpen(hoursAgo(0), now), true);
  assert.equal(isRatingWindowOpen(hoursAgo(71), now), true);
  assert.equal(isRatingWindowOpen(hoursAgo(72), now), true);
  assert.equal(isRatingWindowOpen(hoursAgo(72.5), now), false);
  assert.equal(isRatingWindowOpen(hoursAgo(200), now), false);

  // Fail-closed: sin fecha válida no hay ventana.
  assert.equal(isRatingWindowOpen(null, now), false);
  assert.equal(isRatingWindowOpen(undefined, now), false);
  assert.equal(isRatingWindowOpen("no-es-fecha", now), false);
  // Reloj adelantado: una entrega "futura" cuenta como reciente.
  assert.equal(isRatingWindowOpen(hoursAgo(-2), now), true);
});

test("El resumen de evaluaciones promedia solo calificaciones válidas", () => {
  const empty = summarizeRatings([]);
  assert.equal(empty.average, null);
  assert.equal(empty.count, 0);
  assert.deepEqual(empty.distribution, { 1: 0, 2: 0, 3: 0 });

  const mixed = summarizeRatings([3, 3, 2]);
  assert.equal(mixed.count, 3);
  assert.equal(mixed.average, 2.7); // 8/3 = 2.666… → 2.7
  assert.deepEqual(mixed.distribution, { 1: 0, 2: 1, 3: 2 });

  // Acepta documentos {rating} y descarta valores fuera de 1-3.
  const docs = summarizeRatings([{ rating: 1 }, { rating: 3 }, { rating: 5 }, { rating: 0 }, { rating: null }, "x"]);
  assert.equal(docs.count, 2);
  assert.equal(docs.average, 2);
  assert.deepEqual(docs.distribution, { 1: 1, 2: 0, 3: 1 });
});

test("La reputación usa una ventana MÓVIL de las últimas 50 evaluaciones", () => {
  assert.equal(RATING_WINDOW_SIZE, 50);

  // Menos de 50: se promedian TODAS y el conteo refleja la realidad.
  const small = summarizeReputation([3, 2, 3, 3]);
  assert.equal(small.count, 4);
  assert.equal(small.windowSize, 50);
  assert.equal(small.average, 2.8); // 11/4

  // Exactamente 50: entran todas.
  const fifty = summarizeReputation(Array.from({ length: 50 }, () => 3));
  assert.equal(fifty.count, 50);
  assert.equal(fifty.average, 3);

  // 51+ evaluaciones (más recientes primero): la más antigua sale del cálculo.
  // Con 49×1★ + 1×2★ recientes y un 3★ antiguo (51ª), el promedio ventaneado
  // (51/50 = 1.02 → 1.0) demuestra que la más vieja NO cuenta (sin ventana
  // sería 54/51 = 1.058 → 1.1).
  const moving = summarizeReputation([...Array.from({ length: 49 }, () => 1), 2, 3]);
  assert.equal(moving.count, 50);
  assert.equal(moving.average, 1)

  // Sin evaluaciones válidas no se inventa un promedio.
  const empty = summarizeReputation([]);
  assert.equal(empty.average, null);
  assert.equal(empty.count, 0);

  // Acepta documentos {rating} y descarta valores inválidos sin ocupar ventana.
  const docs = summarizeReputation([{ rating: 1 }, { rating: 5 }, { rating: 2 }]);
  assert.equal(docs.count, 2);
  assert.equal(docs.average, 1.5);
});

test("El texto de la ventana refleja el número real de entregas (nunca inventa 50)", () => {
  assert.equal(reputationWindowLabel(0), "Aún no tienes evaluaciones");
  assert.equal(reputationWindowLabel(1), "Basado en tus últimas 1 entrega");
  assert.equal(reputationWindowLabel(12), "Basado en tus últimas 12 entregas");
  assert.equal(reputationWindowLabel(50), "Basado en tus últimas 50 entregas");
  // Nunca reporta más que el tamaño de la ventana.
  assert.equal(reputationWindowLabel(80), "Basado en tus últimas 50 entregas");
});

test("Solo órdenes entregadas y no canceladas son evaluables", () => {
  assert.equal(isOrderRateable({ deliveredAt: "2026-10-01T00:00:00.000Z" }), true);
  assert.equal(isOrderRateable({ orderStatus: "delivered" }), true);
  assert.equal(isOrderRateable({ orderStatus: "completed" }), true);
  assert.equal(isOrderRateable({}), false);
  assert.equal(isOrderRateable({ orderStatus: "cancelled", deliveredAt: "2026-10-01T00:00:00.000Z" }), false);
  assert.equal(isOrderRateable({ deliveredAt: "2026-10-01T00:00:00.000Z", cancelledAt: "2026-10-01T00:00:00.000Z" }), false);
});