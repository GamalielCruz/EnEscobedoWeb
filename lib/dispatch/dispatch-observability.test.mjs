import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDispatchObservabilitySnapshot,
  analyzeMandadoEventQuality,
  estimateWait,
  estimateNextAvailableDriver,
  toPublicEstimatedWait,
} from "./dispatch-observability.ts";

const config = {
  mode: "assisted",
  maxDistanceKm: 8,
  searchRadiusKm: 6,
  maxOrdersPerDriver: 3,
  maxWaitMinutesBeforeEscalate: 20,
  prioritizeMandados: false,
  prioritizeRestaurants: false,
  allowMultipleOrders: false,
  allowMixStores: false,
  allowMixMandados: false,
  allowMixRestaurantMandado: false,
};

const now = Date.parse("2026-08-18T12:00:00.000Z");
const future = new Date(now + 60 * 60 * 1000).toISOString();
const past = new Date(now - 60 * 60 * 1000).toISOString();
const stats = (p50, p75, p90 = p75, sampleSize = 30) => ({ sampleSize, p50, p75, p90 });
const history = (over = {}) => ({
  assignment_to_pickup_arrival: stats(3, 5),
  pickup_arrival_to_en_route: stats(3, 5),
  en_route_to_destination_arrival: stats(10, 15),
  destination_arrival_to_delivered: stats(2, 5),
  ...over,
});

const driver = (over = {}) => ({
  _id: "d1",
  activo: true,
  bloqueado: false,
  disponible: true,
  disponibleHasta: future,
  estadoDisponibilidad: "available",
  activeOrders: [],
  ...over,
});

const order = (over = {}) => ({
  _id: "o1",
  serviceKind: "mandado",
  orderType: "delivery",
  orderStatus: "shipped",
  status: "shipped",
  dispatchStatus: "accepted",
  mandadoEnRuta: false,
  repartidorAsignadoRef: "d1",
  orderEvents: [],
  ...over,
});

test("available vigente aporta un slot inmediato", () => {
  const snapshot = buildDispatchObservabilitySnapshot({ drivers: [driver()], orders: [], waitingMandadoOrders: [], config, now });
  assert.equal(snapshot.connectedDrivers, 1);
  assert.equal(snapshot.availableDrivers, 1);
  assert.equal(snapshot.immediateCapacity, 1);
  assert.equal(snapshot.capacityState, "HEALTHY");
});

test("busy o offer_pending no aportan capacidad", () => {
  const snapshot = buildDispatchObservabilitySnapshot({
    drivers: [
      driver({ _id: "busy", estadoDisponibilidad: "busy", activeOrders: [order({ _id: "active" })] }),
      driver({ _id: "offer", estadoDisponibilidad: "offer_pending", ofertaExpiraAt: future }),
    ],
    orders: [order({ _id: "active" })],
    waitingMandadoOrders: [],
    config,
    now,
  });
  assert.equal(snapshot.busyDrivers, 1);
  assert.equal(snapshot.offerPendingDrivers, 1);
  assert.equal(snapshot.immediateCapacity, 0);
});

test("sesión expirada ocupada termina el pedido pero no cuenta como conectada ni capaz", () => {
  const snapshot = buildDispatchObservabilitySnapshot({
    drivers: [driver({ disponibleHasta: past, estadoDisponibilidad: "busy", activeOrders: [order()] })],
    orders: [order()],
    waitingMandadoOrders: [],
    config,
    now,
  });
  assert.equal(snapshot.connectedDrivers, 0);
  assert.equal(snapshot.busyDrivers, 1);
  assert.equal(snapshot.immediateCapacity, 0);
});

test("eventos incompletos no generan percentiles falsos", () => {
  const report = analyzeMandadoEventQuality([order({ orderEvents: [{ type: "driver_assigned", at: future }] })]);
  assert.equal(report.ordersWithCompleteEvents, 0);
  assert.equal(report.durations.assignment_to_pickup_arrival.sampleSize, 0);
  assert.equal(report.sufficientSample, false);
  assert.ok(report.missingEvents.picked_up > 0);
});

test("eventos completos producen transiciones y percentiles reales", () => {
  const events = [
    { type: "driver_assigned", at: "2026-08-18T10:00:00.000Z" },
    { type: "picked_up", at: "2026-08-18T10:03:00.000Z" },
    { type: "en_route", at: "2026-08-18T10:05:00.000Z" },
    { type: "at_door", at: "2026-08-18T10:15:00.000Z" },
    { type: "delivered", at: "2026-08-18T10:20:00.000Z" },
  ];
  const report = analyzeMandadoEventQuality([order({ status: "delivered", orderStatus: "delivered", dispatchStatus: "completed", orderEvents: events })]);
  assert.equal(report.ordersWithCompleteEvents, 1);
  assert.equal(report.completeTransitions.assignment_to_pickup_arrival, 1);
  assert.equal(report.durations.assignment_to_pickup_arrival.p50, 3);
  assert.equal(report.durations.destination_arrival_to_delivered.p90, 5);
  assert.equal(report.modernCompleteOrders, 1);
  assert.equal(report.modernTerminalOrders, 1);
  assert.equal(report.modernCompleteEventRate, 100);
  assert.equal(report.modernEventCoverage.en_route.percentage, 100);
});

test("un outlier estadístico queda sospechoso y fuera de los percentiles válidos", () => {
  const makeEvents = (minutes) => [
    { type: "driver_assigned", at: "2026-08-18T10:00:00.000Z" },
    { type: "picked_up", at: new Date(Date.parse("2026-08-18T10:00:00.000Z") + minutes * 60000).toISOString() },
  ];
  const orders = [0.5, 0.6, 0.7, 0.8, 1, 202.3].map((minutes, index) => order({
    _id: `o-${index}`,
    orderEvents: makeEvents(minutes),
  }));
  const report = analyzeMandadoEventQuality(orders);
  assert.equal(report.transitionQuality.assignment_to_pickup_arrival.suspicious, 1);
  assert.equal(report.durations.assignment_to_pickup_arrival.sampleSize, 5);
  assert.equal(report.diagnostics[5].transitionClassifications.assignment_to_pickup_arrival, "SUSPICIOUS");
});

test("legacy queda diagnosticado y fuera de las estadísticas modernas", () => {
  const report = analyzeMandadoEventQuality([order({ mandadoPickupAtDoor: true, mandadoEnRuta: null, orderEvents: [
    { type: "driver_assigned", at: "2026-08-18T10:00:00.000Z" },
    { type: "picked_up", at: "2026-08-18T10:03:00.000Z" },
  ] })]);
  assert.equal(report.legacyOrders, 1);
  assert.equal(report.modernOrders, 0);
  assert.equal(report.diagnostics[0].classificationReason, "legacy_pickup_marker");
  assert.equal(report.durations.assignment_to_pickup_arrival.sampleSize, 0);
});

test("unknown explica que faltan los marcadores modernos", () => {
  const report = analyzeMandadoEventQuality([order({
    mandadoPickupAtDoor: false,
    mandadoEnRuta: undefined,
    orderEvents: [
      { type: "driver_assigned", at: "2026-08-18T10:00:00.000Z" },
      { type: "at_door", at: "2026-08-18T10:05:00.000Z" },
      { type: "delivered", at: "2026-08-18T10:06:00.000Z" },
    ],
  })]);
  assert.equal(report.unknownGenerationOrders, 1);
  assert.equal(report.diagnostics[0].classificationReason, "missing_modern_markers");
});

test("modern activo incompleto no reduce la tasa terminal", () => {
  const report = analyzeMandadoEventQuality([order({
    orderStatus: "shipped",
    status: "shipped",
    orderEvents: [{ type: "driver_assigned", at: "2026-08-18T10:00:00.000Z" }],
  })]);
  assert.equal(report.modernOrders, 1);
  assert.equal(report.modernIncompleteOrders, 1);
  assert.equal(report.modernTerminalOrders, 0);
  assert.equal(report.modernCompleteEventRate, null);
});

test("evento duplicado se marca sospechoso", () => {
  const report = analyzeMandadoEventQuality([order({ orderEvents: [
    { type: "driver_assigned", at: "2026-08-18T10:00:00.000Z" },
    { type: "picked_up", at: "2026-08-18T10:03:00.000Z" },
    { type: "picked_up", at: "2026-08-18T10:03:01.000Z" },
  ] })]);
  assert.equal(report.transitionQuality.assignment_to_pickup_arrival.suspicious, 1);
  assert.deepEqual(report.diagnostics[0].duplicateEvents, ["picked_up"]);
});

test("evento fuera de orden es inválido", () => {
  const report = analyzeMandadoEventQuality([order({ orderEvents: [
    { type: "driver_assigned", at: "2026-08-18T10:00:00.000Z" },
    { type: "picked_up", at: "2026-08-18T10:05:00.000Z" },
    { type: "en_route", at: "2026-08-18T10:04:00.000Z" },
  ] })]);
  assert.equal(report.transitionQuality.pickup_arrival_to_en_route.invalid, 1);
});

test("pedido cancelado no aporta muestras válidas", () => {
  const report = analyzeMandadoEventQuality([order({ status: "cancelled", orderStatus: "cancelled", orderEvents: [
    { type: "driver_assigned", at: "2026-08-18T10:00:00.000Z" },
    { type: "picked_up", at: "2026-08-18T10:03:00.000Z" },
  ] })]);
  assert.equal(report.transitionQuality.assignment_to_pickup_arrival.invalid, 1);
  assert.equal(report.durations.assignment_to_pickup_arrival.sampleSize, 0);
});

test("un pedido activo expone etapa y candidato de liberación interno", () => {
  const active = order({
    _id: "active",
    mandadoEnRuta: true,
    orderEvents: [{ type: "en_route", at: "2026-08-18T11:50:00.000Z" }],
  });
  const snapshot = buildDispatchObservabilitySnapshot({
    drivers: [driver({ estadoDisponibilidad: "busy", activeOrders: [active] })],
    orders: [active],
    waitingMandadoOrders: [],
    config,
    now,
  });
  assert.equal(snapshot.orderStages[0].stage, "en_route");
  assert.equal(snapshot.expectedRelease[0].driverId, "d1");
  assert.equal(snapshot.expectedRelease[0].confidence, "low");
});

test("assigned sin histórico usa fallback conservador", () => {
  const result = estimateWait({ activeOrders: [order()], historicalDurations: history({
    assignment_to_pickup_arrival: stats(null, null, null, 0),
  }), now });
  assert.deepEqual(
    { minMinutes: result.minMinutes, maxMinutes: result.maxMinutes, confidence: result.confidence, reason: result.reason },
    { minMinutes: 12, maxMinutes: 25, confidence: "low", reason: "insufficient_stage_history" },
  );
});

test("pickup_arrival suma recogida restante y ruta", () => {
  const pickupOrder = order({
    mandadoPickupAtDoor: true,
    mandadoEnRuta: false,
    orderEvents: [{ type: "picked_up", at: new Date(now - 1 * 60000).toISOString() }],
  });
  const result = estimateWait({ activeOrders: [pickupOrder], historicalDurations: history(), now });
  assert.equal(result.stage, "pickup_arrival");
  assert.deepEqual([result.minMinutes, result.maxMinutes], [12, 19]);
});

test("en_route resta tiempo transcurrido y mantiene confianza baja con pocas muestras", () => {
  const routeOrder = order({ mandadoPickupAtDoor: true, mandadoEnRuta: true, orderEvents: [{ type: "en_route", at: new Date(now - 5 * 60000).toISOString() }] });
  const result = estimateWait({ activeOrders: [routeOrder], historicalDurations: history({ en_route_to_destination_arrival: stats(12, 18, 20, 2) }), now });
  assert.deepEqual([result.minMinutes, result.maxMinutes, result.confidence, result.reason], [7, 13, "low", "driver_en_route"]);
});

test("at_door prolongado se marca delivery_wait_extended", () => {
  const atDoorOrder = order({ dispatchStatus: "at_door", mandadoPickupAtDoor: true, mandadoEnRuta: true, orderEvents: [{ type: "at_door", at: new Date(now - 10 * 60000).toISOString() }] });
  const result = estimateWait({ activeOrders: [atDoorOrder], historicalDurations: history({ destination_arrival_to_delivered: stats(2, 5, 6, 30) }), now });
  assert.equal(result.confidence, "low");
  assert.equal(result.reason, "delivery_wait_extended");
});

test("múltiples pedidos y riesgo de sesión reducen confianza", () => {
  const first = order({ orderEvents: [{ type: "en_route", at: new Date(now - 2 * 60000).toISOString() }], mandadoPickupAtDoor: true, mandadoEnRuta: true });
  const result = estimateWait({
    driver: { _id: "d1", disponibleHasta: new Date(now + 2 * 60000).toISOString() },
    activeOrders: [first, { ...first, _id: "second" }],
    historicalDurations: history(),
    now,
  });
  assert.equal(result.confidence, "low");
  assert.equal(result.reason, "multiple_active_orders");
});

test("selecciona el repartidor por menor mediana", () => {
  const makeInput = (driverId, min, max) => ({
    driver: { _id: driverId },
    activeOrders: [order({ mandadoEnRuta: true, mandadoPickupAtDoor: true, orderEvents: [{ type: "en_route", at: new Date(now - 1 * 60000).toISOString() }] })],
    historicalDurations: history({ en_route_to_destination_arrival: stats(min + 1, max + 1, max + 2, 30) }),
    now,
  });
  const result = estimateNextAvailableDriver([makeInput("slow", 8, 12), makeInput("fast", 4, 9)]);
  assert.equal(result.minMinutes, 4);
  assert.equal(result.maxMinutes, 9);
});

test("solo publica rangos con confianza medium/high", () => {
  assert.equal(toPublicEstimatedWait({ minMinutes: 8, maxMinutes: 12, confidence: "low" }), null);
  assert.deepEqual(toPublicEstimatedWait({ minMinutes: 8, maxMinutes: 12, confidence: "medium" }), { minMinutes: 8, maxMinutes: 12 });
  assert.deepEqual(toPublicEstimatedWait({ minMinutes: 8, maxMinutes: 12, confidence: "high" }), { minMinutes: 8, maxMinutes: 12 });
});