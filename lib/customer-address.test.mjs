import assert from "node:assert/strict";
import { normalizeCustomerAddress, parseCustomerAddress } from "./customer-address.ts";

const address = normalizeCustomerAddress({
  formatted_address: "5 de febrero #64, Pedro Escobedo, Querétaro",
  address: "5 de febrero #64",
  city: "Pedro Escobedo",
  state: "Querétaro",
  label: "Casa",
  latitude: 20.5,
  longitude: -100.1,
});

assert.equal(address?.street, "5 de febrero #64");
assert.equal(address?.label, "Casa");
assert.equal(address?.formattedAddress, "5 de febrero #64, Pedro Escobedo, Querétaro");
assert.equal(normalizeCustomerAddress({ address: "x" }), null);
assert.equal(normalizeCustomerAddress({ address: "Calle 1", latitude: 200 })?.latitude, undefined);
assert.equal(parseCustomerAddress("{invalid"), null);

console.log("customer-address: ok");
