import assert from "node:assert/strict";
import test from "node:test";

import { isDeliveryDriverAvailable, isDriverDispatchEnabled } from "./fulfillment.ts";

test("reparto propio funciona con el reparto comunitario apagado", () => {
  const previous = process.env.ELMENU_DRIVER_DELIVERY_ENABLED;
  process.env.ELMENU_DRIVER_DELIVERY_ENABLED = "false";

  assert.equal(isDriverDispatchEnabled(true), true);
  assert.equal(isDriverDispatchEnabled(false), false);

  if (previous === undefined) delete process.env.ELMENU_DRIVER_DELIVERY_ENABLED;
  else process.env.ELMENU_DRIVER_DELIVERY_ENABLED = previous;
});

test("reparto propio no depende de repartidores comunitarios conectados", () => {
  assert.equal(isDeliveryDriverAvailable(true, 0), true);
  assert.equal(isDeliveryDriverAvailable(false, 0), false);
  assert.equal(isDeliveryDriverAvailable(false, 1), true);
});
