import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateDeliveryQuote,
  EMPTY_STORE_DELIVERY_CONFIG,
  getDeliveryPricingConfigId,
} from "./delivery-zones.ts";

test("cada restaurante usa su configuracion y empieza sin cobertura", () => {
  assert.equal(getDeliveryPricingConfigId(), "deliveryPricingConfig.main");
  assert.equal(getDeliveryPricingConfigId("store-123"), "deliveryPricingConfig.store-123");
  assert.equal(
    calculateDeliveryQuote(EMPTY_STORE_DELIVERY_CONFIG, { lat: 20.6, lng: -100.4 }).allowed,
    false
  );
});
