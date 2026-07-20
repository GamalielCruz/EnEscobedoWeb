import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { isAdminUser } from "@/lib/admin";
import {
  calculateDeliveryQuote,
  DEFAULT_DELIVERY_CONFIG,
  EMPTY_STORE_DELIVERY_CONFIG,
  getDeliveryPricingConfigId,
  normalizeDeliveryConfig,
  validateZoneOverlaps,
} from "@/lib/delivery-zones";
import { writeClient } from "@/sanity/lib/client";

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get("storeId");
    const accessError = await getAccessError(storeId, userId);
    if (accessError) return accessError;

    const config = await getConfig(storeId);
    const lat = Number(searchParams.get("lat"));
    const lng = Number(searchParams.get("lng"));
    const orderDate = searchParams.get("orderDate") ?? undefined;

    const quote = Number.isFinite(lat) && Number.isFinite(lng)
      ? calculateDeliveryQuote(config, { lat, lng, orderDate })
      : null;

    return NextResponse.json({
      success: true,
      config,
      quote,
      overlapWarnings: validateZoneOverlaps(config.zones),
    });
  } catch (error) {
    console.error("[delivery-pricing GET]", error);
    return NextResponse.json({ error: "Error cargando configuracion de envios" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { userId } = await auth();
    const body = await request.json();
    const storeId = typeof body.storeId === "string" ? body.storeId : null;
    const accessError = await getAccessError(storeId, userId);
    if (accessError) return accessError;

    const config = normalizeDeliveryConfig(body.config);
    const validationError = validateConfig(config);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

    const configId = getDeliveryPricingConfigId(storeId);
    const title = storeId ? `Configuracion de envios de ${storeId}` : "Configuracion principal de envios";

    const updated = await writeClient
      .createIfNotExists({
        _id: configId,
        _type: "deliveryPricingConfig",
        title,
        ...(storeId ? EMPTY_STORE_DELIVERY_CONFIG : DEFAULT_DELIVERY_CONFIG),
      })
      .then(() =>
        writeClient
          .patch(configId)
          .set({
            title,
            zones: config.zones,
            demand: config.demand,
            scheduleRules: config.scheduleRules,
            outsideZone: config.outsideZone,
            debug: config.debug,
          })
          .commit()
      );

    return NextResponse.json({
      success: true,
      config: normalizeDeliveryConfig(updated as Partial<typeof DEFAULT_DELIVERY_CONFIG>),
      overlapWarnings: validateZoneOverlaps(config.zones),
    });
  } catch (error) {
    console.error("[delivery-pricing PATCH]", error);
    return NextResponse.json({ error: "Error guardando configuracion de envios" }, { status: 500 });
  }
}

async function getConfig(storeId: string | null) {
  const doc = await writeClient.fetch(
    `*[_type == "deliveryPricingConfig" && _id == $id][0]`,
    { id: getDeliveryPricingConfigId(storeId) }
  );
  return normalizeDeliveryConfig(doc ?? (storeId ? EMPTY_STORE_DELIVERY_CONFIG : DEFAULT_DELIVERY_CONFIG));
}

async function getAccessError(storeId: string | null, userId: string | null) {
  if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!storeId) {
    return isAdminUser(userId) ? null : NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const store = await writeClient.fetch<{ ownerClerkUserId?: string; hasOwnDelivery?: boolean } | null>(
    `*[_type == "affiliateStore" && _id == $storeId][0]{ ownerClerkUserId, hasOwnDelivery }`,
    { storeId },
    { cache: "no-store" }
  );
  if (store?.ownerClerkUserId !== userId) {
    return NextResponse.json({ error: "No tienes permiso para esta tienda" }, { status: 403 });
  }
  return store.hasOwnDelivery
    ? null
    : NextResponse.json({ error: "El reparto propio requiere aprobacion" }, { status: 403 });
}

function validateConfig(config: ReturnType<typeof normalizeDeliveryConfig>) {
  if (config.zones.some((zone) => !zone || typeof zone.name !== "string" || !zone.name.trim() || !Number.isFinite(zone.basePrice) || zone.basePrice < 0)) {
    return "Cada zona requiere nombre y un costo valido";
  }
  if (config.zones.some((zone) => !Array.isArray(zone.coordinates) || zone.coordinates.length < 3)) {
    return "Cada zona requiere al menos tres puntos";
  }
  if (config.zones.some((zone) => zone.coordinates.some((point) =>
    !Number.isFinite(point?.lat) || point.lat < -90 || point.lat > 90 ||
    !Number.isFinite(point?.lng) || point.lng < -180 || point.lng > 180
  ))) {
    return "Las coordenadas de las zonas no son validas";
  }
  if (!Number.isFinite(config.demand.multiplier) || config.demand.multiplier < 0 || config.scheduleRules.some((rule) =>
    !Number.isFinite(rule?.multiplier) || rule.multiplier < 0 ||
    typeof rule.startTime !== "string" || typeof rule.endTime !== "string"
  )) {
    return "Los multiplicadores no pueden ser negativos";
  }
  if (!Number.isFinite(config.outsideZone.specialFee) || config.outsideZone.specialFee < 0) {
    return "La tarifa fuera de zona no puede ser negativa";
  }
  return null;
}
