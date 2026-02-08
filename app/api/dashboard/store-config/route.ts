
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { client } from "@/sanity/lib/client";

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
