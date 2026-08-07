import { NextRequest, NextResponse } from "next/server";
import {
  assignOrderToDriver,
  reassignOrder,
  releaseOrderFromDriver,
  requireAdmin,
} from "@/lib/dispatch/dispatch-core";
import { getDispatchConfig } from "@/lib/dispatch/dispatch-config";
import { dispatchDeliveryOffer } from "@/lib/delivery-dispatch";
import { backendClient } from "@/sanity/lib/backendClient";

export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  try {
    const body = await request.json();
    const { action, orderId, driverId, fromDriverId, toDriverId, reason } = body ?? {};

    const actor = { actorUserId: admin.userId, actorName: "Operador admin" };

    if (action === "assign") {
      if (!orderId || !driverId) {
        return NextResponse.json({ error: "Faltan pedido o repartidor." }, { status: 400 });
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
