import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getRatingSummary } from "@/lib/order-ratings-store";

export const dynamic = "force-dynamic";

/**
 * GET /api/customer/profile — perfil del cliente.
 *
 * Identidad: Clerk (nombre) — el cliente no vive en Sanity.
 * Reputación: promedio ANÓNIMO de las evaluaciones RECIBIDAS por el cliente
 * sobre una ventana móvil de las últimas 50. No expone evaluaciones
 * individuales, distribución ni quién calificó.
 *
 * Solo lectura: no modifica datos de Clerk ni documentos de la orden.
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId).catch(() => null);

    const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
    const name = fullName || user?.username || "Cliente";

    const result = await getRatingSummary({
      evaluateeId: userId,
      evaluateeRole: "customer",
    });
    if (!result.ok) return NextResponse.json(result, { status: 404 });

    return NextResponse.json(
      {
        ok: true,
        profile: {
          name,
          summary: result.summary,
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[customer/profile GET] Error", {
      userId,
      error: error instanceof Error ? { message: error.message } : error,
    });
    return NextResponse.json(
      { ok: false, error: "No pudimos cargar tu perfil. Intenta de nuevo." },
      { status: 500 }
    );
  }
}
