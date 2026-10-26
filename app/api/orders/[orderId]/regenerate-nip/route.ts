import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { isAdminUser } from "@/lib/admin";
import { regenerateDeliveryPin } from "@/lib/nip-actions";

// Regenera el NIP de una orden de mandado (solo operación/soporte, PASO 5).
// Política: límite de 3 regeneraciones por pedido y cooldown de 10 minutos
// (constantes en lib/nip-delivery.ts). Invalida el NIP anterior, reinicia
// intentos, expiración nueva y reenvía el código al canal configurado.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!isAdminUser(userId)) {
    return NextResponse.json({ error: "No tienes permiso para esta acción" }, { status: 403 });
  }
  const { orderId } = await params;
  const body = await request.json().catch(() => ({}));
  const result = await regenerateDeliveryPin(orderId, String(body.reason || "soporte"));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({
    success: true,
    orderNumber: result.orderNumber,
    deliveryPinRegenCount: result.deliveryPinRegenCount,
    sent: result.sent,
  });
}
