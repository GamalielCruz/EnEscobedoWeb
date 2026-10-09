import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  getOrderRatingStatus,
  submitOrderRating,
  type RatingFailure,
} from "@/lib/order-ratings-store";

export const dynamic = "force-dynamic";

// ────────────────────────────────────────────────────────────────────
// Evaluación del CLIENTE hacia el repartidor (sistema de 3 estrellas).
//
//   GET  /api/orders/[orderId]/rating  → ¿puede evaluar? ¿ya evaluó?
//   POST /api/orders/[orderId]/rating  → registra la evaluación
//
// Desacoplado: solo escribe documentos `orderRating`. No toca la orden.
// ────────────────────────────────────────────────────────────────────

function failureResponse(failure: RatingFailure) {
  const status =
    failure.code === "forbidden"
      ? 403
      : failure.code === "not_found"
        ? 404
        : failure.code === "invalid"
          ? 400
          : 409; // not_rateable | duplicate
  return NextResponse.json({ ok: false, code: failure.code, error: failure.error }, { status });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const result = await getOrderRatingStatus({
      orderNumber: orderId,
      role: "customer",
      evaluatorId: userId,
    });
    if (!result.ok) return failureResponse(result);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[orders/rating GET] Error", {
      orderId,
      error: error instanceof Error ? { message: error.message } : error,
    });
    return NextResponse.json(
      { ok: false, error: "No pudimos preparar tu evaluación. Intenta de nuevo." },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));

  try {
    const result = await submitOrderRating({
      orderNumber: orderId,
      role: "customer",
      evaluatorId: userId,
      rating: body?.rating,
      reasons: body?.reasons,
      comment: body?.comment,
      incidentDescription: body?.incidentDescription,
      requestContact: body?.requestContact,
    });
    if (!result.ok) return failureResponse(result);
    return NextResponse.json(
      {
        ok: true,
        alreadyRated: result.alreadyRated,
        hasSeriousIncident: result.value.hasSeriousIncident,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[orders/rating POST] Error", {
      orderId,
      userId,
      error: error instanceof Error ? { message: error.message } : error,
    });
    return NextResponse.json(
      { ok: false, error: "No pudimos guardar tu evaluación. Intenta de nuevo." },
      { status: 500 }
    );
  }
}
