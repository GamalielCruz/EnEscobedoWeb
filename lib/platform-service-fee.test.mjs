import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateOrderTotal,
  PLATFORM_SERVICE_FEE_MXN,
} from "./platform-service-fee.ts";

test("suma la tarifa de servicio al total del cliente", () => {
  assert.equal(PLATFORM_SERVICE_FEE_MXN, 5);
  assert.equal(calculateOrderTotal({ productsSubtotal: 120, shippingFee: 30 }), 155);
});
