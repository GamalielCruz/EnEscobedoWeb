import { NextResponse } from "next/server";
import { createClient } from "@sanity/client";

const sanityClient = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET!,
  useCdn: false,
  apiVersion: "2024-07-25",
  token: process.env.SANITY_API_READ_TOKEN!,
});

const ABARROTES_STORE_ID = "abarrotes-pilot";

export async function GET() {
  try {
    // Find the store _id by storeId field
    const store = await sanityClient.fetch<{ _id: string } | null>(
      `*[_type == "affiliateStore" && (storeId == $sid || slug.current == $sid)][0]{ _id }`,
      { sid: ABARROTES_STORE_ID }
    );

    if (!store) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    const products = await sanityClient.fetch<
      Array<{
        _id: string;
        name?: string;
        hasImage: boolean;
        categories?: Array<{ _id: string; title?: string; name?: string }>;
      }>
    >(
      `*[_type == "product" && affiliateStore._ref == $storeId] | order(name asc) {
        _id,
        name,
        "hasImage": defined(image.asset),
        categories[]->{ _id, title, name }
      }`,
      { storeId: store._id }
    );

    return NextResponse.json(products);
  } catch (err) {
    console.error("[bulk-images-list]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
