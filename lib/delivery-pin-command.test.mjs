import assert from "node:assert/strict";
import test from "node:test";
import { parseDeliveryPinCommand } from "./delivery-pin-command.ts";

test("acepta un NIP solo cuando hay un pedido por confirmar", () => {
  assert.deepEqual(parseDeliveryPinCommand("067061"), { pin: "067061", orderToken: null });
  assert.deepEqual(parseDeliveryPinCommand("NIP #ORD-123 067061"), { pin: "067061", orderToken: "ORD-123" });
  assert.equal(parseDeliveryPinCommand("67061"), null);
  assert.equal(parseDeliveryPinCommand("NIP ORD-123 1234567"), null);
});
