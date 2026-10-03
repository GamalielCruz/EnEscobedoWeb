import { NextRequest, NextResponse } from "next/server";
import { requireDriver } from "@/lib/driver-auth";
import {
  getOrderRatingStatus,
  submitOrderRating,
  type RatingFailure,
} from "@/lib/order-ratings-store";

export const dynamic = "force-dynamic";

// ────────────────────────────────────────────────────────────────────
// Evaluación del REPARTIDOR hacia el cliente (mismo sistema de 3 estrellas).
//
//   GET  /api/driver/rating?orderNumber=…  → ¿puede evaluar? ¿ya evaluó?
//   POST /api/driver/rating                → registra la evaluación
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

export async function GET(request: NextRequest) {
  const auth = await requireDriver();
  if (!auth.ok) return auth.error;

  const orderNumber = request.nextUrl.searchParams.get("orderNumber");
  if (!orderNumber) {
    return NextResponse.json({ error: "orderNumber es requerido." }, { status: 400 });
  }

  try {
    const result = await getOrderRatingStatus({
      orderNumber,
      role: "driver",
      evaluatorId: auth.repartidor._id,
    });
    if (!result.ok) return failureResponse(result);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[driver/rating GET] Error", {
      orderNumber,
      driverId: auth.repartidor._id,
      error: error instanceof Error ? { message: error.message } : error,
    });
    return NextResponse.json(
      { ok: false, error: "No pudimos preparar la evaluación. Intenta de nuevo." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireDriver();
  if (!auth.ok) return auth.error;

  const body = await request.json().catch(() => ({}));
  const orderNumber = typeof body?.orderNumber === "string" ? body.orderNumber : null;
  if (!orderNumber) {
    return NextResponse.json({ error: "orderNumber es requerido." }, { status: 400 });
  }

  try {
    const result = await submitOrderRating({
      orderNumber,
      role: "driver",
      evaluatorId: auth.repartidor._id,
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
    console.error("[driver/rating POST] Error", {
      orderNumber,
      driverId: auth.repartidor._id,
      error: error instanceof Error ? { message: error.message } : error,
    });
    return NextResponse.json(
      { ok: false, error: "No pudimos guardar la evaluación. Intenta de nuevo." },
      { status: 500 }
    );
  }
}
