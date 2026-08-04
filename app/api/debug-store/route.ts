import { NextRequest, NextResponse } from "next/server";
import { client } from "@/sanity/lib/client";
import { sanityFetch } from "@/sanity/lib/live";
import { defineQuery } from "next-sanity";
import { getStoreBySlug } from "@/sanity/lib/products/getStoreBySlug";
import { getStoreById } from "@/sanity/lib/products/getStoreById";
import { getProductsByStore } from "@/sanity/lib/products/getProductsByStore";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug") || "hornea";

  const results: Record<string, unknown> = {
    slug,
    env: {
      VERCEL_ENV: process.env.VERCEL_ENV,
      NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
      SANITY_DATASET: process.env.NEXT_PUBLIC_SANITY_DATASET,
      SANITY_PROJECT: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
      HAS_READ_TOKEN: !!process.env.SANITY_API_READ_TOKEN,
      HAS_WRITE_TOKEN: !!process.env.SANITY_API_TOKEN,
    },
  };

  // 1. Direct client.fetch for slug lookup
  try {
    const exactId = await client.fetch<string | null>(
      `*[_type == "affiliateStore" && slug.current == $slug][0]._id`,
      { slug }
    );
    results.step1_exactId = exactId;
  } catch (e) {
    results.step1_error = String(e);
  }

  // 2. All stores via client
  try {
    const all = await client.fetch<Array<{ _id: string; name?: string; slugCurrent?: string }>>(
      `*[_type == "affiliateStore"]{_id, name, "slugCurrent": slug.current}`
    );
    results.step2_allStores = all;
  } catch (e) {
    results.step2_error = String(e);
  }

  // 3. sanityFetch test
  try {
    const Q = defineQuery(`*[_type == "affiliateStore"][0]._id`);
    const r = await sanityFetch({ query: Q });
    results.step3_sanityFetch_firstId = r.data;
  } catch (e) {
    results.step3_sanityFetch_error = String(e);
  }

  // 4. Full getStoreBySlug
  try {
    const store = await getStoreBySlug(slug);
    results.step4_getStoreBySlug = store ? { _id: store._id, name: store.name } : null;

    // 5. getStoreById with the found id
    if (store) {
      try {
        const storeById = await getStoreById(store._id);
        results.step5_getStoreById = storeById ? { _id: storeById._id, name: storeById.name } : null;
      } catch (e) {
        results.step5_getStoreById_error = String(e);
      }

      // 6. getProductsByStore
      try {
        const { products } = await getProductsByStore(store._id);
        results.step6_productsCount = products.length;
      } catch (e) {
        results.step6_products_error = String(e);
      }
    }
  } catch (e) {
    results.step4_error = String(e);
  }

  return NextResponse.json(results);
}
