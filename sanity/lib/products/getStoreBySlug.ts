import { client } from "@/sanity/lib/client";
import { slugifyStoreName } from "@/lib/store-url";
import { getStoreById } from "./getStoreById";

export async function getStoreBySlug(slug: string) {
  const normalizedSlug = slug.toLowerCase();
  const exactId = await client.fetch<string | null>(
    `*[_type == "affiliateStore" && slug.current == $slug][0]._id`,
    { slug: normalizedSlug }
  );
  if (exactId) return getStoreById(exactId);

  // ponytail: keeps existing stores live until their editable slugs are saved in Sanity.
  const legacyStores = await client.fetch<Array<{ _id: string; name?: string }>>(
    `*[_type == "affiliateStore" && !defined(slug.current)]{ _id, name }`
  );
  const legacyStore = legacyStores.find(
    (store) => slugifyStoreName(store.name || "") === normalizedSlug
  );
  return legacyStore ? getStoreById(legacyStore._id) : null;
}
