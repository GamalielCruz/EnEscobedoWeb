import { appendOrderEvent } from "@/lib/order-events";
import { createOrderWithCommercialCap } from "@/lib/commercial-order";
import { buildOrderDocument, buildStoreMapsUrl, OrderAddressInput, OrderItemInput, validateAndQuoteOrder } from "@/lib/order-pricing";
import { notifyRestaurantNewOrder } from "@/lib/restaurant-notifications";
import { getPaymentMethodLabel } from "@/lib/payment";
import { getStripe } from "@/lib/stripe";
import { extractSpeiDetails } from "@/lib/spei-reference-extractor";
import { sendOrderConfirmation, sendPickupOrderReceived } from "@/lib/whatsapp";
import { syncBaserowOrder, syncBaserowOrderById } from "@/lib/baserow";
import { dispatchDeliveryOffer } from "@/lib/delivery-dispatch";
import { backendClient } from "@/sanity/lib/backendClient";
import { after } from "next/server";
import Stripe from "stripe";
import { sendScheduledOrderConfirmation } from "@/lib/scheduled-order-whatsapp";
import { buildMandadoOrderDocument, quoteMandado, createMandadoSettlementSnapshot } from "@/lib/mandado-order";
import { resolveMandadoNipChannel } from "@/lib/mandado-nip-channel";
import { getMexicoDateKey } from "@/lib/mexico-time";
import { calculateEstimatedFees, calculateFeesFromActual, getProcessorType } from "@/lib/payment-processor-fees";
import { createSettlementSnapshot, type OrderFinancials } from "@/lib/settlements";

type ExistingOrder = {
  _id: string;
  orderNumber?: string;
  stripeCheckoutSessionId?: string;
  status?: string;
  orderType?: "delivery" | "pickup";
  paymentStatus?: string;
  paidAt?: string;
  baserowRowId?: number;
  orderEvents?: Array<{ type?: string }>;
  [key: string]: unknown;
};

type StripeSessionMetadata = {
  serviceKind?: string;
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
  deliveryNotes?: string;
  fulfillmentTiming?: string;
  scheduledStartAt?: string;
  scheduledEndAt?: string;
  scheduledTimezone?: string;
  orderItems?: string;
  mandadoMode?: string;
  mandadoPinEnabled?: string;
  mandadoOriginLabel?: string;
  mandadoOriginLat?: string;
  mandadoOriginLng?: string;
  mandadoDestinationLabel?: string;
  mandadoDestinationLat?: string;
  mandadoDestinationLng?: string;
  mandadoDetails0?: string;
  mandadoDetails1?: string;
  mandadoRecipientPhone?: string;
  mandadoRecipientName?: string;
  mandadoBusinessName?: string;
  mandadoOriginReference?: string;
  mandadoDestinationReference?: string;
  mandadoDestinationPerson?: string;
  [key: string]: string | undefined;
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
  return backendClient.fetch<ExistingOrder | null>(`*[_type == "order" && (stripeCheckoutSessionId == $sessionId || orderNumber == $orderNumber)][0]{ ..., "restaurantName": coalesce(affiliateStore->name, sellerSnapshot.name) }`,
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
  const serialized = metadata.orderItems || Object.keys(metadata)
    .filter((key) => /^orderItems\d+$/.test(key))
    .sort((left, right) => Number(left.slice(10)) - Number(right.slice(10)))
    .map((key) => metadata[key])
    .join("");
  if (!serialized) throw new Error("Missing order items metadata");
  const parsed = JSON.parse(serialized) as OrderItemInput[];
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
  if (!session.payment_intent) {
    return { fee: 0, percentage: 0, fixedFee: 0, netAmount: 0 };
  }

  try {
    const pi = await stripe.paymentIntents.retrieve(session.payment_intent as string, {
      expand: ["latest_charge.balance_transaction"],
    });
    const latestCharge = pi.latest_charge as Stripe.Charge | null;
    const balanceTx = latestCharge?.balance_transaction as Stripe.BalanceTransaction | null;
    const actualFee = Math.round((balanceTx?.fee ?? 0)) / 100;
    const amount = (session.amount_total ?? 0) / 100;

    // Use centralized fee calculation
    const { calculateFeesFromActual } = await import("./payment-processor-fees");
    return calculateFeesFromActual(amount, actualFee, "stripe");
  } catch (error) {
    console.log("[stripe-order] Could not retrieve Stripe fee, using fallback:", error);
    // Fallback to estimated calculation
    const { calculateEstimatedFees } = await import("./payment-processor-fees");
    const amount = (session.amount_total ?? 0) / 100;
    return calculateEstimatedFees(amount, "stripe");
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

  if (metadata.serviceKind === "mandado") {
    if (!orderNumber || !customerName || !customerEmail || !clerkUserId) throw new Error("Missing required order metadata");
    const draft = await quoteMandado({
      mode: metadata.mandadoMode,
      origin: { label: metadata.mandadoOriginLabel, lat: metadata.mandadoOriginLat, lng: metadata.mandadoOriginLng },
      destination: { label: metadata.mandadoDestinationLabel, lat: metadata.mandadoDestinationLat, lng: metadata.mandadoDestinationLng },
      details: `${metadata.mandadoDetails0 || ""}${metadata.mandadoDetails1 || ""}`,
      pinEnabled: metadata.mandadoPinEnabled === "true",
    });
    // PASO 3 + AJUSTE 1/2: revalidar el canal del NIP con la metadata de la sesión
    // (defensa en profundidad; la sesión ya se creó con canal válido).
    const senderPhone = String(metadata.phone || session.customer_details?.phone || "");
    const recipientName = String(metadata.mandadoRecipientName || "");
    const recipientPhone = String(metadata.mandadoRecipientPhone || "");
    const recipientWhatsAppDeclared = metadata.mandadoRecipientWhatsAppDeclared === "true";
    const senderNipFallbackAccepted = metadata.mandadoSenderNipFallbackAccepted === "true";
    const nipChannel = resolveMandadoNipChannel({
      pinEnabled: draft.pinEnabled === true,
      senderPhone,
      recipientName,
      recipientPhone,
      recipientWhatsAppDeclared,
      senderFallbackAccepted: senderNipFallbackAccepted,
      explicitNipRecipient: metadata.mandadoNipRecipient === "sender" ? "sender" : undefined,
    });
    if (!nipChannel.ok) throw new Error(nipChannel.error);
    const stripeFees = await resolveStripeFee(stripe, session);
  
  // Create financial snapshot for mandado settlements
  const mandadoSettlementSnapshot = createMandadoSettlementSnapshot(draft, "stripe", stripeFees.fee);

  const orderData = buildMandadoOrderDocument({
      draft,
      orderNumber,
      clerkUserId,
      customerName,
      customerEmail,
      phone: String(metadata.phone || session.customer_details?.phone || ""),
      paymentMethod: "stripe",
      paymentStatus: getPaymentStatus(session),
      stripeCheckoutSessionId: session.id,
      stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : undefined,
      stripeCustomerId: typeof session.customer === "string" ? session.customer : undefined,
      stripeFee: stripeFees.fee,
      stripeFeePercentage: stripeFees.percentage,
      stripeFixedFee: stripeFees.fixedFee,
      paymentProcessingFee: stripeFees.fee,
      paymentProcessingFeePercentage: stripeFees.percentage,
      paymentProcessingFixedFee: stripeFees.fixedFee,
      paymentNetAmount: stripeFees.netAmount,
      settlementSnapshot: mandadoSettlementSnapshot,
      recipientPhone: String(metadata.mandadoRecipientPhone || ""),
      recipientName: String(metadata.mandadoRecipientName || ""),
      recipientWhatsAppDeclared,
      senderNipFallbackAccepted,
      nipRecipient: nipChannel.ok ? nipChannel.channel ?? undefined : undefined,
      // Endurecimiento B: canal efectivo + teléfono destino desde la metadata
      // (defensa en profundidad: se re-deriva si la metadata no los trae).
      nipDeliveryChannel: (String(metadata.mandadoNipDeliveryChannel || "") ||
        undefined) as "whatsapp_sender" | "whatsapp_recipient" | "none" | undefined,
      nipDeliveryPhone: String(metadata.mandadoNipDeliveryPhone || "") || undefined,
      businessName: String(metadata.mandadoBusinessName || ""),
      originReference: String(metadata.mandadoOriginReference || ""),
      destinationReference: String(metadata.mandadoDestinationReference || ""),
      destinationPerson: String(metadata.mandadoDestinationPerson || ""),
    }) as OrderDocumentRecord;
    orderData._id = `stripe-order-${session.id}`;
    orderData.restaurantName = "Mandado El Menú";
    return orderData;
  }

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
    fulfillment:
      metadata.fulfillmentTiming === "scheduled" &&
      metadata.scheduledStartAt &&
      metadata.scheduledEndAt
        ? {
            timing: "scheduled",
            scheduledSlot: {
              startAt: metadata.scheduledStartAt,
              endAt: metadata.scheduledEndAt,
              timezone: metadata.scheduledTimezone,
            },
          }
        : { timing: "asap" },
  });

  const stripeFees = await resolveStripeFee(stripe, session);
  const paymentStatus = getPaymentStatus(session);
  const deliveryNotes = orderType === "delivery"
    ? String(metadata.deliveryNotes || "").trim().slice(0, 500) || undefined
    : undefined;

  // Create financial snapshot for settlements
  const financials: OrderFinancials = {
    grossTotal: quote.financials.grossTotal,
    productsSubtotal: quote.financials.productsSubtotal,
    shippingFee: quote.financials.shippingFee,
    platformServiceFee: quote.financials.platformServiceFee,
    platformCommission: quote.financials.platformCommission,
    paymentProcessingFee: stripeFees.fee,
    paymentProcessingFeePercentage: stripeFees.percentage,
    paymentProcessingFixedFee: stripeFees.fixedFee,
    paymentNetAmount: stripeFees.netAmount,
    driverPayout: quote.financials.driverPayout,
    storeNetTotal: quote.financials.storeNetTotal,
    platformNetTotal: quote.financials.platformNetTotal,
  };
  const settlementSnapshot = createSettlementSnapshot(financials, {
    orderType,
    storeHasOwnDelivery: quote.store.hasOwnDelivery ?? false,
    paymentProvider: "stripe",
  }, "stripe");

  const fulfillment =
    metadata.fulfillmentTiming === "scheduled" &&
    metadata.scheduledStartAt &&
    metadata.scheduledEndAt
      ? {
          timing: "scheduled",
          scheduledSlot: {
            startAt: metadata.scheduledStartAt,
            endAt: metadata.scheduledEndAt,
            timezone: metadata.scheduledTimezone,
          },
        }
      : { timing: "asap" };

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
    dispatchStatus:
      orderType === "delivery" && quote.fulfillment.timing === "scheduled"
        ? "scheduled"
        : orderType === "delivery"
          ? "waiting_for_driver"
          : "not_required",
    stripeCheckoutSessionId: session.id,
    stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
    stripeCustomerId: typeof session.customer === "string" ? session.customer : null,
    amountDiscount: session.total_details?.amount_discount ? session.total_details.amount_discount / 100 : 0,
    stripeFee: stripeFees.fee,
    stripeFeePercentage: stripeFees.percentage,
    stripeFixedFee: stripeFees.fixedFee,
    paymentProcessingFee: stripeFees.fee,
    paymentProcessingFeePercentage: stripeFees.percentage,
    paymentProcessingFixedFee: stripeFees.fixedFee,
    paymentNetAmount: stripeFees.netAmount,
    deliveryNotes,
    settlementSnapshot,
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
    let confirmedOrder = existingOrder;
    if (session.payment_status === "paid" && existingOrder.paymentStatus !== "paid") {
      confirmedOrder = (await markOrderPaidBySession(session.id)) as ExistingOrder;
    }
    if (session.payment_status === "paid") {
      const stripeFees = await resolveStripeFee(stripe, session);
      const discount = (session.total_details?.amount_discount ?? 0) / 100;
      const grossTotal = (session.amount_total ?? Number(confirmedOrder.grossTotal || 0) * 100) / 100;
      const platformCommission = Number(confirmedOrder.platformCommission ?? 0);
      const platformServiceFee = Number(confirmedOrder.platformServiceFee ?? 0);
      const driverPayout = Number(confirmedOrder.driverPayout ?? 0);
      confirmedOrder = (await backendClient
        .patch(existingOrder._id)
        .set({
          amountDiscount: discount,
          discount,
          totalPrice: grossTotal,
          grossTotal,
          stripeFee: stripeFees.fee,
          stripeFeePercentage: stripeFees.percentage,
          stripeFixedFee: stripeFees.fixedFee,
          stripeNetAmount: stripeFees.netAmount,
          paymentProcessingFee: stripeFees.fee,
          paymentProcessingFeePercentage: stripeFees.percentage,
          paymentProcessingFixedFee: stripeFees.fixedFee,
          paymentNetAmount: stripeFees.netAmount,
          storeNetTotal:
            Math.round(
              (grossTotal - platformServiceFee - platformCommission - stripeFees.fee - driverPayout) * 100
            ) / 100,
          platformNetTotal:
            Math.round((platformCommission + platformServiceFee - stripeFees.fee) * 100) / 100,
          ...(typeof session.payment_intent === "string"
            ? { stripePaymentIntentId: session.payment_intent }
            : {}),
        })
        .commit()) as ExistingOrder;
    }
    const alreadySent = existingOrder.orderEvents?.some(
      (event) => event.type === "sent_to_restaurant"
    );
    if (session.payment_status === "paid" && !alreadySent) {
      await appendOrderEvent(existingOrder._id, {
        type: "sent_to_restaurant",
        source: "stripe-webhook",
        actor: "stripe",
      });
      if (confirmedOrder.serviceKind !== "mandado") await notifyRestaurantNewOrder(existingOrder._id);
      const phone = String(confirmedOrder.phone || "");
      // Los Mandados no reutilizan las plantillas de restaurantes (`confirmacion_pedido`).
      if (
        confirmedOrder.serviceKind !== "mandado" &&
        confirmedOrder.fulfillmentTiming !== "scheduled" &&
        phone &&
        confirmedOrder.orderNumber
      ) {
        if (confirmedOrder.orderType === "pickup") {
          await sendPickupOrderReceived(
            phone,
            String(confirmedOrder.customerName || "Cliente"),
            String(confirmedOrder.orderNumber),
            String(confirmedOrder.restaurantName || "Restaurante"),
            String(confirmedOrder.grossTotal || confirmedOrder.totalPrice || "0"),
            getPaymentMethodLabel(String(confirmedOrder.paymentMethod || "")),
            buildStoreMapsUrl({ name: String(confirmedOrder.restaurantName || "Restaurante") })
          ).catch(() => null);
        } else {
          await sendOrderConfirmation(
            phone,
            String(confirmedOrder.customerName || "Cliente"),
            String(confirmedOrder.orderNumber)
          ).catch(() => null);
        }
      }
    }
    if (session.payment_status === "paid" && confirmedOrder.fulfillmentTiming === "scheduled") {
      await sendScheduledOrderConfirmation({
        ...confirmedOrder,
        _id: existingOrder._id,
        storeName: String(
          confirmedOrder.restaurantName ||
            (confirmedOrder.sellerSnapshot as { name?: string } | undefined)?.name ||
            "Restaurante"
        ),
      });
    }
    if (session.payment_status === "paid" && !confirmedOrder.baserowRowId) {
      after(() => syncBaserowOrder(confirmedOrder as any));
    }
    return confirmedOrder;
  }

  const orderData = await buildOrderData(session, stripe);
  let order: any;
  let isNewOrder = false;

  try {
    order = await createOrderWithCommercialCap(orderData);
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
    if (
      orderData.orderType === "delivery" &&
      orderData.paymentStatus === "paid" &&
      orderData.fulfillmentTiming !== "scheduled"
    ) {
      await appendOrderEvent(order._id, { type: "dispatch_started", source: "stripe-webhook", actor: "stripe" });
    }
    if (orderData.fulfillmentTiming === "scheduled") {
      await appendOrderEvent(order._id, {
        type: "scheduled_order_created",
        source: "stripe-webhook",
        actor: "stripe",
        payload: { scheduledSlot: orderData.scheduledSlot },
      });
    }
  }

  const customerPhone = typeof orderData.phone === "string" ? orderData.phone : "";
  const safeCustomerName = typeof orderData.customerName === "string" && orderData.customerName ? orderData.customerName : "Cliente";
  const createdOrderNumber = typeof orderData.orderNumber === "string" ? orderData.orderNumber : "";

  // Los Mandados no reutilizan las plantillas de restaurantes (`confirmacion_pedido`).
  if (isNewOrder && orderData.serviceKind !== "mandado" && customerPhone && createdOrderNumber) {
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
    if (orderData.serviceKind !== "mandado") await notifyRestaurantNewOrder(order._id);
    if (orderData.fulfillmentTiming === "scheduled" && orderData.paymentStatus === "paid") {
      await sendScheduledOrderConfirmation({
        ...orderData,
        _id: order._id,
        storeName: String(orderData.restaurantName || "Restaurante"),
      });
    }
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

  const order = await createOrderInSanity(session, stripe);

  if (
    session.payment_status === "paid" &&
    getOrderType(getMetadata(session)) === "delivery" &&
    order.fulfillmentTiming !== "scheduled"
  ) {
    await dispatchDeliveryOffer(order._id).catch((error) => {
      console.error("[checkout/confirm] dispatchDeliveryOffer error:", error);
    });
  }

  return order;
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
