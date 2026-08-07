import assert from "node:assert/strict";
import test from "node:test";
import { validateAssignment } from "./dispatch-validation.ts";

const config = {
  mode: "manual",
  maxDistanceKm: 8,
  searchRadiusKm: 6,
  maxOrdersPerDriver: 3,
  maxWaitMinutesBeforeEscalate: 20,
  prioritizeMandados: false,
  prioritizeRestaurants: false,
  allowMultipleOrders: true,
  allowMixStores: false,
  allowMixMandados: true,
  allowMixRestaurantMandado: false,
};

const order = (over = {}) => ({
  _id: "o1",
  orderType: "delivery",
  orderStatus: "pending",
  driverId: null,
  storeId: "s1",
  storeHasOwnDelivery: false,
  serviceKind: "restaurant",
  ...over,
});

const driver = (over = {}) => ({
  _id: "d1",
  activo: true,
  bloqueado: false,
  disponible: true,
  estadoDisponibilidad: "available",
  disponibleHasta: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  storeId: null,
  activeOrders: [],
  ...over,
});

test("permite asignación manual a repartidor disponible", () => {
  assert.equal(validateAssignment(order(), driver(), config, "manual"), null);
  assert.equal(validateAssignment(order(), driver(), config, "assisted"), null);
});

test("modo auto (aceptación de oferta) no revalida disponibilidad", () => {
  // Un repartidor con oferta pendiente acepta: es el flujo legítimo de WhatsApp.
  assert.equal(
    validateAssignment(order(), driver({ estadoDisponibilidad: "offer_pending" }), config, "auto"),
    null
  );
});

test("rechaza pedido inexistente o repartidor inexistente", () => {
  assert.equal(validateAssignment(null, driver(), config, "manual"), "El pedido no existe.");
  assert.equal(validateAssignment(order(), null, config, "manual"), "El repartidor no existe.");
});

test("rechaza pedido no entregable", () => {
  assert.equal(validateAssignment(order({ orderType: "pickup" }), driver(), config, "manual"), "El pedido no es de entrega.");
});

test("rechaza pedido terminado o cancelado", () => {
  for (const orderStatus of ["delivered", "completed", "cancelled", "picked_up"]) {
    assert.ok(validateAssignment(order({ orderStatus }), driver(), config, "manual")?.includes("terminado o cancelado"));
  }
});

test("rechaza reasignación al mismo repartidor", () => {
  assert.equal(
    validateAssignment(order({ driverId: "d1" }), driver(), config, "manual"),
    "El pedido ya está asignado a este repartidor."
  );
});

test("rechaza asignación cuando otro operador ya asignó el pedido", () => {
  const err = validateAssignment(order({ driverId: "d-otro" }), driver(), config, "manual");
  assert.ok(err?.includes("asignado a otro repartidor"));
  // El webhook (auto) nunca llega aquí: el pedido ofrecido no tiene repartidorAsignado.
  assert.equal(validateAssignment(order({ driverId: null }), driver(), config, "auto"), null);
});

test("rechaza repartidor inactivo o bloqueado", () => {
  assert.equal(validateAssignment(order(), driver({ activo: false }), config, "manual"), "El repartidor está inactivo.");
  assert.equal(validateAssignment(order(), driver({ bloqueado: true }), config, "manual"), "El repartidor está bloqueado.");
});

test("mensaje claro al asignar manualmente a un repartidor con oferta pendiente", () => {
  const err = validateAssignment(order(), driver({ estadoDisponibilidad: "offer_pending" }), config, "manual");
  assert.ok(err?.includes("oferta pendiente"));
});

test("rechaza repartidor pausado o desconectado en asignación manual", () => {
  // Pausado/desconectado por el admin: disponible=false (como hace setDriverControl).
  const err = validateAssignment(order(), driver({ disponible: false }), config, "manual");
  assert.ok(err?.includes("no está disponible"));
  // Estado explícitamente no válido aunque el flag disponible siga en true.
  const err2 = validateAssignment(order(), driver({ estadoDisponibilidad: "paused" }), config, "manual");
  assert.ok(err2?.includes("pausado o desconectado"));
  const err3 = validateAssignment(order(), driver({ estadoDisponibilidad: "offline" }), config, "manual");
  assert.ok(err3?.includes("pausado o desconectado"));
});

test("rechaza sesión de disponibilidad vencida", () => {
  const err = validateAssignment(
    order(),
    driver({ disponibleHasta: new Date(Date.now() - 1000).toISOString() }),
    config,
    "manual"
  );
  assert.ok(err?.includes("venció"));
});

test("rechaza ocupado cuando no se permiten múltiples pedidos", () => {
  const err = validateAssignment(
    order(),
    driver({ estadoDisponibilidad: "busy", activeOrders: [{ _id: "a" }] }),
    { ...config, allowMultipleOrders: false },
    "manual"
  );
  assert.ok(err?.includes("múltiples pedidos") || err?.includes("ocupado"));
});

test("rechaza sobrecapacidad (máximo de pedidos activos)", () => {
  const err = validateAssignment(
    order(),
    driver({ activeOrders: [{ _id: "a" }, { _id: "b" }, { _id: "c" }] }),
    config,
    "manual"
  );
  assert.ok(err?.includes("máximo de 3"));
});

test("rechaza mezclar restaurantes cuando está prohibido", () => {
  const err = validateAssignment(
    order({ storeHasOwnDelivery: true, storeId: "s1" }),
    driver({ storeId: "s2" }),
    config,
    "manual"
  );
  assert.ok(err?.includes("otra tienda"));
});

test("rechaza repartidor de tienda para mandado cuando está prohibido", () => {
  const err = validateAssignment(
    order({ serviceKind: "mandado" }),
    driver({ storeId: "s1" }),
    config,
    "manual"
  );
  assert.ok(err?.includes("Mandados"));
});

test("permite asignar a repartidor ocupado si se permiten múltiples pedidos", () => {
  assert.equal(
    validateAssignment(order(), driver({ estadoDisponibilidad: "busy", activeOrders: [{ _id: "a" }] }), config, "manual"),
    null
  );
});
