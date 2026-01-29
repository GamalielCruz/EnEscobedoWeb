import { Metadata } from "@/actions/createCheckoutSession";
import stripe from "@/lib/stripe";
import { backendClient } from "@/sanity/lib/backendClient";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import {
  ExtendedPaymentIntent,
  BankTransferInstructions,
} from "@/types/stripe-extended";
import { extractSpeiDetails } from "@/lib/spei-reference-extractor";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const headersList = await headers();
  const sig = headersList.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "No signature" }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.log("Stripe webhook secret is not set");
    return NextResponse.json(
      { error: "Stripe webhook secret is not set" },
      { status: 400 }
    );
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    console.log("Weebhook verification failed", err);
    return NextResponse.json(
      { error: `Webhook Error: ${err}` },
      { status: 400 }
    );
  }

  // Handle different checkout session events
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    // For OXXO and bank transfer payments, we need to check if the payment is actually paid
    // For card payments, payment_status will be "paid" immediately
    if (session.payment_status === "paid") {
      try {
        const order = await createOrderInSanity(session);
        console.log("Order created in sanity: ", order);
      } catch (err) {
        console.log("Error creating order in sanity: ", err);
        return NextResponse.json(
          { error: "Error creating order" },
          { status: 500 }
        );
      }
    } else {
      console.log("Payment not yet completed for session:", session.id);
      // For OXXO and bank transfers, create order with pending status
      try {
        const order = await createOrderInSanity(session);
        console.log("Pending order created in sanity: ", order);
      } catch (err) {
        console.log("Error creating pending order in sanity: ", err);
        return NextResponse.json(
          { error: "Error creating pending order" },
          { status: 500 }
        );
      }
    }
  }

  // Handle payment intent events for OXXO and Bank Transfers
  if (event.type === "payment_intent.succeeded") {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    console.log("Payment intent succeeded:", paymentIntent.id);

    // Find the checkout session for this payment intent
    const sessions = await stripe.checkout.sessions.list({
      payment_intent: paymentIntent.id,
      limit: 1,
    });

    if (sessions.data.length > 0) {
      const session = sessions.data[0];

      // Check if order already exists
      const existingOrder = await backendClient.fetch(
        `*[_type == "order" && stripeCheckoutSessionId == $sessionId][0]`,
        { sessionId: session.id }
      );

      if (existingOrder) {
        // Update existing order to paid status
        await backendClient
          .patch(existingOrder._id)
          .set({
            status: "paid",
            paidAt: new Date().toISOString(),
          })
          .commit();
        console.log("Order status updated to paid:", existingOrder._id);
      } else {
        // Create new order with paid status
        try {
          const order = await createOrderInSanity(session);
          console.log(
            "Order created in sanity from payment_intent.succeeded: ",
            order
          );
        } catch (err) {
          console.log("Error creating order in sanity: ", err);
          return NextResponse.json(
            { error: "Error creating order" },
            { status: 500 }
          );
        }
      }
    }
  }

  // Handle checkout session expiration (especially for OXXO payments)
  if (event.type === "checkout.session.expired") {
    const session = event.data.object as Stripe.Checkout.Session;
    console.log("Checkout session expired:", session.id);

    try {
      // Check if an order was already created for this session
      const existingOrder = await backendClient.fetch(
        `*[_type == "order" && stripeCheckoutSessionId == $sessionId][0]`,
        { sessionId: session.id }
      );

      if (existingOrder) {
        // Update existing order status to expired
        await backendClient
          .patch(existingOrder._id)
          .set({
            status: "expired",
            expiredAt: new Date().toISOString(),
          })
          .commit();
        console.log("Order status updated to expired:", existingOrder._id);
      } else {
        // Create order with expired status for tracking purposes
        const order = await createOrderInSanity(session);
        await backendClient
          .patch(order._id)
          .set({
            status: "expired",
            expiredAt: new Date().toISOString(),
          })
          .commit();
        console.log("Expired order created in sanity:", order._id);
      }
    } catch (err) {
      console.log("Error handling expired checkout session:", err);
    }
  }

  // Handle payment intent cancellation for OXXO
  if (event.type === "payment_intent.payment_failed") {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    console.log("Payment failed for payment intent:", paymentIntent.id);

    // Find the checkout session for this payment intent
    const sessions = await stripe.checkout.sessions.list({
      payment_intent: paymentIntent.id,
      limit: 1,
    });

    if (sessions.data.length > 0) {
      const session = sessions.data[0];

      // Update the order status to failed
      try {
        const existingOrder = await backendClient.fetch(
          `*[_type == "order" && stripeCheckoutSessionId == $sessionId][0]`,
          { sessionId: session.id }
        );

        if (existingOrder) {
          await backendClient
            .patch(existingOrder._id)
            .set({ status: "failed" })
            .commit();
          console.log("Order status updated to failed:", existingOrder._id);
        }
      } catch (err) {
        console.log("Error updating order status to failed: ", err);
      }
    }
  }

  return NextResponse.json({ received: true });
}

async function createOrderInSanity(session: Stripe.Checkout.Session) {
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

  // Check if metadata exists and has required fields
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
    pickupStoreName,
    customerAddress 
  } = metadata as unknown as Metadata;

  // Determine payment method from the session
  let paymentMethod = "card"; // default

  // If payment_intent exists, we can get the actual payment method used
  if (payment_intent) {
    try {
      const pi = await stripe.paymentIntents.retrieve(payment_intent as string);
      if (pi.payment_method) {
        const pm = await stripe.paymentMethods.retrieve(
          pi.payment_method as string
        );
        paymentMethod =
          pm.type === "customer_balance" ? "bank_transfer" : pm.type;
      }
    } catch (error) {
      console.log("Could not retrieve payment method details:", error);
      // Fallback to session-based detection
      if (
        session.payment_method_types?.includes("customer_balance") &&
        session.payment_status === "paid"
      ) {
        paymentMethod = "bank_transfer";
      } else if (
        session.payment_method_types?.includes("oxxo") &&
        session.payment_status !== "paid"
      ) {
        paymentMethod = "oxxo";
      }
    }
  } else {
    // Fallback for sessions without payment_intent (pending payments)
    if (session.payment_method_types?.includes("oxxo")) {
      paymentMethod = "oxxo";
    } else if (session.payment_method_types?.includes("customer_balance")) {
      paymentMethod = "bank_transfer";
    }
  }

  const lineItemsWithProducts = await stripe.checkout.sessions.listLineItems(
    id,
    {
      expand: ["data.price.product"],
    }
  );

  const sanityProducts = lineItemsWithProducts.data.map((item) => ({
    _key: crypto.randomUUID(),
    product: {
      _type: "reference",
      _ref: (item.price?.product as Stripe.Product)?.metadata?.id,
    },
    quantity: item.quantity || 0,
  }));

  // Get bank transfer details if it's a SPEI payment
  let bankTransferReference: string | undefined;
  let bankTransferClabe: string | undefined;

  if (paymentMethod === "bank_transfer" && payment_intent) {
    try {
      const speiDetails = await extractSpeiDetails(payment_intent as string);

      bankTransferReference = speiDetails.reference;
      bankTransferClabe = speiDetails.clabe;

      console.log("SPEI details extracted successfully");
    } catch (error) {
      console.log("Could not extract SPEI details:", error);
      // Generate a basic reference as fallback
      bankTransferReference = orderNumber.replace(/-/g, "").slice(-8);
    }
  }

  // Get OXXO reference number if it's an OXXO payment
  let oxxoReference: string | undefined;

  if (paymentMethod === "oxxo" && payment_intent) {
    try {
      const pi = (await stripe.paymentIntents.retrieve(
        payment_intent as string,
        {
          expand: ["charges.data.payment_method_details"],
        }
      )) as Stripe.PaymentIntent & { charges?: { data: Stripe.Charge[] } };

      console.log("Extracting OXXO reference for PI:", pi.id);

      // Type guard for OXXO details with reference number
      const hasOxxoReference = (obj: unknown): obj is { reference: string } => {
        return (
          typeof obj === "object" &&
          obj !== null &&
          "reference" in obj &&
          typeof (obj as { reference: unknown }).reference === "string"
        );
      };

      // Type guard for OXXO details with number (Stripe uses 'number' for OXXO reference)
      const hasOxxoNumber = (obj: unknown): obj is { number: string } => {
        return (
          typeof obj === "object" &&
          obj !== null &&
          "number" in obj &&
          typeof (obj as { number: unknown }).number === "string"
        );
      };

      // Check multiple possible locations for OXXO reference
      
      // 1. Check next_action.oxxo_display_details (most common for pending payments)
      if (pi.next_action?.oxxo_display_details) {
        // Check for 'number' property (Stripe's actual field name)
        if (hasOxxoNumber(pi.next_action.oxxo_display_details)) {
          oxxoReference = pi.next_action.oxxo_display_details.number;
          console.log("OXXO reference extracted from next_action");
        }
        // Fallback to 'reference' property if it exists
        else if (hasOxxoReference(pi.next_action.oxxo_display_details)) {
          oxxoReference = pi.next_action.oxxo_display_details.reference;
          console.log("OXXO reference extracted from next_action (fallback)");
        }
      }

      // 2. Check charges for completed payments
      if (!oxxoReference && pi.charges?.data?.[0]) {
        const charge = pi.charges.data[0];
        
        if (charge.payment_method_details?.oxxo) {
          // Check for 'number' property first
          if (hasOxxoNumber(charge.payment_method_details.oxxo)) {
            oxxoReference = charge.payment_method_details.oxxo.number;
            console.log("OXXO reference extracted from charges");
          }
          // Fallback to 'reference' property
          else if (hasOxxoReference(charge.payment_method_details.oxxo)) {
            oxxoReference = charge.payment_method_details.oxxo.reference;
            console.log("OXXO reference extracted from charges (fallback)");
          }
        }
      }

      // 3. Check if there's a reference in the payment method itself
      if (!oxxoReference && pi.payment_method) {
        try {
          const pm = await stripe.paymentMethods.retrieve(pi.payment_method as string);
          
          if (pm.oxxo) {
            // Check for 'number' property first
            if (hasOxxoNumber(pm.oxxo)) {
              oxxoReference = pm.oxxo.number;
              console.log("OXXO reference extracted from payment method");
            }
            // Fallback to 'reference' property
            else if (hasOxxoReference(pm.oxxo)) {
              oxxoReference = pm.oxxo.reference;
              console.log("OXXO reference extracted from payment method (fallback)");
            }
          }
        } catch (pmError) {
          console.log("Could not retrieve payment method for OXXO reference");
        }
      }

      if (!oxxoReference) {
        console.log("No OXXO reference found, using orderNumber as fallback");
      }

    } catch (error) {
      console.log("Could not extract OXXO reference:", error);
    }
  }

  const order = await backendClient.create({
    _type: "order",
    orderNumber,
    stripeCheckoutSessionId: id,
    stripePaymentIntentId: payment_intent,
    customerName,
    stripeCustomerId: customer,
    clerkUserId: clerkUserId,
    email: customerEmail,
    phone: customer_details?.phone || undefined,
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
  });

  return order;
}
