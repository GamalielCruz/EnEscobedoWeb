import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { writeClient } from "@/sanity/lib/client";
import { isAdminUser } from "@/lib/admin";

const OWNED_STORES_QUERY = `*[_type == "affiliateStore" && ownerClerkUserId == $userId] { _id }`;
const PRODUCT_STORE_QUERY = `*[_type == "product" && _id == $productId][0]{
  _id,
  "storeId": affiliateStore._ref
}`;
const STORE_CATEGORY_IDS_QUERY = `*[_type == "category" && _id in $categoryIds &&
  (affiliateStore._ref == $storeId ||
    _id in *[_type == "product" && affiliateStore._ref == $storeId].categories[]._ref)
]._id`;

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get("storeId");
    const includeRejected = searchParams.get("includeRejected") === "true";
    const statusParam = searchParams.get("status");

    const allowedStatuses = ["pending", "approved", "rejected"] as const;
    const requestedStatuses = statusParam
      ? statusParam
          .split(",")
          .map((status) => status.trim())
          .filter((status): status is (typeof allowedStatuses)[number] =>
            allowedStatuses.includes(status as (typeof allowedStatuses)[number])
          )
      : includeRejected
        ? ["pending", "rejected"]
        : ["pending"];

    const isAdmin = isAdminUser(userId);
    const ownedStores = await writeClient.fetch<{ _id: string }[]>(OWNED_STORES_QUERY, {
      userId,
    });
    const ownedStoreIds = ownedStores?.map((store) => store._id) ?? [];
    if (storeId && !isAdmin && !ownedStoreIds.includes(storeId)) {
      return NextResponse.json({ error: "No tienes permiso para esta tienda", requestId }, { status: 403 });
    }

    const statusFilter =
      requestedStatuses.length === 1
        ? `status == '${requestedStatuses[0]}'`
        : `status in [${requestedStatuses.map((status) => `'${status}'`).join(", ")}]`;
    const storeFilter = storeId
      ? ` && product->affiliateStore._ref == $storeId`
      : isAdmin ? "" : ` && product->affiliateStore._ref in $ownedStoreIds`;
    const query = `*[_type == "productUpdateRequest" && ${statusFilter}${storeFilter}]{
      _id,
      product->{_id, name, affiliateStore->{_id, name}},
      changes,
      submittedBy,
      submittedAt,
      status,
      rejectionReason
    } | order(submittedAt desc)`;
    console.log("[product-update-requests GET] Fetching with query:", query);
    const items = await writeClient.fetch(query, storeId ? { storeId } : isAdmin ? {} : { ownedStoreIds });
    console.log("[product-update-requests GET] Found items:", items.length);
    return NextResponse.json({ success: true, items: items ?? [], requestId }, {
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
  } catch (e) {
    console.error("[product-update-requests GET]", { requestId, error: e });
    return NextResponse.json({ error: "Error cargando solicitudes", requestId }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const body = await request.json();
    const { productId, changes } = body;
    if (!productId || !changes) return NextResponse.json({ error: "productId y changes son requeridos" }, { status: 400 });

    const product = await writeClient.fetch<{ _id: string; storeId?: string } | null>(
      PRODUCT_STORE_QUERY,
      { productId }
    );
    if (!product) {
      return NextResponse.json({ error: "Producto no encontrado", requestId }, { status: 404 });
    }

    const ownedStores = await writeClient.fetch<{ _id: string }[]>(OWNED_STORES_QUERY, {
      userId,
    });
    const ownsStore = ownedStores?.some((store) => store._id === product.storeId);
    if (!ownsStore) {
      return NextResponse.json({ error: "No tienes permiso para este producto", requestId }, { status: 403 });
    }

    if (Array.isArray(changes.categories)) {
      const categoryIds = [...new Set(changes.categories.map((category: { _ref?: string }) => category?._ref).filter(Boolean))];
      const allowedIds = await writeClient.fetch<string[]>(STORE_CATEGORY_IDS_QUERY, {
        storeId: product.storeId,
        categoryIds,
      });
      if (categoryIds.length !== changes.categories.length || allowedIds.length !== categoryIds.length) {
        return NextResponse.json({ error: "Una categoría no pertenece a esta tienda", requestId }, { status: 400 });
      }
    }

    console.log("[product-update-requests POST] Creating request for product:", productId);
    console.log("[product-update-requests POST] Changes:", changes);

    const doc: any = {
      _type: "productUpdateRequest",
      product: { _type: "reference", _ref: productId },
      changes,
      status: "pending",
      submittedBy: userId,
      submittedAt: new Date().toISOString(),
    };

    console.log("[product-update-requests POST] Doc to create:", JSON.stringify(doc, null, 2));

    const created = await writeClient.create(doc);
    console.log("[product-update-requests POST] Created successfully:", created._id);
    return NextResponse.json({ success: true, request: created, requestId });
  } catch (e) {
    console.error("[product-update-requests POST] Error:", { requestId, error: e });
    return NextResponse.json({ error: "Error creando solicitud", requestId }, { status: 500 });
  }
}
