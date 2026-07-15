import assert from "node:assert/strict";
import test from "node:test";

import {
  classifySupportMessage,
  normalizeSupportMessage,
} from "./classify-support-message.ts";

const cases = [
  ["Hola", "greeting"],
  ["¿A qué hora cierran?", "business_hours"],
  ["¿Entregan en La Lira?", "coverage"],
  ["¿Puedo pagar con tarjeta?", "payment_methods"],
  ["¿Tienen promociones?", "promotions"],
  ["¿Cuánto cuesta el envío?", "delivery_cost"],
  ["Quiero recoger en tienda", "pickup"],
  ["¿Cómo hago un pedido?", "how_to_order"],
  ["Quiero hablar con una persona", "human_support"],
  ["¿Dónde está mi pedido?", "operational_query"],
  ["Quiero un reembolso", "sensitive_case"],
  ["Mi repartidor fue agresivo", "sensitive_case"],
  ["Gracias", "unknown"],
];

test("classifies the initial support phrases", () => {
  for (const [message, category] of cases) {
    assert.equal(classifySupportMessage(message).category, category, message);
  }
});

test("normalizes accents, case, punctuation, and repeated spaces", () => {
  assert.equal(normalizeSupportMessage("  ¿BUENAS   TARDES!  "), "buenas tardes");
  assert.equal(classifySupportMessage("  ¿TIENEN   PROMOCIÓN? ").category, "promotions");
});

test("handles empty and long unknown messages without broad false matches", () => {
  assert.equal(classifySupportMessage("").category, "unknown");
  assert.equal(classifySupportMessage("x".repeat(20_000)).category, "unknown");
  assert.equal(
    classifySupportMessage("La tarjeta del restaurante tiene su teléfono").category,
    "unknown",
  );
  assert.equal(classifySupportMessage("Entregan factura fiscal").category, "unknown");
});

test("recognizes a common spelling variation", () => {
  assert.equal(classifySupportMessage("Cual es su orario?").category, "business_hours");
});
