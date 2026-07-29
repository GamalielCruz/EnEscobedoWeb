import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { client, readClient, writeClient } from "@/sanity/lib/client";
import { syncBaserowOrderById } from "@/lib/baserow";
import { appendOrderEvent, OrderEventType } from "@/lib/order-events";
import { sendOrderCancelled, sendOrderDelivered, sendPickupReadyForCustomer } from "@/lib/whatsapp";
import { buildStoreMapsUrl } from "@/lib/order-pricing";
import { sendScheduledOrderPreparationStarted } from "@/lib/scheduled-order-whatsapp";
import { shouldStartScheduledPreparation } from "@/lib/fulfillment-schedule";
import {
  buildStateFields,
  DispatchStatusValue,
  OrderStatusValue,
  PaymentStatusValue,
  SettlementStatusValue,
} from "@/lib/order-state";

const OWNED_STORES_QUERY = `*[_type == "affiliateStore" && ownerClerkUserId == $userId] { _id }`;
const ORDERS_BASE_FILTER = `!(_id in path('drafts.**')) && _type == "order" && (pickupStore._ref == $storeId || affiliateStore._ref == $storeId)`;
const ORDER_PROJECTION = `{
  _id,
  _type,
  orderNumber,
  orderType,
  orderStatus,
  paymentStatus,
  dispatchStatus,
  settlementStatus,
  fulfillmentProvider,
  fulfillmentTiming,
  scheduledSlot,
  scheduledPreparationAt,
  preparationStatus,
  deliveryVerificationStatus,
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
    "price": select(
      defined(lineTotal) => lineTotal,
      defined(totalPrice) => totalPrice,
      defined(product->price) => product->price * quantity,
      0
    ),
    "customizations": customizations[]{
      _key,
      title,
      "options": options[]{ _key, label, priceDelta }
    },
    notes,
    allergies
  },
  "totalAmount": totalPrice,
  paymentMethod,
  status,
  estimatedPickupDate,
  readyAt,
  pickedUpAt,
  deliveredAt,
  cancelledAt,
  refundedAt,
  orderEvents,
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
const ORDER_BY_NUMBER = `*[_type == "order" && orderNumber == $orderNumber][0]{
  _id,
  orderNumber,
  customerName,
  phone,
  orderType,
  paymentMethod,
  paymentProvider,
  requiresStripeReconciliation,
  stripeFee,
  grossTotal,
  totalPrice,
  orderStatus,
  paymentStatus,
  dispatchStatus,
  settlementStatus,
  fulfillmentTiming,
  scheduledSlot,
  preparationStatus,
  readyAt,
  pickedUpAt,
  deliveredAt,
  pickupStatus,
  pickupStore,
  affiliateStore,
  "storeName": coalesce(pickupStore->name, affiliateStore->name),
  "storeAddress": coalesce(pickupStore->address.street, affiliateStore->address.street),
  "storeCoordinates": coalesce(pickupStore->coordinates, affiliateStore->coordinates)
}`;

function isValidIsoDate(value: string | null) {
  if (!value) return false;
  return !Number.isNaN(Date.parse(value));
}

function mapStoreStatus(orderType: "pickup" | "delivery", status: string): Partial<{ orderStatus: OrderStatusValue; dispatchStatus: DispatchStatusValue }> {
  switch (status) {
    case "processing":
      return { orderStatus: "processing" };
    case "ready_for_pickup":
      return { orderStatus: "ready_for_pickup", dispatchStatus: "not_required" };
    case "picked_up":
    case "completed":
      return { orderStatus: status === "completed" ? "completed" : "picked_up", dispatchStatus: "not_required" };
    case "cancelled":
      return { orderStatus: "cancelled", dispatchStatus: orderType === "pickup" ? "not_required" : undefined };
    default:
      return { orderStatus: status as OrderStatusValue };
  }
}

function shouldEmitRestaurantAccepted(previousStatus?: string, nextStatus?: string) {
  return previousStatus === "pending" && !!nextStatus && nextStatus !== "pending" && nextStatus !== "cancelled";
}

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const storeIdRaw = searchParams.get("storeId");
    const scope = searchParams.get("scope") ?? "all";
    const startAt = searchParams.get("startAt");
    const endAt = searchParams.get("endAt");
    const beforeAt = searchParams.get("beforeAt");
    const storeId = storeIdRaw && !["", "null", "undefined"].includes(storeIdRaw) ? storeIdRaw : null;
    if (!storeId) return NextResponse.json({ error: "storeId requerido" }, { status: 400 });
    if (scope === "today" && (!isValidIsoDate(startAt) || !isValidIsoDate(endAt))) {
      return NextResponse.json({ error: "startAt y endAt validos son requeridos para scope=today" }, { status: 400 });
    }
    if (scope === "history" && !isValidIsoDate(beforeAt)) {
      return NextResponse.json({ error: "beforeAt valido es requerido para scope=history" }, { status: 400 });
    }

    const readSanity = process.env.SANITY_API_READ_TOKEN ? readClient : process.env.SANITY_API_TOKEN ? writeClient : client;
    const ownedStores = await readSanity.fetch<{ _id: string }[]>(OWNED_STORES_QUERY, { userId });
    const ownsStore = ownedStores?.some((s) => s._id === storeId);
    if (!ownsStore) return NextResponse.json({ error: "No tienes permiso para esta tienda" }, { status: 403 });

    const query = scope === "today" ? TODAY_ORDERS_QUERY : scope === "history" ? HISTORY_ORDERS_QUERY : ALL_ORDERS_QUERY;
    const queryParams: Record<string, string> = { storeId };
    if (scope === "today" && startAt && endAt) {
      queryParams.startAt = startAt;
      queryParams.endAt = endAt;
    }
    if (scope === "history" && beforeAt) {
      queryParams.beforeAt = beforeAt;
    }

    const orders = await readSanity.fetch(query, queryParams);
    return NextResponse.json({ success: true, orders: orders ?? [], requestId }, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  } catch (e) {
    console.error("[dashboard/store-orders GET]", { requestId, error: e });
    return NextResponse.json({ error: "Error al cargar pedidos", requestId }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const body = await request.json();
    const { orderNumber, status } = body;
    if (!orderNumber) {
      return NextResponse.json({ error: "orderNumber es requerido" }, { status: 400 });
    }

    if (!process.env.SANITY_API_TOKEN) return NextResponse.json({ error: "Error al actualizar pedido", requestId }, { status: 500 });

    const order = await client.fetch(ORDER_BY_NUMBER, { orderNumber });
    if (!order) return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });

    const ownedStores = await writeClient.fetch<{ _id: string }[]>(OWNED_STORES_QUERY, { userId });
    const storeId = order.pickupStore?._ref || order.affiliateStore?._ref;
    const ownsStore = ownedStores?.some((s) => s._id === storeId);
    if (!ownsStore) {
      return NextResponse.json({ error: "No tienes permiso para esta orden o tienda no identificada" }, { status: 403 });
    }

    const now = new Date().toISOString();
    const orderType = order.orderType === "pickup" ? "pickup" : "delivery";
    const mapped: Partial<{ orderStatus: OrderStatusValue; dispatchStatus: DispatchStatusValue }> = status ? mapStoreStatus(orderType, status) : {};
    const orderStatus = (body.orderStatus || mapped.orderStatus || order.orderStatus || "pending") as OrderStatusValue;
    if (orderType === "delivery" && orderStatus === "delivered") {
      return NextResponse.json({ error: "La entrega debe completarse verificando el PIN" }, { status: 409 });
    }
    let paymentStatus = (body.paymentStatus || order.paymentStatus || "pending") as PaymentStatusValue;
    const dispatchStatus = (body.dispatchStatus || mapped.dispatchStatus || order.dispatchStatus || (orderType === "pickup" ? "not_required" : "waiting_for_driver")) as DispatchStatusValue;
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

    const updateData: Record<string, unknown> = {
      ...buildStateFields({ orderType, orderStatus, paymentStatus, dispatchStatus, settlementStatus, paymentMethod: order.paymentMethod }),
      updatedAt: now,
    };
    const scheduledPreparationStarted = shouldStartScheduledPreparation({
      fulfillmentTiming: order.fulfillmentTiming,
      nextOrderStatus: orderStatus,
      preparationStatus: order.preparationStatus,
    });
    if (scheduledPreparationStarted) {
      updateData.preparationStatus = "in_preparation";
      updateData.preparationStartedAt = now;
    }

    if (orderStatus === "ready_for_pickup" && !order.readyAt) {
      updateData.readyAt = now;
      updateData.pickupStatus = "ready_for_pickup";
    } else if ((orderStatus === "picked_up" || orderStatus === "completed") && !order.pickedUpAt) {
      updateData.pickedUpAt = now;
      updateData.pickupStatus = "picked_up";
    } else if (orderStatus === "delivered" && !order.deliveredAt) {
      updateData.deliveredAt = now;
    } else if (isCancelled) {
      updateData.pickupStatus = orderType === "pickup" ? "expired" : order.pickupStatus;
      updateData.cancelledAt = now;
      updateData.settlementStatus = settlementStatus;
      if (order.fulfillmentTiming === "scheduled") updateData.scheduleStatus = "cancelled";
      if (isStripeOrder) {
        updateData.requiresStripeReconciliation = true;
      } else {
        updateData.requiresStripeReconciliation = false;
        updateData.stripeFee = 0;
      }
    }
    if (
      order.fulfillmentTiming === "scheduled" &&
      ["delivered", "completed", "picked_up"].includes(orderStatus)
    ) {
      updateData.scheduleStatus = "completed";
    }

    if (paymentStatus === "refunded") {
      updateData.refundedAt = now;
      updateData.settlementStatus = "refunded";
    }

    const updated = await writeClient.patch(order._id).set(updateData).commit();

    const events: Array<{ type: OrderEventType; reason?: string; payload?: Record<string, unknown> }> = [];
    if (shouldEmitRestaurantAccepted(order.orderStatus, orderStatus)) {
      events.push({ type: "restaurant_accepted" });
    }
    if (scheduledPreparationStarted) {
      events.push({ type: "scheduled_order_preparation_started" });
    }
    if (isCancelled && order.orderStatus !== "cancelled") {
      events.push({ type: order.orderStatus === "pending" ? "restaurant_rejected" : "cancelled", reason: order.orderStatus === "pending" ? "store_rejected_order" : "store_cancelled_order" });
      if (order.orderStatus === "pending") {
        events.push({ type: "cancelled", reason: "store_rejected_order" });
      }
      if (order.fulfillmentTiming === "scheduled") {
        events.push({ type: "scheduled_order_cancelled", reason: "store_cancelled_order" });
      }
    }
    if (orderType === "pickup" && orderStatus === "ready_for_pickup" && order.orderStatus !== "ready_for_pickup") {
      events.push({ type: "ready_for_pickup", reason: "store_marked_ready" });
    }
    const pickupDeliveredNow =
      orderType === "pickup" &&
      (orderStatus === "picked_up" || orderStatus === "completed") &&
      order.orderStatus !== "picked_up" &&
      order.orderStatus !== "completed";

    if (pickupDeliveredNow) {
      events.push({ type: "picked_up", reason: "store_marked_picked_up" });
    }
    if (needsRefund && order.paymentStatus !== "requires_refund" && order.paymentStatus !== "refunded") {
      events.push({ type: "refund_required", reason: "stripe_order_cancelled", payload: { paymentStatus } });
    }
    events.push({
      type: "manual_admin_action",
      payload: { orderStatus, paymentStatus, dispatchStatus, settlementStatus: updateData.settlementStatus },
    });

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
        console.error("[dashboard/store-orders PATCH] WhatsApp ready pickup error:", whatsappError);
      });
    }
    if (pickupDeliveredNow && order.phone) {
      void sendOrderDelivered(order.phone, order.customerName || "Cliente", order.orderNumber).catch((whatsappError) => {
        console.error("[dashboard/store-orders PATCH] WhatsApp pickup delivered error:", whatsappError);
      });
    }
    if (orderType === "pickup" && isCancelled && order.phone) {
      void sendOrderCancelled(order.phone, order.customerName || "Cliente", order.orderNumber).catch((whatsappError) => {
        console.error("[dashboard/store-orders PATCH] WhatsApp cancel pickup error:", whatsappError);
      });
    }

    for (const event of events) {
      await appendOrderEvent(order._id, {
        type: event.type,
        source: "api/dashboard/store-orders",
        actor: userId,
        reason: event.reason,
        payload: event.payload,
      });
    }
    if (scheduledPreparationStarted) {
      void sendScheduledOrderPreparationStarted({
        ...order,
        _id: order._id,
      }).catch((whatsappError) => {
        console.error("[dashboard/store-orders PATCH] WhatsApp scheduled preparation error:", whatsappError);
      });
    }

    void syncBaserowOrderById(order._id).catch((error) => {
      console.error("[dashboard/store-orders PATCH] Baserow sync error:", error);
    });

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
  } catch (e) {
    console.error("[dashboard/store-orders PATCH]", { requestId, error: e });
    return NextResponse.json({ error: "Error al actualizar pedido", requestId }, { status: 500 });
  }
}




