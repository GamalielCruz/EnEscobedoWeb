import assert from "node:assert/strict";
import test from "node:test";

import { isOrderDispatchable } from "./order-state.ts";

test("excludes a cancelled legacy order even if dispatch is waiting", () => {
  assert.equal(isOrderDispatchable({ status: "cancelled" }), false);
});

test("allows an unpaid COD delivery waiting for a driver", () => {
  assert.equal(
    isOrderDispatchable({
      status: "pending_delivery",
      orderStatus: "pending",
      paymentStatus: "unpaid",
    }),
    true
  );
});

test("excludes assigned, refunded, and failed orders", () => {
  assert.equal(isOrderDispatchable({ repartidorAsignado: { _ref: "driver" } }), false);
  assert.equal(isOrderDispatchable({ paymentStatus: "refunded" }), false);
  assert.equal(isOrderDispatchable({ paymentStatus: "failed" }), false);
});
