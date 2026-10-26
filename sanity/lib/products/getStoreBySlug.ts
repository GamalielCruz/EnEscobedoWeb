import { client } from "@/sanity/lib/client";
import { slugifyStoreName } from "@/lib/store-url";
import { getStoreById } from "./getStoreById";

const STORE_SLUG_ALIASES: Record<string, string> = {
  super: "abarrotes-pilot",
};

export async function getStoreBySlug(slug: string) {
  const normalizedSlug = slug.toLowerCase().trim();
  const resolvedSlug = STORE_SLUG_ALIASES[normalizedSlug] || normalizedSlug;

  // 1. Exact slug.current match
  const exactId = await client.fetch<string | null>(
    `*[_type == "affiliateStore" && slug.current == $slug][0]._id`,
    { slug: resolvedSlug }
  );

  if (exactId) return getStoreById(exactId);

  // 2. Legacy: stores without slug.current — match by slugified name
  const legacyStores = await client.fetch<Array<{ _id: string; name?: string }>>(
    `*[_type == "affiliateStore" && !defined(slug.current)]{ _id, name }`
  );

  const legacyStore = legacyStores.find(
    (store) => slugifyStoreName(store.name || "") === resolvedSlug
  );

  if (legacyStore) return getStoreById(legacyStore._id);

  // 3. Broad fallback: any store whose slugified name matches, regardless of slug field
  const allStores = await client.fetch<Array<{ _id: string; name?: string; slug?: { current?: string } }>>(
    `*[_type == "affiliateStore"]{ _id, name, "slugCurrent": slug.current }`
  );

  const fallbackStore = allStores.find(
    (store) => slugifyStoreName(store.name || "") === resolvedSlug
  );

  return fallbackStore ? getStoreById(fallbackStore._id) : null;
}
