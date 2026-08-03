import { client } from "@/sanity/lib/client";
import { slugifyStoreName } from "@/lib/store-url";
import { getStoreById } from "./getStoreById";

const STORE_SLUG_ALIASES: Record<string, string> = {
  super: "abarrotes-pilot",
};

export async function getStoreBySlug(slug: string) {
  const normalizedSlug = slug.toLowerCase();
  const resolvedSlug = STORE_SLUG_ALIASES[normalizedSlug] || normalizedSlug;
  // #region debug-point A:getStoreBySlug-entry
  (() => { try { const fs = require("fs"); let u = "http://127.0.0.1:7777/event", s = "staging-super-404"; try { const e = fs.readFileSync(".dbg/staging-super-404.env", "utf8"); u = e.match(/DEBUG_SERVER_URL=(.+)/)?.[1] || u; s = e.match(/DEBUG_SESSION_ID=(.+)/)?.[1] || s; } catch {} fetch(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: s, runId: "post-fix", hypothesisId: "A", location: "getStoreBySlug.ts:9", msg: "[DEBUG] getStoreBySlug entry", data: { slug: normalizedSlug, resolvedSlug }, ts: Date.now() }) }).catch(() => {}); } catch {} })();
  // #endregion
  const exactId = await client.fetch<string | null>(
    `*[_type == "affiliateStore" && slug.current == $slug][0]._id`,
    { slug: resolvedSlug }
  );
  // #region debug-point B:getStoreBySlug-exact
  (() => { try { const fs = require("fs"); let u = "http://127.0.0.1:7777/event", s = "staging-super-404"; try { const e = fs.readFileSync(".dbg/staging-super-404.env", "utf8"); u = e.match(/DEBUG_SERVER_URL=(.+)/)?.[1] || u; s = e.match(/DEBUG_SESSION_ID=(.+)/)?.[1] || s; } catch {} fetch(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: s, runId: "post-fix", hypothesisId: "B", location: "getStoreBySlug.ts:16", msg: "[DEBUG] getStoreBySlug exact lookup", data: { slug: normalizedSlug, resolvedSlug, exactId: exactId || null }, ts: Date.now() }) }).catch(() => {}); } catch {} })();
  // #endregion
  if (exactId) return getStoreById(exactId);

  // ponytail: keeps existing stores live until their editable slugs are saved in Sanity.
  const legacyStores = await client.fetch<Array<{ _id: string; name?: string }>>(
    `*[_type == "affiliateStore" && !defined(slug.current)]{ _id, name }`
  );
  const legacyStore = legacyStores.find(
    (store) => slugifyStoreName(store.name || "") === resolvedSlug
  );
  // #region debug-point C:getStoreBySlug-legacy
  (() => { try { const fs = require("fs"); let u = "http://127.0.0.1:7777/event", s = "staging-super-404"; try { const e = fs.readFileSync(".dbg/staging-super-404.env", "utf8"); u = e.match(/DEBUG_SERVER_URL=(.+)/)?.[1] || u; s = e.match(/DEBUG_SESSION_ID=(.+)/)?.[1] || s; } catch {} fetch(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: s, runId: "post-fix", hypothesisId: "C", location: "getStoreBySlug.ts:27", msg: "[DEBUG] getStoreBySlug legacy lookup", data: { slug: normalizedSlug, resolvedSlug, legacyMatchId: legacyStore?._id || null }, ts: Date.now() }) }).catch(() => {}); } catch {} })();
  // #endregion
  return legacyStore ? getStoreById(legacyStore._id) : null;
}
