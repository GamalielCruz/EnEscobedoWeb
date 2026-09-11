import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { isAdminUser } from "@/lib/admin";
import { canUserActOnNipOrder, resendDeliveryPin } from "@/lib/nip-actions";

// Reenvía el código de entrega (remitente o operación/soporte, PASO 5).
// Reutiliza el NIP vigente si sigue válido; regenera SOLO si expiró o si el
// llamador lo pide explícitamente con { regenerate: true } (respetando el
// límite y cooldown de regeneración). Cooldown de 60 s entre reenvíos e
// idempotencia vía claim de WhatsApp.
//
// El remitente puede reenviar el código de su propio envío (incluso cuando el
// canal es el destinatario: el código va al WhatsApp del destinatario y NUNCA
// se revela aquí). La regeneración forzada ({ regenerate: true }) queda
// reservada a operación/soporte; al remitente solo se le regenera de forma
// automática cuando el NIP expiró (política de lib/nip-delivery.ts).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { orderId } = await params;

  const isAdmin = isAdminUser(userId);
  const isOwner = await canUserActOnNipOrder(userId, orderId);
  if (!isAdmin && !isOwner) {
    return NextResponse.json({ error: "No tienes permiso para esta acción" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  // La regeneración forzada explícita es solo de operación; el remitente solo
  // regenera de forma automática cuando el NIP expiró (el plan lo decide).
  const result = await resendDeliveryPin(orderId, {
    regenerate: isAdmin && body.regenerate === true,
    reason: String(body.reason || (isAdmin ? "soporte" : "remitente")),
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({
    success: true,
    orderNumber: result.orderNumber,
    action: result.action,
    sent: result.sent,
  });
}
