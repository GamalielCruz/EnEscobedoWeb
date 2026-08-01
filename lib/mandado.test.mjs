import assert from "node:assert/strict";
import test from "node:test";
import { calculateMandadoQuote } from "./mandado.ts";

const quote = (name, price) => ({
  allowed: true,
  finalPrice: price,
  zone: { id: name, name, basePrice: price },
});

test("mandado cobra la zona mas cara y rechaza puntos fuera de cobertura", () => {
  assert.equal(calculateMandadoQuote(quote("Centro", 30), quote("Lira", 80)).finalPrice, 94);
  assert.deepEqual(
    calculateMandadoQuote(quote("Centro", 30), { allowed: false, finalPrice: null, zone: null }),
    { allowed: false, finalPrice: null, outsidePoint: "destination" }
  );
});
