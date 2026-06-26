import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { writeClient } from "@/sanity/lib/client";
import { sendOrderConfirmation } from "@/lib/whatsapp";
import { dispatchDeliveryOffer } from "@/lib/delivery-dispatch";
import { randomUUID } from "crypto";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const { items, metadata, shippingCost = 0 } = body;


    if (!items || items.length === 0) {
      return NextResponse.json({ success: false, error: "La lista de productos está vacía" }, { status: 400 });
    }

    const subtotal = (items as Array<{product: {price?: number}, quantity: number}>).reduce(
      (total, item) => total + ((item.product?.price ?? 0) * item.quantity),
      0
    );
    const totalPrice = subtotal + shippingCost;

    const sanityProducts = (items as Array<{
      product: { _id: string; price?: number; optionGroups?: Array<{title?: string; options?: Array<{label?: string; priceDelta?: number}>}> };
      quantity: number;
      customizations?: { [key: string]: string | string[] };
    }>).map((item, index) => {
      const transformedCustomizations = transformCustomizations(
        item.customizations,
        item.product?.optionGroups
      );
      return {
        _key: `item-${index}-${Date.now()}`,
        product: { _type: "reference", _ref: item.product._id },
        quantity: item.quantity,
        customizations: transformedCustomizations,
      };
    });

    const clean = (text: unknown): string => String(text || "").trim();

    const customerPhone = clean(metadata.phone);

    const orderData: { _type: string; [key: string]: unknown } = {
      _type: "order",
      orderNumber: metadata.orderNumber,
      customerName: clean(metadata.customerName),
      email: clean(metadata.customerEmail),
      phone: customerPhone || undefined,
      clerkUserId: metadata.clerkUserId,
      paymentMethod: "cash_on_delivery",
      currency: "mxn",
      products: sanityProducts,
      totalPrice: Number(totalPrice.toFixed(2)),
      subtotal: Number(subtotal.toFixed(2)),
      shippingCost: Number(shippingCost.toFixed(2)),
      orderType: metadata.storeInfo?.deliveryMethod === "pickup" ? "pickup" : "delivery",
      status: metadata.storeInfo?.deliveryMethod === "pickup" ? "pending_pickup" : "pending_delivery",
      orderDate: new Date().toISOString(),
      shippingAddress: {
        line1: clean(metadata.shippingAddress?.line1) || "Dirección no especificada",
        line2: clean(metadata.shippingAddress?.line2),
        city: clean(metadata.shippingAddress?.city),
        state: clean(metadata.shippingAddress?.state),
        postal_code: clean(metadata.shippingAddress?.postal_code),
        country: "MX",
      },
      stripeCustomerId: `cod_${metadata.clerkUserId}`,
      stripePaymentIntentId: `cod_${metadata.orderNumber}`,
    };

    if (metadata.storeInfo?.storeId) {
      orderData.pickupStore = { _type: "reference", _ref: metadata.storeInfo.storeId };
      orderData.affiliateStore = { _type: "reference", _ref: metadata.storeInfo.storeId };
      if (metadata.storeInfo.deliveryMethod === "pickup") {
        orderData.pickupStatus = "in_transit";
        orderData.pickupCode = randomUUID().split("-")[0].toUpperCase();
      }
    }

    const result = await writeClient.create(orderData);
    const customerName = clean(metadata.customerName) || "Cliente";
    const orderNumber = clean(metadata.orderNumber);

    if (customerPhone && orderNumber) {
      void sendOrderConfirmation(customerPhone, customerName, orderNumber).catch(
        (whatsappError) => {
          console.error("[create-cod-order] WhatsApp error:", whatsappError);
        }
      );
    }

    // Disparar oferta de reparto si es delivery
    if (orderData.orderType === "delivery") {
      void dispatchDeliveryOffer(result._id).catch((e) =>
        console.error("[create-cod-order] dispatchDeliveryOffer error:", e)
      );
    }

    return NextResponse.json({ success: true, orderId: result._id, orderNumber: metadata.orderNumber });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error interno";
    console.error("❌ COD API ERROR:", msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

function transformCustomizations(
  customizations: { [key: string]: string | string[] } | undefined,
  optionGroups?: Array<{ title?: string; options?: Array<{ label?: string; priceDelta?: number }> }>
): Array<{ _key: string; title?: string; options?: Array<{ _key: string; label?: string; priceDelta?: number }> }> {
  if (!customizations || Object.keys(customizations).length === 0) return [];

  return Object.entries(customizations).map(([groupKey, selection]) => {
    const groupIndex = parseInt(groupKey.replace("group-", ""), 10);
    const group = optionGroups?.[groupIndex];
    const selectedOptions = Array.isArray(selection) ? selection : [selection];

    return {
      _key: randomUUID(),
      title: group?.title || groupKey,
      options: selectedOptions
        .filter((label) => !!label)
        .map((label) => ({
          _key: randomUUID(),
          label,
          priceDelta: group?.options?.find((o) => o.label === label)?.priceDelta || 0,
        })),
    };
  });
}
