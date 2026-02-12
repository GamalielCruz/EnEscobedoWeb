import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { writeClient } from "@/sanity/lib/client";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const { storeId, force } = body;

    if (!storeId) {
      return NextResponse.json({ error: "storeId requerido" }, { status: 400 });
    }

    // Check if store exists
    const store = await writeClient.getDocument(storeId);
    if (!store) {
      return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 });
    }

    // Check if already owned
    if (store.ownerClerkUserId && store.ownerClerkUserId !== userId && !force) {
        return NextResponse.json({ error: `Esta tienda ya pertenece a otro usuario (${store.ownerClerkUserId})` }, { status: 403 });
    }

    // Update store owner
    await writeClient
      .patch(storeId)
      .set({ ownerClerkUserId: userId })
      .commit();

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[claim-store POST]", e);
    return NextResponse.json({ error: "Error al reclamar tienda" }, { status: 500 });
  }
}

