import assert from "node:assert/strict";
import test from "node:test";
import { buildAddressMapsUrl } from "./order-maps.ts";

test("prefers exact coordinates over an ambiguous street", () => {
  assert.equal(
    buildAddressMapsUrl({ line1: "23C Panamericana", latitude: 20.501753, longitude: -100.157771 }),
    "https://www.google.com/maps?q=20.501753%2C-100.157771"
  );
});
