import assert from "node:assert/strict";
import {
  customerAddressStorageKey,
  normalizeCustomerAddress,
  parseCustomerAddress,
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

console.log("customer-address: ok");
