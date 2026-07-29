import { after, NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { writeClient } from "@/sanity/lib/client";
import { sendOrderConfirmation, sendPickupOrderReceived } from "@/lib/whatsapp";
import { dispatchDeliveryOffer } from "@/lib/delivery-dispatch";
import { notifyRestaurantNewOrder } from "@/lib/restaurant-notifications";
import { appendOrderEvent } from "@/lib/order-events";
import { buildOrderDocument, buildStoreMapsUrl, OrderAddressInput, OrderItemInput, validateAndQuoteOrder } from "@/lib/order-pricing";
import { getPaymentMethodLabel } from "@/lib/payment";
import { syncBaserowOrder } from "@/lib/baserow";
import { assertCurrentLegalAcceptance } from "@/lib/legal-config";
import { recordCurrentLegalAcceptance } from "@/lib/legal-acceptance";
import { DeliverySlotUnavailableError } from "@/lib/fulfillment-schedule";
import { sendScheduledOrderConfirmation } from "@/lib/scheduled-order-whatsapp";

function normalizeItems(items: Array<any>): OrderItemInput[] {
  return (items || []).map((item) => ({
    productId: String(item?.productId || item?.product?._id || item?.product?.id || ""),
    quantity: Number(item?.quantity || 0),
    customizations: item?.customizations,
    notes: item?.notes,
    allergies: item?.allergies,
  }));
}

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const metadata = body?.metadata || {};
    assertCurrentLegalAcceptance(metadata.legalAccepted);
    await recordCurrentLegalAcceptance(request, userId, "checkout_cash_delivery");
    const storeId = String(metadata?.storeInfo?.storeId || "");
    const orderType = metadata?.storeInfo?.deliveryMethod === "pickup" ? "pickup" : "delivery";
    const paymentMethod = orderType === "pickup" ? "cash_at_store" : "cash_on_delivery";
    const orderItems = normalizeItems(body?.items || []);
    const shippingAddress = (metadata?.shippingAddress || null) as OrderAddressInput | null;
    const deliveryNotes = String(metadata?.deliveryNotes || "").trim().slice(0, 500) || undefined;

    const quote = await validateAndQuoteOrder({
      storeId,
      items: orderItems,
      orderType,
      paymentMethod,
      shippingAddress,
      fulfillment:
        metadata.fulfillmentTiming === "scheduled" && metadata.scheduledSlot
          ? { timing: "scheduled", scheduledSlot: metadata.scheduledSlot }
          : { timing: "asap" },
    });

    const orderData = buildOrderDocument({
      orderNumber: String(metadata.orderNumber || ""),
      clerkUserId: String(metadata.clerkUserId || userId),
      customerName: String(metadata.customerName || "Cliente").trim(),
      customerEmail: String(metadata.customerEmail || "").trim(),
      phone: String(metadata.phone || "").trim(),
      storeId,
      orderType,
      paymentMethod,
      quote,
      shippingAddress,
      deliveryNotes,
      codInstructions: deliveryNotes,
      paymentStatus: "unpaid",
      dispatchStatus:
        orderType === "delivery" && quote.fulfillment.timing === "scheduled"
          ? "scheduled"
          : orderType === "delivery"
            ? "waiting_for_driver"
            : "not_required",
    }) as { _type: string; [key: string]: unknown };

    if (orderType === "pickup") {
      orderData.pickupStatus = "in_transit";
      orderData.pickupCode = crypto.randomUUID().split("-")[0].toUpperCase();
    }

    const result = await writeClient.create(orderData);
    after(() => syncBaserowOrder({ ...orderData, _id: result._id, restaurantName: quote.store.name }));

    await appendOrderEvent(result._id, { type: "created", source: "api/create-cod-order", actor: userId });
    await appendOrderEvent(result._id, { type: "sent_to_restaurant", source: "api/create-cod-order" });
    if (orderType === "delivery" && quote.fulfillment.timing === "asap") {
      await appendOrderEvent(result._id, { type: "dispatch_started", source: "api/create-cod-order" });
    }
    if (quote.fulfillment.timing === "scheduled") {
      await appendOrderEvent(result._id, {
        type: "scheduled_order_created",
        source: "api/create-cod-order",
        actor: userId,
        payload: { scheduledSlot: orderData.scheduledSlot },
      });
    }

    after(async () => {
      const customerPhone = String(orderData.phone || "");
      const customerName = String(orderData.customerName || "Cliente");
      const orderNumber = String(orderData.orderNumber || "");

      const tasks: Array<Promise<unknown>> = [
        customerPhone && orderNumber ? (orderType === "pickup" ? sendPickupOrderReceived(customerPhone, customerName, orderNumber, String(quote.store.name || "Restaurante"), String(orderData.grossTotal || orderData.totalPrice || "0"), getPaymentMethodLabel(String(orderData.paymentMethod || "")), buildStoreMapsUrl(quote.store)) : sendOrderConfirmation(customerPhone, customerName, orderNumber)) : Promise.resolve(),
        notifyRestaurantNewOrder(result._id),
        orderType === "delivery" && quote.fulfillment.timing === "asap"
          ? dispatchDeliveryOffer(result._id)
          : Promise.resolve(),
        quote.fulfillment.timing === "scheduled"
          ? sendScheduledOrderConfirmation({
              ...orderData,
              _id: result._id,
              storeName: quote.store.name,
            })
          : Promise.resolve(),
      ];

      await Promise.allSettled(tasks);
    });

    return NextResponse.json({
      success: true,
      orderId: result._id,
      orderNumber: orderData.orderNumber,
      requestId,
      totals: {
        productsSubtotal: orderData.productsSubtotal,
        shippingFee: orderData.shippingFee,
        grossTotal: orderData.grossTotal,
      },
    });
  } catch (error: unknown) {
    console.error("[create-cod-order]", { requestId, error });
    return NextResponse.json({
      success: false,
      ...(error instanceof DeliverySlotUnavailableError
        ? { code: error.code, alternatives: error.alternatives }
        : {}),
      error: error instanceof Error ? error.message : "Error interno del servidor",
      requestId,
    }, { status: error instanceof DeliverySlotUnavailableError ? 409 : 400 });
  }
}



