import assert from "node:assert/strict";
import test from "node:test";

import { isRestaurantVisibleOrder } from "./payment.ts";

test("el restaurante solo ve pedidos Stripe pagados", () => {
  assert.equal(isRestaurantVisibleOrder({ paymentProvider: "stripe", paymentStatus: "pending" }), false);
  assert.equal(isRestaurantVisibleOrder({ paymentProvider: "stripe", paymentStatus: "expired" }), false);
  assert.equal(isRestaurantVisibleOrder({ paymentProvider: "stripe", paymentStatus: "paid" }), true);
  assert.equal(isRestaurantVisibleOrder({ paymentProvider: "cash", paymentStatus: "pending" }), true);
});
