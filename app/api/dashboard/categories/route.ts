import { NextRequest, NextResponse } from "next/server";
import { client } from "@/sanity/lib/client";

const CATEGORIES_QUERY = `*[_type == "category"] | order(title asc) {
  _id,
  title,
  "slug": slug.current,
  description
}`;

export async function GET(request: NextRequest) {
  try {
    const categories = await client.fetch(CATEGORIES_QUERY);
    return NextResponse.json({ success: true, categories: categories ?? [] });
  } catch (e) {
    console.error("[dashboard/categories GET]", e);
    return NextResponse.json(
      { error: "Error al cargar categorías" },
      { status: 500 }
    );
  }
}
