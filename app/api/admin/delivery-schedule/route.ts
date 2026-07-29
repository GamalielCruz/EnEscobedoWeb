import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { DELIVERY_SCHEDULE_CONFIG_ID, getDeliveryScheduleConfig } from "@/lib/delivery-schedule-config";
import { appendOrderEvent } from "@/lib/order-events";
import {
  FULFILLMENT_TIMEZONE,
  WEEKDAYS,
  normalizeDeliveryScheduleConfig,
  type DeliveryScheduleConfig,
} from "@/lib/fulfillment-schedule";
import { isAdminUser } from "@/lib/admin";
import { syncBaserowOrderById } from "@/lib/baserow";
import { backendClient } from "@/sanity/lib/backendClient";

const SCHEDULED_ORDERS_QUERY = `*[
  _type == "order" && fulfillmentTiming == "scheduled"
] | order(scheduledSlot.startAt asc)[0...250]{
  _id,
  _rev,
  orderNumber,
  customerName,
  phone,
  orderType,
  orderStatus,
  paymentStatus,
  dispatchStatus,
  scheduleStatus,
  scheduledSlot,
  scheduledPreparationAt,
  scheduledDispatchAt,
  preparationStartedAt,
  scheduledDispatchStartedAt,
  scheduleRiskLevel,
  customerHelpRequested,
  repartidorAsignado->{ _id, nombre },
  "storeName": affiliateStore->name
}`;

const DRIVERS_QUERY = `*[
  _type == "repartidor" &&
  activo == true &&
  disponible == true &&
  estadoDisponibilidad == "available" &&
  (!defined(disponibleHasta) || disponibleHasta > $now)
] | order(nombre asc){
  _id,
  nombre,
  telefono,
  disponible,
  estadoDisponibilidad
}`;

async function requireAdmin() {
  const { userId } = await auth();
  if (!userId) return { error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  if (!isAdminUser(userId)) return { error: NextResponse.json({ error: "Sin permisos" }, { status: 403 }) };
  return { userId };
}

function assertValidConfig(config: DeliveryScheduleConfig) {
  const time = /^([01]\d|2[0-3]):[0-5]\d$/;
  for (const weekday of WEEKDAYS) {
    const day = config.weeklySchedule[weekday];
    if (!time.test(day.startTime) || !time.test(day.endTime) || day.startTime >= day.endTime) {
      throw new Error(`Horario invalido para ${weekday}.`);
    }
  }
  if (
    config.contingencyBeforeMinutes > config.adminAlertBeforeMinutes ||
    config.adminAlertBeforeMinutes > config.riskBeforeMinutes
  ) {
    throw new Error("Los umbrales deben mantener contingencia <= alerta <= riesgo.");
  }
  for (const exception of config.exceptions) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(exception.date)) throw new Error("Fecha de excepcion invalida.");
    if (
      exception.deliveryEnabled &&
      ((!time.test(exception.startTime || "") || !time.test(exception.endTime || "")) ||
        String(exception.startTime) >= String(exception.endTime))
    ) {
      throw new Error(`Horario de excepcion invalido: ${exception.date}.`);
    }
  }
}

export async function GET() {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const [config, orders, drivers] = await Promise.all([
    getDeliveryScheduleConfig(),
    backendClient.fetch(SCHEDULED_ORDERS_QUERY),
    backendClient.fetch(DRIVERS_QUERY, { now: new Date().toISOString() }),
  ]);
  return NextResponse.json({ config, orders, drivers }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  try {
    const config = normalizeDeliveryScheduleConfig(await request.json());
    assertValidConfig(config);
    await backendClient.createOrReplace({
      _id: DELIVERY_SCHEDULE_CONFIG_ID,
      _type: "deliveryScheduleConfig",
      ...config,
      timezone: FULFILLMENT_TIMEZONE,
      updatedAt: new Date().toISOString(),
      updatedBy: admin.userId,
    });
    return NextResponse.json({ success: true, config });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Configuracion invalida." },
      { status: 400 }
    );
  }
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  try {
    const { action, orderId, driverId } = await request.json();
    if (action !== "assign_driver" || !orderId || !driverId) {
      return NextResponse.json({ error: "Accion invalida." }, { status: 400 });
    }
    const [order, driver] = await Promise.all([
      backendClient.fetch<any>(
        `*[_type == "order" && _id == $orderId][0]{
          _id, _rev, orderType, orderStatus, fulfillmentTiming, repartidorAsignado,
          "storeId": affiliateStore._ref,
          "storeHasOwnDelivery": affiliateStore->hasOwnDelivery
        }`,
        { orderId }
      ),
      backendClient.fetch<any>(
        `*[
          _type == "repartidor" &&
          _id == $driverId &&
          activo == true &&
          disponible == true &&
          estadoDisponibilidad == "available" &&
          (!defined(disponibleHasta) || disponibleHasta > $now)
        ][0]{ _id, _rev, nombre, "storeId": tiendaAsignada._ref }`,
        { driverId, now: new Date().toISOString() }
      ),
    ]);
    if (
      !order ||
      !driver ||
      order.orderType !== "delivery" ||
      order.fulfillmentTiming !== "scheduled" ||
      order.repartidorAsignado ||
      (order.storeHasOwnDelivery ? driver.storeId !== order.storeId : Boolean(driver.storeId)) ||
      ["cancelled", "delivered", "completed"].includes(order.orderStatus)
    ) {
      return NextResponse.json({ error: "Orden o repartidor no disponible." }, { status: 409 });
    }

    const now = new Date().toISOString();
    await backendClient
      .transaction()
      .patch(orderId, (patch) =>
        patch
          .ifRevisionId(order._rev)
          .set({
            repartidorAsignado: { _type: "reference", _ref: driverId },
            repartidorAsignadoAt: now,
            dispatchStatus: "accepted",
            scheduleStatus: "dispatching",
            scheduledDispatchStartedAt: now,
            updatedAt: now,
          })
          .unset(["offeredTo", "deliveryOfertaExpiresAt"])
      )
      .patch(driverId, (patch) =>
        patch
          .ifRevisionId(driver._rev)
          .set({ estadoDisponibilidad: "busy", ultimaActividad: now })
          .unset(["ultimoPedidoOfertado", "pedidosOfertados", "restauranteOferta", "ofertaTipo", "ofertaEnviadaAt", "ofertaExpiraAt"])
      )
      .commit();
    await appendOrderEvent(orderId, {
      type: "driver_assigned",
      source: "api/admin/delivery-schedule",
      actor: admin.userId,
      payload: { driverId, manual: true },
    });
    await appendOrderEvent(orderId, {
      type: "scheduled_order_driver_assigned",
      source: "api/admin/delivery-schedule",
      actor: admin.userId,
      payload: { driverId },
    });
    void syncBaserowOrderById(orderId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[admin/delivery-schedule]", error);
    return NextResponse.json({ error: "No se pudo completar la accion." }, { status: 500 });
  }
}
