import assert from "node:assert/strict";
import {
  formatChatwootDisplayName,
  getChatwootConfig,
  isChatwootHiddenRoute,
} from "./chatwoot.ts";

assert.equal(
  formatChatwootDisplayName({ firstName: "Ignacio", lastName: "Cruz Hernández" }),
  "Ignacio C.",
);
assert.equal(
  formatChatwootDisplayName({ firstName: "María", lastName: "López" }),
  "María L.",
);
assert.equal(formatChatwootDisplayName({ fullName: "Juan Pérez García" }), "Juan P.");
assert.equal(formatChatwootDisplayName({ fullName: "Andrea" }), "Andrea");
assert.equal(formatChatwootDisplayName({}), "Cliente");
assert.equal(
  formatChatwootDisplayName({
    firstName: "  Ignacio   Gamaliel ",
    fullName: "Ignacio Gamaliel Cruz Hernández",
  }),
  "Ignacio C.",
);

assert.equal(isChatwootHiddenRoute("/dashboard/orders"), true);
assert.equal(isChatwootHiddenRoute("/admin"), true);
assert.equal(isChatwootHiddenRoute("/administrator"), false);
assert.equal(isChatwootHiddenRoute("/store/dashboard-special"), false);

delete process.env.NEXT_PUBLIC_CHATWOOT_BASE_URL;
delete process.env.NEXT_PUBLIC_CHATWOOT_WEBSITE_TOKEN;
assert.equal(getChatwootConfig(), null);
process.env.NEXT_PUBLIC_CHATWOOT_BASE_URL = "https://soporte.elmenu.site/";
process.env.NEXT_PUBLIC_CHATWOOT_WEBSITE_TOKEN = "test-token";
assert.deepEqual(getChatwootConfig(), {
  baseUrl: "https://soporte.elmenu.site",
  websiteToken: "test-token",
});
