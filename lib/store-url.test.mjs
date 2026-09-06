import assert from "node:assert/strict";
import test from "node:test";

import { getStorePath, slugifyStoreName } from "./store-url.ts";

test("genera enlaces cortos y respeta el slug configurado", () => {
  assert.equal(slugifyStoreName("La Cocina de Sami"), "lacocinadesami");
  assert.equal(slugifyStoreName("Hornea°"), "hornea");
  assert.equal(getStorePath({ name: "Nombre anterior", slug: { current: "hornea" } }), "/hornea");
});
