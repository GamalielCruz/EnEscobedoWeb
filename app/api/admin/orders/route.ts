import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { client, readClient, writeClient } from "@/sanity/lib/client";
import { isAdminUser } from "@/lib/admin";
import { sendOrderCancelled } from "@/lib/whatsapp";
import { dispatchDeliveryOffer } from "@/lib/delivery-dispatch";

const ORDER_PROJECTION = `{
  _id,
  _type,
  orderNumber,
  orderType,
  pickupCode,
  "fulfillmentType": select(orderType == "pickup" => "pickup", "delivery"),
  "customerInfo": {
    "name": customerName,
    "email": email,
    "clerkUserId": clerkUserId,
    "phone": phone
  },
  "deliveryAddress": shippingAddress,
  "storeInfo": {
    "storeId": coalesce(pickupStore._ref, affiliateStore._ref),
    "storeName": coalesce(pickupStore->name, affiliateStore->name, "Tienda no encontrada"),
    "storeAddress": coalesce(pickupStore->address.street, affiliateStore->address.street, ""),
    "storePhone": coalesce(pickupStore->contact.phone, affiliateStore->contact.phone, "")
  },
  "items": products[]{
    _key,
    "productName": product->name,
    "productId": product->_id,
    quantity,
    "price": product->price,
    notes
  },
  "totalAmount": totalPrice,
  paymentMethod,
  status,
  dispatchStatus,
  "offeredToRef": offeredTo._ref,
  "repartidorAsignadoRef": repartidorAsignado._ref,
  estimatedPickupDate,
  readyAt,
  pickedUpAt,
  deliveredAt,
  "notes": deliveryNotes,
  "createdAt": orderDate,
  updatedAt
}`;

const ORDER_BY_NUMBER_QUERY = `*[_type == "order" && orderNumber == $orderNumber][0]{
  _id,
  orderNumber,
  orderType,
  customerName,
  phone,
  status,
  readyAt,
  pickedUpAt,
  deliveredAt
}`;

function getReader() {
  if (process.env.SANITY_API_READ_TOKEN) {
    return readClient;
  }

  if (process.env.SANITY_API_TOKEN) {
    return writeClient;
  }

  return client;
}

function isFinalStatus(status: string) {
  return ["cancelled", "completed", "delivered", "picked_up", "failed"].includes(status);
}

function getStatusNotification(status: string) {
  switch (status) {
    case "cancelled":
      return sendOrderCancelled;
    default:
      return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    if (!isAdminUser(userId)) {
      return NextResponse.json({ error: "No tienes permisos" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const type = searchParams.get("type");
    const q = searchParams.get("q")?.trim().toLowerCase() ?? "";
    const limitParam = Number(searchParams.get("limit") ?? "100");
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 250) : 100;

    const filters = [`!(_id in path('drafts.**'))`, `_type == "order"`];
    const params: Record<string, string> = {};

    if (type === "pickup") {
      filters.push(`orderType == "pickup"`);
    } else if (type === "delivery") {
      filters.push(`orderType == "delivery"`);
    }

    if (status && status !== "all") {
      filters.push(`status == $status`);
      params.status = status;
    }

    const query = `*[${filters.join(" && ")}] | order(orderDate desc) [0...${limit}] ${ORDER_PROJECTION}`;
    const orders = await getReader().fetch(query, params);

    const filteredOrders = q
      ? (orders ?? []).filter((order: any) => {
          const haystack = [
            order.orderNumber,
            order.pickupCode,
            order.customerInfo?.name,
            order.customerInfo?.email,
            order.customerInfo?.phone,
            order.storeInfo?.storeName,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          return haystack.includes(q);
        })
      : orders ?? [];

    return NextResponse.json(
      {
        success: true,
        orders: filteredOrders,
        count: filteredOrders.length,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
          Pragma: "no-cache",
          Expires: "0",
        },
      }
    );
  } catch (error) {
    console.error("[admin/orders GET]", error);
    return NextResponse.json({ error: "Error al cargar pedidos" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    if (!isAdminUser(userId)) {
      return NextResponse.json({ error: "No tienes permisos" }, { status: 403 });
    }

    if (!process.env.SANITY_API_TOKEN) {
      return NextResponse.json(
        { error: "Error al actualizar pedido", details: { message: "Missing SANITY_API_TOKEN" } },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { orderNumber, status } = body;

    if (!orderNumber || !status) {
      return NextResponse.json(
        { error: "orderNumber y status son requeridos" },
        { status: 400 }
      );
    }

    const order = await client.fetch(ORDER_BY_NUMBER_QUERY, { orderNumber });

    if (!order) {
      return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
    }

    const now = new Date().toISOString();
    const updateData: Record<string, string> = {
      status,
      updatedAt: now,
    };

    if (order.orderType === "pickup") {
      if (status === "ready_for_pickup" && !order.readyAt) {
        updateData.readyAt = now;
      }

      if ((status === "picked_up" || status === "completed") && !order.pickedUpAt) {
        updateData.pickedUpAt = now;
      }

      if (status === "ready_for_pickup") {
        updateData.pickupStatus = "ready_for_pickup";
      } else if (status === "picked_up" || status === "completed") {
        updateData.pickupStatus = "picked_up";
      } else if (status === "cancelled") {
        updateData.pickupStatus = "expired";
      } else if (!isFinalStatus(status)) {
        updateData.pickupStatus = "in_transit";
      }
    }

    if (status === "delivered" && !order.deliveredAt) {
      updateData.deliveredAt = now;
    }

    const updated = await writeClient.patch(order._id).set(updateData).commit();

    // Disparar oferta de reparto si es un delivery que pasa a processing
    if (status === "processing" && order.orderType === "delivery") {
      void dispatchDeliveryOffer(order._id).catch((e) =>
        console.error("[admin/orders PATCH] dispatchDeliveryOffer error:", e)
      );
    }

    const shouldNotify = order.status !== status;
    const notify = shouldNotify ? getStatusNotification(status) : null;

    if (notify && order.phone && order.orderNumber) {
      const customerName =
        typeof order.customerName === "string" && order.customerName
          ? order.customerName
          : "Cliente";

      void notify(order.phone, customerName, order.orderNumber).catch(
        (whatsappError) => {
          console.error("[admin/orders PATCH] WhatsApp error:", whatsappError);
        }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        orderId: updated._id,
        orderNumber,
        status,
        updatedAt: now,
      },
    });
  } catch (error) {
    console.error("[admin/orders PATCH]", error);
    return NextResponse.json({ error: "Error al actualizar pedido" }, { status: 500 });
  }
}
