import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateDeliveryQuote,
  EMPTY_STORE_DELIVERY_CONFIG,
  getDeliveryPricingConfigId,
  parseOptionalPrice,
  PEDRO_ESCOBEDO_DELIVERY_TEMPLATE,
  updateDeliveryZone,
} from "./delivery-zones.ts";

test("cada restaurante usa su configuracion y empieza sin cobertura", () => {
  assert.equal(getDeliveryPricingConfigId(), "deliveryPricingConfig.main");
  assert.equal(getDeliveryPricingConfigId("store-123"), "deliveryPricingConfig.store-123");
  assert.equal(
    calculateDeliveryQuote(EMPTY_STORE_DELIVERY_CONFIG, { lat: 20.6, lng: -100.4 }).allowed,
    false
  );
});

test("el costo puede quedar vacio mientras se reemplaza", () => {
  assert.equal(parseOptionalPrice(""), null);
  assert.equal(parseOptionalPrice("30"), 30);
  assert.equal(parseOptionalPrice("-1"), null);
});

test("editar el mapa conserva las zonas y cambios mas recientes", () => {
  const config = structuredClone(PEDRO_ESCOBEDO_DELIVERY_TEMPLATE);
  config.zones.push({ ...config.zones[0], id: "nueva", name: "Nueva" });
  config.zones[0].basePrice = 99;

  const updated = updateDeliveryZone(config, config.zones[0].id, { coordinates: [{ lat: 1, lng: 2 }] });

  assert.equal(updated.zones[0].basePrice, 99);
  assert.equal(updated.zones.at(-1)?.id, "nueva");
});

test("la plantilla de Pedro Escobedo ofrece cuatro costos fijos sin multiplicadores", () => {
  assert.deepEqual(
    PEDRO_ESCOBEDO_DELIVERY_TEMPLATE.zones.map(({ name, basePrice }) => [name, basePrice]),
    [["Chamizal", 45], ["Pedro Escobedo Centro", 30], ["Lira", 80], ["El Sauz", 70]]
  );
  assert.equal(PEDRO_ESCOBEDO_DELIVERY_TEMPLATE.demand.multiplier, 1);
  assert.deepEqual(PEDRO_ESCOBEDO_DELIVERY_TEMPLATE.scheduleRules, []);
  assert.equal(PEDRO_ESCOBEDO_DELIVERY_TEMPLATE.outsideZone.mode, "reject");
});
