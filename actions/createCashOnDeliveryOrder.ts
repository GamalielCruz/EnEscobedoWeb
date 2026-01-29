"use server";

import { backendClient } from "@/sanity/lib/backendClient";
import { BasketItem } from "@/store/store";

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
};

export async function createCashOnDeliveryOrder(
  items: GroupedBasketItem[],
  metadata: CashOnDeliveryMetadata,
  shippingCost: number = 148 // Default shipping cost in MXN
) {
  try {
    const itemsWithoutPrice = items.filter((item) => !item.product.price);
    if (itemsWithoutPrice.length > 0) {
      throw new Error(
        "No se puede crear una orden con productos sin precio"
      );
    }

    // Calculate total
    const subtotal = items.reduce(
      (total, item) => total + (item.product.price! * item.quantity),
      0
    );
    const totalPrice = subtotal + shippingCost;

    // Prepare products for Sanity
    const sanityProducts = items.map((item) => ({
      _key: crypto.randomUUID(),
      product: {
        _type: "reference",
        _ref: item.product._id,
      },
      quantity: item.quantity,
    }));

    // Ensure shipping address has all required fields and clean text
    const cleanText = (text: string | undefined | null): string => {
      if (!text) return "";
      // Remove invisible characters, zero-width spaces, and other problematic Unicode
      return text
        .replace(/[\u200B-\u200D\uFEFF]/g, '') // Zero-width spaces
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Control characters
        .replace(/[\u2000-\u206F]/g, ' ') // General punctuation block
        .replace(/[\uFFF0-\uFFFF]/g, '') // Specials block
        .trim();
    };

    const shippingAddress = {
      line1: cleanText(metadata.shippingAddress.line1) || "Dirección no especificada",
      line2: cleanText(metadata.shippingAddress.line2) || "",
      city: cleanText(metadata.shippingAddress.city) || "Ciudad no especificada",
      state: cleanText(metadata.shippingAddress.state) || "Estado no especificado",
      postal_code: cleanText(metadata.shippingAddress.postal_code) || "00000",
      country: cleanText(metadata.shippingAddress.country) || "MX",
    };

    console.log("Creating COD order with shipping address:", shippingAddress);

    // Create order in Sanity
    const order = await backendClient.create({
      _type: "order",
      orderNumber: metadata.orderNumber,
      customerName: metadata.customerName,
      email: metadata.customerEmail,
      phone: metadata.phone || "No especificado",
      clerkUserId: metadata.clerkUserId,
      paymentMethod: "cash_on_delivery",
      currency: "mxn",
      products: sanityProducts,
      totalPrice: totalPrice,
      subtotal: subtotal,
      shippingCost: shippingCost,
      status: metadata.storeInfo?.deliveryMethod === 'pickup' ? "pending_pickup" : "pending_delivery",
      orderDate: new Date().toISOString(),
      shippingAddress: shippingAddress,
      
      // COD orders don't have Stripe IDs, so we'll use placeholder values or make them optional
      stripeCustomerId: "cod_customer_" + metadata.clerkUserId,
      stripePaymentIntentId: "cod_payment_" + metadata.orderNumber,
      
      // Store information if available
      ...(metadata.storeInfo && {
        pickupStore: {
          _type: "reference",
          _ref: metadata.storeInfo.storeId,
        },
        deliveryMethod: metadata.storeInfo.deliveryMethod === 'pickup' ? 'click_collect' : 'home_delivery',
        estimatedPickupDate: metadata.storeInfo.deliveryMethod === 'pickup' 
          ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours from now
          : undefined,
        pickupStatus: metadata.storeInfo.deliveryMethod === 'pickup' ? 'in_transit' : undefined,
        pickupCode: metadata.storeInfo.deliveryMethod === 'pickup' 
          ? Math.random().toString(36).substring(2, 10).toUpperCase()
          : undefined,
      }),
      
      // COD specific fields
      codInstructions: metadata.storeInfo?.deliveryMethod === 'pickup' 
        ? `Pago en efectivo al recoger en: ${cleanText(metadata.storeInfo.storeName)}. Monto total: $${totalPrice.toFixed(2)} MXN. ${cleanText(metadata.storeInfo.estimatedDelivery)}`
        : `Pago en efectivo al momento de la entrega. Monto total: $${totalPrice.toFixed(2)} MXN. ${cleanText(metadata.storeInfo?.estimatedDelivery || 'Tiempo estimado por confirmar')}`,
      deliveryNotes: metadata.storeInfo?.deliveryMethod === 'pickup'
        ? `RECOGER EN TIENDA: ${cleanText(metadata.storeInfo.storeName)} - ${cleanText(metadata.storeInfo.storeAddress)}. Tel: ${cleanText(metadata.storeInfo.storePhone)}. Verificar monto exacto: $${totalPrice.toFixed(2)} MXN`
        : `ENTREGA A DOMICILIO - Verificar monto exacto: $${totalPrice.toFixed(2)} MXN. Direccion: ${cleanText(shippingAddress.line1)}, ${cleanText(shippingAddress.city)}, ${cleanText(shippingAddress.state)}`,
    });

    console.log("Cash on Delivery order created successfully:", {
      orderId: order._id,
      orderNumber: metadata.orderNumber,
      shippingAddress: shippingAddress,
      storeInfo: metadata.storeInfo
    });

    return {
      success: true,
      orderId: order._id,
      orderNumber: metadata.orderNumber,
      totalAmount: totalPrice,
    };

  } catch (error) {
    console.error("Error creating Cash on Delivery order:", error);
    console.error("Metadata received:", metadata);
    throw new Error("No se pudo crear la orden de pago contra entrega: " + (error instanceof Error ? error.message : 'Error desconocido'));
  }
}