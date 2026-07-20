import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
export const dynamic = "force-dynamic";
import { writeClient } from "@/sanity/lib/client";

const CATEGORIES_QUERY = `*[
  _type == "category" &&
  _id in *[_type == "product" && affiliateStore._ref == $storeId].categories[]._ref
] | order(title asc) {
  _id,
  title,
  "slug": slug.current,
  description
}`;

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const storeId = request.nextUrl.searchParams.get("storeId");
    if (!storeId) return NextResponse.json({ error: "storeId requerido" }, { status: 400 });

    const ownsStore = await writeClient.fetch<boolean>(
      `count(*[_type == "affiliateStore" && _id == $storeId && ownerClerkUserId == $userId]) > 0`,
      { storeId, userId }
    );
    if (!ownsStore) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

    const categories = await writeClient.fetch(CATEGORIES_QUERY, { storeId });
    return NextResponse.json({ success: true, categories: categories ?? [] });
  } catch (e) {
    console.error("[dashboard/categories GET]", e);
    return NextResponse.json(
      { error: "Error al cargar categorías" },
      { status: 500 }
    );
  }
}
