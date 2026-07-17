import assert from "node:assert/strict";
import test from "node:test";

import { isDriverDispatchEnabled } from "./fulfillment.ts";

test("reparto propio funciona con el reparto comunitario apagado", () => {
  const previous = process.env.ELMENU_DRIVER_DELIVERY_ENABLED;
  process.env.ELMENU_DRIVER_DELIVERY_ENABLED = "false";

  assert.equal(isDriverDispatchEnabled(true), true);
  assert.equal(isDriverDispatchEnabled(false), false);

  if (previous === undefined) delete process.env.ELMENU_DRIVER_DELIVERY_ENABLED;
  else process.env.ELMENU_DRIVER_DELIVERY_ENABLED = previous;
});
