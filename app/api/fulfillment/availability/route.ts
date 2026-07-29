import { NextRequest, NextResponse } from "next/server";
import { calculateDeliveryQuote } from "@/lib/delivery-zones";
import { getDeliveryScheduleConfig } from "@/lib/delivery-schedule-config";
import { isDeliveryDriverAvailable } from "@/lib/fulfillment";
import { getStoreAvailability, type FulfillmentType } from "@/lib/fulfillment-schedule";
import { getDeliveryConfig } from "@/lib/order-pricing";
import { backendClient } from "@/sanity/lib/backendClient";

const STORE_QUERY = `*[_type == "affiliateStore" && _id == $storeId][0]{
  _id,
  isActive,
  isOpen,
  manualOperationalStatus,
  operatingHours,
  serviceTypes,
  hasOwnDelivery,
  "connectedCommunityDrivers": count(*[
    _type == "repartidor" &&
    activo == true &&
    disponible == true &&
    (!defined(disponibleHasta) || disponibleHasta > now()) &&
    !defined(tiendaAsignada)
  ]),
  deliveryTimeMin,
  scheduledOrdersEnabled,
  minimumPreparationMinutes,
  scheduledOrderIntervalMinutes,
  maximumScheduledDays,
  lastDeliveryOrderMinutesBeforeClose,
  lastPickupOrderMinutesBeforeClose
}`;

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const storeId = params.get("storeId") || "";
    const fulfillmentType = params.get("type") as FulfillmentType;
    if (!storeId || !["delivery", "pickup"].includes(fulfillmentType)) {
      return NextResponse.json({ error: "storeId y type son requeridos." }, { status: 400 });
    }

    const [store, config] = await Promise.all([
      backendClient.fetch<any>(STORE_QUERY, { storeId }),
      getDeliveryScheduleConfig(),
    ]);
    if (!store) return NextResponse.json({ error: "Tienda no encontrada." }, { status: 404 });

    let coverageAllowed = true;
    let coverageReason: string | undefined;
    const latitude = Number(params.get("latitude"));
    const longitude = Number(params.get("longitude"));
    if (
      fulfillmentType === "delivery" &&
      Number.isFinite(latitude) &&
      Number.isFinite(longitude)
    ) {
      const deliveryConfig = await getDeliveryConfig(store.hasOwnDelivery ? storeId : undefined);
      const quote = calculateDeliveryQuote(deliveryConfig, {
        lat: latitude,
        lng: longitude,
        orderDate: new Date(),
      });
      coverageAllowed = quote.allowed;
      coverageReason = quote.reason;
    }

    const availability = getStoreAvailability({
      store,
      config,
      fulfillmentType,
      coverageAllowed,
    });
    if (
      fulfillmentType === "delivery" &&
      !isDeliveryDriverAvailable(
        store.hasOwnDelivery,
        Number(store.connectedCommunityDrivers || 0)
      )
    ) {
      availability.asapAvailable = false;
      availability.schedulingAvailable = false;
      availability.slots = [];
      availability.reason =
        "No hay repartidores de El Menú disponibles en este momento. Puedes elegir retiro en el local o intentarlo más tarde.";
    }
    if (!coverageAllowed && coverageReason) availability.reason = coverageReason;
    return NextResponse.json(availability, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[fulfillment/availability]", error);
    return NextResponse.json({ error: "No se pudo consultar la disponibilidad." }, { status: 500 });
  }
}
