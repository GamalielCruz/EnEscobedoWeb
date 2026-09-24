import { NextRequest, NextResponse } from "next/server";
import { requireDriver } from "@/lib/driver-auth";
import { backendClient } from "@/sanity/lib/backendClient";
import { appendOrderEvent } from "@/lib/order-events";
import { buildOfferActivationWindow, decideOfferAck } from "@/lib/dispatch/offer-lifecycle";

export const dynamic = "force-dynamic";

/**
 * POST /api/driver/offer-shown  (ACK de presentación)
 *
 * La app del repartidor confirma con esto que la oferta quedó PRESENTADA.
 * Sólo entonces el servidor fija la ventana de respuesta:
 *
 *   PENDING_DELIVERY → ACTIVE
 *   shownAt    = serverNow
 *   expiresAt  = serverNow + 14 s
 *
 * El timestamp es SIEMPRE del servidor (nunca del teléfono). Idempotente:
 * un segundo ACK (o dos ACK concurrentes) NO reinicia el temporizador — la
 * transición es atómica vía ifRevisionId y el perdedor devuelve el estado
 * existente.
 */

const OFFER_ACK_QUERY = `*[_type == "order" && orderNumber == $orderNumber][0]{
  _id,
  _rev,
  orderNumber,
  serviceKind,
  dispatchStatus,
  status,
  orderStatus,
  deliveryOfertaEnviada,
  deliveryOfertaExpiresAt,
  offerStatus,
  offerId,
  offerCreatedAt,
  offerDeliveryDeadlineAt,
  offerShownAt,
  "offeredToRef": offeredTo._ref,
  "repartidorAsignadoRef": repartidorAsignado._ref
}`;

type OfferAckOrder = {
  _id: string;
  _rev: string;
  orderNumber: string;
  serviceKind?: string;
  dispatchStatus?: string;
  status?: string;
  orderStatus?: string;
  deliveryOfertaEnviada?: boolean;
  deliveryOfertaExpiresAt?: string;
  offerStatus?: string;
  offerId?: string;
  offerCreatedAt?: string;
  offerDeliveryDeadlineAt?: string;
  offerShownAt?: string;
  offeredToRef?: string;
  repartidorAsignadoRef?: string;
};

function remainingSeconds(expiresAt: string, serverNow: Date): number {
  const ms = new Date(expiresAt).getTime() - serverNow.getTime();
  return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 1000)) : 0;
}

export async function POST(request: NextRequest) {
  const auth = await requireDriver();
  if (!auth.ok) return auth.error;

  const { repartidor } = auth;
  const body = await request.json().catch(() => ({}));
  const orderNumber = typeof body?.orderNumber === "string" ? body.orderNumber : "";
  const requestOfferId = typeof body?.offerId === "string" ? body.offerId : null;

  if (!orderNumber) {
    return NextResponse.json({ ok: false, error: "orderNumber es requerido." }, { status: 400 });
  }

  const respond = (payload: Record<string, unknown>, status = 200) =>
    NextResponse.json(payload, { status, headers: { "Cache-Control": "no-store" } });

  // Dos intentos: si la revisión cambió (otro ACK / cancelación en paralelo),
  // se re-lee y se re-decide; nunca se activa dos veces ni se extiende.
  for (let attempt = 0; attempt < 2; attempt++) {
    const order = await backendClient.fetch<OfferAckOrder | null>(OFFER_ACK_QUERY, { orderNumber });
    if (!order) return respond({ ok: false, error: "El pedido no existe." }, 404);

    // Si el cliente envía un offerId distinto al vigente, la oferta ya cambió
    // (nuevo intento de dispatch): no se activa una oferta obsoleta.
    if (requestOfferId && order.offerId && requestOfferId !== order.offerId) {
      return respond({ ok: false, status: order.offerStatus ?? null, error: "Esta oferta ya no está vigente." }, 409);
    }

    const now = new Date();
    const decision = decideOfferAck({
      offerStatus: order.offerStatus,
      deliveryOfertaExpiresAt: order.deliveryOfertaExpiresAt,
      offerDeliveryDeadlineAt: order.offerDeliveryDeadlineAt,
      offeredToRef: order.offeredToRef,
      driverId: repartidor._id,
      repartidorAsignadoRef: order.repartidorAsignadoRef,
      dispatchStatus: order.dispatchStatus,
      now,
    });

    if (decision.action === "rejected") {
      return respond({ ok: false, status: order.offerStatus ?? null, error: decision.error }, 409);
    }

    if (decision.action === "already_active") {
      return respond({
        ok: true,
        status: "active",
        offerId: order.offerId ?? null,
        shownAt: order.offerShownAt ?? null,
        expiresAt: decision.expiresAt,
        serverNow: now.toISOString(),
        ttlRemainingSeconds: remainingSeconds(decision.expiresAt, now),
      });
    }

    const activation = buildOfferActivationWindow(now);

    try {
      await backendClient
        .patch(order._id)
        .ifRevisionId(order._rev)
        .set({
          offerStatus: "active",
          offerShownAt: activation.shownAt,
          offerDeliveredAt: activation.shownAt,
          deliveryOfertaExpiresAt: activation.expiresAt,
          updatedAt: activation.shownAt,
        })
        .commit();
    } catch (error) {
      // Conflicto de revisión: otra escritura ganó. En el primer intento se
      // re-lee; en el segundo se reporta sin extender la ventana.
      if (attempt === 0) {
        console.warn("[driver/offer-shown] conflicto al activar, releyendo", {
          orderId: order._id,
          repartidorId: repartidor._id,
        });
        continue;
      }
      console.error("[driver/offer-shown] no se pudo activar la oferta", {
        orderId: order._id,
        repartidorId: repartidor._id,
        error: error instanceof Error ? error.message : String(error),
      });
      return respond({ ok: false, error: "No se pudo activar la oferta. Reintenta." }, 409);
    }

    // Espejo en el repartidor (best-effort): mantiene `ofertaExpiraAt` alineado
    // con la ventana de respuesta. Sin esto, un ACK tardío dentro de la ventana
    // de entrega dejaría el espejo con el deadline viejo y el cron podría
    // expirar la oferta antes de los 14 s.
    await backendClient
      .patch(repartidor._id)
      .set({
        ofertaStatus: "active",
        ofertaMostradaAt: activation.shownAt,
        ofertaExpiraAt: activation.expiresAt,
        ultimaActividad: activation.shownAt,
      })
      .commit()
      .catch(() => null);

    const deliveryLatencyMs = order.offerCreatedAt
      ? Math.max(0, now.getTime() - new Date(order.offerCreatedAt).getTime())
      : null;

    await appendOrderEvent(order._id, {
      type: "offer_activated",
      source: "driver/offer-shown",
      actor: repartidor._id,
      payload: {
        offerId: order.offerId,
        shownAt: activation.shownAt,
        deliveredAt: activation.shownAt,
        expiresAt: activation.expiresAt,
        deliveryLatencyMs,
      },
    }).catch(() => null);

    console.log("[driver/offer-shown] oferta activada", {
      orderId: order._id,
      orderNumber: order.orderNumber,
      repartidorId: repartidor._id,
      offerId: order.offerId,
      shownAt: activation.shownAt,
      expiresAt: activation.expiresAt,
      deliveryLatencyMs,
    });

    return respond({
      ok: true,
      status: "active",
      offerId: order.offerId ?? null,
      shownAt: activation.shownAt,
      expiresAt: activation.expiresAt,
      serverNow: activation.shownAt,
      ttlRemainingSeconds: remainingSeconds(activation.expiresAt, now),
    });
  }

  return respond({ ok: false, error: "No se pudo activar la oferta. Reintenta." }, 409);
}
