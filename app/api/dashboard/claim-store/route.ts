import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const { storeId } = body;

    if (!storeId) {
      return NextResponse.json({ error: "storeId requerido" }, { status: 400 });
    }

    return NextResponse.json(
      {
        error:
          "La autoasignacion de tiendas esta deshabilitada. Un administrador debe asignar la tienda manualmente.",
      },
      { status: 403 }
    );
  } catch (e) {
    console.error("[claim-store POST]", e);
    return NextResponse.json({ error: "Error al reclamar tienda" }, { status: 500 });
  }
}
