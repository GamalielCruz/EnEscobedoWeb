import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getPendingCustomerRating } from "@/lib/order-ratings-store";

export const dynamic = "force-dynamic";

/**
 * GET /api/orders/rating/pending — tarjeta de calificación del cliente.
 *
 * Devuelve el pedido entregado más reciente que SIGUE dentro de la ventana de
 * 72 h y aún no fue evaluado; si no hay ninguno, `pending: null` (la tarjeta no
 * se muestra). Solo lectura: nunca escribe nada.
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const pending = await getPendingCustomerRating(userId);
    return NextResponse.json(
      { ok: true, pending },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[orders/rating/pending GET] Error", {
      userId,
      error: error instanceof Error ? { message: error.message } : error,
    });
    return NextResponse.json(
      { ok: false, error: "No pudimos revisar tus calificaciones pendientes." },
      { status: 500 }
    );
  }
}
