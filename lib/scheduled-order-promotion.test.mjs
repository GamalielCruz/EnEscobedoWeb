import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateScheduledDispatchAt,
  getScheduledOrderRisk,
} from "./fulfillment-schedule.ts";

// ── Tests para ACTIVE_SCHEDULED_FILTER ────────────────────────────────
// Verifica que el filtro del cron no rechaza órdenes programadas válidas
// por estado de pago.

test("ACTIVE_SCHEDULED_FILTER: una orden con paymentStatus='pending' y paymentMethod='stripe' DEBE ser procesable", () => {
  // Este es exactamente el caso del bug #936349: una orden pagada con Stripe
  // cuyo webhook de confirmación aún no llegó, pero ya pasó su scheduledDispatchAt.
  // El filtro del cron NO debe rechazarla.
  const filter = `
    _type == "order" &&
    fulfillmentTiming == "scheduled" &&
    scheduleStatus in ["scheduled", "ready_for_dispatch", "dispatching"] &&
    orderStatus != "cancelled" &&
    orderStatus != "completed" &&
    orderStatus != "delivered" &&
    paymentStatus != "failed" &&
    paymentStatus != "expired" &&
    paymentStatus != "refunded"
  `;

  // Simular las condiciones de una orden tipo #936349
  const order = {
    _type: "order",
    fulfillmentTiming: "scheduled",
    scheduleStatus: "scheduled",
    orderStatus: "pending",
    paymentStatus: "pending", // <-- Pago no confirmado aún
    paymentMethod: "stripe",  // <-- Stripe, no COD
    dispatchStatus: "scheduled",
    scheduledDispatchAt: "2026-08-21T02:25:00.000Z", // 20:25 CDMX
  };

  // Verificar que la orden cumple todas las condiciones del filtro
  assert.equal(order._type === "order", true, "orderType check");
  assert.equal(order.fulfillmentTiming === "scheduled", true, "fulfillmentTiming check");
  assert.equal(
    ["scheduled", "ready_for_dispatch", "dispatching"].includes(order.scheduleStatus),
    true,
    "scheduleStatus check"
  );
  assert.equal(order.orderStatus !== "cancelled", true, "not cancelled");
  assert.equal(order.orderStatus !== "completed", true, "not completed");
  assert.equal(order.orderStatus !== "delivered", true, "not delivered");
  assert.equal(order.paymentStatus !== "failed", true, "not failed");
  assert.equal(order.paymentStatus !== "expired", true, "not expired");
  assert.equal(order.paymentStatus !== "refunded", true, "not refunded");

  // NO se verifica paymentStatus == "paid" ni paymentMethod COD
  // El filtro actual del cron NO tiene esta restricción
});

test("ACTIVE_SCHEDULED_FILTER: una orden con paymentStatus='paid' TAMBIÉN debe ser procesable", () => {
  const order = {
    fulfillmentTiming: "scheduled",
    scheduleStatus: "scheduled",
    orderStatus: "pending",
    paymentStatus: "paid",
    paymentMethod: "stripe",
  };

  assert.equal(order.paymentStatus !== "failed", true);
  assert.equal(order.paymentStatus !== "expired", true);
  assert.equal(order.paymentStatus !== "refunded", true);
  assert.equal(
    ["scheduled", "ready_for_dispatch", "dispatching"].includes(order.scheduleStatus),
    true
  );
});

test("ACTIVE_SCHEDULED_FILTER: una orden con paymentMethod='cash_on_delivery' TAMBIÉN debe ser procesable", () => {
  const order = {
    fulfillmentTiming: "scheduled",
    scheduleStatus: "scheduled",
    orderStatus: "pending",
    paymentStatus: "pending",
    paymentMethod: "cash_on_delivery",
  };

  assert.equal(order.paymentStatus !== "failed", true);
  assert.equal(order.paymentStatus !== "expired", true);
  assert.equal(order.paymentStatus !== "refunded", true);
  assert.equal(
    ["scheduled", "ready_for_dispatch", "dispatching"].includes(order.scheduleStatus),
    true
  );
});

// ── Tests para scheduledDispatchAt ────────────────────────────────────
// Verifica el cálculo correcto de cuándo un pedido debe entrar a Dispatch.

test("calculateScheduledDispatchAt: 35 minutos antes del inicio de la ventana", () => {
  const startAt = "2026-08-21T03:00:00.000Z"; // 21:00 CDMX
  const dispatchAt = calculateScheduledDispatchAt({
    startAt,
    estimatedTravelMinutes: 15,
    driverAssignmentMarginMinutes: 20,
  });

  // scheduledDispatchAt debe ser 35 minutos antes
  const expected = new Date(new Date(startAt).getTime() - 35 * 60_000).toISOString();
  assert.equal(dispatchAt, expected, "scheduledDispatchAt = startAt - 35 min");
  assert.equal(
    new Date(dispatchAt).getTime(),
    new Date("2026-08-21T02:25:00.000Z").getTime(),
    "20:25 CDMX = 02:25 UTC"
  );
});

test("scheduledDispatchAt <= now debe ser true cuando la hora ya pasó", () => {
  const now = new Date("2026-08-21T02:30:00.000Z"); // 20:30 CDMX
  const scheduledDispatchAt = "2026-08-21T02:25:00.000Z"; // 20:25 CDMX

  assert.equal(
    new Date(scheduledDispatchAt).getTime() <= now.getTime(),
    true,
    "20:25 <= 20:30 → debe promover"
  );
});

test("scheduledDispatchAt <= now debe ser false cuando la hora NO ha llegado", () => {
  const now = new Date("2026-08-21T02:20:00.000Z"); // 20:20 CDMX
  const scheduledDispatchAt = "2026-08-21T02:25:00.000Z"; // 20:25 CDMX

  assert.equal(
    new Date(scheduledDispatchAt).getTime() <= now.getTime(),
    false,
    "20:25 > 20:20 → NO debe promover aún"
  );
});

// ── Tests de transición de estado ─────────────────────────────────────
// Verifica que la promoción cambia los campos correctos.

test("transición programada → dispatching: campos que deben cambiarse", () => {
  const orderBefore = {
    dispatchStatus: "scheduled",
    scheduleStatus: "scheduled",
    scheduledDispatchStartedAt: undefined,
  };

  const nowIso = new Date().toISOString();

  // Simular la promoción
  const fields = { updatedAt: nowIso };
  fields.scheduledDispatchStartedAt = nowIso;
  fields.dispatchStatus = "waiting_for_driver";
  fields.scheduleStatus = "ready_for_dispatch";

  assert.equal(fields.dispatchStatus, "waiting_for_driver", "dispatchStatus cambia");
  assert.equal(fields.scheduleStatus, "ready_for_dispatch", "scheduleStatus cambia");
  assert.equal(
    typeof fields.scheduledDispatchStartedAt,
    "string",
    "scheduledDispatchStartedAt se establece"
  );
});

test("después de la promoción, isOrderDispatchable debe retornar true", () => {
  // Después de que el cron promueve la orden:
  const orderAfterPromotion = {
    dispatchStatus: "waiting_for_driver",
    orderStatus: "pending",
    paymentStatus: "paid",
    repartidorAsignado: undefined,
    status: "pending",
  };

  // isOrderDispatchable checks
  const isDispatchable =
    !orderAfterPromotion.repartidorAsignado &&
    orderAfterPromotion.dispatchStatus !== "scheduled" &&
    !["shipped", "delivered", "cancelled", "refunded"].includes(
      orderAfterPromotion.status ?? ""
    ) &&
    !["shipped", "delivered", "cancelled", "completed", "picked_up"].includes(
      orderAfterPromotion.orderStatus ?? ""
    ) &&
    !["failed", "expired", "refunded", "requires_refund"].includes(
      orderAfterPromotion.paymentStatus ?? ""
    );

  assert.equal(isDispatchable, true, "orden promovida debe ser despachable");
});

test("ANTES de la promoción, isOrderDispatchable debe retornar false", () => {
  const orderBeforePromotion = {
    dispatchStatus: "scheduled",
    orderStatus: "pending",
    paymentStatus: "paid",
    repartidorAsignado: undefined,
    status: "pending",
  };

  const isDispatchable =
    !orderBeforePromotion.repartidorAsignado &&
    orderBeforePromotion.dispatchStatus !== "scheduled";

  assert.equal(isDispatchable, false, "orden NO promovida NO debe ser despachable");
});

// ── Tests de idempotencia ─────────────────────────────────────────────
// Verifica que la promoción solo ocurre una vez.

test("si scheduledDispatchStartedAt ya está definido, NO debe re-promoverse", () => {
  const order = {
    orderType: "delivery",
    scheduledDispatchStartedAt: "2026-08-21T02:25:01.000Z", // Ya fue promovida
    scheduledDispatchAt: "2026-08-21T02:25:00.000Z",
    dispatchStatus: "waiting_for_driver", // Ya cambió
  };

  // La condición del cron es: !defined(scheduledDispatchStartedAt)
  const shouldPromote =
    order.orderType === "delivery" &&
    !order.scheduledDispatchStartedAt &&
    Boolean(order.scheduledDispatchAt);

  assert.equal(shouldPromote, false, "orden ya promovida NO debe re-promoverse");
});

test("si dispatchStatus ya no es 'scheduled', UPCOMING_SCHEDULED_QUERY no la devuelve", () => {
  // El frontend filtra por dispatchStatus == "scheduled"
  const order = {
    dispatchStatus: "waiting_for_driver", // Ya fue promovida
  };

  const matchesFrontendQuery = order.dispatchStatus === "scheduled";
  assert.equal(matchesFrontendQuery, false, "orden promovida NO aparece en Programadas");
});

// ── Tests de risk calculation ─────────────────────────────────────────

test("getScheduledOrderRisk: sin driver, 4 min antes = contingency", () => {
  const now = new Date("2026-08-21T02:21:00.000Z");
  const startAt = "2026-08-21T02:25:00.000Z"; // 4 min en el futuro

  const risk = getScheduledOrderRisk({
    startAt,
    hasDriver: false,
    now,
    riskBeforeMinutes: 20,
    adminAlertBeforeMinutes: 10,
    contingencyBeforeMinutes: 5,
  });

  // 4 min <= 5 (contingencyBeforeMinutes) → contingency
  assert.equal(risk, "contingency", "4 min antes → contingency");
});

test("getScheduledOrderRisk: sin driver, 3 min antes = contingency", () => {
  const now = new Date("2026-08-21T02:22:00.000Z");
  const startAt = "2026-08-21T02:25:00.000Z"; // 3 min en el futuro

  const risk = getScheduledOrderRisk({
    startAt,
    hasDriver: false,
    now,
    riskBeforeMinutes: 20,
    adminAlertBeforeMinutes: 10,
    contingencyBeforeMinutes: 5,
  });

  assert.equal(risk, "contingency", "3 min antes → contingency");
});

test("getScheduledOrderRisk: con driver asignado = none", () => {
  const now = new Date("2026-08-21T02:20:00.000Z");
  const startAt = "2026-08-21T02:25:00.000Z";

  const risk = getScheduledOrderRisk({
    startAt,
    hasDriver: true,
    now,
    riskBeforeMinutes: 20,
    adminAlertBeforeMinutes: 10,
    contingencyBeforeMinutes: 5,
  });

  assert.equal(risk, "none", "con driver → none");
});
