
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { client, writeClient } from "@/sanity/lib/client";

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get("storeId");

    if (!storeId) return NextResponse.json({ error: "Falta storeId" }, { status: 400 });

    const query = `*[_type == "affiliateStore" && _id == $storeId][0]`;
    const store = await client.fetch(query, { storeId });

    if (!store) return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 });
    
    // Check if the user is the owner
    if (store.ownerClerkUserId !== userId) {
         return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    return NextResponse.json({ store });
  } catch (e) {
    console.error("[store-config]", e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const body = await request.json();
    const { storeId, serviceTypes } = body;

    if (!storeId) return NextResponse.json({ error: "Falta storeId" }, { status: 400 });
    if (!serviceTypes) return NextResponse.json({ error: "Faltan serviceTypes" }, { status: 400 });

    const store = await client.fetch(
      `*[_type == "affiliateStore" && _id == $storeId][0]{ _id, ownerClerkUserId, serviceTypes }`,
      { storeId }
    );

    if (!store) return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 });
    if (store.ownerClerkUserId !== userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const nextServiceTypes = {
      ...(store.serviceTypes || {}),
      ...serviceTypes,
      onDemand: Boolean(serviceTypes.onDemand),
      onDemandExtraMinutes: Number(serviceTypes.onDemandExtraMinutes ?? 15),
    };

    const updated = await writeClient
      .patch(storeId)
      .set({ serviceTypes: nextServiceTypes })
      .commit();

    return NextResponse.json({ success: true, store: updated });
  } catch (e) {
    console.error("[store-config PATCH]", e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
