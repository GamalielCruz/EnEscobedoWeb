import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  void request;

  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    return NextResponse.json(
      {
        error:
          "La lista global de tiendas ya no esta disponible para cuentas sin asignacion administrativa.",
        stores: [],
      },
      { status: 403 }
    );
  } catch (e) {
    console.error("[all-stores GET]", e);
    return NextResponse.json({ error: "Error al cargar tiendas", stores: [] }, { status: 500 });
  }
}
