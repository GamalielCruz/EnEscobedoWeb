import { after, NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { writeClient } from "@/sanity/lib/client";
import { sendOrderConfirmation } from "@/lib/whatsapp";
import { dispatchDeliveryOffer } from "@/lib/delivery-dispatch";
import { notifyRestaurantNewOrder } from "@/lib/restaurant-notifications";
import { appendOrderEvent } from "@/lib/order-events";
import { buildOrderDocument, OrderAddressInput, OrderItemInput, validateAndQuoteOrder } from "@/lib/order-pricing";

function normalizeItems(items: Array<any>): OrderItemInput[] {
  return (items || []).map((item) => ({
    productId: String(item?.productId || item?.product?._id || item?.product?.id || ""),
    quantity: Number(item?.quantity || 0),
    customizations: item?.customizations,
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
    const storeId = String(metadata?.storeInfo?.storeId || "");
    const orderType = metadata?.storeInfo?.deliveryMethod === "pickup" ? "pickup" : "delivery";
    const paymentMethod = orderType === "pickup" ? "cash_at_store" : "cash_on_delivery";
    const orderItems = normalizeItems(body?.items || []);
    const shippingAddress = (metadata?.shippingAddress || null) as OrderAddressInput | null;

    const quote = await validateAndQuoteOrder({
      storeId,
      items: orderItems,
      orderType,
      paymentMethod,
      shippingAddress,
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
      paymentStatus: "unpaid",
      dispatchStatus: orderType === "delivery" ? "waiting_for_driver" : "not_required",
    }) as { _type: string; [key: string]: unknown };

    if (orderType === "pickup") {
      orderData.pickupStatus = "in_transit";
      orderData.pickupCode = crypto.randomUUID().split("-")[0].toUpperCase();
    }

    const result = await writeClient.create(orderData);

    await appendOrderEvent(result._id, { type: "created", source: "api/create-cod-order", actor: userId });
    await appendOrderEvent(result._id, { type: "sent_to_restaurant", source: "api/create-cod-order" });
    if (orderType === "delivery") {
      await appendOrderEvent(result._id, { type: "dispatch_started", source: "api/create-cod-order" });
    }

    after(async () => {
      const customerPhone = String(orderData.phone || "");
      const customerName = String(orderData.customerName || "Cliente");
      const orderNumber = String(orderData.orderNumber || "");

      const tasks: Array<Promise<unknown>> = [
        customerPhone && orderNumber ? sendOrderConfirmation(customerPhone, customerName, orderNumber) : Promise.resolve(),
        notifyRestaurantNewOrder(result._id),
        orderType === "delivery" ? dispatchDeliveryOffer(result._id) : Promise.resolve(),
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
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error interno del servidor", requestId }, { status: 400 });
  }
}


