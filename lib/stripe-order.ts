import type { Metadata } from "@/actions/createCheckoutSession";
import { getStripe } from "@/lib/stripe";
import { extractSpeiDetails } from "@/lib/spei-reference-extractor";
import { sendOrderConfirmation } from "@/lib/whatsapp";
import { backendClient } from "@/sanity/lib/backendClient";
import Stripe from "stripe";

type ExistingOrder = {
  _id: string;
  orderNumber?: string;
  stripeCheckoutSessionId?: string;
  status?: string;
  paidAt?: string;
};

async function findExistingOrder(sessionId: string, orderNumber?: string) {
  return backendClient.fetch<ExistingOrder | null>(
    `*[
      _type == "order" &&
      (
        stripeCheckoutSessionId == $sessionId ||
        orderNumber == $orderNumber
      )
    ][0]`,
    { sessionId, orderNumber }
  );
}

function inferPaymentMethod(
  session: Stripe.Checkout.Session,
  paymentMethodType?: string | null
) {
  if (paymentMethodType) {
    return paymentMethodType === "customer_balance"
      ? "bank_transfer"
      : paymentMethodType;
  }

  if (session.payment_method_types?.includes("oxxo")) {
    return "oxxo";
  }

  if (session.payment_method_types?.includes("customer_balance")) {
    return "bank_transfer";
  }

  return "card";
}

async function resolvePaymentMethod(
  stripe: Stripe,
  session: Stripe.Checkout.Session
) {
  if (!session.payment_intent) {
    return inferPaymentMethod(session);
  }

  try {
    const pi = await stripe.paymentIntents.retrieve(
      session.payment_intent as string
    );

    if (!pi.payment_method) {
      return inferPaymentMethod(session);
    }

    const pm = await stripe.paymentMethods.retrieve(pi.payment_method as string);
    return inferPaymentMethod(session, pm.type);
  } catch (error) {
    console.log("[stripe-order] Could not retrieve payment method details:", error);
    return inferPaymentMethod(session);
  }
}

function transformCustomizations(
  customizations: { [key: string]: string | string[] } | undefined,
  optionGroups:
    | Array<{
        title?: string;
        options?: Array<{ label?: string; priceDelta?: number }>;
      }>
    | undefined
) {
  if (!customizations || Object.keys(customizations).length === 0) {
    return [];
  }

  return Object.entries(customizations).map(([groupKey, selection]) => {
    const groupIndex = parseInt(groupKey.replace("group-", ""), 10);
    const group = optionGroups?.[groupIndex];
    const selectedOptions = Array.isArray(selection) ? selection : [selection];

    return {
      title: group?.title || groupKey,
      options: selectedOptions
        .filter((label) => !!label)
        .map((selectedLabel) => {
          const option = group?.options?.find((opt) => opt.label === selectedLabel);
          return {
            _key: crypto.randomUUID(),
            label: selectedLabel,
            priceDelta: option?.priceDelta || 0,
          };
        }),
    };
  });
}

async function buildOrderData(
  session: Stripe.Checkout.Session,
  stripe: Stripe
) {
  const {
    id,
    amount_total,
    currency,
    metadata,
    payment_intent,
    customer,
    total_details,
    customer_details,
  } = session;

  if (!metadata) {
    throw new Error("No metadata found in session");
  }

  const {
    orderNumber,
    customerName,
    customerEmail,
    clerkUserId,
    deliveryMethod,
    pickupStoreId,
    customerAddress,
  } = metadata as unknown as Metadata;

  if (!orderNumber || !customerName || !customerEmail || !clerkUserId) {
    throw new Error("Missing required order metadata");
  }

  const paymentMethod = await resolvePaymentMethod(stripe, session);

  const lineItemsWithProducts = await stripe.checkout.sessions.listLineItems(id, {
    expand: ["data.price.product"],
  });

  let itemsWithCustomizations: Array<{
    productId: string;
    quantity: number;
    price: number;
    customizations?: { [key: string]: string | string[] };
    customPrice?: number;
    optionGroups?: Array<{
      title?: string;
      options?: Array<{
        label?: string;
        priceDelta?: number;
      }>;
    }>;
  }> = [];

  try {
    if (metadata.itemsWithCustomizations) {
      itemsWithCustomizations = JSON.parse(metadata.itemsWithCustomizations);
    }
  } catch (error) {
    console.error("[stripe-order] Error parsing itemsWithCustomizations:", error);
  }

  const sanityProducts = lineItemsWithProducts.data
    .map((item, index) => {
      const stripeProduct = item.price?.product as Stripe.Product | undefined;
      const stripeProductId = stripeProduct?.metadata?.id;
      const itemWithCustomizations = stripeProductId
        ? itemsWithCustomizations.find((i) => i.productId === stripeProductId)
        : itemsWithCustomizations[index];
      const productId = stripeProductId || itemWithCustomizations?.productId;

      if (!productId) {
        console.log("[stripe-order] Missing productId for line item", {
          lineItemId: item.id,
          index,
        });
        return null;
      }

      return {
        _key: crypto.randomUUID(),
        product: {
          _type: "reference",
          _ref: productId,
        },
        quantity: item.quantity || 0,
        price:
          itemWithCustomizations?.customPrice ||
          itemWithCustomizations?.price ||
          0,
        customizations: transformCustomizations(
          itemWithCustomizations?.customizations,
          itemWithCustomizations?.optionGroups
        ),
      };
    })
    .filter((item): item is NonNullable<typeof item> => !!item);

  let bankTransferReference: string | undefined;
  let bankTransferClabe: string | undefined;
  let oxxoReference: string | undefined;

  if (paymentMethod === "bank_transfer" && payment_intent) {
    try {
      const speiDetails = await extractSpeiDetails(payment_intent as string);
      bankTransferReference = speiDetails.reference;
      bankTransferClabe = speiDetails.clabe;
    } catch (error) {
      console.log("[stripe-order] Could not extract SPEI details:", error);
      bankTransferReference = orderNumber.replace(/-/g, "").slice(-8);
    }
  }

  if (paymentMethod === "oxxo" && payment_intent) {
    try {
      const pi = (await stripe.paymentIntents.retrieve(payment_intent as string, {
        expand: ["charges.data.payment_method_details"],
      })) as Stripe.PaymentIntent & { charges?: { data: Stripe.Charge[] } };

      const nextAction = pi.next_action?.oxxo_display_details as
        | { number?: string; reference?: string }
        | undefined;
      const chargeOxxo = pi.charges?.data?.[0]?.payment_method_details?.oxxo as
        | { number?: string; reference?: string }
        | undefined;

      oxxoReference =
        nextAction?.number ||
        nextAction?.reference ||
        chargeOxxo?.number ||
        chargeOxxo?.reference;
    } catch (error) {
      console.log("[stripe-order] Could not extract OXXO reference:", error);
    }
  }

  const orderData: { _id: string; _type: string; [key: string]: unknown } = {
    _id: `stripe-order-${id}`,
    _type: "order",
    orderNumber,
    stripeCheckoutSessionId: id,
    stripePaymentIntentId: payment_intent,
    customerName,
    stripeCustomerId: customer,
    clerkUserId,
    email: customerEmail,
    phone: (metadata as unknown as Metadata).phone || customer_details?.phone || undefined,
    paymentMethod,
    bankTransferReference,
    bankTransferClabe,
    oxxoReference,
    currency,
    amountDiscount: total_details?.amount_discount
      ? total_details.amount_discount / 100
      : 0,
    products: sanityProducts,
    totalPrice: amount_total ? amount_total / 100 : 0,
    status: session.payment_status === "paid" ? "paid" : "pending",
    orderDate: new Date().toISOString(),
  };

  if (deliveryMethod) {
    const isPickup = deliveryMethod === "click_collect" || deliveryMethod === "pickup";
    orderData.orderType = isPickup ? "pickup" : "delivery";
  }

  if (pickupStoreId) {
    const isPickup = deliveryMethod === "click_collect" || deliveryMethod === "pickup";
    if (isPickup) {
      orderData.pickupStore = {
        _type: "reference",
        _ref: pickupStoreId,
      };
    }

    orderData.affiliateStore = {
      _type: "reference",
      _ref: pickupStoreId,
    };
  }

  if (metadata.shippingCost && Number(metadata.shippingCost) > 0) {
    orderData.shippingCost = Number(metadata.shippingCost);
  }

  if (customerAddress) {
    orderData.shippingAddress = {
      line1: customerAddress,
    };
  }

  return orderData;
}

export async function createOrderInSanity(
  session: Stripe.Checkout.Session,
  stripe: Stripe
) {
  const orderNumber = session.metadata?.orderNumber;
  const existingOrder = await findExistingOrder(session.id, orderNumber);

  if (existingOrder) {
    return existingOrder;
  }

  const orderData = await buildOrderData(session, stripe);
  const order = await backendClient.createIfNotExists(orderData);
  const customerPhone =
    typeof orderData.phone === "string" ? orderData.phone : "";
  const customerName =
    typeof orderData.customerName === "string" && orderData.customerName
      ? orderData.customerName
      : "Cliente";
  const createdOrderNumber =
    typeof orderData.orderNumber === "string" ? orderData.orderNumber : "";

  if (customerPhone && createdOrderNumber) {
    void sendOrderConfirmation(customerPhone, customerName, createdOrderNumber).catch(
      (whatsappError) => {
        console.error("[stripe-order] WhatsApp error:", whatsappError);
      }
    );
  }

  console.log("[stripe-order] Order stored in Sanity:", order._id);
  return order;
}

export async function ensureOrderFromCheckoutSession(
  sessionId: string,
  expectedOrderNumber?: string
) {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  const actualOrderNumber = session.metadata?.orderNumber;

  if (!session.metadata) {
    throw new Error("Checkout session does not contain metadata");
  }

  if (
    expectedOrderNumber &&
    actualOrderNumber &&
    expectedOrderNumber !== actualOrderNumber
  ) {
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

  if (!existingOrder) {
    return null;
  }

  if (existingOrder.status === "paid" && existingOrder.paidAt) {
    return existingOrder;
  }

  return backendClient
    .patch(existingOrder._id)
    .set({
      status: "paid",
      paidAt: new Date().toISOString(),
    })
    .commit();
}
