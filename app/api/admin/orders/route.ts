import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { client, readClient, writeClient } from "@/sanity/lib/client";
import { isAdminUser } from "@/lib/admin";
import { syncBaserowOrderById } from "@/lib/baserow";
import { sendOrderCancelled, sendPickupReadyForCustomer } from "@/lib/whatsapp";
import { dispatchDeliveryOffer } from "@/lib/delivery-dispatch";
import { appendOrderEvent, OrderEventType } from "@/lib/order-events";
import { buildStoreMapsUrl } from "@/lib/order-pricing";
import {
  buildStateFields,
  OrderStatusValue,
  PaymentStatusValue,
  DispatchStatusValue,
  SettlementStatusValue,
} from "@/lib/order-state";

const ORDER_PROJECTION = `{
  _id,
  _type,
  orderNumber,
  orderType,
  orderStatus,
  paymentStatus,
  dispatchStatus,
  settlementStatus,
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
    notes
  },
  "totalAmount": totalPrice,
  paymentMethod,
  status,
  estimatedPickupDate,
  readyAt,
  pickedUpAt,
  deliveredAt,
  deliveryVerificationStatus,
  cancelledAt,
  refundedAt,
  grossTotal,
  storeNetTotal,
  platformNetTotal,
  driverPayout,
  stripeFee,
  tax,
  shippingFee,
  productsSubtotal,
  orderEvents,
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
  paymentMethod,
  paymentProvider,
  requiresStripeReconciliation,
  stripeFee,
  status,
  orderStatus,
  paymentStatus,
  dispatchStatus,
  settlementStatus,
  readyAt,
  pickedUpAt,
  deliveredAt,
  deliveryVerificationStatus,
  "storeName": coalesce(pickupStore->name, affiliateStore->name),
  "storeAddress": coalesce(pickupStore->address.street, affiliateStore->address.street),
  "storeCoordinates": coalesce(pickupStore->coordinates, affiliateStore->coordinates)
}`;

function getReader() {
  if (process.env.SANITY_API_READ_TOKEN) return readClient;
  if (process.env.SANITY_API_TOKEN) return writeClient;
  return client;
}

function getStatusNotification(orderStatus: string) {
  if (orderStatus === "cancelled") return sendOrderCancelled;
  return null;
}

function mapLegacyStatus(orderType: "pickup" | "delivery", status: string): Partial<{ orderStatus: OrderStatusValue; paymentStatus: PaymentStatusValue; dispatchStatus: DispatchStatusValue }> {
  switch (status) {
    case "cancelled":
      return { orderStatus: "cancelled", paymentStatus: undefined, dispatchStatus: orderType === "pickup" ? "not_required" : undefined };
    case "processing":
      return { orderStatus: "processing" };
    case "ready_for_pickup":
      return { orderStatus: "ready_for_pickup", dispatchStatus: "not_required" };
    case "picked_up":
      return { orderStatus: "picked_up", dispatchStatus: "not_required" };
    case "completed":
      return { orderStatus: "completed", dispatchStatus: orderType === "pickup" ? "not_required" : "completed" };
    case "shipped":
      return { orderStatus: "shipped", dispatchStatus: "accepted" };
    case "delivered":
      return { orderStatus: "delivered", dispatchStatus: orderType === "delivery" ? "completed" : "not_required" };
    default:
      return { orderStatus: status as OrderStatusValue };
  }
}

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!isAdminUser(userId)) return NextResponse.json({ error: "No tienes permisos" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const type = searchParams.get("type");
    const q = searchParams.get("q")?.trim().toLowerCase() ?? "";
    const limitParam = Number(searchParams.get("limit") ?? "100");
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 250) : 100;

    const filters = [`!(_id in path('drafts.**'))`, `_type == "order"`];
    const params: Record<string, string> = {};

    if (type === "pickup") filters.push(`orderType == "pickup"`);
    else if (type === "delivery") filters.push(`orderType == "delivery"`);

    if (status && status !== "all") {
      filters.push(`(status == $status || orderStatus == $status || paymentStatus == $status || dispatchStatus == $status || settlementStatus == $status)`);
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

    return NextResponse.json({ success: true, orders: filteredOrders, count: filteredOrders.length }, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  } catch (error) {
    console.error("[admin/orders GET]", error);
    return NextResponse.json({ error: "Error al cargar pedidos" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!isAdminUser(userId)) return NextResponse.json({ error: "No tienes permisos" }, { status: 403 });
    if (!process.env.SANITY_API_TOKEN) {
      return NextResponse.json({ error: "Error al actualizar pedido", details: { message: "Missing SANITY_API_TOKEN" } }, { status: 500 });
    }

    const body = await request.json();
    const { orderNumber, status } = body;
    if (!orderNumber) {
      return NextResponse.json({ error: "orderNumber es requerido" }, { status: 400 });
    }

    const order = await client.fetch(ORDER_BY_NUMBER_QUERY, { orderNumber });
    if (!order) return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });

    const now = new Date().toISOString();
    const orderType = order.orderType === "pickup" ? "pickup" : "delivery";
    const legacyMapped: Partial<{ orderStatus: OrderStatusValue; paymentStatus: PaymentStatusValue; dispatchStatus: DispatchStatusValue }> = status ? mapLegacyStatus(orderType, status) : {};
    const orderStatus = (body.orderStatus || legacyMapped.orderStatus || order.orderStatus || "pending") as OrderStatusValue;
    const deliveryOverrideReason = String(body.deliveryOverrideReason || "").trim();
    if (orderType === "delivery" && orderStatus === "delivered" && order.deliveryVerificationStatus !== "verified" && !deliveryOverrideReason) {
      return NextResponse.json({ error: "Se requiere motivo para la anulación administrativa del PIN" }, { status: 400 });
    }
    let paymentStatus = (body.paymentStatus || legacyMapped.paymentStatus || order.paymentStatus || "pending") as PaymentStatusValue;
    const dispatchStatus = (body.dispatchStatus || legacyMapped.dispatchStatus || order.dispatchStatus || (orderType === "pickup" ? "not_required" : "waiting_for_driver")) as DispatchStatusValue;
    let settlementStatus = (body.settlementStatus || order.settlementStatus || "pending") as SettlementStatusValue;

    const isCancelled = orderStatus === "cancelled";
    const isStripeOrder = order.paymentProvider === "stripe";
    const needsRefund = isCancelled && isStripeOrder && paymentStatus !== "refunded";

    if (needsRefund && paymentStatus === "paid") {
      paymentStatus = "requires_refund";
    }
    if (paymentStatus === "refunded") {
      settlementStatus = "refunded";
    } else if (isCancelled) {
      settlementStatus = "cancelled";
    }

    const stateFields = buildStateFields({
      orderType,
      orderStatus,
      paymentStatus,
      dispatchStatus,
      settlementStatus,
      paymentMethod: order.paymentMethod,
    });

    const updateData: Record<string, unknown> = {
      ...stateFields,
      updatedAt: now,
    };

    if (orderType === "pickup") {
      if (orderStatus === "ready_for_pickup" && !order.readyAt) {
        updateData.readyAt = now;
        updateData.pickupStatus = "ready_for_pickup";
      }
      if ((orderStatus === "picked_up" || orderStatus === "completed") && !order.pickedUpAt) {
        updateData.pickedUpAt = now;
        updateData.pickupStatus = "picked_up";
      }
      if (orderStatus === "cancelled") {
        updateData.pickupStatus = "expired";
        updateData.cancelledAt = now;
      }
    }

    if (orderStatus === "delivered" && !order.deliveredAt) {
      updateData.deliveredAt = now;
      if (orderType === "delivery" && order.deliveryVerificationStatus !== "verified") {
        updateData.deliveryVerificationMethod = "support_override";
        updateData.deliveryVerificationStatus = "overridden";
        updateData.deliveryVerificationEvidence = deliveryOverrideReason;
      }
    }
    if (isCancelled) {
      updateData.cancelledAt = now;
      updateData.settlementStatus = settlementStatus;
      if (isStripeOrder) {
        updateData.requiresStripeReconciliation = true;
      } else {
        updateData.requiresStripeReconciliation = false;
        updateData.stripeFee = 0;
      }
    }
    if (paymentStatus === "refunded") {
      updateData.refundedAt = now;
      updateData.settlementStatus = "refunded";
    }

    const updated = await writeClient.patch(order._id).set(updateData).commit();

    const events: Array<{ type: OrderEventType; reason?: string; payload?: Record<string, unknown> }> = [];
    if (isCancelled && order.orderStatus !== "cancelled") {
      events.push({ type: "cancelled", reason: "admin_cancelled_order" });
    }
    if (orderType === "pickup" && orderStatus === "ready_for_pickup" && order.orderStatus !== "ready_for_pickup") {
      events.push({ type: "ready_for_pickup", reason: "admin_marked_ready" });
    }
    if (orderType === "pickup" && (orderStatus === "picked_up" || orderStatus === "completed") && order.orderStatus !== "picked_up" && order.orderStatus !== "completed") {
      events.push({ type: "picked_up", reason: "admin_marked_picked_up" });
    }
    if (needsRefund && order.paymentStatus !== "requires_refund" && order.paymentStatus !== "refunded") {
      events.push({ type: "refund_required", reason: "stripe_order_cancelled", payload: { paymentStatus } });
    }
    events.push({
      type: "manual_admin_action",
      payload: { orderStatus, paymentStatus, dispatchStatus, settlementStatus: updateData.settlementStatus },
    });
    if (orderType === "delivery" && orderStatus === "delivered" && order.deliveryVerificationStatus !== "verified") {
      events.push({ type: "delivery_override", reason: deliveryOverrideReason });
    }

    for (const event of events) {
      await appendOrderEvent(order._id, {
        type: event.type,
        source: "api/admin/orders",
        actor: userId,
        reason: event.reason,
        payload: event.payload,
      });
    }

    void syncBaserowOrderById(order._id).catch((error) => {
      console.error("[admin/orders PATCH] Baserow sync error:", error);
    });

    if (dispatchStatus === "waiting_for_driver" && orderType === "delivery") {
      void dispatchDeliveryOffer(order._id).catch((e) => console.error("[admin/orders PATCH] dispatchDeliveryOffer error:", e));
    }

    if (orderType === "pickup" && orderStatus === "ready_for_pickup" && order.phone) {
      void sendPickupReadyForCustomer(
        order.phone,
        order.customerName || "Cliente",
        order.orderNumber,
        order.storeName || "Restaurante",
        buildStoreMapsUrl({
          name: order.storeName || "Restaurante",
          address: { street: order.storeAddress || "" },
          coordinates: order.storeCoordinates,
        })
      ).catch((whatsappError) => {
        console.error("[admin/orders PATCH] WhatsApp ready pickup error:", whatsappError);
      });
    }

    const notify = getStatusNotification(orderStatus);
    if (notify && order.phone && order.orderNumber) {
      const customerName = typeof order.customerName === "string" && order.customerName ? order.customerName : "Cliente";
      void notify(order.phone, customerName, order.orderNumber).catch((whatsappError) => {
        console.error("[admin/orders PATCH] WhatsApp error:", whatsappError);
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        orderId: updated._id,
        orderNumber,
        status: updateData.status,
        orderStatus,
        paymentStatus,
        dispatchStatus,
        settlementStatus: updateData.settlementStatus,
        updatedAt: now,
      },
    });
  } catch (error) {
    console.error("[admin/orders PATCH]", error);
    return NextResponse.json({ error: "Error al actualizar pedido" }, { status: 500 });
  }
}




