import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildAddressMapsUrl, buildDriverConfirmationData } from "./order-maps.ts";

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
// El flujo de aceptación (webhook) ya no puede enviar el mensaje legacy: el
// builder fue eliminado y el bloque ACEPTO solo llama a la plantilla
// confirmacion_repartidor (más instrucciones de entrega para restaurantes).
test("el webhook ya no referencia el mensaje legacy 📦 MANDADO", () => {
  const source = readFileSync(
    new URL("../app/api/whatsapp/webhook/route.ts", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(source, /mandado-driver-instructions/);
  assert.doesNotMatch(source, /buildMandadoDriverInstructions/);
  assert.doesNotMatch(source, /sendBotMessage\(fromPhone, buildMandado/);
});
