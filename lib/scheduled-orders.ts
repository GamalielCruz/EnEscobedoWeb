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
  grossTotal?: number;
  totalPrice?: number;
  storeName?: string;
};

const ACTIVE_SCHEDULED_FILTER = `
  _type == "order" &&
  fulfillmentTiming == "scheduled" &&
  scheduleStatus in ["scheduled", "ready_for_dispatch", "dispatching"] &&
  orderStatus != "cancelled" &&
  orderStatus != "completed" &&
  orderStatus != "delivered" &&
  paymentStatus != "failed" &&
  paymentStatus != "expired" &&
  paymentStatus != "refunded" &&
  (paymentStatus == "paid" || paymentMethod in ["cash_on_delivery", "cash_at_store", "cash_on_pickup"])
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
        await dispatchDeliveryOffer(order._id);
      }
    } catch (error) {
      if (!isRevisionConflict(error)) {
        summary.errors += 1;
        console.error("[scheduled-orders] no se pudo activar", { orderId: order._id, error });
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
