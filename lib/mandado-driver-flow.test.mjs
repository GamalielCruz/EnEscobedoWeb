import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mandadoDriverState,
  mandadoEnPuertaPayload,
  mandadoPickedUpPayload,
  mandadoEntregadoPayload,
  buildMandadoAssignmentInteractive,
  buildMandadoPickupArrivalInteractive,
  buildMandadoEnRouteInteractive,
  buildMandadoDestinationArrivalInteractive,
} from "./mandado-driver-flow.ts";
import { buildDriverConfirmationData } from "./order-maps.ts";

const CONFIRMATION = buildDriverConfirmationData({
  serviceKind: "mandado",
  mandadoOrigin: { label: "Farmacia San Jorge, Centro", lat: 20.5, lng: -100.16 },
  mandadoDestination: { label: "Casa de la esquina, Col. Centro", lat: 20.51, lng: -100.15 },
});

function mandado(overrides = {}) {
  return {
    serviceKind: "mandado",
    dispatchStatus: "accepted",
    mandadoPickupAtDoor: false,
    mandadoEnRuta: false,
    ...overrides,
  };
}

// ── Derivación de estado ────────────────────────────────────────────────

test("ASSIGNED: accepted + sin recolección", () => {
  assert.equal(mandadoDriverState(mandado()), "assigned");
});

test("PICKUP_ARRIVAL: accepted + pickupAtDoor + enRuta false (explícito)", () => {
  assert.equal(
    mandadoDriverState(mandado({ mandadoPickupAtDoor: true, mandadoEnRuta: false })),
    "pickup_arrival"
  );
});

test("EN_ROUTE: accepted + pickupAtDoor + enRuta true", () => {
  assert.equal(
    mandadoDriverState(mandado({ mandadoPickupAtDoor: true, mandadoEnRuta: true })),
    "en_route"
  );
});

test("DESTINATION_ARRIVAL: dispatchStatus at_door", () => {
  assert.equal(
    mandadoDriverState(mandado({ dispatchStatus: "at_door", mandadoPickupAtDoor: true, mandadoEnRuta: true })),
    "destination_arrival"
  );
});

test("DELIVERED: dispatchStatus completed", () => {
  assert.equal(
    mandadoDriverState(mandado({ dispatchStatus: "completed", mandadoPickupAtDoor: true, mandadoEnRuta: true })),
    "delivered"
  );
});

test("transición inválida: mandadoEnRuta=true sin mandadoPickupAtDoor → null (nunca se deriva EN_ROUTE)", () => {
  assert.equal(mandadoDriverState(mandado({ mandadoPickupAtDoor: false, mandadoEnRuta: true })), null);
});

test("LEGACY: pickupAtDoor=true + accepted + mandadoEnRuta undefined → en_route (comportamiento histórico)", () => {
  assert.equal(
    mandadoDriverState(mandado({ mandadoPickupAtDoor: true, mandadoEnRuta: undefined })),
    "en_route"
  );
  assert.equal(
    mandadoDriverState(mandado({ mandadoPickupAtDoor: true, mandadoEnRuta: null })),
    "en_route"
  );
});

test("no-mandado → null", () => {
  assert.equal(mandadoDriverState({ serviceKind: "restaurant", dispatchStatus: "accepted" }), null);
  assert.equal(mandadoDriverState({}), null);
});

test("dispatchStatus fuera de la máquina → null", () => {
  assert.equal(mandadoDriverState(mandado({ dispatchStatus: "offered" })), null);
  assert.equal(mandadoDriverState(mandado({ dispatchStatus: "waiting_for_driver" })), null);
});

// ── Payloads de botones (mismos comandos que los de texto) ─────────────

test("los payloads de botones reutilizan los comandos canónicos", () => {
  assert.equal(mandadoEnPuertaPayload("ord-1"), "EN PUERTA|ord-1");
  assert.equal(mandadoPickedUpPayload("ord-1"), "PEDIDO EN DIRECCION AL DOMICILIO|ord-1");
  assert.equal(mandadoEntregadoPayload("ord-1"), "ENTREGADO|ord-1");
});

// ── Builders de mensajes interactivos ───────────────────────────────────

test("ASSIGNED: una sola comunicación con toda la información + botón de recolección", () => {
  const message = buildMandadoAssignmentInteractive(
    {
      _id: "ord-1",
      orderNumber: "ABC-1",
      serviceKind: "mandado",
      mandadoOrigin: { label: "Farmacia San Jorge, Centro", lat: 20.5, lng: -100.16 },
      mandadoDestination: { label: "Casa de la esquina, Col. Centro", lat: 20.51, lng: -100.15 },
      mandadoDetails: "Comprar medicina",
    },
    CONFIRMATION
  );
  assert.match(message.body, /📦 MANDADO #ABC-1/);
  assert.match(message.body, /Recoge en:\nFarmacia San Jorge, Centro/);
  assert.match(message.body, /Destino:\nCasa de la esquina, Col. Centro/);
  assert.match(message.body, /📝 Instrucciones:\nComprar medicina/);
  assert.match(message.body, /Mapa del punto de recolección:\n/);
  assert.ok(message.body.length <= 1000);
  assert.equal(message.buttons.length, 1);
  assert.equal(message.buttons[0].id, "EN PUERTA|ord-1");
  assert.ok(message.buttons[0].title.length <= 20);
});

test("PICKUP_ARRIVAL: aviso mínimo + botón 'Ya recogí el mandado'", () => {
  const message = buildMandadoPickupArrivalInteractive("ord-1");
  assert.match(message.body, /✅ Recolección registrada\./);
  assert.match(message.body, /Cuando tengas el mandado, avísame\./);
  assert.equal(message.buttons[0].id, "PEDIDO EN DIRECCION AL DOMICILIO|ord-1");
  assert.equal(message.buttons[0].title, "Ya recogí el mandado");
});

test("EN_ROUTE: destino + botón 'Llegué al destino' + mapa del destino", () => {
  const message = buildMandadoEnRouteInteractive(
    { _id: "ord-1", serviceKind: "mandado" },
    CONFIRMATION
  );
  assert.match(message.body, /🚗 Mandado recogido\./);
  assert.match(message.body, /Destino: Casa de la esquina, Col\. Centro/);
  assert.match(message.body, /Mapa del destino:\n/);
  assert.equal(message.buttons[0].id, "EN PUERTA|ord-1");
  assert.equal(message.buttons[0].title, "Llegué al destino");
});

test("DESTINATION_ARRIVAL (ES OFF): aviso mínimo + botón 'Entregado'", () => {
  const message = buildMandadoDestinationArrivalInteractive("ord-1");
  assert.match(message.body, /📍 Llegaste al destino\./);
  assert.match(message.body, /Puedes realizar la entrega\./);
  assert.equal(message.buttons[0].id, "ENTREGADO|ord-1");
  assert.equal(message.buttons[0].title, "Entregado");
});

test("cuerpo largo: se trunca a 1000 conservando el link de Maps al final", () => {
  const longOrder = {
    _id: "ord-1",
    orderNumber: "LARGO-1",
    serviceKind: "mandado",
    mandadoOrigin: { label: "A".repeat(300) },
    mandadoDestination: { label: "B".repeat(300) },
    mandadoDetails: "X".repeat(800),
    mandadoOriginReference: "Y".repeat(120),
    mandadoDestinationReference: "Z".repeat(120),
  };
  const message = buildMandadoAssignmentInteractive(longOrder, CONFIRMATION);
  assert.ok(message.body.length <= 1000, `body ${message.body.length} > 1000`);
  assert.match(message.body, /Mapa del punto de recolección:\nhttps:\/\//);
  assert.ok(message.body.endsWith(CONFIRMATION.restaurantMapsUrl), "el link de Maps debe sobrevivir al truncado");
});
