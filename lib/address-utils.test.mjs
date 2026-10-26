import assert from "node:assert/strict";
import {
  addressLabel,
  customerAddressToMandadoPoint,
  googlePlaceToCustomerAddress,
  parseGoogleAddressComponents,
} from "./address-utils.ts";

const components = [
  { long_name: "5 de Febrero", short_name: "5 de Febrero", types: ["route"] },
  { long_name: "64", short_name: "64", types: ["street_number"] },
  { long_name: "Magisterial", short_name: "Magisterial", types: ["sublocality_level_1"] },
  { long_name: "Pedro Escobedo", short_name: "Pedro Escobedo", types: ["locality"] },
  { long_name: "Querétaro", short_name: "Qro.", types: ["administrative_area_level_1"] },
  { long_name: "76740", short_name: "76740", types: ["postal_code"] },
  { long_name: "México", short_name: "MX", types: ["country"] },
];

// parseGoogleAddressComponents: texto estructurado a partir de los
// address_components de Google.
const fields = parseGoogleAddressComponents(components);
assert.equal(fields.street, "5 de Febrero 64");
assert.equal(fields.city, "Pedro Escobedo");
assert.equal(fields.state, "Querétaro");
assert.equal(fields.postalCode, "76740");
assert.equal(fields.country, "México");

// Sin locality, cae a sublocality / admin nivel 2.
assert.equal(
  parseGoogleAddressComponents(
    components.filter((component) => component.types[0] !== "locality")
  ).city,
  "Magisterial"
);
assert.deepEqual(parseGoogleAddressComponents(undefined), {
  street: "",
  city: "",
  state: "",
  postalCode: "",
  country: "México",
});

// googlePlaceToCustomerAddress: place de Autocomplete → CustomerAddress
// parcial con coordenadas.
const place = {
  formatted_address: "5 de Febrero 64, Magisterial, Pedro Escobedo, Qro., México",
  address_components: components,
  geometry: {
    location: {
      lat: () => 20.502,
      lng: () => -100.145,
    },
  },
  place_id: "ChIJ-test",
};
const parsed = googlePlaceToCustomerAddress(place);
assert.equal(parsed.street, "5 de Febrero 64");
assert.equal(parsed.city, "Pedro Escobedo");
assert.equal(parsed.formattedAddress, "5 de Febrero 64, Magisterial, Pedro Escobedo, Qro., México");
assert.equal(parsed.latitude, 20.502);
assert.equal(parsed.longitude, -100.145);
assert.equal(parsed.country, "México");

// Sin geometría → coordenadas undefined, pero conserva el texto.
const noGeometry = googlePlaceToCustomerAddress({ formatted_address: "Calle 1, Centro" });
assert.equal(noGeometry.latitude, undefined);
assert.equal(noGeometry.longitude, undefined);
assert.equal(noGeometry.formattedAddress, "Calle 1, Centro");

// Los resultados del Geocoder (reverse geocode) también son compatibles.
const geocoderResult = googlePlaceToCustomerAddress({
  formatted_address: "Av. Hidalgo 12, Centro, Pedro Escobedo, Qro.",
  address_components: [
    { long_name: "Hidalgo", short_name: "Hidalgo", types: ["route"] },
    { long_name: "12", short_name: "12", types: ["street_number"] },
    { long_name: "Centro", short_name: "Centro", types: ["sublocality_level_1"] },
    { long_name: "Pedro Escobedo", short_name: "Pedro Escobedo", types: ["locality"] },
    { long_name: "Querétaro", short_name: "Qro.", types: ["administrative_area_level_1"] },
    { long_name: "México", short_name: "MX", types: ["country"] },
  ],
  geometry: { location: { lat: () => 20.5, lng: () => -100.1 } },
});
assert.equal(geocoderResult.street, "Hidalgo 12");
assert.equal(geocoderResult.city, "Pedro Escobedo");

// customerAddressToMandadoPoint: con coordenadas se convierte directo al
// punto de Mandado (sin geocodificar); sin coordenadas devuelve null.
const saved = {
  id: "casa-1",
  label: "Casa",
  formattedAddress: "5 de Febrero 64, Pedro Escobedo, Qro.",
  street: "5 de Febrero 64",
  city: "Pedro Escobedo",
  state: "Querétaro",
  postalCode: "76740",
  country: "México",
  latitude: 20.502,
  longitude: -100.145,
};
const point = customerAddressToMandadoPoint(saved);
assert.equal(point?.label, "Casa");
assert.equal(point?.lat, 20.502);
assert.equal(point?.lng, -100.145);
assert.equal(customerAddressToMandadoPoint({ ...saved, latitude: undefined }), null);
assert.equal(addressLabel({ ...saved, label: "" }), "5 de Febrero 64");

console.log("address-utils: ok");
