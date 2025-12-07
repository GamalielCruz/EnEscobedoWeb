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

    // Create order in Sanity
    const order = await backendClient.create({
      _type: "order",
      orderNumber: metadata.orderNumber,
      customerName: metadata.customerName,
      email: metadata.customerEmail,
      phone: metadata.phone,
      clerkUserId: metadata.clerkUserId,
      paymentMethod: "cash_on_delivery",
      currency: "mxn",
      products: sanityProducts,
      totalPrice: totalPrice,
      subtotal: subtotal,
      shippingCost: shippingCost,
      status: "pending_delivery", // Special status for COD orders
      orderDate: new Date().toISOString(),
      shippingAddress: {
        line1: metadata.shippingAddress.line1,
        line2: metadata.shippingAddress.line2,
        city: metadata.shippingAddress.city,
        state: metadata.shippingAddress.state,
        postal_code: metadata.shippingAddress.postal_code,
        country: metadata.shippingAddress.country,
      },
      // COD specific fields
      codInstructions: "El pago se realizará en efectivo al momento de la entrega",
      deliveryNotes: "Orden con pago contra entrega - verificar monto exacto",
    });

    console.log("Cash on Delivery order created:", order._id);
    return {
      success: true,
      orderId: order._id,
      orderNumber: metadata.orderNumber,
      totalAmount: totalPrice,
    };

  } catch (error) {
    console.error("Error creating Cash on Delivery order:", error);
    throw new Error("No se pudo crear la orden de pago contra entrega");
  }
}