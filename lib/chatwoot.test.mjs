import assert from "node:assert/strict";
import { getChatwootConfig, isChatwootHiddenRoute } from "./chatwoot.ts";

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
