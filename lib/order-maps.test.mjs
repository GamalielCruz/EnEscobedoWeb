import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildAddressMapsUrl, buildDriverConfirmationData, buildMandadoDriverInstructions } from "./order-maps.ts";

test("prefers exact coordinates over an ambiguous street", () => {
  assert.equal(
    buildAddressMapsUrl({ line1: "23C Panamericana", latitude: 20.501753, longitude: -100.157771 }),
    "https://www.google.com/maps?q=20.501753%2C-100.157771"
  );
});

// ── Mandados ────────────────────────────────────────────────────────────

test("mandado con coordenadas usa origen/destino reales en texto y coordenadas en Maps", () => {
  const data = buildDriverConfirmationData({
    serviceKind: "mandado",
    storeName: "Punto de inicio",
    storeLat: 20.4984,
    storeLng: -100.1607,
    destLat: 20.5012,
    destLng: -100.1589,
    mandadoOriginLabel: "5 de Febrero #64, Magisterial, Pedro Escobedo, Qro.",
    mandadoDestinationLabel: "Av. de las Torres 128, Col. El Paraíso, Querétaro, Qro.",
  });

  assert.equal(data.restaurantName, "5 de Febrero #64, Magisterial, Pedro Escobedo, Qro.");
  assert.equal(data.deliveryAddress, "Av. de las Torres 128, Col. El Paraíso, Querétaro, Qro.");
  assert.equal(data.restaurantMapsUrl, "https://www.google.com/maps?q=20.4984,-100.1607");
  assert.equal(data.clientMapsUrl, "https://www.google.com/maps?q=20.5012,-100.1589");
});

test("mandado usa los puntos anidados mandadoOrigin/mandadoDestination cuando faltan campos planos", () => {
  const data = buildDriverConfirmationData({
    serviceKind: "mandado",
    storeName: "Punto de inicio",
    mandadoOrigin: { label: "Farmacia San Jorge, Centro", lat: 20.5, lng: -100.16 },
    mandadoDestination: { label: "Casa de la esquina, Col. Centro", lat: 20.51, lng: -100.15 },
  });

  assert.equal(data.restaurantName, "Farmacia San Jorge, Centro");
  assert.equal(data.deliveryAddress, "Casa de la esquina, Col. Centro");
  assert.equal(data.restaurantMapsUrl, "https://www.google.com/maps?q=20.5,-100.16");
  assert.equal(data.clientMapsUrl, "https://www.google.com/maps?q=20.51,-100.15");
});

test("mandado sin coordenadas cae a búsqueda de texto con la etiqueta real (nunca 'Ver pedido'/'Punto de inicio')", () => {
  const data = buildDriverConfirmationData({
    serviceKind: "mandado",
    storeName: "Punto de inicio",
    mandadoOrigin: { label: "Plaza Fundadores 12, Centro" },
    mandadoDestination: { label: "Calle 5 de Mayo 88, Centro" },
  });

  assert.equal(data.restaurantName, "Plaza Fundadores 12, Centro");
  assert.equal(data.deliveryAddress, "Calle 5 de Mayo 88, Centro");
  assert.equal(data.restaurantMapsUrl, "https://maps.google.com/maps?q=Plaza%20Fundadores%2012%2C%20Centro");
  assert.equal(data.clientMapsUrl, "https://maps.google.com/maps?q=Calle%205%20de%20Mayo%2088%2C%20Centro");
});

test("el payload de confirmación nunca contiene el mensaje legacy 📦 MANDADO", () => {
  const data = buildDriverConfirmationData({
    serviceKind: "mandado",
    mandadoOrigin: { label: "A", lat: 1, lng: 2 },
    mandadoDestination: { label: "B", lat: 3, lng: 4 },
    mandadoDetails: "Medicina",
  });
  const serialized = JSON.stringify(data);
  assert.doesNotMatch(serialized, /📦 MANDADO|RECOLECCIÓN|ENTREGA|Artículo:/);
});

test("mandado: instrucciones del repartidor integran solicitud, indicaciones y cobro", () => {
  const message = buildMandadoDriverInstructions({
    serviceKind: "mandado",
    orderNumber: "ABC-123",
    mandadoOrigin: { label: "Farmacia San Jorge, Centro" },
    mandadoDestination: { label: "Casa de la esquina, Col. Centro" },
    mandadoDetails: "Comprar medicina",
    mandadoOriginReference: "Preguntar por Juan en recepción",
    mandadoDestinationReference: "Tocar el timbre 3 veces",
    paymentMethod: "cash_on_delivery",
    totalPrice: 54,
  });

  assert.match(message, /📦 MANDADO #ABC-123/);
  assert.match(message, /Recoge en:\nFarmacia San Jorge, Centro/);
  assert.match(message, /Destino:\nCasa de la esquina, Col. Centro/);
  assert.match(message, /📝 Instrucciones:\nComprar medicina/);
  assert.match(message, /📍 Indicaciones:\nPreguntar por Juan en recepción\nTocar el timbre 3 veces/);
  assert.match(message, /💰 Cobro:\nCOBRAR EN EFECTIVO - \$54\.00 MXN/);
  assert.match(message, /Después de recoger el mandado, dirígete al destino\./);
});

test("mandado: sin indicaciones ni monto, se omiten esas secciones con fallbacks legibles", () => {
  const message = buildMandadoDriverInstructions({
    serviceKind: "mandado",
    orderNumber: "XYZ-9",
    mandadoOriginLabel: "Punto de inicio",
    mandadoDestinationLabel: "Destino del mandado",
    mandadoDetails: "  ",
    paymentMethod: "stripe",
  });

  assert.doesNotMatch(message, /📍 Indicaciones/);
  assert.match(message, /📝 Instrucciones:\nSin instrucciones adicionales\./);
  assert.match(message, /💰 Cobro:\nYA PAGADO/);
  assert.doesNotMatch(message, /\$0\.00 MXN/);
});

// ── Restaurantes (comportamiento previo intacto) ────────────────────────

test("restaurante conserva tienda + shippingAddress y URLs de Maps", () => {
  const data = buildDriverConfirmationData({
    serviceKind: "restaurant",
    storeName: "Tienda de Crepas",
    storeAddress: "Calle Hidalgo 123",
    storeCoordinates: { latitude: 20.1, longitude: -100.2 },
    shippingAddress: {
      line1: "Calle Hidalgo 123",
      street: "Calle Hidalgo",
      city: "Querétaro",
      latitude: 20.3,
      longitude: -100.4,
    },
  });

  assert.equal(data.restaurantName, "Tienda de Crepas");
  assert.equal(data.deliveryAddress, "Calle Hidalgo 123, Calle Hidalgo, Querétaro");
  assert.equal(data.restaurantMapsUrl, "https://www.google.com/maps?q=20.1,-100.2");
  assert.equal(data.clientMapsUrl, "https://www.google.com/maps?q=20.3,-100.4");
});

test("restaurante sin coordenadas usa texto de tienda y de shippingAddress", () => {
  const data = buildDriverConfirmationData({
    storeName: "Tienda de Crepas",
    storeAddress: "Calle Hidalgo 123",
    shippingAddress: { line1: "Calle Hidalgo 123" },
  });

  assert.equal(data.restaurantMapsUrl, "https://maps.google.com/maps?q=Calle%20Hidalgo%20123");
  assert.equal(data.clientMapsUrl, "https://maps.google.com/maps?q=Calle%20Hidalgo%20123");
});

// ── Garantía a nivel de fuente ──────────────────────────────────────────
// El mensaje legacy (📦 MANDADO sin instrucciones, que DUPLICABA la plantilla
// canónica) no debe reaparecer. El builder actual (`buildMandadoDriverInstructions`)
// se llama SOLO para mandados y SIEMPRE junto a la plantilla
// confirmacion_repartidor; los restaurantes conservan deliveryNotes.
test("el webhook llama al builder de instrucciones solo para mandados", () => {
  const source = readFileSync(
    new URL("../app/api/whatsapp/webhook/route.ts", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(source, /mandado-driver-instructions/);
  assert.doesNotMatch(source, /📦 MANDADO/);
  assert.match(source, /isMandadoOrder\s*\?\s*sendBotMessage\(fromPhone, buildMandadoDriverInstructions/);
  assert.match(source, /!isMandadoOrder && deliveryNotes/);
});
