import assert from "node:assert/strict";
import { normalizeProductRequests } from "./product-requests.ts";

assert.deepEqual(
  normalizeProductRequests(
    { notes: " Sin cebolla ", allergies: ["Leche", "Leche", "Nueces"] },
    { allowSpecialInstructions: true, acceptsAllergyRequests: true }
  ),
  { notes: "Sin cebolla", allergies: ["Leche", "Nueces"] }
);
assert.deepEqual(
  normalizeProductRequests(
    { notes: "Sin cebolla", allergies: ["Leche"] },
    { allowSpecialInstructions: false, acceptsAllergyRequests: false }
  ),
  { notes: undefined, allergies: [] }
);

console.log("product-requests: ok");
