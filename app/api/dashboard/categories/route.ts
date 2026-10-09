import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
export const dynamic = "force-dynamic";
import { writeClient } from "@/sanity/lib/client";

const CATEGORIES_QUERY = `*[
  _type == "category" &&
  (affiliateStore._ref == $storeId ||
    _id in *[_type == "product" && affiliateStore._ref == $storeId].categories[]._ref)
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

    const [categories, categoryOrder] = await Promise.all([
      writeClient.fetch(CATEGORIES_QUERY, { storeId }),
      writeClient.fetch<string[]>(
        `*[_type == "affiliateStore" && _id == $storeId][0].categoryOrder[]._ref`,
        { storeId }
      ),
    ]);
    return NextResponse.json({ success: true, categories: categories ?? [], categoryOrder: categoryOrder ?? [] });
  } catch (e) {
    console.error("[dashboard/categories GET]", e);
    return NextResponse.json(
      { error: "Error al cargar categorías" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { storeId, categoryIds } = await request.json();
    if (!storeId || !Array.isArray(categoryIds) || categoryIds.some((id) => typeof id !== "string" || !id)) {
      return NextResponse.json({ error: "Tienda y orden de categorías requeridos" }, { status: 400 });
    }
    if (new Set(categoryIds).size !== categoryIds.length) {
      return NextResponse.json({ error: "El orden contiene categorías repetidas" }, { status: 400 });
    }

    const ownsStore = await writeClient.fetch<boolean>(
      `count(*[_type == "affiliateStore" && _id == $storeId && ownerClerkUserId == $userId]) > 0`,
      { storeId, userId }
    );
    if (!ownsStore) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

    const validIds = await writeClient.fetch<string[]>(
      `*[_type == "category" && _id in $categoryIds &&
        (affiliateStore._ref == $storeId ||
          _id in *[_type == "product" && affiliateStore._ref == $storeId].categories[]._ref)
      ]._id`,
      { storeId, categoryIds }
    );
    if (validIds.length !== categoryIds.length) {
      return NextResponse.json({ error: "Una categoría no pertenece a esta tienda" }, { status: 400 });
    }

    const references = categoryIds.map((id: string, index: number) => ({
      _type: "reference",
      _ref: id,
      _key: `category-${index}`,
    }));
    await writeClient.patch(storeId).set({ categoryOrder: references }).commit();
    revalidatePath("/");
    revalidatePath("/dashboard");
    revalidatePath(`/store/${storeId}`);
    return NextResponse.json({ success: true, categoryOrder: categoryIds });
  } catch (e) {
    console.error("[dashboard/categories PATCH]", e);
    return NextResponse.json({ error: "Error al guardar el orden de categorías" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { storeId, title } = await request.json();
    const cleanTitle = String(title ?? "").trim();
    if (!storeId || !cleanTitle) {
      return NextResponse.json({ error: "Tienda y nombre requeridos" }, { status: 400 });
    }
    if (cleanTitle.length > 60) {
      return NextResponse.json({ error: "El nombre es demasiado largo" }, { status: 400 });
    }

    const ownsStore = await writeClient.fetch<boolean>(
      `count(*[_type == "affiliateStore" && _id == $storeId && ownerClerkUserId == $userId]) > 0`,
      { storeId, userId }
    );
    if (!ownsStore) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

    const existing = await writeClient.fetch<{ _id: string; title: string } | null>(
      `*[_type == "category" && lower(title) == $title &&
        (affiliateStore._ref == $storeId ||
          _id in *[_type == "product" && affiliateStore._ref == $storeId].categories[]._ref)
      ][0]{ _id, title }`,
      { storeId, title: cleanTitle.toLocaleLowerCase("es-MX") }
    );
    if (existing) return NextResponse.json({ success: true, category: existing });

    const slug = cleanTitle
      .toLocaleLowerCase("es-MX")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const category = await writeClient.create({
      _type: "category",
      title: cleanTitle,
      slug: { _type: "slug", current: `${slug}-${Date.now().toString(36)}` },
      affiliateStore: { _type: "reference", _ref: storeId },
    });

    return NextResponse.json({ success: true, category }, { status: 201 });
  } catch (e) {
    console.error("[dashboard/categories POST]", e);
    return NextResponse.json({ error: "Error al crear categoría" }, { status: 500 });
  }
}
