import { backendClient } from "@/sanity/lib/backendClient";

export type OrderEventType =
  | "created"
  | "payment_pending"
  | "paid"
  | "sent_to_restaurant"
  | "restaurant_accepted"
  | "restaurant_rejected"
  | "dispatch_started"
  | "offer_sent"
  | "offer_accepted"
  | "offer_rejected"
  | "offer_expired"
  | "driver_assigned"
  | "at_door"
  | "ready_for_pickup"
  | "picked_up"
  | "delivered"
  | "cancelled"
  | "refund_required"
  | "manual_admin_action";

export async function appendOrderEvent(
  orderId: string,
  event: {
    type: OrderEventType;
    actor?: string;
    source?: string;
    reason?: string;
    payload?: Record<string, unknown>;
    at?: string;
  }
) {
  const at = event.at ?? new Date().toISOString();

  await backendClient
    .patch(orderId)
    .setIfMissing({ orderEvents: [] })
    .append("orderEvents", [
      {
        _key: crypto.randomUUID(),
        type: event.type,
        actor: event.actor,
        source: event.source,
        reason: event.reason,
        payloadJson: event.payload ? JSON.stringify(event.payload) : undefined,
        at,
      },
    ])
    .commit();
}


