import "server-only";

import { getDeliveryScheduleConfig } from "@/lib/delivery-schedule-config";
import { dispatchDeliveryOffer } from "@/lib/delivery-dispatch";
import { appendOrderEvent } from "@/lib/order-events";
import {
  getScheduledOrderRisk,
  shouldSendScheduledNoDriverContingency,
} from "@/lib/fulfillment-schedule";
import {
  sendScheduledOrderNoDriver,
} from "@/lib/scheduled-order-whatsapp";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { assignOrderToDriver } from "@/lib/dispatch/dispatch-core";
import { backendClient } from "@/sanity/lib/backendClient";

type ScheduledOrder = {
  _id: string;
  _rev: string;
  orderNumber?: string;
  customerName?: string;
  phone?: string;
  orderType?: "delivery" | "pickup";
  orderStatus?: string;
  paymentStatus?: string;
  paymentMethod?: string;
  dispatchStatus?: string;
  scheduleStatus?: string;
  scheduleRiskLevel?: string;
  scheduleRiskAlertedAt?: string;
  scheduledPreparationAt?: string;
  scheduledDispatchAt?: string;
  scheduledDispatchStartedAt?: string;
  scheduledSlot?: { startAt?: string; endAt?: string };
  repartidorAsignado?: unknown;
  preassignedDriver?: { _ref?: string } | string | null;
  grossTotal?: number;
  totalPrice?: number;
  storeName?: string;
};

// Filtro de órdenes programadas que el cron debe procesar.
// NOTA: NO se filtra por paymentStatus == "paid" porque una orden programada
// ya fue validada al crearse. El pago puede estar pendiente de confirmación
// del webhook de Stripe y eso no debe impedir que entre a Dispatch a su hora.
const ACTIVE_SCHEDULED_FILTER = `
  _type == "order" &&
  fulfillmentTiming == "scheduled" &&
  scheduleStatus in ["scheduled", "ready_for_dispatch", "dispatching"] &&
  orderStatus != "cancelled" &&
  orderStatus != "completed" &&
  orderStatus != "delivered" &&
  paymentStatus != "failed" &&
  paymentStatus != "expired" &&
  paymentStatus != "refunded"
`;

const PROJECTION = `{
  _id,
  _rev,
  orderNumber,
  customerName,
  phone,
  orderType,
  orderStatus,
  paymentStatus,
  paymentMethod,
  dispatchStatus,
  scheduleStatus,
  scheduleRiskLevel,
  scheduleRiskAlertedAt,
  scheduledPreparationAt,
  scheduledDispatchAt,
  preparationStartedAt,
  scheduledDispatchStartedAt,
  scheduledSlot,
  repartidorAsignado,
  preassignedDriver,
  grossTotal,
  totalPrice,
  "storeName": affiliateStore->name
}`;

function isRevisionConflict(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    ("statusCode" in error && error.statusCode === 409)
  );
}

export async function processScheduledOrders(now = new Date()) {
  const nowIso = now.toISOString();
  const config = await getDeliveryScheduleConfig();
  const dueOrders = await backendClient.fetch<ScheduledOrder[]>(
    `*[${ACTIVE_SCHEDULED_FILTER} && (
      (orderType == "delivery" && !defined(scheduledDispatchStartedAt) && scheduledDispatchAt <= $now)
    )] ${PROJECTION}`,
    { now: nowIso }
  );
  const summary = { prepared: 0, dispatched: 0, riskUpdated: 0, alerts: 0, errors: 0 };

  for (const order of dueOrders) {
    const startDispatch =
      order.orderType === "delivery" &&
      !order.scheduledDispatchStartedAt &&
      Boolean(order.scheduledDispatchAt && order.scheduledDispatchAt <= nowIso);
    if (!startDispatch) continue;

    const fields: Record<string, unknown> = { updatedAt: nowIso };
    if (startDispatch) {
      fields.scheduledDispatchStartedAt = nowIso;
      fields.dispatchStatus = "waiting_for_driver";
      fields.scheduleStatus = "ready_for_dispatch";
    }

    try {
      await backendClient.patch(order._id).ifRevisionId(order._rev).set(fields).commit();
      if (startDispatch) {
        summary.dispatched += 1;
        await appendOrderEvent(order._id, {
          type: "scheduled_order_ready_for_dispatch",
          source: "cron/check-repartidores",
          at: nowIso,
        });
        await appendOrderEvent(order._id, {
          type: "scheduled_order_dispatch_started",
          source: "cron/check-repartidores",
          at: nowIso,
        });

        // Reserva silenciosa: si hay preassignedDriver, verificar disponibilidad.
        const preassignedRef = order.preassignedDriver;
        const preassignedDriverId = typeof preassignedRef === "string"
          ? preassignedRef
          : preassignedRef?._ref ?? null;
        if (preassignedDriverId) {
          const driver = await backendClient.fetch<any>(
            `*[_type == "repartidor" && _id == $driverId][0]{
              _id, activo, disponible, bloqueado, estadoDisponibilidad, disponibleHasta
            }`,
            { driverId: preassignedDriverId }
          );
          const isAvailable =
            driver &&
            driver.activo &&
            !driver.bloqueado &&
            driver.disponible &&
            driver.estadoDisponibilidad === "available" &&
            (!driver.disponibleHasta || new Date(driver.disponibleHasta).getTime() > Date.now());

          if (isAvailable) {
            // Reserva confirmada: asignar directamente al preassignedDriver.
            // assignOrderToDriver setea repartidorAsignado, limpia preassignedDriver,
            // y maneja dispatchStatus/scheduleStatus/scheduledDispatchStartedAt.
            const assigned = await assignOrderToDriver({
              orderId: order._id,
              driverId: preassignedDriverId,
              actorUserId: "cron/check-repartidores",
              actorName: "Cron",
              mode: "auto",
              reason: "reserva silenciosa confirmada",
              notifyDriver: true,
              markShipped: false,
              skipEvents: true, // ya registramos los eventos arriba
            });
            if (!assigned.ok) {
              // Si la asignación falló (driver ya no disponible, conflicto),
              // limpiar preassigned y dejar que el dispatch normal continúe.
              await backendClient
                .patch(order._id)
                .unset(["preassignedDriver", "preassignedAt"])
                .commit();
              await dispatchDeliveryOffer(order._id);
            }
          } else {
            // Reserva no materializable: driver ya no disponible.
            await backendClient
              .patch(order._id)
              .unset(["preassignedDriver", "preassignedAt"])
              .commit();
            await appendOrderEvent(order._id, {
              type: "scheduled_order_preassignment_cleared",
              source: "cron/check-repartidores",
              payload: { reason: "preassigned driver no longer available" },
            });
            await dispatchDeliveryOffer(order._id);
          }
        } else {
          // Sin reserva: dispatch normal.
          await dispatchDeliveryOffer(order._id);
        }
      }
    } catch (error) {
      if (!isRevisionConflict(error)) {
        summary.errors += 1;
        console.error("[scheduled-orders] no se pudo activar", { orderId: order._id, error });
      }
    }
  }

  // ── Safety net: reconciliación de órdenes atascadas ──────────────────
  // Busca órdenes cuyo scheduledDispatchAt ya venció pero que siguen con
  // scheduleStatus == "scheduled" y sin scheduledDispatchStartedAt. Esto
  // cubre race conditions o fallos transitorios del loop principal.
  const stuckOrders = await backendClient.fetch<ScheduledOrder[]>(
    `*[${ACTIVE_SCHEDULED_FILTER} &&
      orderType == "delivery" &&
      scheduleStatus == "scheduled" &&
      !defined(scheduledDispatchStartedAt) &&
      scheduledDispatchAt <= $now
    ] { _id, _rev, orderNumber, scheduledDispatchAt, scheduleStatus }`,
    { now: nowIso }
  );
  for (const order of stuckOrders) {
    // Solo procesar si no fue ya procesado en el loop principal
    // (doble verificación atómica con ifRevisionId)
    try {
      await backendClient
        .patch(order._id)
        .ifRevisionId(order._rev)
        .set({
          scheduledDispatchStartedAt: nowIso,
          dispatchStatus: "waiting_for_driver",
          scheduleStatus: "ready_for_dispatch",
          updatedAt: nowIso,
        })
        .commit();
      summary.dispatched += 1;
      await appendOrderEvent(order._id, {
        type: "scheduled_order_ready_for_dispatch",
        source: "cron/check-repartidores/safety-net",
        at: nowIso,
      });
      await dispatchDeliveryOffer(order._id);
    } catch (error) {
      if (!isRevisionConflict(error)) {
        summary.errors += 1;
        console.error("[scheduled-orders] safety-net: no se pudo activar", { orderId: order._id, error });
      }
    }
  }

  const horizon = new Date(
    now.getTime() +
      Math.max(30, config.riskBeforeMinutes, config.adminAlertBeforeMinutes, config.contingencyBeforeMinutes) *
        60_000
  ).toISOString();
  const riskOrders = await backendClient.fetch<ScheduledOrder[]>(
    `*[${ACTIVE_SCHEDULED_FILTER} &&
      orderType == "delivery" &&
      !defined(repartidorAsignado) &&
      scheduledSlot.startAt > $now &&
      scheduledSlot.startAt <= $horizon
    ] ${PROJECTION}`,
    { now: nowIso, horizon }
  );

  for (const order of riskOrders) {
    const risk = getScheduledOrderRisk({
      startAt: String(order.scheduledSlot?.startAt),
      hasDriver: Boolean(order.repartidorAsignado),
      now,
      riskBeforeMinutes: config.riskBeforeMinutes,
      adminAlertBeforeMinutes: config.adminAlertBeforeMinutes,
      contingencyBeforeMinutes: config.contingencyBeforeMinutes,
    });
    if (risk === order.scheduleRiskLevel) continue;

    try {
      await backendClient
        .patch(order._id)
        .ifRevisionId(order._rev)
        .set({ scheduleRiskLevel: risk, updatedAt: nowIso })
        .commit();
      summary.riskUpdated += 1;
      await appendOrderEvent(order._id, {
        type: "scheduled_order_risk_alert",
        source: "cron/check-repartidores",
        payload: { risk },
      });

      if (risk === "alert" && !order.scheduleRiskAlertedAt && process.env.ADMIN_WHATSAPP_PHONE) {
        await sendWhatsAppMessage(
          process.env.ADMIN_WHATSAPP_PHONE,
          `Pedido programado #${order.orderNumber || order._id} sin repartidor. Nivel: alerta.`
        ).catch(() => null);
        await backendClient.patch(order._id).set({ scheduleRiskAlertedAt: nowIso }).commit();
        summary.alerts += 1;
      }
      if (shouldSendScheduledNoDriverContingency({
        orderType: order.orderType,
        risk,
        hasDriver: Boolean(order.repartidorAsignado),
        scheduledDispatchStartedAt: order.scheduledDispatchStartedAt,
      })) {
        await sendScheduledOrderNoDriver(order);
      }
    } catch (error) {
      if (!isRevisionConflict(error)) {
        summary.errors += 1;
        console.error("[scheduled-orders] no se pudo actualizar riesgo", {
          orderId: order._id,
          error,
        });
      }
    }
  }

  return summary;
}
