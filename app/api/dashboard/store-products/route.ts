import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { client, writeClient } from "@/sanity/lib/client";

const OWNED_STORES_QUERY = `*[_type == "affiliateStore" && ownerClerkUserId == $userId] { _id }`;
const PRODUCTS_QUERY = `*[_type == "product" && affiliateStore._ref == $storeId] | order(name asc) {
  _id,
  name,
  "slug": slug.current,
  price,
  stock,
  description,
  image,
  categories[]->{ _id, title },
  optionGroups,
  approvalStatus,
  isVisible,
  pendingChanges,
  rejectionReason,
  affiliateStore->{ _id, name }
}`;

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get("storeId");
    if (!storeId) {
      return NextResponse.json({ error: "storeId requerido" }, { status: 400 });
    }

    // Use writeClient to ensure fresh data (no CDN cache)
    const ownedStores = await writeClient.fetch<{ _id: string }[]>(OWNED_STORES_QUERY, {
      userId,
    });
    const ownsStore = ownedStores?.some((s) => s._id === storeId);
    if (!ownsStore) {
      return NextResponse.json({ error: "No tienes permiso para esta tienda" }, { status: 403 });
    }

    const products = await writeClient.fetch(PRODUCTS_QUERY, { storeId });
    console.log(`[store-products GET] Fetched ${products?.length ?? 0} products for store ${storeId}`);
    return NextResponse.json({ success: true, products: products ?? [] }, {
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
  } catch (e) {
    console.error("[dashboard/store-products GET]", e);
    return NextResponse.json({ error: "Error al cargar productos" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const { name, price, description, storeId, stock, categories, optionGroups, image } = body;

    if (!name || price == null || !storeId) {
      return NextResponse.json(
        { error: "Nombre, precio y storeId son requeridos" },
        { status: 400 }
      );
    }

    const ownedStores = await writeClient.fetch<{ _id: string }[]>(OWNED_STORES_QUERY, {
      userId,
    });
    const ownsStore = ownedStores?.some((s) => s._id === storeId);
    if (!ownsStore) {
      return NextResponse.json({ error: "No tienes permiso para esta tienda" }, { status: 403 });
    }

    const slugBase = name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const slugCurrent = `${slugBase}-${Date.now().toString(36)}`;

    // Create product as pending for approval (store pending changes separately)
    const productDoc: any = {
      _type: "product",
      name: String(name).trim(),
      price: Number(price),
      slug: { _type: "slug", current: slugCurrent },
      affiliateStore: { _type: "reference", _ref: storeId },
      stock: stock != null ? Number(stock) : undefined,
      approvalStatus: "pending",
      submittedBy: userId,
      submittedAt: new Date().toISOString(),
      isVisible: false,
      ...(description && {
        description: [
          {
            _type: "block",
            _key: `desc-${Date.now()}`,
            style: "normal",
            children: [{ _type: "span", _key: "span", text: String(description) }],
            markDefs: [],
          },
        ],
      }),
    };

    // Añadir categorías si existen
    if (categories && Array.isArray(categories) && categories.length > 0) {
      productDoc.categories = categories.map((catId: string) => ({
        _type: "reference",
        _ref: catId,
        _key: `cat-${catId}-${Date.now()}`,
      }));
    }

    // Añadir grupos de opciones si existen
    if (optionGroups && Array.isArray(optionGroups) && optionGroups.length > 0) {
      productDoc.optionGroups = optionGroups.map((group: any, idx: number) => ({
        _type: "optionGroup",
        _key: group._key || `group-${idx}-${Date.now()}`,
        title: group.title,
        description: group.description || undefined,
        required: group.required || false,
        selectionType: group.selectionType || "single",
        options: group.options?.map((opt: any, optIdx: number) => ({
          _type: "option",
          _key: opt._key || `opt-${idx}-${optIdx}-${Date.now()}`,
          label: opt.label,
          description: opt.description || undefined,
          priceDelta: opt.priceDelta != null ? Number(opt.priceDelta) : 0,
          isDefault: opt.isDefault || false,
        })) || [],
      }));
    }

    // Añadir imagen si existe (el cliente debe subir primero el asset)
    if (image) {
      productDoc.image = image;
    }

    const created = await writeClient.create(productDoc);
    return NextResponse.json({ success: true, product: created });
  } catch (e) {
    console.error("[dashboard/store-products POST]", e);
    return NextResponse.json({ error: "Error al crear producto" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json();
    console.log('[dashboard/store-products PATCH] incoming body:', JSON.stringify(body));
    const { productId, name, price, description, storeId, stock, categories, optionGroups, image } = body;

    if (!productId || !storeId) {
      return NextResponse.json({ error: "productId y storeId son requeridos" }, { status: 400 });
    }

    const ownedStores = await client.fetch<{ _id: string }[]>(OWNED_STORES_QUERY, {
      userId,
    });
    const ownsStore = ownedStores?.some((s) => s._id === storeId);
    if (!ownsStore) {
      return NextResponse.json({ error: "No tienes permiso para esta tienda" }, { status: 403 });
    }

    // Verificar que el producto pertenece a la tienda
    const existing = await client.fetch(
      `*[_type == "product" && _id == $productId]{ _id, "storeRef": affiliateStore._ref }[0]`,
      { productId }
    );
    if (!existing) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }
    if (existing.storeRef !== storeId) {
      return NextResponse.json({ error: "El producto no pertenece a esa tienda" }, { status: 403 });
    }

    // Instead of applying changes immediately, save them under `pendingChanges`
    const pending: any = {};
    if (name != null) pending.name = String(name).trim();
    if (price != null) pending.price = Number(price);
    if (stock != null) pending.stock = Number(stock);
    if (description != null) pending.description = [
      {
        _type: "block",
        _key: `desc-${Date.now()}`,
        style: "normal",
        children: [{ _type: "span", _key: "span", text: String(description) }],
        markDefs: [],
      },
    ];
    if (image != null) pending.image = image;
    if (categories != null) {
      pending.categories = Array.isArray(categories) && categories.length > 0
        ? categories.map((catId: string) => ({ _type: "reference", _ref: catId, _key: `cat-${catId}-${Date.now()}` }))
        : [];
    }
    if (optionGroups != null) {
      pending.optionGroups = Array.isArray(optionGroups) && optionGroups.length > 0
        ? optionGroups.map((group: any, idx: number) => ({
            _type: "optionGroup",
            _key: group._key || `group-${idx}-${Date.now()}`,
            title: group.title,
            description: group.description || undefined,
            required: group.required || false,
            selectionType: group.selectionType || "single",
            options:
              group.options?.map((opt: any, optIdx: number) => ({
                _type: "option",
                _key: opt._key || `opt-${idx}-${optIdx}-${Date.now()}`,
                label: opt.label,
                description: opt.description || undefined,
                priceDelta: opt.priceDelta != null ? Number(opt.priceDelta) : 0,
                isDefault: opt.isDefault || false,
              })) || [],
          }))
        : [];
    }

    const patch = writeClient.patch(productId as string).set({
      pendingChanges: pending,
      approvalStatus: "pending",
      submittedBy: userId,
      submittedAt: new Date().toISOString(),
    });

    const updated = await patch.commit();
    console.log('[dashboard/store-products PATCH] updated doc id:', updated._id, 'approvalStatus:', updated.approvalStatus, 'hasPendingChanges:', !!updated.pendingChanges);
    return NextResponse.json({ success: true, product: updated });
  } catch (e) {
    console.error("[dashboard/store-products PATCH]", e);
    return NextResponse.json({ error: "Error al actualizar producto" }, { status: 500 });
  }
}
