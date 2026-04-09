import { getStripe } from "@/lib/stripe";
import { backendClient } from "@/sanity/lib/backendClient";
import { createOrderInSanity, markOrderPaidBySession } from "@/lib/stripe-order";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

export async function POST(req: NextRequest) {
  let stripe;
  try {
    stripe = getStripe();
  } catch (error) {
    return NextResponse.json(
      { error: "Stripe no configurado", details: String(error) },
      { status: 500 }
    );
  }
  const body = await req.text();
  const headersList = await headers();
  const sig = headersList.get("stripe-signature");

  console.log("[webhook] Request received. Signature present:", !!sig);

  if (!sig) {
    return NextResponse.json({ error: "No signature" }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.log("[webhook] Stripe webhook secret is not set");
    return NextResponse.json(
      { error: "Stripe webhook secret is not set" },
      { status: 400 }
    );
  }
  const sanityWriteToken =
    process.env.SANITY_API_WRITE_TOKEN || process.env.SANITY_API_TOKEN;
  if (!sanityWriteToken) {
    console.log("[webhook] Sanity write token is not set");
    return NextResponse.json(
      { error: "Sanity write token is not set" },
      { status: 500 }
    );
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
    console.log("[webhook] Event constructed successfully:", event.type, "ID:", event.id);
  } catch (err) {
    console.log("[webhook] Webhook verification failed", err);
    return NextResponse.json(
      { error: `Webhook Error: ${err}` },
      { status: 400 }
    );
  }

  // Handle different checkout session events
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    console.log("[webhook] checkout.session.completed. Status:", session.payment_status, "ID:", session.id);
    console.log("[webhook] Session Metadata:", JSON.stringify(session.metadata, null, 2));

    // For OXXO and bank transfer payments, we need to check if the payment is actually paid
    // For card payments, payment_status will be "paid" immediately
    if (session.payment_status === "paid") {
      try {
        const order = await createOrderInSanity(session, stripe);
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
        const order = await createOrderInSanity(session, stripe);
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
      const updatedOrder = await markOrderPaidBySession(session.id);

      if (updatedOrder) {
        console.log("Order status updated to paid:", updatedOrder._id);
      } else {
        // Create new order with paid status
        try {
          const order = await createOrderInSanity(session, stripe);
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
        const order = await createOrderInSanity(session, stripe);
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

