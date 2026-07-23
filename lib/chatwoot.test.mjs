import assert from "node:assert/strict";
import { getChatwootConfig, isChatwootHiddenRoute } from "./chatwoot.ts";

assert.equal(isChatwootHiddenRoute("/"), false);
assert.equal(isChatwootHiddenRoute("/store/restaurant"), true);
assert.equal(isChatwootHiddenRoute("/product/pepperoni"), true);

delete process.env.NEXT_PUBLIC_CHATWOOT_BASE_URL;
delete process.env.NEXT_PUBLIC_CHATWOOT_WEBSITE_TOKEN;
assert.equal(getChatwootConfig(), null);
process.env.NEXT_PUBLIC_VERCEL_ENV = "production";
process.env.NEXT_PUBLIC_CHATWOOT_BASE_URL = "https://soporte.elmenu.site/";
process.env.NEXT_PUBLIC_CHATWOOT_WEBSITE_TOKEN = "test-token";
assert.deepEqual(getChatwootConfig(), {
  baseUrl: "https://soporte.elmenu.site",
  websiteToken: "test-token",
});
delete process.env.NEXT_PUBLIC_VERCEL_ENV;
