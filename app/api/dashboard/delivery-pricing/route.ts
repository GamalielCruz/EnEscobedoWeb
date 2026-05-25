import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { isAdminUser } from "@/lib/admin";
import {
  calculateDeliveryQuote,
  DEFAULT_DELIVERY_CONFIG,
  normalizeDeliveryConfig,
  validateZoneOverlaps,
} from "@/lib/delivery-zones";
import { writeClient } from "@/sanity/lib/client";

const CONFIG_ID = "deliveryPricingConfig.main";

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!isAdminUser(userId)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const config = await getConfig();
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
    if (!isAdminUser(userId)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const body = await request.json();
    const config = normalizeDeliveryConfig(body.config);

    const updated = await writeClient
      .createIfNotExists({
        _id: CONFIG_ID,
        _type: "deliveryPricingConfig",
        title: "Configuracion principal de envios",
        ...DEFAULT_DELIVERY_CONFIG,
      })
      .then(() =>
        writeClient
          .patch(CONFIG_ID)
          .set({
            title: "Configuracion principal de envios",
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

async function getConfig() {
  const doc = await writeClient.fetch(`*[_type == "deliveryPricingConfig" && _id == $id][0]`, { id: CONFIG_ID });
  return normalizeDeliveryConfig(doc ?? DEFAULT_DELIVERY_CONFIG);
}
