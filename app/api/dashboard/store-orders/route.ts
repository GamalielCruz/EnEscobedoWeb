import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { client, writeClient } from "@/sanity/lib/client";

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
    _type == "clickCollectOrder" => items,
    _type == "order" => products[]{ 
      _key, 
      "productName": product->name,
      "productId": product->_id,
      "quantity": quantity, 
      "price": product->price
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

    const ownedStores = await writeClient.fetch<{ _id: string }[]>(OWNED_STORES_QUERY, {
      userId,
    });
    const ownsStore = ownedStores?.some((s) => s._id === storeId);
    if (!ownsStore) {
      return NextResponse.json({ error: "No tienes permiso para esta tienda" }, { status: 403 });
    }

    const orders = await writeClient.fetch(ORDERS_QUERY, { storeId });
    
    return NextResponse.json({ success: true, orders: orders ?? [] }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
      }
    });
  } catch (e) {
    console.error("[dashboard/store-orders GET]", e);
    return NextResponse.json({ error: "Error al cargar pedidos" }, { status: 500 });
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

    const order = await client.fetch(ORDER_BY_NUMBER, { orderNumber });
    if (!order) {
      return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
    }

    const ownedStores = await writeClient.fetch<{ _id: string }[]>(OWNED_STORES_QUERY, {
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

    const updated = await writeClient.patch(order._id).set(updateData).commit();

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
