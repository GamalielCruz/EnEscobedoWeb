import assert from "node:assert/strict";
import {
  customerAddressStorageKey,
  dedupeCustomerAddresses,
  normalizeCustomerAddress,
  parseCustomerAddress,
  restoreCustomerAddress,
  sameCustomerAddress,
  selectActiveAddress,
} from "./customer-address.ts";

const address = normalizeCustomerAddress({
  formatted_address: "Calle Reforma 10, Pedro Escobedo, Querétaro",
  address: "Calle Reforma 10",
  city: "Pedro Escobedo",
  state: "Querétaro",
  label: "Casa",
  latitude: 20.5,
  longitude: -100.1,
});

assert.equal(address?.street, "Calle Reforma 10");
assert.equal(address?.label, "Casa");
assert.equal(address?.formattedAddress, "Calle Reforma 10, Pedro Escobedo, Querétaro");
assert.equal(normalizeCustomerAddress({ address: "x" }), null);
assert.equal(normalizeCustomerAddress({ address: "Calle 1", latitude: 200 })?.latitude, undefined);
assert.equal(parseCustomerAddress("{invalid"), null);
assert.notEqual(customerAddressStorageKey("user-a"), customerAddressStorageKey("user-b"));
assert.equal(restoreCustomerAddress(null, address)?.street, "Calle Reforma 10");
assert.equal(restoreCustomerAddress(JSON.stringify({ ...address, street: "Calle Hidalgo 10" }), address)?.street, "Calle Hidalgo 10");
assert.equal(restoreCustomerAddress(null, null), null);

// ── Deduplicación: una sola dirección guardada para el mismo registro ──

const casa = normalizeCustomerAddress({
  id: "id-casa-1",
  label: "Casa de mamá",
  street: "5 de Febrero 66",
  city: "Pedro Escobedo",
  state: "Querétaro",
  postalCode: "76705",
  latitude: 20.5,
  longitude: -100.1,
});
const casaCopia = { ...casa };
const trabajo = normalizeCustomerAddress({
  id: "id-trabajo-2",
  label: "Trabajo",
  street: "Av. Constitución 123",
  city: "Pedro Escobedo",
  state: "Querétaro",
  postalCode: "76740",
  latitude: 20.51,
  longitude: -100.11,
});

// Crear una dirección una vez → [A], nunca [A, A].
assert.equal(dedupeCustomerAddresses([casa]).length, 1);
assert.equal(dedupeCustomerAddresses([casa, casa]).length, 1);
assert.equal(dedupeCustomerAddresses([casa, casaCopia]).length, 1);

// Editar: mismo id → [A modificada], NO [A, A modificada].
const casaEditada = normalizeCustomerAddress({ ...casa, street: "5 de Febrero 68" });
const editada = dedupeCustomerAddresses([casa, casaEditada]);
assert.equal(editada.length, 1);
assert.equal(editada[0].street, "5 de Febrero 68"); // gana la versión más reciente

// Diferentes direcciones sí coexisten.
assert.equal(dedupeCustomerAddresses([casa, trabajo]).length, 2);

// Duplicado por coordenadas (datos legacy sin id): misma dirección +
// mismas coordenadas → mismo registro lógico.
const legacyA = normalizeCustomerAddress({
  street: "5 de Febrero 66",
  city: "Pedro Escobedo",
  postalCode: "76705",
  latitude: 20.5,
  longitude: -100.1,
});
const legacyB = normalizeCustomerAddress({
  street: "5 de Febrero 66",
  city: "Pedro Escobedo",
  postalCode: "76705",
  latitude: 20.5,
  longitude: -100.1,
});
assert.equal(sameCustomerAddress(legacyA, legacyB), true);
assert.equal(dedupeCustomerAddresses([legacyA, legacyB]).length, 1);

// Mismo nombre pero distinta ubicación NO son la misma dirección.
const legacyOtroPunto = normalizeCustomerAddress({
  street: "5 de Febrero 66",
  city: "Pedro Escobedo",
  postalCode: "76705",
  latitude: 20.9,
  longitude: -100.9,
});
assert.equal(sameCustomerAddress(legacyA, legacyOtroPunto), false);
assert.equal(dedupeCustomerAddresses([legacyA, legacyOtroPunto]).length, 2);

// ── Una sola dirección ACTUAL ──────────────────────────────────────────
// selectActiveAddress siempre devuelve UN único registro; la UI deriva
// ACTUAL de active.id === address.id, así que nunca hay dos ACTUAL.
assert.equal(selectActiveAddress([casa, trabajo], "id-trabajo-2")?.id, "id-trabajo-2");
assert.equal(selectActiveAddress([casa, trabajo], "id-inexistente")?.id, "id-casa-1"); // fallback: primera
assert.equal(selectActiveAddress([casa, trabajo], "id-inexistente", "id-trabajo-2")?.id, "id-trabajo-2"); // preferida local
assert.equal(selectActiveAddress([], "id-x"), null);

// Con la lista deduplicada solo puede existir una entrada por id, y el
// activo es un único objeto → a lo sumo una coincidencia.
const unicos = dedupeCustomerAddresses([casa, casaCopia, trabajo]);
const activo = selectActiveAddress(unicos, "id-casa-1");
assert.equal(unicos.filter((a) => a.id === activo?.id).length, 1);

console.log("customer-address: ok");
