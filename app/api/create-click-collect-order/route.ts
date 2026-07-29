import { after, NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { writeClient } from "@/sanity/lib/client";
import { notifyRestaurantNewOrder } from "@/lib/restaurant-notifications";
import { sendPickupOrderReceived } from "@/lib/whatsapp";
import { appendOrderEvent } from "@/lib/order-events";
import { buildOrderDocument, buildStoreMapsUrl, OrderItemInput, validateAndQuoteOrder } from "@/lib/order-pricing";
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

function generatePickupCode(): string {
  return crypto.randomUUID().split("-")[0].toUpperCase();
}

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json();
    assertCurrentLegalAcceptance(body?.legalAccepted);
    await recordCurrentLegalAcceptance(request, userId, "checkout_pickup");
    const orderItems = normalizeItems(body?.items || []);
    const storeId = String(body?.storeId || body?.metadata?.storeId || "");
    const paymentMethod = String(body?.paymentMethod || "cash_at_store");
    const deliveryNotes = [body?.notes, body?.estimatedDelivery ? `Tiempo estimado: ${body.estimatedDelivery}` : null]
      .filter(Boolean)
      .join(" | ");

    const quote = await validateAndQuoteOrder({
      storeId,
      items: orderItems,
      orderType: "pickup",
      paymentMethod,
      fulfillment:
        body?.fulfillmentTiming === "scheduled" && body?.scheduledSlot
          ? { timing: "scheduled", scheduledSlot: body.scheduledSlot }
          : { timing: "asap" },
    });

    const orderData = buildOrderDocument({
      orderNumber: String(body?.orderNumber || ""),
      clerkUserId: String(body?.clerkUserId || userId),
      customerName: String(body?.customerName || "Cliente").trim(),
      customerEmail: String(body?.customerEmail || "").trim(),
      phone: String(body?.phone || "").trim(),
      storeId,
      orderType: "pickup",
      paymentMethod,
      quote,
      paymentStatus: paymentMethod === "card_at_store" ? "pending" : "unpaid",
      dispatchStatus: "not_required",
      orderStatus: "pending",
      deliveryNotes: deliveryNotes || undefined,
    }) as { _type: string; [key: string]: unknown };

    orderData.pickupStatus = "in_transit";
    orderData.pickupCode = generatePickupCode();

    const result = await writeClient.create(orderData);
    after(() => syncBaserowOrder({ ...orderData, _id: result._id, restaurantName: quote.store.name }));

    await appendOrderEvent(result._id, { type: "created", source: "api/create-click-collect-order", actor: userId });
    await appendOrderEvent(result._id, { type: "sent_to_restaurant", source: "api/create-click-collect-order" });
    if (quote.fulfillment.timing === "scheduled") {
      await appendOrderEvent(result._id, {
        type: "scheduled_order_created",
        source: "api/create-click-collect-order",
        actor: userId,
        payload: { scheduledSlot: orderData.scheduledSlot },
      });
    }

    after(async () => {
      const phone = String(orderData.phone || "");
      const customerName = String(orderData.customerName || "Cliente");
      const orderNumber = String(orderData.orderNumber || "");

      await Promise.allSettled([
        phone && orderNumber ? sendPickupOrderReceived(phone, customerName, orderNumber, String(quote.store.name || "Restaurante"), String(orderData.grossTotal || orderData.totalPrice || "0"), getPaymentMethodLabel(String(orderData.paymentMethod || "")), buildStoreMapsUrl(quote.store)) : Promise.resolve(),
        notifyRestaurantNewOrder(result._id),
        quote.fulfillment.timing === "scheduled"
          ? sendScheduledOrderConfirmation({
              ...orderData,
              _id: result._id,
              storeName: quote.store.name,
            })
          : Promise.resolve(),
      ]);
    });

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        orderId: result._id,
        orderNumber: orderData.orderNumber,
        pickupCode: orderData.pickupCode,
        totals: {
          productsSubtotal: orderData.productsSubtotal,
          grossTotal: orderData.grossTotal,
        },
      },
    });
  } catch (error) {
    console.error("[create-click-collect-order]", { requestId, error });
    return NextResponse.json(
      {
        success: false,
        ...(error instanceof DeliverySlotUnavailableError
          ? { code: error.code, alternatives: error.alternatives }
          : {}),
        error: error instanceof Error ? error.message : "Error interno del servidor",
        requestId,
      },
      { status: error instanceof DeliverySlotUnavailableError ? 409 : 400 }
    );
  }
}



