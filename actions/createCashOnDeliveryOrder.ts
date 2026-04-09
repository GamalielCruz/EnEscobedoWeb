"use server";

import { writeClient } from "@/sanity/lib/client";
import { BasketItem } from "@/store/store";
import { randomUUID } from "crypto";

export type CashOnDeliveryMetadata = {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  clerkUserId: string;
  phone: string;
  shippingAddress: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postal_code: string;
    country: string;
  };
  storeInfo?: {
    storeId: string;
    storeName: string;
    storeAddress: string;
    storePhone: string;
    deliveryMethod: 'delivery' | 'pickup';
    estimatedDelivery: string;
  };
};

export type GroupedBasketItem = {
  product: BasketItem["product"];
  quantity: number;
  customizations?: { [key: string]: string | string[] };
  customPrice?: number;
};

export async function createCashOnDeliveryOrder(
  items: GroupedBasketItem[],
  metadata: CashOnDeliveryMetadata,
  shippingCost: number = 0
) {
  try {
    console.log("[COD ACTION] Starting order creation:", metadata.orderNumber);

    // Deep validation of items
    if (!items || items.length === 0) throw new Error("La lista de productos está vacía");
    
    const validItems = items.filter(item => item.product && item.product._id && item.product.price);
    if (validItems.length !== items.length) {
      const invalidNames = items.filter(i => !i.product?._id || !i.product?.price).map(i => i.product?.name || "Desconocido");
      throw new Error(`Hay productos inválidos o sin precio: ${invalidNames.join(", ")}`);
    }

    // Calculate subtotal
    const subtotal = items.reduce(
      (total, item) => total + (item.product.price! * item.quantity),
      0
    );
    const totalPrice = subtotal + shippingCost;

    // Prepare products for Sanity with explicit keys
    console.log("🔥 COD ITEMS:", JSON.stringify(items, null, 2));
    console.log("🔥 FIRST ITEM:", JSON.stringify(items[0], null, 2));
    console.log("🔥 CUSTOMIZATIONS RAW:", items[0]?.customizations);
    console.log("🔥 OPTION GROUPS RAW:", items[0]?.product?.optionGroups);
    console.log("🔥 TRANSFORMED CUSTOMIZATIONS:", JSON.stringify(
      transformCustomizations(items[0]?.customizations, items[0]?.product?.optionGroups as any),
      null, 2
    ));

    const sanityProducts = items.map((item, index) => {
      const transformedCustomizations = transformCustomizations(
        item.customizations,
        item.product?.optionGroups as any
      );
      return {
        _key: `item-${index}-${Date.now()}`,
        product: {
          _type: "reference",
          _ref: item.product._id,
        },
        quantity: item.quantity,
        customizations: transformedCustomizations,
      };
    });

    // Cleaning logic
    const clean = (text: any): string => String(text || "").trim();

    const orderData: any = {
      _type: "order",
      orderNumber: metadata.orderNumber,
      customerName: clean(metadata.customerName),
      email: clean(metadata.customerEmail),
      phone: clean(metadata.phone) || "No especificado",
      clerkUserId: metadata.clerkUserId,
      paymentMethod: "cash_on_delivery",
      currency: "mxn",
      products: sanityProducts,
      totalPrice: Number(totalPrice.toFixed(2)),
      subtotal: Number(subtotal.toFixed(2)),
      shippingCost: Number(shippingCost.toFixed(2)),
      status: metadata.storeInfo?.deliveryMethod === 'pickup' ? "pending_pickup" : "pending_delivery",
      orderDate: new Date().toISOString(),
      shippingAddress: {
        line1: clean(metadata.shippingAddress.line1) || "Dirección no especificada",
        line2: clean(metadata.shippingAddress.line2),
        city: clean(metadata.shippingAddress.city),
        state: clean(metadata.shippingAddress.state),
        postal_code: clean(metadata.shippingAddress.postal_code),
        country: "MX",
      },
      stripeCustomerId: `cod_${metadata.clerkUserId}`,
      stripePaymentIntentId: `cod_${metadata.orderNumber}`,
    };

    // Store link
    if (metadata.storeInfo?.storeId) {
      // Usar tanto pickupStore como affiliateStore para máxima compatibilidad
      orderData.pickupStore = {
        _type: "reference",
        _ref: metadata.storeInfo.storeId,
      };
      orderData.affiliateStore = {
        _type: "reference",
        _ref: metadata.storeInfo.storeId,
      };
      orderData.deliveryMethod = metadata.storeInfo.deliveryMethod === 'pickup' ? 'click_collect' : 'home_delivery';
      
      if (metadata.storeInfo.deliveryMethod === 'pickup') {
        orderData.pickupStatus = "in_transit";
        orderData.pickupCode = randomUUID().split('-')[0].toUpperCase();
      }
    }

    // Final Sanity Create
    console.log("[COD ACTION] Submitting to Sanity...");
    const result = await writeClient.create(orderData);
    console.log("[COD ACTION] Success! ID:", result._id);

    return {
      success: true,
      orderId: result._id,
      orderNumber: metadata.orderNumber,
    };

  } catch (error: any) {
    console.error("[COD ACTION] CRITICAL ERROR:", error.message || error);
    return {
      success: false,
      error: error.message || "Error desconocido al crear la orden"
    };
  }
}

function transformCustomizations(
  customizations: { [key: string]: string | string[] } | undefined,
  optionGroups?: Array<{
    title?: string;
    options?: Array<{ label?: string; priceDelta?: number }>;
  }>
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
