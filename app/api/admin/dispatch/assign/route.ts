import { NextRequest, NextResponse } from "next/server";
import {
  assignOrderToDriver,
  reassignOrder,
  releaseOrderFromDriver,
  requireAdmin,
} from "@/lib/dispatch/dispatch-core";
import { getDispatchConfig } from "@/lib/dispatch/dispatch-config";
import { cancelOrderOffer, dispatchDeliveryOffer, offerOrderToDriver } from "@/lib/delivery-dispatch";
import { backendClient } from "@/sanity/lib/backendClient";

export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  try {
    const body = await request.json();
    const { action, orderId, driverId, fromDriverId, toDriverId, reason } = body ?? {};

    const actor = { actorUserId: admin.userId, actorName: "Operador admin" };

    if (action === "assign" || action === "offer") {
      if (!orderId || !driverId) {
        return NextResponse.json({ error: "Faltan pedido o repartidor." }, { status: 400 });
      }
      const order = await backendClient.fetch<{ serviceKind?: string; orderNumber?: string }>(
        `*[_type == "order" && _id == $orderId][0]{ serviceKind, orderNumber }`,
        { orderId }
      );
      if (!order) return NextResponse.json({ error: "El pedido no existe." }, { status: 404 });

      // Flujo de oferta (SOLO mandados): en los 3 modos del Dispatch Center,
      // "seleccionar repartidor" para un mandado crea una OFERTA, no una
      // asignación. La asignación definitiva ocurre solo cuando el repartidor
      // ACEPTA por WhatsApp. Los restaurantes conservan la asignación directa.
      // La regla vive aquí (servidor) para que ningún cliente/UI la pueda omitir.
      if (order.serviceKind === "mandado") {
        const result = await offerOrderToDriver(orderId, driverId, {
          reason: reason ?? "oferta manual desde el Dispatch Center",
        });
        if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
        const config = await getDispatchConfig().catch(() => null);
        await backendClient
          .create({
            _type: "dispatchAudit",
            action: "offer",
            mode: config?.mode ?? "manual",
            actorUserId: admin.userId,
            actorName: "Operador admin",
            order: { _type: "reference", _ref: orderId },
            orderNumber: order.orderNumber,
            driver: { _type: "reference", _ref: driverId },
            reason: reason ?? "oferta manual",
            details: "Oferta de reparto enviada por WhatsApp; el mandado queda asignado solo cuando el repartidor acepta.",
            createdAt: new Date().toISOString(),
          })
          .catch(() => null);
        return NextResponse.json({ success: true, offer: true });
      }

      // Restaurante: el flujo de oferta no aplica; si se pidió explícitamente, se rechaza.
      if (action === "offer") {
        return NextResponse.json({ error: "El flujo de oferta solo aplica a mandados." }, { status: 409 });
      }

      const result = await assignOrderToDriver({
        orderId,
        driverId,
        ...actor,
        mode: "manual",
        reason: reason ?? "asignación manual",
        notifyDriver: true,
      });
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
      return NextResponse.json({ success: true });
    }

    if (action === "reassign") {
      if (!orderId || !fromDriverId || !toDriverId) {
        return NextResponse.json({ error: "Faltan datos para reasignar." }, { status: 400 });
      }
      // Nota: la reasignación es un override admin directo sobre un pedido YA
      // asignado (no aplica el flujo de oferta). La regla "seleccionar =
      // oferta" rige solo para pedidos SIN repartidor; reasignar mueve una
      // asignación existente de un repartidor a otro de forma inmediata.
      const result = await reassignOrder({
        orderId,
        fromDriverId,
        toDriverId,
        ...actor,
        reason: reason ?? "reasignación manual",
      });
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
      return NextResponse.json({ success: true });
    }

    if (action === "cancel_offer") {
      if (!orderId || !driverId) {
        return NextResponse.json({ error: "Faltan pedido o repartidor." }, { status: 400 });
      }
      const order = await backendClient.fetch<{ orderNumber?: string }>(
        `*[_type == "order" && _id == $orderId][0]{ orderNumber }`,
        { orderId }
      );
      if (!order) return NextResponse.json({ error: "El pedido no existe." }, { status: 404 });
      // El código interno "offer_cancelled" activa el evento offer_cancelled en
      // setOrdersWaiting; el texto legible para humanos va en el audit details.
      const result = await cancelOrderOffer(orderId, driverId, "offer_cancelled");
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
      const config = await getDispatchConfig().catch(() => null);
      await backendClient
        .create({
          _type: "dispatchAudit",
          action: "cancel_offer",
          mode: config?.mode ?? "manual",
          actorUserId: admin.userId,
          actorName: "Operador admin",
          order: { _type: "reference", _ref: orderId },
          orderNumber: order.orderNumber,
          driver: { _type: "reference", _ref: driverId },
          reason: reason ?? "cancelación de oferta",
          details: "Oferta cancelada por el operador; el pedido vuelve a la cola de asignación.",
          createdAt: new Date().toISOString(),
        })
        .catch(() => null);
      return NextResponse.json({ success: true });
    }

    if (action === "unassign") {
      if (!orderId || !driverId) {
        return NextResponse.json({ error: "Faltan pedido o repartidor." }, { status: 400 });
      }
      const result = await releaseOrderFromDriver({
        orderId,
        driverId,
        ...actor,
        reason: reason ?? "cancelación de asignación",
        notifyDriver: true,
      });
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
      return NextResponse.json({ success: true });
    }

    if (action === "redispatch") {
      if (!orderId) return NextResponse.json({ error: "Falta el pedido." }, { status: 400 });
      const config = await getDispatchConfig();
      if (config.mode !== "auto") {
        return NextResponse.json({
          success: false,
          info: `El modo ${config.mode} no ejecuta el algoritmo automático. El pedido queda en espera para asignación.`,
        });
      }
      const sent = await dispatchDeliveryOffer(orderId);
      await backendClient
        .create({
          _type: "dispatchAudit",
          action: "redispatch",
          mode: "auto",
          actorUserId: admin.userId,
          actorName: "Operador admin",
          order: { _type: "reference", _ref: orderId },
          reason: reason ?? "re-ejecución del algoritmo",
          details: sent ? "Oferta enviada automáticamente al repartidor." : "Sin repartidores disponibles en este intento.",
          createdAt: new Date().toISOString(),
        })
        .catch(() => null);
      return NextResponse.json({ success: sent, info: sent ? "Oferta enviada al repartidor." : "No se pudo ofrecer el pedido (revisa repartidores disponibles)." });
    }

    return NextResponse.json({ error: "Acción inválida." }, { status: 400 });
  } catch (error) {
    console.error("[admin/dispatch/assign]", error);
    return NextResponse.json({ error: "No se pudo completar la acción." }, { status: 500 });
  }
}
