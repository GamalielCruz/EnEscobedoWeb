import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@sanity/client";

const sanityClient = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET!,
  useCdn: false,
  apiVersion: "2024-07-25",
  token: process.env.SANITY_API_TOKEN!,
});

const OFF_HEADERS = { "User-Agent": "ElMenu/1.0 (hola@elmenu.site)" };

async function searchOFF(query: string): Promise<string | null> {
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=5&fields=product_name,image_front_url,image_url`;
  try {
    const res = await fetch(url, {
      headers: OFF_HEADERS,
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      products?: Array<{ image_front_url?: string; image_url?: string }>;
    };
    for (const p of data.products ?? []) {
      const img = p.image_front_url || p.image_url;
      if (img) return img;
    }
  } catch {
    // timeout or network error — skip
  }
  return null;
}

// Strip common suffixes: sizes (1L, 500g, 1kg…), pack counts (6 pzas),
// presentation words, and then progressively shorten to improve recall.
function buildSearchVariants(name: string, categoryName?: string): string[] {
  const variants: string[] = [];

  // 1. Original name
  variants.push(name);

  // 2. Remove size/weight/count tokens (e.g. "1L", "500 ml", "6 pzas", "1 kg")
  const stripped = name
    .replace(/\b\d+(\.\d+)?\s*(ml|l|kg|g|gr|mg|oz|lt|pzas?|piezas?|pack|pk|ct)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (stripped && stripped !== name) variants.push(stripped);

  // 3. First 3 words of stripped name
  const words = stripped.split(/\s+/).filter(Boolean);
  if (words.length > 3) variants.push(words.slice(0, 3).join(" "));

  // 4. First 2 words
  if (words.length > 2) variants.push(words.slice(0, 2).join(" "));

  // 5. Category fallback (generic product image)
  if (categoryName) variants.push(categoryName);

  // Deduplicate while preserving order
  return [...new Set(variants.map((v) => v.trim()).filter(Boolean))];
}

async function findImageUrl(
  productName: string,
  categoryName?: string
): Promise<string | null> {
  for (const query of buildSearchVariants(productName, categoryName)) {
    const img = await searchOFF(query);
    if (img) return img;
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const { productId, productName, categoryName } = await req.json() as {
      productId?: string;
      productName?: string;
      categoryName?: string;
    };

    if (!productId || !productName) {
      return NextResponse.json({ error: "Missing productId or productName" }, { status: 400 });
    }

    const imageUrl = await findImageUrl(productName, categoryName);
    if (!imageUrl) {
      return NextResponse.json({ error: "No image found in Open Food Facts" }, { status: 404 });
    }

    // Download the image
    const imgRes = await fetch(imageUrl, {
      headers: { "User-Agent": "ElMenu/1.0 (hola@elmenu.site)" },
      signal: AbortSignal.timeout(15000),
    });
    if (!imgRes.ok) {
      return NextResponse.json({ error: `Image download failed: ${imgRes.status}` }, { status: 502 });
    }

    const contentType = imgRes.headers.get("content-type") || "image/jpeg";
    const buffer = Buffer.from(await imgRes.arrayBuffer());

    // Upload to Sanity
    const asset = await sanityClient.assets.upload("image", buffer, {
      filename: `product-${productId}.jpg`,
      contentType,
    });

    // Patch the product
    await sanityClient
      .patch(productId)
      .set({
        image: {
          _type: "image",
          asset: { _type: "reference", _ref: asset._id },
        },
      })
      .commit({ autoGenerateArrayKeys: true });

    return NextResponse.json({ ok: true, assetId: asset._id, imageUrl });
  } catch (err) {
    console.error("[bulk-upload-image]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
