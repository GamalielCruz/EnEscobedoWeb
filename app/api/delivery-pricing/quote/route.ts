import { NextRequest, NextResponse } from "next/server";
import {
  calculateDeliveryQuote,
  DEFAULT_DELIVERY_CONFIG,
  EMPTY_STORE_DELIVERY_CONFIG,
  getDeliveryPricingConfigId,
  normalizeDeliveryConfig,
} from "@/lib/delivery-zones";
import { writeClient } from "@/sanity/lib/client";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const lat = Number(body.lat ?? body.latitude);
    const lng = Number(body.lng ?? body.longitude);
    const storeId = typeof body.storeId === "string" ? body.storeId : null;

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ error: "Latitud y longitud son requeridas" }, { status: 400 });
    }

    const config = await getConfig(storeId);
    const quote = calculateDeliveryQuote(config, {
      lat,
      lng,
      orderDate: body.orderDate ? new Date(body.orderDate) : new Date(),
    });

    return NextResponse.json({ success: true, quote });
  } catch (error) {
    console.error("[delivery-pricing/quote POST]", error);
    return NextResponse.json({ error: "Error calculando costo de envio" }, { status: 500 });
  }
}

async function getConfig(storeId: string | null) {
  const store = storeId
    ? await writeClient.fetch<{ hasOwnDelivery?: boolean } | null>(
        `*[_type == "affiliateStore" && _id == $storeId][0]{ hasOwnDelivery }`,
        { storeId }
      )
    : null;
  const usesOwnDelivery = store?.hasOwnDelivery === true;
  const doc = await writeClient.fetch(
    `*[_type == "deliveryPricingConfig" && _id == $id][0]`,
    { id: getDeliveryPricingConfigId(usesOwnDelivery ? storeId : null) }
  );
  return normalizeDeliveryConfig(
    doc ?? (usesOwnDelivery ? EMPTY_STORE_DELIVERY_CONFIG : DEFAULT_DELIVERY_CONFIG)
  );
}
