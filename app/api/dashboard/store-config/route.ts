
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
    const { storeId, serviceTypes, isOpen, highDemandMode } = body;

    if (!storeId) return NextResponse.json({ error: "Falta storeId" }, { status: 400 });
    if (!serviceTypes && typeof isOpen !== "boolean" && typeof highDemandMode !== "boolean") {
      return NextResponse.json(
        { error: "Faltan datos para actualizar la configuracion" },
        { status: 400 }
      );
    }

    const store = await client.fetch(
      `*[_type == "affiliateStore" && _id == $storeId][0]{ _id, ownerClerkUserId, serviceTypes, isOpen, highDemandMode }`,
      { storeId }
    );

    if (!store) return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 });
    if (store.ownerClerkUserId !== userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const resolvedHighDemandMode =
      typeof highDemandMode === "boolean"
        ? highDemandMode
        : typeof serviceTypes?.onDemand === "boolean"
          ? serviceTypes.onDemand
          : Boolean(store.highDemandMode ?? store.serviceTypes?.onDemand);

    const nextServiceTypes = serviceTypes
      ? {
          ...(store.serviceTypes || {}),
          ...serviceTypes,
          onDemand: resolvedHighDemandMode,
          onDemandExtraMinutes: Number(
            serviceTypes.onDemandExtraMinutes ?? store.serviceTypes?.onDemandExtraMinutes ?? 15
          ),
        }
      : {
          ...(store.serviceTypes || {}),
          onDemand: resolvedHighDemandMode,
        };

    const patchData = {
      ...(typeof isOpen === "boolean" ? { isOpen } : {}),
      highDemandMode: resolvedHighDemandMode,
      serviceTypes: nextServiceTypes,
    };

    const updated = await writeClient
      .patch(storeId)
      .set(patchData)
      .commit();

    return NextResponse.json({ success: true, store: updated });
  } catch (e) {
    console.error("[store-config PATCH]", e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
