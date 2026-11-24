import { NextRequest, NextResponse } from "next/server";
import { requireDriver } from "@/lib/driver-auth";
import {
  acceptDriverOffer,
  rejectDriverOffer,
  markPickupArrival,
  markMandadoEnRoute,
  markPickedUp,
  markAtDoor,
  markDelivered,
  markDeliveredWithPin,
  cancelOrderByDriver,
} from "@/lib/driver-actions";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await requireDriver();
  if (!auth.ok) return auth.error;

  const { repartidor } = auth;
  const body = await request.json().catch(() => ({}));
  const { action, orderNumber, pin, reason, note } = body ?? {};

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
      // Ramificado por serviceKind: mandados conservan su transición (Ya
      // recogí → mandadoEnRuta) y restaurantes sellan restaurantPickedUpAt.
      result = await markPickedUp(orderNumber, repartidor._id);
      break;
    case "destination_arrival":
      // Camino de la APP: en restaurantes a domicilio la llegada al cliente
      // exige recolección confirmada (el webhook de WhatsApp NO pasa por aquí).
      result = await markAtDoor(orderNumber, repartidor._id, {
        requireRestaurantPickup: true,
      });
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
    case "cancel_order":
      // Cancelación desde el menú ⋮ de "Ver ruta". El motivo se valida
      // server-side contra el catálogo (lib/order-cancellation.ts) y queda
      // registrado en la propia orden (order.cancellation) además de la bitácora.
      result = await cancelOrderByDriver(orderNumber, repartidor._id, {
        reason,
        note,
      });
      break;
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
