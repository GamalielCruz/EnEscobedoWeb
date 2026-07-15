import assert from "node:assert/strict";
import test from "node:test";

import { formatOrderStatusResponse } from "./order-status-response.ts";

test("formats delivery, pickup, payment, and at-door order states", () => {
  assert.equal(
    formatOrderStatusResponse({
      orderNumber: " COD-123 ",
      orderStatus: "processing",
      restaurantName: "  La   Cocina ",
    }),
    "Tu pedido #COD-123 de La Cocina está en preparación.",
  );
  assert.equal(
    formatOrderStatusResponse({
      orderStatus: "shipped",
      dispatchStatus: "at_door",
    }),
    "Tu pedido está en tu domicilio; el repartidor indicó que llegó a la puerta.",
  );
  assert.equal(
    formatOrderStatusResponse({
      orderStatus: "pending",
      paymentStatus: "failed",
    }),
    "Tu pedido no pudo confirmarse porque el pago no se completó.",
  );
  assert.equal(
    formatOrderStatusResponse({
      orderType: "pickup",
      pickupStatus: "ready_for_pickup",
    }),
    "Tu pedido está listo para recoger.",
  );
});
