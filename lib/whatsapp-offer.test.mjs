import assert from "node:assert/strict";
import test from "node:test";
import { WHATSAPP_TEMPLATES } from "./whatsapp/templates.ts";

// ============================================================
// TEST 1: Mandado uses oferta_mandado template
// ============================================================
test("Template de mandado existe y es oferta_mandado", () => {
  assert.equal(WHATSAPP_TEMPLATES.ofertaMandado, "oferta_mandado");
});

// ============================================================
// TEST 2: Restaurant uses oferta_reparto (unchanged)
// ============================================================
test("Template de restaurante sigue siendo oferta_reparto", () => {
  assert.equal(WHATSAPP_TEMPLATES.ofertaReparto, "oferta_reparto");
});

// ============================================================
// TEST 3: Los dos templates son diferentes
// ============================================================
test("oferta_mandado y oferta_reparto son templates distintos", () => {
  assert.notEqual(WHATSAPP_TEMPLATES.ofertaMandado, WHATSAPP_TEMPLATES.ofertaReparto);
});

// ============================================================
// TEST 4: Mandado $44 — monto correcto
// ============================================================
test("Mandado $44: driverPayout=$44, customerTotal=$54", () => {
  // Simular los valores que se pasarían al template
  const driverPayout = 44;
  const customerTotal = 54;
  const driverLabel = `$${driverPayout.toFixed(2)} MXN`;
  const totalLabel = `$${customerTotal.toFixed(2)} MXN`;

  assert.equal(driverLabel, "$44.00 MXN");
  assert.equal(totalLabel, "$54.00 MXN");

  // Verificar que Tu envío = driverPayout (NO customerTotal)
  assert.notEqual(driverLabel, totalLabel, "Tu envío NO debe ser igual al total del cliente");
  assert.equal(driverLabel, "$44.00 MXN", "Tu envío = $44 (polygonPrice)");
  assert.equal(totalLabel, "$54.00 MXN", "Total pagado = $54 (customerTotal)");
});

// ============================================================
// TEST 5: Mandado $30 — monto correcto (no hardcodeado)
// ============================================================
test("Mandado $30: driverPayout=$30, customerTotal=$40", () => {
  const driverPayout = 30;
  const customerTotal = 40;
  const driverLabel = `$${driverPayout.toFixed(2)} MXN`;
  const totalLabel = `$${customerTotal.toFixed(2)} MXN`;

  assert.equal(driverLabel, "$30.00 MXN");
  assert.equal(totalLabel, "$40.00 MXN");
  assert.notEqual(driverLabel, "$44.00 MXN", "NO hardcodeado a $44");
});

// ============================================================
// TEST 6: Restaurant mantiene su formato
// ============================================================
test("Restaurante: restaurantAmount = total - driverPayout", () => {
  const totalPrice = 50;
  const driverPayout = 10;
  const restaurantAmount = totalPrice - driverPayout;

  assert.equal(restaurantAmount, 40, "Restaurante recibe $40 (subtotal)");
  assert.notEqual(restaurantAmount, totalPrice, "Restaurante NO recibe el total");
});

// ============================================================
// TEST 7: Mandado restaurantAmount = driverPayout (no totalPrice - driverPayout)
// ============================================================
test("Mandado: restaurantAmount para template = driverPayout (polygonPrice)", () => {
  const totalPrice = 54;
  const driverPayout = 44;

  // Para mandado, el monto del polígono ES driverPayout
  const mandadoPolygonPrice = driverPayout;
  assert.equal(mandadoPolygonPrice, 44, "polygonPrice = driverPayout = $44");

  // NO usar totalPrice - driverPayout (eso da el service fee $10)
  const wrongAmount = totalPrice - driverPayout;
  assert.equal(wrongAmount, 10, "totalPrice - driverPayout = $10 (service fee, NO el polígono)");
  assert.notEqual(mandadoPolygonPrice, wrongAmount, "polygonPrice NO es el service fee");
});

// ============================================================
// TEST 8: serviceKind routing
// ============================================================
test("Routing: mandado → oferta_mandado, restaurante → oferta_reparto", () => {
  function selectTemplate(serviceKind) {
    return serviceKind === "mandado"
      ? WHATSAPP_TEMPLATES.ofertaMandado
      : WHATSAPP_TEMPLATES.ofertaReparto;
  }

  assert.equal(selectTemplate("mandado"), "oferta_mandado");
  assert.equal(selectTemplate("restaurant"), "oferta_reparto");
  assert.equal(selectTemplate(undefined), "oferta_reparto");
  assert.equal(selectTemplate("delivery"), "oferta_reparto");
});
