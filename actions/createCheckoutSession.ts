"use server";

import { imageUrl } from "@/lib/imageUrl";
import stripe from "@/lib/stripe";
import { BasketItem } from "@/store/store";
import { buildUrl } from "@/lib/urls";

export type Metadata = {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  clerkUserId: string;
  deliveryMethod?: string;
  pickupStoreId?: string;
  pickupStoreName?: string;
  customerAddress?: string;
  shippingCost?: number; // Agregar costo de envío
};

export type GroupedBasketItem = {
  product: BasketItem["product"];
  quantity: number;
};

export async function createCheckoutSession(
  items: GroupedBasketItem[],
  metadata: Metadata
) {
  try {
    const itemsWithoutPrice = items.filter((item) => !item.product.price);
    if (itemsWithoutPrice.length > 0) {
      throw new Error(
        "No se puede crear una sesión de checkout con productos sin precio"
      );
    }

    // For customer_balance payments, we always need a customer
    // First, try to find existing customer
    const customers = await stripe.customers.list({
      email: metadata.customerEmail,
      limit: 1,
    });

    let customerId: string;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    } else {
      // Create a new customer if none exists
      const newCustomer = await stripe.customers.create({
        email: metadata.customerEmail,
        name: metadata.customerName,
        metadata: {
          clerkUserId: metadata.clerkUserId,
        },
      });
      customerId = newCustomer.id;
    }

    // Use public URLs for Stripe redirects to ensure users are redirected to the correct domain
    const success_url = buildUrl(
      `/success?session_id={CHECKOUT_SESSION_ID}&orderNumber=${metadata.orderNumber}`
    );
    const cancel_url = buildUrl("/basket");

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      metadata,
      mode: "payment",
      allow_promotion_codes: true,
      payment_method_types: ["card"], // Solo tarjeta
      phone_number_collection: {
        enabled: true,
      },
      success_url: success_url,
      cancel_url: cancel_url,
      line_items: items.map((item) => ({
        price_data: {
          currency: "mxn",
          unit_amount: Math.round(item.product.price! * 100),
          product_data: {
            name: item.product.name || "Producto sin nombre",
            description: `Product ID: ${item.product._id}`,
            metadata: {
              id: item.product._id,
            },
            images: item.product.image
              ? [imageUrl(item.product.image).url()]
              : undefined,
          },
        },
        quantity: item.quantity,
      })),
      // Solo agregar opciones de envío si NO es Click & Collect y hay costo de envío
      ...(metadata.deliveryMethod !== 'click_collect' && metadata.shippingCost && metadata.shippingCost > 0 && {
        shipping_options: [
          {
            shipping_rate_data: {
              type: "fixed_amount",
              fixed_amount: {
                amount: Math.round(metadata.shippingCost * 100), // Usar el costo real del metadata
                currency: "mxn",
              },
              display_name: "Envío a domicilio",
             
            },
          },
        ],
      }),
    });

    return session.url;
  } catch (error: unknown) {
    console.error("Error al crear la sesión de checkout", error);

    // Type guard to check if error is a Stripe error or has expected properties
    const isStripeError = (
      err: unknown
    ): err is { code?: string; param?: string; message?: string } => {
      return typeof err === "object" && err !== null;
    };

    // Provide more specific error messages for card payments
    if (isStripeError(error) && error.code === "card_declined") {
      throw new Error(
        "Tu tarjeta fue rechazada. Por favor intenta con otra tarjeta."
      );
    }

    if (isStripeError(error) && error.code === "payment_method_not_available") {
      throw new Error(
        "El método de pago no está disponible temporalmente. Por favor intenta de nuevo."
      );
    }

    throw error;
  }
}