import { appendOrderEvent } from "@/lib/order-events";
import { dispatchDeliveryOffer } from "@/lib/delivery-dispatch";
import { createOrderInSanity, markOrderPaidBySession } from "@/lib/stripe-order";
import { getStripe } from "@/lib/stripe";
import { backendClient } from "@/sanity/lib/backendClient";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

async function patchOrderBySession(
  sessionId: string,
  values: Record<string, unknown>,
  eventType?: Parameters<typeof appendOrderEvent>[1]["type"]
) {
  const existingOrder = await backendClient.fetch<{ _id: string; orderType?: "delivery" | "pickup" } | null>(
    `*[_type == "order" && stripeCheckoutSessionId == $sessionId][0]{ _id, orderType }`,
    { sessionId }
  );

  if (!existingOrder) return null;
  const updated = await backendClient.patch(existingOrder._id).set(values).commit();
  if (eventType) {
    await appendOrderEvent(existingOrder._id, { type: eventType, source: "stripe-webhook", actor: "stripe" });
  }
  return { updated, orderType: existingOrder.orderType };
}

export async function POST(req: NextRequest) {
  let stripe: Stripe;
  try {
    stripe = getStripe();
  } catch (error) {
    return NextResponse.json({ error: "Stripe no configurado", details: String(error) }, { status: 500 });
  }

  const body = await req.text();
  const headersList = await headers();
  const sig = headersList.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "No signature" }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "Stripe webhook secret is not set" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    return NextResponse.json({ error: `Webhook Error: ${err}` }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const order = await createOrderInSanity(session, stripe);
      const deliveryMethod = session.metadata?.deliveryMethod;
      const isDelivery = deliveryMethod !== "click_collect" && deliveryMethod !== "pickup";
      if (session.payment_status === "paid" && isDelivery) {
        await dispatchDeliveryOffer(order._id).catch((error) => {
          console.error("[webhook] dispatchDeliveryOffer error:", error);
        });
      }
    }

    if (event.type === "payment_intent.succeeded") {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const sessions = await stripe.checkout.sessions.list({ payment_intent: paymentIntent.id, limit: 1 });

      if (sessions.data.length > 0) {
        const session = sessions.data[0];
        const updatedOrder = await markOrderPaidBySession(session.id);
        if (!updatedOrder) {
          const createdOrder = await createOrderInSanity(session, stripe);
          const deliveryMethod = session.metadata?.deliveryMethod;
          if (deliveryMethod !== "click_collect" && deliveryMethod !== "pickup") {
            await dispatchDeliveryOffer(createdOrder._id).catch((error) => {
              console.error("[webhook] dispatchDeliveryOffer error:", error);
            });
          }
        }
      }
    }

    if (event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session;
      const now = new Date().toISOString();
      const patched = await patchOrderBySession(
        session.id,
        {
          status: "expired",
          paymentStatus: "expired",
          expiredAt: now,
          updatedAt: now,
        },
        "manual_admin_action"
      );

      if (!patched) {
        const order = await createOrderInSanity(session, stripe);
        await backendClient.patch(order._id).set({ status: "expired", paymentStatus: "expired", expiredAt: now, updatedAt: now }).commit();
      }
    }

    if (event.type === "payment_intent.payment_failed") {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const sessions = await stripe.checkout.sessions.list({ payment_intent: paymentIntent.id, limit: 1 });
      if (sessions.data.length > 0) {
        const session = sessions.data[0];
        const now = new Date().toISOString();
        await patchOrderBySession(
          session.id,
          {
            status: "failed",
            paymentStatus: "failed",
            updatedAt: now,
          },
          "manual_admin_action"
        );
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[webhook] Error handling Stripe event", { type: event.type, error });
    return NextResponse.json({ error: "Error handling webhook" }, { status: 500 });
  }
}
