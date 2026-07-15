import "server-only";

import { backendClient } from "@/sanity/lib/backendClient";
import {
  formatOrderStatusResponse,
  type SupportOrder,
} from "./order-status-response";

const LATEST_ORDER_QUERY = `*[
  _type == "order" && clerkUserId == $clerkUserId
] | order(orderDate desc, _createdAt desc)[0]{
  orderNumber,
  orderStatus,
  orderType,
  paymentStatus,
  pickupStatus,
  dispatchStatus,
  status,
  "restaurantName": coalesce(pickupStore->name, affiliateStore->name)
}`;

export async function getLatestOrderStatusResponse(clerkUserId?: string) {
  if (!clerkUserId || !/^user_[A-Za-z0-9]+$/.test(clerkUserId)) return undefined;

  try {
    const order = await backendClient.fetch<SupportOrder | null>(
      LATEST_ORDER_QUERY,
      { clerkUserId },
    );
    return order ? formatOrderStatusResponse(order) : undefined;
  } catch (error) {
    console.error("[chatwoot orders] No se pudo consultar el pedido", {
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    return undefined;
  }
}
