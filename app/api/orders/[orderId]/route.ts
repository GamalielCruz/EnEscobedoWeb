import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { writeClient } from "@/sanity/lib/client";
import { backendClient } from "@/sanity/lib/backendClient";
import {
  buildStateFields,
  DispatchStatusValue,
  OrderStatusValue,
  PaymentStatusValue,
} from "@/lib/order-state";
import { appendOrderEvent } from "@/lib/order-events";
import {
  canCustomerCancel,
  customerPhaseHint,
  customerPhaseLabel,
  deriveCustomerPhase,
  prolongedSearchCopy,
  type CustomerTrackingPhase,
} from "@/lib/order-tracking";

export const dynamic = "force-dynamic";

// ── Proyección mínima de solo lectura ────────────────────────────────────
// Nunca exponer datos operativos internos (ofertas, offeredTo, NIP, teléfonos
// del repartidor). Solo lo que la pantalla de tracking necesita mostrar.
// Lectura SIN CDN: un pedido recién creado (p. ej. pago con TARJETA, cuya
// orden nace en /api/checkout/confirm) debe aparecer de inmediato en el
// seguimiento; el CDN puede servirlo con retraso y romper la pantalla de
// espera durante los primeros segundos.
const TRACKING_QUERY = `*[_type == "order" && !(_id in path('drafts.**')) && (_id == $orderNumber || orderNumber == $orderNumber) && clerkUserId == $userId][0]{
  _id,
  orderNumber,
  orderType,
  serviceKind,
  status,
  orderStatus,
  paymentStatus,
  paymentMethod,
  dispatchStatus,
  "hasAssignedDriver": defined(repartidorAsignado),
  mandadoPickupAtDoor,
  mandadoEnRuta,
  updatedAt,
  totalPrice,
  currency,
  "storeName": coalesce(affiliateStore->name, pickupStore->name, storeInfo.storeName, "Tu comercio"),
  "storeAddress": coalesce(affiliateStore->address.street, pickupStore->address.street, ""),
  "deliveryLine1": shippingAddress.line1,
  "deliveryCity": shippingAddress.city,
  "deliveryState": shippingAddress.state,
  "deliveryReference": shippingAddress.line2,
  "mandadoOriginLabel": mandadoOrigin.label,
  "mandadoDestinationLabel": mandadoDestination.label,
  "items": products[0...4]{
    quantity,
    "name": product->name
  },
  "driver": select(
    defined(repartidorAsignado) => {
      "nombre": repartidorAsignado->nombre,
      "foto": repartidorAsignado->foto,
      "calificacion": repartidorAsignado->calificacion
    },
    null
  ),
  fulfillmentTiming,
  "customerPhone": phone,
  "customerName": customerName
}`;

type TrackingDoc = {
  _id: string;
  orderNumber?: string;
  orderType?: string;
  serviceKind?: string;
  status?: string;
  orderStatus?: string;
  paymentStatus?: string;
  paymentMethod?: string;
  dispatchStatus?: string;
  hasAssignedDriver?: boolean;
  mandadoPickupAtDoor?: boolean;
  mandadoEnRuta?: boolean;
  updatedAt?: string;
  totalPrice?: number;
  currency?: string;
  storeName?: string;
  storeAddress?: string;
  deliveryLine1?: string;
  deliveryCity?: string;
  deliveryState?: string;
  deliveryReference?: string;
  mandadoOriginLabel?: string;
  mandadoDestinationLabel?: string;
  items?: Array<{ quantity?: number; name?: string | null }>;
  driver?: { nombre?: string; foto?: unknown; calificacion?: number } | null;
  fulfillmentTiming?: string;
  customerPhone?: string;
  customerName?: string;
};

function buildPayload(order: TrackingDoc, phase: CustomerTrackingPhase, noDrivers: boolean) {
  const destination =
    order.mandadoDestinationLabel ??
    [order.deliveryLine1, order.deliveryCity].filter(Boolean).join(", ") ??
    "";
  const originLabel = order.mandadoOriginLabel ?? order.storeName ?? "Tu comercio";

  return {
    orderNumber: order.orderNumber ?? "",
    orderId: order._id,
    phase,
    phaseLabel: customerPhaseLabel(phase),
    phaseHint: customerPhaseHint(phase),
    prolonged: prolongedSearchCopy({ phase, noDrivers }),
    canCancel: canCustomerCancel({ phase, orderStatus: order.orderStatus ?? order.status }),
    paymentMethod: order.paymentMethod ?? null,
    paymentStatus: order.paymentStatus ?? null,
    driver:
      (phase === "accepted" || phase === "pickup_arrival" || phase === "en_route") && order.driver
        ? {
            nombre: order.driver.nombre ?? null,
            foto: order.driver.foto ?? null,
            calificacion: typeof order.driver.calificacion === "number" ? order.driver.calificacion : null,
          }
        : null,
    summary: {
      storeName: originLabel,
      storeAddress: order.mandadoOriginLabel ? order.storeName ?? "" : order.storeAddress ?? "",
      destination,
      destinationReference: order.deliveryReference ?? "",
      items: (order.items ?? []).map((item) => ({
        quantity: item.quantity ?? 1,
        name: item.name ?? "Producto",
      })),
      total: order.totalPrice ?? null,
      currency: order.currency ?? "MXN",
    },
    updatedAt: order.updatedAt ?? null,
  };
}

// ── GET: estado de tracking en tiempo casi real ─────────────────────────
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const order = await backendClient.fetch<TrackingDoc | null>(TRACKING_QUERY, {
    orderNumber: orderId,
    userId,
  });

  if (!order) {
    return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
  }

  const phase = deriveCustomerPhase({
    serviceKind: order.serviceKind,
    orderType: order.orderType,
    status: order.status,
    orderStatus: order.orderStatus,
    dispatchStatus: order.dispatchStatus,
    hasAssignedDriver: order.hasAssignedDriver,
    mandadoPickupAtDoor: order.mandadoPickupAtDoor,
    mandadoEnRuta: order.mandadoEnRuta,
  });

  const payload = buildPayload(order, phase, false);
  return NextResponse.json(payload, {
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" },
  });
}

// ── DELETE: cancelación del cliente ─────────────────────────────────────
// Respeta las reglas de negocio: solo antes de recolección; Stripe cobrado
// pasa a requires_refund (reconciliación existente); COD marca el pedido
// cancelado y notifica por WhatsApp con la plantilla existente.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const order = await backendClient.fetch<TrackingDoc | null>(TRACKING_QUERY, {
    orderNumber: orderId,
    userId,
  });

  if (!order) {
    return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
  }

  const phase = deriveCustomerPhase({
    serviceKind: order.serviceKind,
    orderType: order.orderType,
    status: order.status,
    orderStatus: order.orderStatus,
    dispatchStatus: order.dispatchStatus,
    hasAssignedDriver: order.hasAssignedDriver,
    mandadoPickupAtDoor: order.mandadoPickupAtDoor,
    mandadoEnRuta: order.mandadoEnRuta,
  });

  const reason = String((await request.json().catch(() => ({})))?.reason ?? "customer_cancelled").slice(0, 200);

  if (!canCustomerCancel({ phase, orderStatus: order.orderStatus ?? order.status })) {
    return NextResponse.json(
      { error: "El pedido ya no puede cancelarse en esta etapa." },
      { status: 409 }
    );
  }

  const now = new Date().toISOString();
  const orderType = order.orderType === "pickup" ? "pickup" : "delivery";
  const isStripeOrder = order.paymentMethod === "stripe";
  const currentPaymentStatus = (order.paymentStatus ?? "pending") as PaymentStatusValue;
  const paymentStatus: PaymentStatusValue =
    isStripeOrder && currentPaymentStatus === "paid" ? "requires_refund" : currentPaymentStatus;

  const stateFields = buildStateFields({
    orderType,
    orderStatus: "cancelled" as OrderStatusValue,
    paymentStatus,
    dispatchStatus: "not_required" as DispatchStatusValue,
    settlementStatus: isStripeOrder && currentPaymentStatus === "paid" ? "pending" : "cancelled",
    paymentMethod: order.paymentMethod,
  });

  const updateData: Record<string, unknown> = {
    ...stateFields,
    cancelledAt: now,
    updatedAt: now,
  };
  if (order.fulfillmentTiming === "scheduled") updateData.scheduleStatus = "cancelled";

  await writeClient
    .patch(order._id)
    .set(updateData)
    .commit({ autoGenerateArrayKeys: true });

  await appendOrderEvent(order._id, {
    type: "cancelled",
    source: "api/orders/[orderId]",
    actor: userId,
    reason,
  });

  // Notificación WhatsApp de cancelación (best-effort, plantilla existente).
  if (order.customerPhone && order.orderNumber) {
    void (async () => {
      try {
        const { sendOrderCancelled } = await import("@/lib/whatsapp");
        await sendOrderCancelled(
          order.customerPhone!,
          order.customerName || "Cliente",
          order.orderNumber!
        );
      } catch (error) {
        console.error("[orders DELETE] WhatsApp cancel error:", error);
      }
    })();
  }

  // Sincroniza Baserow (best-effort, igual que el resto de mutaciones).
  void (async () => {
    try {
      const { syncBaserowOrderById } = await import("@/lib/baserow");
      await syncBaserowOrderById(order._id);
    } catch (error) {
      console.error("[orders DELETE] Baserow sync error:", error);
    }
  })();

  return NextResponse.json({
    success: true,
    data: {
      orderId: order._id,
      orderNumber: order.orderNumber ?? "",
      orderStatus: "cancelled",
      paymentStatus,
    },
  });
}
