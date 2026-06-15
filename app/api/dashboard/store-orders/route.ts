import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "next-sanity";

const OWNED_STORES_QUERY = `*[_type == "affiliateStore" && ownerClerkUserId == $userId] { _id }`;
const ORDERS_BASE_FILTER = `
  !(_id in path('drafts.**')) && _type == "order" && (pickupStore._ref == $storeId || affiliateStore._ref == $storeId)
`;
const ORDER_PROJECTION = `{
  _id,
  _type,
  orderNumber,
  pickupCode,
  "customerInfo": { "name": customerName, "email": email, "clerkUserId": clerkUserId, "phone": phone },
  "deliveryAddress": shippingAddress,
  "storeInfo": { 
    "storeId": coalesce(pickupStore._ref, affiliateStore._ref), 
    "storeName": coalesce(pickupStore->name, affiliateStore->name), 
    "storeAddress": coalesce(pickupStore->address.street, affiliateStore->address.street), 
    "storePhone": coalesce(pickupStore->contact.phone, affiliateStore->contact.phone) 
  },
  "items": products[]{ 
    _key, 
    "productName": product->name,
    "productId": product->_id,
    "quantity": quantity, 
    "price": product->price,
    "productOptionGroups": product->optionGroups[]{
      title
    },
    "customizations": customizations[]{
      _key,
      title,
      "options": options[]{
        _key,
        label,
        priceDelta
      }
    },
    notes
  },
  "totalAmount": totalPrice,
  paymentMethod,
  status,
  estimatedPickupDate,
  readyAt,
  pickedUpAt,
  "notes": deliveryNotes,
  "createdAt": orderDate,
  "deliveryMethod": select(orderType == "pickup" => "click_collect", "home_delivery"),
  updatedAt
}`;
const ALL_ORDERS_QUERY = `*[${ORDERS_BASE_FILTER}] | order(orderDate desc) ${ORDER_PROJECTION}`;
const TODAY_ORDERS_QUERY = `*[
  ${ORDERS_BASE_FILTER}
  && orderDate >= $startAt
  && orderDate < $endAt
] | order(orderDate desc) ${ORDER_PROJECTION}`;
const HISTORY_ORDERS_QUERY = `*[
  ${ORDERS_BASE_FILTER}
  && orderDate < $beforeAt
] | order(orderDate desc) [0...100] ${ORDER_PROJECTION}`;
const ORDER_BY_NUMBER = `*[_type == "order" && orderNumber == $orderNumber][0]`;

function isValidIsoDate(value: string | null) {
  if (!value) return false;
  return !Number.isNaN(Date.parse(value));
}

function getSanityClients() {
  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET;
  const apiVersion = process.env.NEXT_PUBLIC_SANITY_API_VERSION || "2024-07-25";

  if (!projectId || !dataset) {
    return {
      error: {
        message: "Missing Sanity environment variables",
        projectId: !!projectId,
        dataset: !!dataset,
      },
    };
  }

  const base = {
    projectId,
    dataset,
    apiVersion,
    perspective: "published" as const,
  };

  return {
    client: createClient({ ...base, useCdn: false }),
    readClient: createClient({
      ...base,
      useCdn: true,
      token: process.env.SANITY_API_READ_TOKEN,
    }),
    writeClient: createClient({
      ...base,
      useCdn: false,
      token: process.env.SANITY_API_TOKEN,
    }),
  };
}

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const storeIdRaw = searchParams.get("storeId");
    const scope = searchParams.get("scope") ?? "all";
    const startAt = searchParams.get("startAt");
    const endAt = searchParams.get("endAt");
    const beforeAt = searchParams.get("beforeAt");
    const storeId =
      storeIdRaw && storeIdRaw.trim() !== "" && storeIdRaw !== "null" && storeIdRaw !== "undefined"
        ? storeIdRaw
        : null;
    if (!storeId) {
      return NextResponse.json({ error: "storeId requerido" }, { status: 400 });
    }

    if (scope === "today" && (!isValidIsoDate(startAt) || !isValidIsoDate(endAt))) {
      return NextResponse.json({ error: "startAt y endAt validos son requeridos para scope=today" }, { status: 400 });
    }

    if (scope === "history" && !isValidIsoDate(beforeAt)) {
      return NextResponse.json({ error: "beforeAt valido es requerido para scope=history" }, { status: 400 });
    }

    const sanity = getSanityClients();
    if ("error" in sanity) {
      return NextResponse.json(
        { error: "Error al cargar pedidos", details: sanity.error },
        { status: 500 }
      );
    }

    const readSanity =
      process.env.SANITY_API_READ_TOKEN ? sanity.readClient : process.env.SANITY_API_TOKEN ? sanity.writeClient : sanity.client;

    const ownedStores = await readSanity.fetch<{ _id: string }[]>(OWNED_STORES_QUERY, {
      userId,
    });
    const ownsStore = ownedStores?.some((s) => s._id === storeId);
    if (!ownsStore) {
      return NextResponse.json({ error: "No tienes permiso para esta tienda" }, { status: 403 });
    }

    const query =
      scope === "today"
        ? TODAY_ORDERS_QUERY
        : scope === "history"
          ? HISTORY_ORDERS_QUERY
          : ALL_ORDERS_QUERY;

    const queryParams: Record<string, string> = { storeId };

    if (scope === "today" && startAt && endAt) {
      queryParams.startAt = startAt;
      queryParams.endAt = endAt;
    }

    if (scope === "history" && beforeAt) {
      queryParams.beforeAt = beforeAt;
    }

    const orders = await readSanity.fetch(query, queryParams);

    return NextResponse.json({ success: true, orders: orders ?? [] }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
      }
    });
  } catch (e) {
    console.error("[dashboard/store-orders GET]", e);
    const baseError =
      e instanceof Error
        ? {
            name: e.name,
            message: e.message,
            stack: e.stack,
          }
        : { message: String(e) };

    const statusCode =
      typeof e === "object" && e !== null && typeof (e as { statusCode?: unknown }).statusCode === "number"
        ? (e as { statusCode: number }).statusCode
        : undefined;
    const status =
      typeof e === "object" && e !== null && typeof (e as { status?: unknown }).status === "number"
        ? (e as { status: number }).status
        : undefined;

    return NextResponse.json(
      {
        error: "Error al cargar pedidos",
        details: {
          ...baseError,
          ...(statusCode ? { statusCode } : {}),
          ...(status ? { status } : {}),
        },
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const { orderNumber, status } = body;

    if (!orderNumber || !status) {
      return NextResponse.json(
        { error: "orderNumber y status son requeridos" },
        { status: 400 }
      );
    }

    const sanity = getSanityClients();
    if ("error" in sanity) {
      return NextResponse.json(
        { error: "Error al actualizar pedido", details: sanity.error },
        { status: 500 }
      );
    }

    if (!process.env.SANITY_API_TOKEN) {
      return NextResponse.json(
        {
          error: "Error al actualizar pedido",
          details: { message: "Missing SANITY_API_TOKEN" },
        },
        { status: 500 }
      );
    }

    const order = await sanity.client.fetch(ORDER_BY_NUMBER, { orderNumber });
    if (!order) {
      return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
    }

    const ownedStores = await sanity.writeClient.fetch<{ _id: string }[]>(OWNED_STORES_QUERY, {
      userId,
    });
    
    // Extraer storeId del documento order
    const storeId = order.pickupStore?._ref || order.affiliateStore?._ref;

    const ownsStore = ownedStores?.some((s) => s._id === storeId);
    if (!ownsStore) {
      console.error("[dashboard/store-orders PATCH] Store ownership check failed:", { storeId, ownedStores });
      return NextResponse.json({ error: "No tienes permiso para esta orden o tienda no identificada" }, { status: 403 });
    }

    const updateData: Record<string, unknown> = {
      status,
      updatedAt: new Date().toISOString(),
    };
    if (status === "ready_for_pickup" && !order.readyAt) {
      updateData.readyAt = new Date().toISOString();
      updateData.pickupStatus = "ready_for_pickup";
    } else if (status === "picked_up" && !order.pickedUpAt) {
      updateData.pickedUpAt = new Date().toISOString();
      updateData.pickupStatus = "picked_up";
    } else if (status === "completed" && !order.pickedUpAt) {
      updateData.pickedUpAt = new Date().toISOString();
      updateData.pickupStatus = "picked_up";
    } else if (status === "delivered" && !order.deliveredAt) {
      updateData.deliveredAt = new Date().toISOString();
    } else if (status === "cancelled") {
      updateData.pickupStatus = "expired";
    }

    const updated = await sanity.writeClient.patch(order._id).set(updateData).commit();

    return NextResponse.json({
      success: true,
      data: {
        orderId: updated._id,
        orderNumber,
        status,
        updatedAt: updateData.updatedAt,
      },
    });
  } catch (e) {
    console.error("[dashboard/store-orders PATCH]", e);
    return NextResponse.json({ error: "Error al actualizar pedido" }, { status: 500 });
  }
}