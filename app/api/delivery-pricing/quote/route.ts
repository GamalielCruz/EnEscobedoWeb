import { NextRequest, NextResponse } from "next/server";
import { calculateDeliveryQuote, DEFAULT_DELIVERY_CONFIG, normalizeDeliveryConfig } from "@/lib/delivery-zones";
import { writeClient } from "@/sanity/lib/client";

const CONFIG_ID = "deliveryPricingConfig.main";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const lat = Number(body.lat ?? body.latitude);
    const lng = Number(body.lng ?? body.longitude);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ error: "Latitud y longitud son requeridas" }, { status: 400 });
    }

    const config = await getConfig();
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

async function getConfig() {
  const doc = await writeClient.fetch(`*[_type == "deliveryPricingConfig" && _id == $id][0]`, { id: CONFIG_ID });
  return normalizeDeliveryConfig(doc ?? DEFAULT_DELIVERY_CONFIG);
}
