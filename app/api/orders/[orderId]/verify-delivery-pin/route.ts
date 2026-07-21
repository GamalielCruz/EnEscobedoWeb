import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { backendClient } from "@/sanity/lib/backendClient";
import { isAdminUser } from "@/lib/admin";
import { isDeliveryPinValid } from "@/lib/delivery-pin";
import { appendOrderEvent } from "@/lib/order-events";
import { syncBaserowOrderById } from "@/lib/baserow";

const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;
type DeliveryPinOrder = {
  _id: string;
  _rev: string;
  orderNumber: string;
  orderType?: string;
  orderStatus?: string;
  fulfillmentProvider?: string;
  deliveryPinHash?: string;
  deliveryPinExpiresAt?: string;
  deliveryPinAttemptCount?: number;
  deliveryPinLockedUntil?: string;
  deliveryVerificationMethod?: string;
  deliveryVerificationStatus?: string;
  storeOwnerId?: string;
};

export async function POST(request: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { orderId } = await params;
  const body = await request.json().catch(() => ({}));
  const pin = String(body?.pin || "");

  const order = await backendClient.fetch<DeliveryPinOrder | null>(`*[_type == "order" && _id == $orderId][0]{
    _id, _rev, orderNumber, orderType, orderStatus, status, fulfillmentProvider,
    deliveryPinHash, deliveryPinExpiresAt, deliveryPinAttemptCount, deliveryPinLockedUntil,
    deliveryVerificationMethod, deliveryVerificationStatus,
    "storeOwnerId": affiliateStore->ownerClerkUserId
  }`, { orderId });
  if (!order) return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });

  const authorized = isAdminUser(userId) || (order.fulfillmentProvider === "restaurant_delivery" && order.storeOwnerId === userId);
  if (!authorized) return NextResponse.json({ error: "No tienes permiso para verificar esta entrega" }, { status: 403 });
  if (order.orderType !== "delivery" || order.deliveryVerificationMethod !== "pin") return NextResponse.json({ error: "La orden no requiere PIN" }, { status: 409 });
  if (order.orderStatus === "delivered" && order.deliveryVerificationStatus === "verified") return NextResponse.json({ success: true, alreadyVerified: true });

  const now = new Date();
  if (order.deliveryPinLockedUntil && new Date(order.deliveryPinLockedUntil) > now) return NextResponse.json({ error: "PIN bloqueado temporalmente" }, { status: 429 });
  if (order.deliveryPinExpiresAt && new Date(order.deliveryPinExpiresAt) < now) return NextResponse.json({ error: "El PIN expiró" }, { status: 410 });

  if (!isDeliveryPinValid(order.orderNumber, pin, order.deliveryPinHash || "")) {
    const attempts = Number(order.deliveryPinAttemptCount || 0) + 1;
    const lockedUntil = attempts >= MAX_ATTEMPTS ? new Date(now.getTime() + LOCK_MS).toISOString() : undefined;
    await backendClient.patch(order._id).ifRevisionId(order._rev).set({
      deliveryPinAttemptCount: attempts,
      deliveryVerificationStatus: lockedUntil ? "locked" : "pending",
      deliveryPinLockedUntil: lockedUntil,
      updatedAt: now.toISOString(),
    }).commit();
    await appendOrderEvent(order._id, { type: "delivery_pin_failed", source: "api/verify-delivery-pin", actor: userId, payload: { attempt: attempts, locked: Boolean(lockedUntil) } });
    return NextResponse.json({ error: lockedUntil ? "PIN bloqueado temporalmente" : "PIN incorrecto", attemptsRemaining: Math.max(0, MAX_ATTEMPTS - attempts) }, { status: lockedUntil ? 429 : 400 });
  }

  const verifiedAt = now.toISOString();
  await backendClient.patch(order._id).ifRevisionId(order._rev).set({
    status: "delivered",
    orderStatus: "delivered",
    dispatchStatus: "completed",
    deliveredAt: verifiedAt,
    deliveryPinVerifiedAt: verifiedAt,
    deliveryPinVerifiedBy: userId,
    deliveryVerificationStatus: "verified",
    updatedAt: verifiedAt,
  }).commit();
  await appendOrderEvent(order._id, { type: "delivery_pin_verified", source: "api/verify-delivery-pin", actor: userId });
  await appendOrderEvent(order._id, { type: "delivered", source: "api/verify-delivery-pin", actor: userId });
  void syncBaserowOrderById(order._id).catch(() => null);
  return NextResponse.json({ success: true });
}
