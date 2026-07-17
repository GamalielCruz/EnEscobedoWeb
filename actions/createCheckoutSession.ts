import "server-only";

import { imageUrl } from "@/lib/imageUrl";
import { getStripe } from "@/lib/stripe";
import { buildUrl } from "@/lib/urls";
import { BasketItem } from "@/store/store";
import { OrderAddressInput, OrderItemInput, validateAndQuoteOrder } from "@/lib/order-pricing";
import { backendClient } from "@/sanity/lib/backendClient";
import { assertCurrentLegalAcceptance } from "@/lib/legal-config";

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
};

export type GroupedBasketItem = {
  product: BasketItem["product"];
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

type AutoPromotion = {
  stripePromotionCodeId?: string;
  couponCode?: string;
  allowedOrderTypes?: string[];
  allowedPaymentMethods?: string[];
  allowedStores?: string[];
};

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
  if (promotion.stripePromotionCodeId) {
    const promotionCode = await getStripe().promotionCodes.retrieve(promotion.stripePromotionCodeId);
    return promotionCode.active ? promotionCode.id : null;
  }

  const promotionCodes = await getStripe().promotionCodes.list({
    code: promotion.couponCode,
    active: true,
    limit: 1,
  });
  return promotionCodes.data[0]?.id ?? null;
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
    productsSubtotal: String(quotedOrder.productsSubtotal),
    grossTotal: String(quotedOrder.grossTotal),
    discount: String(quotedOrder.discount),
    tax: String(quotedOrder.tax),
  };

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
  if (compactOrderItems.length > 500) {
    throw new Error("Los detalles del pedido exceden el limite permitido");
  }
  stripeMetadata.orderItems = compactOrderItems;

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

  return session.client_secret;
}

