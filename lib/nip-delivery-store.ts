/**
 * I/O compartido de `nipDeliveryStatus` (PASO 1-2).
 *
 * Único lugar que escribe el estado de entrega del NIP en la orden, con
 * transición forward-only e idempotencia (nunca degrada un `delivered`/`failed`
 * ya confirmado). Lo usan tanto `lib/mandado-whatsapp.ts` (envío de la plantilla
 * que transporta el NIP) como el webhook de WhatsApp (recepción de `statuses`).
 */
import "server-only";

import { backendClient } from "@/sanity/lib/backendClient";
import { resolveNextNipStatus, type NipDeliveryStatus } from "@/lib/nip-delivery";

export async function updateOrderNipDeliveryStatus(
  orderId: string,
  incoming: NipDeliveryStatus
) {
  const order = (await backendClient.fetch(
    `*[_type == "order" && _id == $orderId][0]{
      _id,
      _rev,
      serviceKind,
      mandadoEntregaSegura,
      nipDeliveryStatus,
      nipSentAt,
      nipDeliveredAt
    }`,
    { orderId }
  )) as {
    _id: string;
    _rev: string;
    serviceKind?: string;
    mandadoEntregaSegura?: boolean;
    nipDeliveryStatus?: string;
    nipSentAt?: string;
    nipDeliveredAt?: string;
  } | null;
  if (!order) return;

  // Solo aplica a mandados con Entrega segura activa (restaurantes no usan este estado).
  if (String(order.serviceKind ?? "") !== "mandado" || order.mandadoEntregaSegura !== true) {
    return;
  }

  const next = resolveNextNipStatus(
    (order.nipDeliveryStatus as NipDeliveryStatus | undefined),
    incoming
  );
  if (!next || next === order.nipDeliveryStatus) return;

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { nipDeliveryStatus: next, updatedAt: now };
  if (next === "sent" && !order.nipSentAt) patch.nipSentAt = now;
  if (next === "delivered" && !order.nipDeliveredAt) patch.nipDeliveredAt = now;

  await backendClient
    .patch(orderId)
    .ifRevisionId(order._rev)
    .set(patch)
    .commit()
    .catch((error) =>
      console.error("[nip-delivery-store] error actualizando nipDeliveryStatus", {
        orderId,
        next,
        error,
      })
    );
}
