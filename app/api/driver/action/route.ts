import { NextRequest, NextResponse } from "next/server";
import { requireDriver } from "@/lib/driver-auth";
import {
  acceptDriverOffer,
  rejectDriverOffer,
  markPickupArrival,
  markMandadoEnRoute,
  markAtDoor,
  markDelivered,
  markDeliveredWithPin,
} from "@/lib/driver-actions";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await requireDriver();
  if (!auth.ok) return auth.error;

  const { repartidor } = auth;
  const body = await request.json().catch(() => ({}));
  const { action, orderNumber, pin } = body ?? {};

  if (!action || !orderNumber || typeof orderNumber !== "string") {
    return NextResponse.json(
      { error: "action y orderNumber son requeridos." },
      { status: 400 }
    );
  }

  let result;

  switch (action) {
    case "accept":
      result = await acceptDriverOffer(orderNumber, repartidor._id);
      break;
    case "reject":
      result = await rejectDriverOffer(orderNumber, repartidor._id);
      break;
    case "pickup_arrival":
      result = await markPickupArrival(orderNumber, repartidor._id);
      break;
    case "picked_up":
      result = await markMandadoEnRoute(orderNumber, repartidor._id);
      break;
    case "destination_arrival":
      result = await markAtDoor(orderNumber, repartidor._id);
      break;
    case "delivered":
      result = await markDelivered(orderNumber, repartidor._id);
      break;
    case "delivered_with_pin": {
      // Entrega con NIP (Entrega segura): la validación es SIEMPRE server-side
      // (markDeliveredWithPin → validateDeliveryPin). El servidor registra
      // intentos, bloqueos y expiración; el cliente solo envía el código.
      if (typeof pin !== "string" || !/^\d{6}$/.test(pin)) {
        return NextResponse.json(
          { ok: false, error: "Ingresa el código de 6 dígitos." },
          { status: 400 }
        );
      }
      result = await markDeliveredWithPin(orderNumber, repartidor._id, pin);
      break;
    }
    default:
      return NextResponse.json(
        { error: `Acción "${action}" no reconocida.` },
        { status: 400 }
      );
  }

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    mandadoState: result.newState,
    dispatchStatus: result.dispatchStatus,
  });
}
