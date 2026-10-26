import assert from "node:assert/strict";
import test from "node:test";
import { calculateMandadoQuote, MANDADO_SERVICE_FEE } from "./mandado.ts";

const quote = (name, price) => ({
  allowed: true,
  finalPrice: price,
  zone: { id: name, name, basePrice: price },
});

test("mandado cobra la zona mas cara y rechaza puntos fuera de cobertura", () => {
  // Con service fee de $10: max(30, 80) + 10 = 90
  assert.equal(calculateMandadoQuote(quote("Centro", 30), quote("Lira", 80)).finalPrice, 90);
  assert.equal(calculateMandadoQuote(quote("Centro", 30), quote("Lira", 80)).polygonPrice, 80);
  assert.equal(MANDADO_SERVICE_FEE, 10, "Service fee es $10");
  assert.deepEqual(
    calculateMandadoQuote(quote("Centro", 30), { allowed: false, finalPrice: null, zone: null }),
    { allowed: false, finalPrice: null, polygonPrice: null, outsidePoint: "destination" }
  );
});
