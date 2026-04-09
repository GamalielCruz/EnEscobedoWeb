import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "next-sanity";

const OWNED_STORES_QUERY = `*[_type == "affiliateStore" && ownerClerkUserId == $userId] { _id }`;
// Soporta documentos tipo `clickCollectOrder` y `order` (cuando deliveryMethod == 'click_collect')
const ORDERS_QUERY = `*[
  !(_id in path('drafts.**')) && (
    (_type == "clickCollectOrder" && storeInfo.storeId == $storeId)
    || (_type == "order" && (pickupStore._ref == $storeId || affiliateStore._ref == $storeId))
  )
] | order(coalesce(createdAt, orderDate) desc) {
  _id,
  _type,
  orderNumber,
  pickupCode,
  "customerInfo": select(
    _type == "clickCollectOrder" => customerInfo,
    _type == "order" => { "name": customerName, "email": email, "clerkUserId": clerkUserId, "phone": phone }
  ),
  "deliveryAddress": select(
    _type == "order" => shippingAddress,
    null
  ),
  "storeInfo": select(
    _type == "clickCollectOrder" => storeInfo,
    _type == "order" => { 
      "storeId": coalesce(pickupStore._ref, affiliateStore._ref), 
      "storeName": coalesce(pickupStore->name, affiliateStore->name), 
      "storeAddress": coalesce(pickupStore->address.street, affiliateStore->address.street), 
      "storePhone": coalesce(pickupStore->contact.phone, affiliateStore->contact.phone) 
    }
  ),
  "items": select(
    _type == "clickCollectOrder" => items[]{
      _key,
      "productName": coalesce(productName, product->name),
      "productId": coalesce(productId, product->_id),
      quantity,
      price,
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
    _type == "order" => products[]{ 
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
    }
  ),
  "totalAmount": coalesce(totalAmount, totalPrice),
  paymentMethod,
  status,
  estimatedPickupDate,
  readyAt,
  pickedUpAt,
  notes,
  "createdAt": coalesce(createdAt, orderDate),
  "deliveryMethod": coalesce(deliveryMethod, "click_collect"),
  updatedAt
}`;
const ORDER_BY_NUMBER = `*[
  (_type == "clickCollectOrder" && orderNumber == $orderNumber)
  || (_type == "order" && orderNumber == $orderNumber)
][0]`;

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
    const storeId =
      storeIdRaw && storeIdRaw.trim() !== "" && storeIdRaw !== "null" && storeIdRaw !== "undefined"
        ? storeIdRaw
        : null;
    if (!storeId) {
      return NextResponse.json({ error: "storeId requerido" }, { status: 400 });
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

    const orders = await readSanity.fetch(ORDERS_QUERY, { storeId });
    
    console.log('[store-orders API] StoreId:', storeId);
    console.log('[store-orders API] Orders found:', orders.length);
    
    // Log detallado del primer pedido para depurar
    if (orders.length > 0) {
      console.log('[store-orders API] RAW first order:', JSON.stringify(orders[0], null, 2));
      console.log('[store-orders API] First order items field:', orders[0].items);
      console.log('[store-orders API] First order _type:', orders[0]._type);
      
      // Verificar específicamente el campo items para clickCollectOrder
      if (orders[0]._type === 'clickCollectOrder') {
        console.log('[store-orders API] ClickCollectOrder items structure:', JSON.stringify(orders[0].items, null, 2));
        console.log('[store-orders API] ClickCollectOrder items length:', orders[0].items?.length);
        console.log('[store-orders API] ClickCollectOrder first item:', JSON.stringify(orders[0].items?.[0], null, 2));
      }
    }
    
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
    
    // Extraer storeId dependiendo del tipo de documento
    let storeId = "";
    if (order._type === "clickCollectOrder") {
      storeId = order.storeInfo?.storeId;
    } else if (order._type === "order") {
      storeId = order.pickupStore?._ref || order.affiliateStore?._ref;
    }

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
    } else if (status === "picked_up" && !order.pickedUpAt) {
      updateData.pickedUpAt = new Date().toISOString();
    } else if (status === "delivered" && !order.deliveredAt) {
      updateData.deliveredAt = new Date().toISOString();
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
