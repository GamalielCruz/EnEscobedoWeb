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
      // Don't set customer_creation since we always have a customer now
      metadata,
      mode: "payment",
      allow_promotion_codes: true,
      payment_method_types: ["card", "oxxo", "customer_balance"],
      payment_method_options: {
        oxxo: {
          expires_after_days: 2,
        },
        customer_balance: {
          funding_type: "bank_transfer",
          bank_transfer: {
            type: "mx_bank_transfer",
          },
        },
      },
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
      // Solo recopilar dirección de envío si NO es Click & Collect
      ...(metadata.deliveryMethod !== 'click_collect' && {
        shipping_address_collection: {
          allowed_countries: ["MX"],
        },
      }),
      // Solo agregar opciones de envío si NO es Click & Collect
      ...(metadata.deliveryMethod !== 'click_collect' && {
        shipping_options: [
          {
            shipping_rate_data: {
              type: "fixed_amount",
              fixed_amount: {
                amount: 14800,
                currency: "mxn",
              },
              display_name: "Envío nacional",
              delivery_estimate: {
                minimum: {
                  unit: "business_day",
                  value: 2,
                },
                maximum: {
                  unit: "business_day",
                  value: 10,
                },
              },
            },
          },
          {
            shipping_rate_data: {
              type: "fixed_amount",
              fixed_amount: {
                amount: 30000,
                currency: "mxn",
              },
              display_name: "Envío Express",
              delivery_estimate: {
                minimum: {
                  unit: "business_day",
                  value: 1,
                },
                maximum: {
                  unit: "business_day",
                  value: 2,
                },
              },
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

    // Provide more specific error messages
    if (
      isStripeError(error) &&
      error.code === "parameter_invalid_empty" &&
      error.param === "customer"
    ) {
      throw new Error(
        "Error de configuración: No se pudo crear el customer para transferencias bancarias"
      );
    }

    if (isStripeError(error) && error.code === "payment_method_not_available") {
      throw new Error(
        "Las transferencias bancarias SPEI no están disponibles temporalmente"
      );
    }

    if (isStripeError(error) && error.message?.includes("customer_balance")) {
      throw new Error(
        "Error con transferencias bancarias. Por favor intenta con otro método de pago"
      );
    }

    throw error;
  }
}
