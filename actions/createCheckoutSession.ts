import "server-only";

import { imageUrl } from "@/lib/imageUrl";
import { getStripe } from "@/lib/stripe";
import { buildUrl } from "@/lib/urls";
import { BasketItem } from "@/store/store";
import { buildOrderDocument, OrderAddressInput, OrderItemInput, validateAndQuoteOrder } from "@/lib/order-pricing";
import { backendClient } from "@/sanity/lib/backendClient";
import { assertCurrentLegalAcceptance } from "@/lib/legal-config";
import { resolvePromotionCode, type AutoPromotion } from "@/lib/stripe-promotion";
import type { FulfillmentSelection } from "@/lib/fulfillment-schedule";
import { appendOrderEvent } from "@/lib/order-events";
import { createOrderWithCommercialCap } from "@/lib/commercial-order";

export type Metadata = {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  clerkUserId: string;
  phone?: string;
  whatsappConsent?: string;
  deliveryMethod?: string;
  pickupStoreId?: string;
  pickupStoreName?: string;
  customerAddress?: string;
  shippingCost?: number;
  shippingAddress?: OrderAddressInput;
  deliveryNotes?: string;
  legalAccepted?: boolean;
  fulfillmentTiming?: "asap" | "scheduled";
  scheduledSlot?: {
    startAt: string;
    endAt: string;
    timezone?: string;
  };
};

export type GroupedBasketItem = {
  product: BasketItem["product"];
  notes?: string;
  allergies?: string[];
  quantity: number;
  customizations?: { [key: string]: string | string[] };
  customPrice?: number;
};

function normalizeDeliveryMethod(deliveryMethod?: string) {
  return deliveryMethod === "pickup" ? "click_collect" : deliveryMethod;
}

function buildOrderItems(items: GroupedBasketItem[]): OrderItemInput[] {
  return items.map((item) => ({
    productId: item.product._id,
    quantity: item.quantity,
    customizations: item.customizations,
    notes: item.notes,
    allergies: item.allergies,
  }));
}

function buildShippingAddress(metadata: Metadata): OrderAddressInput | undefined {
  if (metadata.shippingAddress) return metadata.shippingAddress;
  if (!metadata.customerAddress) return undefined;

  const [line1Raw = "", citySegmentRaw = "", stateRaw = ""] = metadata.customerAddress
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean);
  const city = citySegmentRaw.replace(/^\d{4,5}\s+/, "").trim();

  return {
    line1: line1Raw,
    city,
    state: stateRaw,
    country: "MX",
  };
}


async function getEligibleAutoPromotion(orderType: "delivery" | "pickup", paymentMethod: "stripe", storeId: string) {
  const promotions = await backendClient.fetch<AutoPromotion[]>(`*[
    _type == "sale"
    && isActive == true
    && autoApply != false
    && (defined(stripePromotionCodeId) || defined(couponCode))
    && (!defined(validFrom) || validFrom <= now())
    && (!defined(validUntil) || validUntil >= now())
  ] | order(validFrom desc)[]{
    stripePromotionCodeId,
    couponCode,
    allowedOrderTypes,
    allowedPaymentMethods,
    "allowedStores": allowedStores[]._ref
  }`);

  const promotion = promotions.find((candidate) =>
    candidate.allowedOrderTypes?.includes(orderType)
    && candidate.allowedPaymentMethods?.includes(paymentMethod)
    && candidate.allowedStores?.includes(storeId)
  );
  if (!promotion) return null;
  return resolvePromotionCode(getStripe(), promotion);
}

export async function createCheckoutSession(items: GroupedBasketItem[], metadata: Metadata) {
  assertCurrentLegalAcceptance(metadata.legalAccepted);
  const stripe = getStripe();
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("No hay productos para procesar el pago");
  }

  if (!metadata.orderNumber || !metadata.customerName || !metadata.customerEmail || !metadata.clerkUserId) {
    throw new Error("Faltan datos del cliente para procesar el pago");
  }

  const normalizedMethod = normalizeDeliveryMethod(metadata.deliveryMethod);
  const orderType = normalizedMethod === "click_collect" || normalizedMethod === "pickup" ? "pickup" : "delivery";
  const storeId = metadata.pickupStoreId;
  if (!storeId) {
    throw new Error("Tienda requerida para procesar el pedido");
  }

  const quotedOrder = await validateAndQuoteOrder({
    storeId,
    items: buildOrderItems(items),
    orderType,
    paymentMethod: "stripe",
    shippingAddress: buildShippingAddress(metadata),
    fulfillment:
      metadata.fulfillmentTiming === "scheduled" && metadata.scheduledSlot
        ? {
            timing: "scheduled",
            scheduledSlot: metadata.scheduledSlot,
          }
        : ({ timing: "asap" } satisfies FulfillmentSelection),
  });

  const customers = await stripe.customers.list({
    email: metadata.customerEmail,
    limit: 1,
  });

  const customerId =
    customers.data[0]?.id ??
    (
      await stripe.customers.create({
        email: metadata.customerEmail,
        name: metadata.customerName,
        metadata: {
          clerkUserId: metadata.clerkUserId,
        },
      })
    ).id;

  const returnUrl = buildUrl(`/success?session_id={CHECKOUT_SESSION_ID}&orderNumber=${metadata.orderNumber}`);
  const stripeMetadata: Record<string, string> = {
    orderNumber: metadata.orderNumber,
    customerName: metadata.customerName,
    customerEmail: metadata.customerEmail,
    clerkUserId: metadata.clerkUserId,
    phone: metadata.phone ? String(metadata.phone) : "",
    deliveryMethod: normalizedMethod || "delivery",
    pickupStoreId: storeId,
    pickupStoreName: metadata.pickupStoreName || quotedOrder.store.name || "",
    shippingFee: String(quotedOrder.shippingFee),
    platformServiceFee: String(quotedOrder.platformServiceFee),
    productsSubtotal: String(quotedOrder.productsSubtotal),
    grossTotal: String(quotedOrder.grossTotal),
    discount: String(quotedOrder.discount),
    tax: String(quotedOrder.tax),
    fulfillmentTiming: quotedOrder.fulfillment.timing,
  };
  if (quotedOrder.fulfillment.slot) {
    stripeMetadata.scheduledStartAt = quotedOrder.fulfillment.slot.start;
    stripeMetadata.scheduledEndAt = quotedOrder.fulfillment.slot.end;
    stripeMetadata.scheduledTimezone = quotedOrder.fulfillment.slot.timezone;
  }

  const shippingAddress = buildShippingAddress(metadata);
  if (shippingAddress?.line1) stripeMetadata.shippingLine1 = shippingAddress.line1;
  if (shippingAddress?.line2) stripeMetadata.shippingLine2 = shippingAddress.line2;
  if (shippingAddress?.city) stripeMetadata.shippingCity = shippingAddress.city;
  if (shippingAddress?.state) stripeMetadata.shippingState = shippingAddress.state;
  if (shippingAddress?.postal_code) stripeMetadata.shippingPostalCode = shippingAddress.postal_code;
  if (shippingAddress?.country) stripeMetadata.shippingCountry = shippingAddress.country;
  if (typeof shippingAddress?.latitude === "number") stripeMetadata.shippingLatitude = String(shippingAddress.latitude);
  if (typeof shippingAddress?.longitude === "number") stripeMetadata.shippingLongitude = String(shippingAddress.longitude);
  const deliveryNotes = String(metadata.deliveryNotes || "").trim().slice(0, 500);
  if (deliveryNotes) stripeMetadata.deliveryNotes = deliveryNotes;

  const compactOrderItems = JSON.stringify(buildOrderItems(items));
  for (let index = 0; index * 450 < compactOrderItems.length; index += 1) {
    if (index >= 20) {
      throw new Error("Los detalles del pedido exceden el limite permitido");
    }
    stripeMetadata[`orderItems${index}`] = compactOrderItems.slice(index * 450, (index + 1) * 450);
  }

  const itemLookup = new Map(items.map((item) => [item.product._id, item.product]));
  const lineItems = quotedOrder.items.map((item) => {
    const frontendProduct = itemLookup.get(item.product._ref);
    const image = frontendProduct?.image ? imageUrl(frontendProduct.image).url() : undefined;
    return {
      price_data: {
        currency: "mxn",
        unit_amount: Math.round(item.unitTotalPrice * 100),
        product_data: {
          name: String(frontendProduct?.name || "Producto").slice(0, 250),
          description: `Product ID: ${item.product._ref}`.slice(0, 500),
          metadata: {
            id: String(item.product._ref).slice(0, 500),
          },
          images: image && image.startsWith("https://") ? [image] : undefined,
        },
      },
      quantity: item.quantity,
    };
  });

  if (orderType === "delivery" && quotedOrder.shippingFee > 0) {
    lineItems.push({
      price_data: {
        currency: "mxn",
        unit_amount: Math.round(quotedOrder.shippingFee * 100),
        product_data: { name: "Costo de envio", description: "Entrega a domicilio", metadata: { id: "shipping-fee" }, images: undefined },
      },
      quantity: 1,
    });
  }

  const autoPromotionCode = await getEligibleAutoPromotion(orderType, "stripe", storeId);

  if (quotedOrder.platformServiceFee > 0) lineItems.push({
    price_data: {
      currency: "mxn",
      unit_amount: Math.round(quotedOrder.platformServiceFee * 100),
      product_data: {
        name: "Tarifa de servicio de ElMenu",
        description: "Uso de la plataforma",
        metadata: { id: "platform-service-fee" },
        images: undefined,
      },
    },
    quantity: 1,
  });
  const totalStripeAmount = lineItems.reduce((sum, item) => sum + item.price_data.unit_amount * item.quantity, 0);
  if (totalStripeAmount < 1000) {
    throw new Error("El monto minimo para procesar el pago con tarjeta es de $10.00 MXN.");
  }

  const createSession = (promotionCode?: string | null) => stripe.checkout.sessions.create({
    customer: customerId,
    metadata: stripeMetadata,
    mode: "payment",
    ...(promotionCode ? { discounts: [{ promotion_code: promotionCode }] } : { allow_promotion_codes: true }),
    payment_method_types: ["card"],
    phone_number_collection: { enabled: false },
    ui_mode: "embedded",
    return_url: returnUrl,
    line_items: lineItems,
  });

  let session;
  try {
    session = await createSession(autoPromotionCode);
  } catch (error) {
    const isPromotionError = error instanceof Error && /promotion|coupon|discount/i.test(error.message);
    if (!autoPromotionCode || !isPromotionError) throw error;
    session = await createSession();
  }

  const reservedOrder = {
    ...buildOrderDocument({
      orderNumber: metadata.orderNumber,
      clerkUserId: metadata.clerkUserId,
      customerName: metadata.customerName,
      customerEmail: metadata.customerEmail,
      phone: String(metadata.phone || ""),
      storeId,
      orderType,
      paymentMethod: "stripe",
      quote: quotedOrder,
      shippingAddress,
      paymentStatus: "pending",
      dispatchStatus:
        orderType === "delivery" && quotedOrder.fulfillment.timing === "scheduled"
          ? "scheduled"
          : orderType === "delivery"
            ? "waiting_for_driver"
            : "not_required",
      stripeCheckoutSessionId: session.id,
      stripeCustomerId: customerId,
      deliveryNotes,
    }),
    _id: `stripe-order-${session.id}`,
    expiredAt: session.expires_at
      ? new Date(session.expires_at * 1000).toISOString()
      : undefined,
  };
  const storedReservation = await createOrderWithCommercialCap(reservedOrder as any) as any;
  if (!Array.isArray(storedReservation.orderEvents) || storedReservation.orderEvents.length === 0) {
    await appendOrderEvent(storedReservation._id, {
      type: "created",
      source: "checkout-reservation",
      actor: metadata.clerkUserId,
    });
    await appendOrderEvent(storedReservation._id, {
      type: "payment_pending",
      source: "checkout-reservation",
      actor: metadata.clerkUserId,
    });
    if (quotedOrder.fulfillment.timing === "scheduled") {
      await appendOrderEvent(storedReservation._id, {
        type: "scheduled_order_created",
        source: "checkout-reservation",
        actor: metadata.clerkUserId,
        payload: { scheduledSlot: reservedOrder.scheduledSlot },
      });
    }
  }

  return session.client_secret;
}

