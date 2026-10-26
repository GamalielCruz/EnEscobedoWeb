import { NextResponse } from "next/server";
import { requireDriver } from "@/lib/driver-auth";
import { getRatingSummary } from "@/lib/order-ratings-store";

export const dynamic = "force-dynamic";

/**
 * GET /api/driver/profile — promedio ANÓNIMO de calificaciones RECIBIDAS por el
 * repartidor sobre una ventana móvil de las últimas 50.
 *
 * Solo lectura. Expone únicamente el promedio y cuántas evaluaciones entran en
 * la ventana: nunca evaluación individual, distribución ni evaluador. NO toca
 * `repartidor.calificacion` (ese campo alimenta el ranking del despacho): el
 * promedio del perfil se calcula aparte.
 */
export async function GET() {
  const auth = await requireDriver();
  if (!auth.ok) return auth.error;

  try {
    const result = await getRatingSummary({
      evaluateeId: auth.repartidor._id,
      evaluateeRole: "driver",
    });
    if (!result.ok) return NextResponse.json(result, { status: 404 });

    return NextResponse.json(
      {
        ok: true,
        profile: {
          name: auth.repartidor.nombre ?? "Repartidor",
          summary: result.summary,
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[driver/profile GET] Error", {
      driverId: auth.repartidor._id,
      error: error instanceof Error ? { message: error.message } : error,
    });
    return NextResponse.json(
      { ok: false, error: "No pudimos cargar tu perfil. Intenta de nuevo." },
      { status: 500 }
    );
  }
}
