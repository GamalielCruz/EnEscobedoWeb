import "server-only";

import { imageUrl } from "@/lib/imageUrl";
import { getStripe } from "@/lib/stripe";
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
  customizations?: { [key: string]: string | string[] };
  customPrice?: number;
};

export async function createCheckoutSession(
  items: GroupedBasketItem[],
  metadata: Metadata
) {
  try {
    const stripe = getStripe();
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error("No hay productos para procesar el pago");
    }

    if (
      !metadata.orderNumber ||
      !metadata.customerName ||
      !metadata.customerEmail ||
      !metadata.clerkUserId
    ) {
      throw new Error("Faltan datos del cliente para procesar el pago");
    }

    const itemsWithoutPrice = items.filter(
      (item) =>
        !item.product?.price ||
        Number.isNaN(item.product.price) ||
        item.product.price <= 0
    );
    if (itemsWithoutPrice.length > 0) {
      throw new Error(
        "No se puede crear una sesión de checkout con productos sin precio"
      );
    }

    const normalizedDeliveryMethod =
      metadata.deliveryMethod === "pickup"
        ? "click_collect"
        : metadata.deliveryMethod;
    const metadataForStripe: Metadata = {
      ...metadata,
      deliveryMethod: normalizedDeliveryMethod,
    };

    const customers = await stripe.customers.list({
      email: metadataForStripe.customerEmail,
      limit: 1,
    });

    let customerId: string;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    } else {
      const newCustomer = await stripe.customers.create({
        email: metadataForStripe.customerEmail,
        name: metadataForStripe.customerName,
        metadata: {
          clerkUserId: metadataForStripe.clerkUserId,
        },
      });
      customerId = newCustomer.id;
    }

    const return_url = buildUrl(
      `/success?session_id={CHECKOUT_SESSION_ID}&orderNumber=${metadataForStripe.orderNumber}`
    );

    const stripeMetadata: Record<string, string> = {};
    for (const [key, value] of Object.entries(metadataForStripe)) {
      if (value !== undefined && value !== null) {
        stripeMetadata[key] = String(value).slice(0, 500);
      }
    }

    const itemsWithCustomizations = items.map((item) => ({
      productId: item.product._id,
      quantity: item.quantity,
      price: item.product.price,
      customizations: item.customizations,
      customPrice: item.customPrice,
      optionGroups: item.product.optionGroups?.map((group) => ({
        title: group.title,
        options: group.options?.map((option) => ({
          label: option.label,
          priceDelta: option.priceDelta,
        })),
      })),
    }));
    const itemsWithCustomizationsJson = JSON.stringify(itemsWithCustomizations);

    if (itemsWithCustomizationsJson.length <= 500) {
      stripeMetadata.itemsWithCustomizations = itemsWithCustomizationsJson;
    } else {
      const minimalItems = items.map((item) => ({
        productId: item.product._id,
        quantity: item.quantity,
        price: item.product.price,
        customPrice: item.customPrice,
      }));
      const minimalItemsJson = JSON.stringify(minimalItems);

      if (minimalItemsJson.length <= 500) {
        stripeMetadata.itemsWithCustomizations = minimalItemsJson;
      } else {
        throw new Error("Los detalles del pedido exceden el límite permitido");
      }
    }

    const lineItems = items.map((item) => {
      if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
        throw new Error("Cantidad inválida en los productos");
      }
      const unitAmount = Math.round(item.product.price! * 100);
      if (!Number.isFinite(unitAmount) || unitAmount <= 0) {
        throw new Error("Precio inválido en los productos");
      }
      const image = item.product.image
        ? imageUrl(item.product.image).url()
        : undefined;
      const safeImages =
        image && image.startsWith("https://") ? [image] : undefined;
      return {
        price_data: {
          currency: "mxn",
          unit_amount: unitAmount,
          product_data: {
            name: (item.product.name || "Producto sin nombre").slice(0, 250),
            description: `Product ID: ${item.product._id}`.slice(0, 500),
            metadata: {
              id: String(item.product._id).slice(0, 500),
            },
            images: safeImages,
          },
        },
        quantity: Math.floor(item.quantity),
      };
    });

    // Validar el monto mínimo de Stripe ($10.00 MXN / 1000 centavos)
    const totalLineItemsAmount = lineItems.reduce((sum, item) => {
      return sum + (item.price_data.unit_amount * item.quantity);
    }, 0);

    const shippingAmount = (normalizedDeliveryMethod !== "click_collect" &&
      metadataForStripe.shippingCost &&
      metadataForStripe.shippingCost > 0)
        ? Math.round(metadataForStripe.shippingCost * 100)
        : 0;

    const totalStripeAmount = totalLineItemsAmount + shippingAmount;

    if (totalStripeAmount < 1000) {
      throw new Error(
        "El monto mínimo para procesar el pago con tarjeta es de $10.00 MXN. Agrega más productos para pagar en línea, o selecciona pagar en efectivo."
      );
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      metadata: stripeMetadata,
      mode: "payment",
      allow_promotion_codes: true,
      payment_method_types: ["card"], // Solo tarjeta
      phone_number_collection: {
        enabled: true,
      },
      ui_mode: "embedded",
      return_url: return_url,
      line_items: lineItems,
      // Solo agregar opciones de envío si NO es Click & Collect y hay costo de envío
      ...(normalizedDeliveryMethod !== "click_collect" &&
        metadataForStripe.shippingCost &&
        metadataForStripe.shippingCost > 0 && {
          shipping_options: [
            {
              shipping_rate_data: {
                type: "fixed_amount",
                fixed_amount: {
                  amount: Math.round(metadataForStripe.shippingCost * 100),
                  currency: "mxn",
                },
                display_name: "Envío a domicilio",
              },
            },
          ],
        }),
    });

    return session.client_secret;
  } catch (error: unknown) {
    console.error("Error al crear la sesión de checkout", error);

    // Type guard to check if error is a Stripe error or has expected properties
    const isStripeError = (
      err: unknown
    ): err is { code?: string; param?: string; message?: string; type?: string } => {
      return typeof err === "object" && err !== null;
    };

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

    if (
      isStripeError(error) &&
      (error.type === "StripeInvalidRequestError" ||
        (error.message &&
          error.message.toLowerCase().includes("metadata")))
    ) {
      const paramInfo = error.param ? ` (${error.param})` : "";
      throw new Error(
        `Datos de pago inválidos: ${error.message || "Revisa los productos y vuelve a intentar."}${paramInfo}`
      );
    }

    throw error;
  }
}
