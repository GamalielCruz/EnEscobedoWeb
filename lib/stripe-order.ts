import { appendOrderEvent } from "@/lib/order-events";
import { buildOrderDocument, buildStoreMapsUrl, OrderAddressInput, OrderItemInput, validateAndQuoteOrder } from "@/lib/order-pricing";
import { notifyRestaurantNewOrder } from "@/lib/restaurant-notifications";
import { getPaymentMethodLabel } from "@/lib/payment";
import { getStripe } from "@/lib/stripe";
import { extractSpeiDetails } from "@/lib/spei-reference-extractor";
import { sendOrderConfirmation, sendPickupOrderReceived } from "@/lib/whatsapp";
import { syncBaserowOrder, syncBaserowOrderById } from "@/lib/baserow";
import { backendClient } from "@/sanity/lib/backendClient";
import { after } from "next/server";
import Stripe from "stripe";

type ExistingOrder = {
  _id: string;
  orderNumber?: string;
  stripeCheckoutSessionId?: string;
  status?: string;
  orderType?: "delivery" | "pickup";
  paymentStatus?: string;
  paidAt?: string;
  baserowRowId?: number;
  [key: string]: unknown;
};

type StripeSessionMetadata = {
  orderNumber?: string;
  customerName?: string;
  customerEmail?: string;
  clerkUserId?: string;
  phone?: string;
  deliveryMethod?: string;
  pickupStoreId?: string;
  pickupStoreName?: string;
  shippingLine1?: string;
  shippingLine2?: string;
  shippingCity?: string;
  shippingState?: string;
  shippingPostalCode?: string;
  shippingCountry?: string;
  shippingLatitude?: string;
  shippingLongitude?: string;
  orderItems?: string;
};

type OrderDocumentRecord = {
  _id?: string;
  _type: string;
  orderType?: "delivery" | "pickup";
  paymentStatus?: string;
  phone?: string;
  customerName?: string;
  orderNumber?: string;
  [key: string]: unknown;
};

function getMetadata(session: Stripe.Checkout.Session) {
  return (session.metadata ?? {}) as StripeSessionMetadata;
}

async function findExistingOrder(sessionId: string, orderNumber?: string) {
  return backendClient.fetch<ExistingOrder | null>(`*[_type == "order" && (stripeCheckoutSessionId == $sessionId || orderNumber == $orderNumber)][0]{ ..., "restaurantName": affiliateStore->name }`,
    { sessionId, orderNumber }
  );
}

function inferPaymentMethod(session: Stripe.Checkout.Session, paymentMethodType?: string | null) {
  if (paymentMethodType) {
    if (paymentMethodType === "customer_balance") return "bank_transfer";
    if (paymentMethodType === "card") return "stripe";
    return paymentMethodType;
  }
  if (session.payment_method_types?.includes("oxxo")) return "oxxo";
  if (session.payment_method_types?.includes("customer_balance")) return "bank_transfer";
  return "stripe";
}

async function resolvePaymentMethod(stripe: Stripe, session: Stripe.Checkout.Session) {
  if (!session.payment_intent) return inferPaymentMethod(session);

  try {
    const pi = await stripe.paymentIntents.retrieve(session.payment_intent as string);
    if (!pi.payment_method) return inferPaymentMethod(session);
    const pm = await stripe.paymentMethods.retrieve(pi.payment_method as string);
    return inferPaymentMethod(session, pm.type);
  } catch (error) {
    console.log("[stripe-order] Could not retrieve payment method details:", error);
    return inferPaymentMethod(session);
  }
}

function getOrderType(metadata: StripeSessionMetadata) {
  return metadata.deliveryMethod === "click_collect" || metadata.deliveryMethod === "pickup" ? "pickup" : "delivery";
}

function parseOrderItems(metadata: StripeSessionMetadata) {
  if (!metadata.orderItems) throw new Error("Missing order items metadata");
  const parsed = JSON.parse(metadata.orderItems) as OrderItemInput[];
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("Invalid order items metadata");
  return parsed;
}

function parseShippingAddress(metadata: StripeSessionMetadata): OrderAddressInput | undefined {
  const line1 = String(metadata.shippingLine1 || "").trim();
  if (!line1) return undefined;

  const latitude = metadata.shippingLatitude ? Number(metadata.shippingLatitude) : undefined;
  const longitude = metadata.shippingLongitude ? Number(metadata.shippingLongitude) : undefined;

  return {
    line1,
    line2: metadata.shippingLine2,
    city: metadata.shippingCity,
    state: metadata.shippingState,
    postal_code: metadata.shippingPostalCode,
    country: metadata.shippingCountry || "MX",
    latitude: Number.isFinite(latitude) ? latitude : undefined,
    longitude: Number.isFinite(longitude) ? longitude : undefined,
  };
}

async function resolveStripeFee(stripe: Stripe, session: Stripe.Checkout.Session) {
  if (!session.payment_intent) return 0;

  try {
    const pi = await stripe.paymentIntents.retrieve(session.payment_intent as string, {
      expand: ["latest_charge.balance_transaction"],
    });
    const latestCharge = pi.latest_charge as Stripe.Charge | null;
    const balanceTx = latestCharge?.balance_transaction as Stripe.BalanceTransaction | null;
    return Math.round((balanceTx?.fee ?? 0)) / 100;
  } catch (error) {
    console.log("[stripe-order] Could not retrieve Stripe fee:", error);
    return 0;
  }
}

async function resolveOfflinePaymentData(stripe: Stripe, session: Stripe.Checkout.Session, paymentMethod: string) {
  let bankTransferReference: string | undefined;
  let bankTransferClabe: string | undefined;
  let oxxoReference: string | undefined;

  if (paymentMethod === "bank_transfer" && session.payment_intent) {
    try {
      const speiDetails = await extractSpeiDetails(session.payment_intent as string);
      bankTransferReference = speiDetails.reference;
      bankTransferClabe = speiDetails.clabe;
    } catch (error) {
      console.log("[stripe-order] Could not extract SPEI details:", error);
      bankTransferReference = String(getMetadata(session).orderNumber || "").replace(/-/g, "").slice(-8);
    }
  }

  if (paymentMethod === "oxxo" && session.payment_intent) {
    try {
      const pi = (await stripe.paymentIntents.retrieve(session.payment_intent as string, {
        expand: ["charges.data.payment_method_details"],
      })) as Stripe.PaymentIntent & { charges?: { data: Stripe.Charge[] } };

      const nextAction = pi.next_action?.oxxo_display_details as { number?: string; reference?: string } | undefined;
      const chargeOxxo = pi.charges?.data?.[0]?.payment_method_details?.oxxo as { number?: string; reference?: string } | undefined;
      oxxoReference = nextAction?.number || nextAction?.reference || chargeOxxo?.number || chargeOxxo?.reference;
    } catch (error) {
      console.log("[stripe-order] Could not extract OXXO reference:", error);
    }
  }

  return { bankTransferReference, bankTransferClabe, oxxoReference };
}

function getPaymentStatus(session: Stripe.Checkout.Session) {
  return session.payment_status === "paid" ? ("paid" as const) : ("pending" as const);
}

async function buildOrderData(session: Stripe.Checkout.Session, stripe: Stripe): Promise<OrderDocumentRecord> {
  const metadata = getMetadata(session);
  const orderNumber = String(metadata.orderNumber || "");
  const customerName = String(metadata.customerName || "").trim();
  const customerEmail = String(metadata.customerEmail || "").trim();
  const clerkUserId = String(metadata.clerkUserId || "").trim();
  const storeId = String(metadata.pickupStoreId || "").trim();

  if (!orderNumber || !customerName || !customerEmail || !clerkUserId || !storeId) {
    throw new Error("Missing required order metadata");
  }

  const orderType = getOrderType(metadata);
  const paymentMethod = await resolvePaymentMethod(stripe, session);
  const shippingAddress = parseShippingAddress(metadata);
  const orderItems = parseOrderItems(metadata);
  const quote = await validateAndQuoteOrder({
    storeId,
    items: orderItems,
    orderType,
    paymentMethod,
    shippingAddress,
  });

  const stripeFee = await resolveStripeFee(stripe, session);
  const paymentStatus = getPaymentStatus(session);
  const deliveryNotes = orderType === "pickup" && metadata.pickupStoreName ? `Recoger en: ${metadata.pickupStoreName}` : undefined;

  const orderData = buildOrderDocument({
    orderNumber,
    clerkUserId,
    customerName,
    customerEmail,
    phone: String(metadata.phone || session.customer_details?.phone || "").trim(),
    storeId,
    orderType,
    paymentMethod,
    quote,
    shippingAddress,
    paymentStatus,
    dispatchStatus: orderType === "delivery" ? "waiting_for_driver" : "not_required",
    stripeCheckoutSessionId: session.id,
    stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
    stripeCustomerId: typeof session.customer === "string" ? session.customer : null,
    amountDiscount: session.total_details?.amount_discount ? session.total_details.amount_discount / 100 : 0,
    stripeFee,
    deliveryNotes,
  }) as OrderDocumentRecord;

  orderData._id = `stripe-order-${session.id}`;
  orderData.pickupStoreMapsUrl = buildStoreMapsUrl(quote.store);
  const offlineData = await resolveOfflinePaymentData(stripe, session, paymentMethod);
  return { ...orderData, ...offlineData, restaurantName: quote.store.name } as OrderDocumentRecord;
}

export async function createOrderInSanity(session: Stripe.Checkout.Session, stripe: Stripe) {
  const orderNumber = getMetadata(session).orderNumber;
  const existingOrder = await findExistingOrder(session.id, orderNumber);
  if (existingOrder) {
    if (!existingOrder.baserowRowId) after(() => syncBaserowOrder(existingOrder as any));
    return existingOrder;
  }

  const orderData = await buildOrderData(session, stripe);
  let order: any;
  let isNewOrder = false;

  try {
    order = await backendClient.create(orderData);
    isNewOrder = true;
  } catch (error: any) {
    if (error.statusCode === 409 || error.message?.includes("already exists")) {
      order = await backendClient.getDocument(String(orderData._id));
      if (!order) throw error;
    } else {
      throw error;
    }
  }

  if (isNewOrder) {
    after(() => syncBaserowOrder(orderData as any));
    await appendOrderEvent(order._id, { type: "created", source: "stripe-webhook", actor: "stripe" });
    await appendOrderEvent(order._id, {
      type: orderData.paymentStatus === "paid" ? "paid" : "payment_pending",
      source: "stripe-webhook",
      actor: "stripe",
    });
    await appendOrderEvent(order._id, { type: "sent_to_restaurant", source: "stripe-webhook", actor: "stripe" });
    if (orderData.orderType === "delivery" && orderData.paymentStatus === "paid") {
      await appendOrderEvent(order._id, { type: "dispatch_started", source: "stripe-webhook", actor: "stripe" });
    }
  }

  const customerPhone = typeof orderData.phone === "string" ? orderData.phone : "";
  const safeCustomerName = typeof orderData.customerName === "string" && orderData.customerName ? orderData.customerName : "Cliente";
  const createdOrderNumber = typeof orderData.orderNumber === "string" ? orderData.orderNumber : "";

  if (isNewOrder && customerPhone && createdOrderNumber) {
    try {
      if (orderData.orderType === "pickup") {
        await sendPickupOrderReceived(customerPhone, safeCustomerName, createdOrderNumber, String(orderData.pickupStoreName || orderData.storeName || "Restaurante"), String(orderData.grossTotal || orderData.totalPrice || "0"), getPaymentMethodLabel(String(orderData.paymentMethod || "")), String(orderData.pickupStoreMapsUrl || buildStoreMapsUrl({ name: String(orderData.pickupStoreName || orderData.storeName || "Restaurante") })));
      } else {
        await sendOrderConfirmation(customerPhone, safeCustomerName, createdOrderNumber);
      }
    } catch (err) {
      console.error("[stripe-order] Error sendOrderConfirmation:", err);
    }
  }

  if (isNewOrder) {
    await notifyRestaurantNewOrder(order._id);
  }

  console.log("[stripe-order] Order stored in Sanity:", order._id);
  return order;
}

export async function ensureOrderFromCheckoutSession(sessionId: string, expectedOrderNumber?: string) {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  const actualOrderNumber = getMetadata(session).orderNumber;

  if (expectedOrderNumber && actualOrderNumber && expectedOrderNumber !== actualOrderNumber) {
    throw new Error("Order number does not match checkout session");
  }

  if (session.payment_status !== "paid" && session.status !== "complete") {
    throw new Error("Checkout session is not ready to create an order");
  }

  return createOrderInSanity(session, stripe);
}

export async function markOrderPaidBySession(sessionId: string) {
  const existingOrder = await backendClient.fetch<ExistingOrder | null>(
    `*[_type == "order" && stripeCheckoutSessionId == $sessionId][0]`,
    { sessionId }
  );

  if (!existingOrder) return null;
  if (existingOrder.paymentStatus === "paid" && existingOrder.paidAt) return existingOrder;

  const now = new Date().toISOString();
  const updated = await backendClient
    .patch(existingOrder._id)
    .set({ status: "paid", paymentStatus: "paid", paidAt: now, updatedAt: now })
    .commit();

  await appendOrderEvent(existingOrder._id, { type: "paid", source: "stripe-webhook", actor: "stripe", at: now });
  after(() => syncBaserowOrderById(existingOrder._id));
  return updated;
}


