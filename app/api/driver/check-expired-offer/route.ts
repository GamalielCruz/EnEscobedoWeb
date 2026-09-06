import { NextResponse } from "next/server";
import { requireDriver } from "@/lib/driver-auth";
import { backendClient } from "@/sanity/lib/backendClient";
import { releaseOrdersForDriver, redispatchOrders } from "@/lib/delivery-dispatch";
import { appendOrderEvent } from "@/lib/order-events";

export const dynamic = "force-dynamic";

/**
 * POST /api/driver/check-expired-offer
 *
 * Detects and immediately releases expired mandado offers for the
 * authenticated driver, then redispatches them.
 *
 * Triggered by the frontend when it detects the offer disappeared
 * from polling without a user-initiated accept/reject.
 *
 * Idempotent: if no expired offers exist, returns { released: 0 }.
 * Concurrent-safe: all patches use ifRevisionId.
 */
export async function POST() {
  const auth = await requireDriver();
  if (!auth.ok) return auth.error;

  const { repartidor } = auth;
  const now = new Date().toISOString();

  // 1. Find expired orders for this driver
  // Only orders that:
  //   - were offered to this driver
  //   - are still in "offered" state (not accepted by anyone)
  //   - have no assigned driver
  //   - have passed their expiration time
  //   - are not delivered/cancelled
  const expiredOrders: Array<{ _id: string; orderNumber?: string }> =
    await backendClient
      .fetch(
        `*[_type == "order"
          && offeredTo._ref == $driverId
          && dispatchStatus == "offered"
          && !defined(repartidorAsignado)
          && defined(deliveryOfertaExpiresAt)
          && deliveryOfertaExpiresAt <= $now
          && status != "delivered"
          && status != "cancelled"
          && orderStatus != "delivered"
          && orderStatus != "cancelled"
          && orderStatus != "completed"
        ]{
          _id,
          orderNumber
        }`,
        { driverId: repartidor._id, now }
      )
      .catch(() => []);

  if (!expiredOrders || expiredOrders.length === 0) {
    return NextResponse.json({ released: 0, redispatched: false });
  }

  const orderIds = expiredOrders.map((o) => o._id);

  // 2. Clean up driver state if still in offer_pending
  // This mirrors what the cron does: patch back to available and unset offer fields
  if (repartidor.estadoDisponibilidad === "offer_pending") {
    await backendClient
      .patch(repartidor._id)
      .set({
        estadoDisponibilidad: "available",
        ultimaActividad: now,
      })
      .unset([
        "ultimoPedidoOfertado",
        "pedidosOfertados",
        "restauranteOferta",
        "ofertaTipo",
        "ofertaEnviadaAt",
        "ofertaExpiraAt",
      ])
      .commit()
      .catch(() => null);
  }

  // 3. Release orders back to waiting_for_driver
  // releaseOrdersForDriver validates: !repartidorAsignado && offeredToRef === driverId
  const releasedOrderIds = await releaseOrdersForDriver(
    orderIds,
    repartidor._id,
    "offer_expired_immediate"
  );

  // 4. Log events
  if (releasedOrderIds.length > 0) {
    await Promise.allSettled(
      releasedOrderIds.map((orderId) =>
        appendOrderEvent(orderId, {
          type: "offer_expired",
          source: "driver/check-expired-offer",
          actor: repartidor._id,
        })
      )
    );
  }

  // 5. Redispatch released orders
  let redispatched = false;
  if (releasedOrderIds.length > 0) {
    redispatched = await redispatchOrders(releasedOrderIds, [repartidor._id]);
  }

  return NextResponse.json({
    released: releasedOrderIds.length,
    redispatched,
  });
}
