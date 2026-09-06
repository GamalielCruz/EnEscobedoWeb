// ────────────────────────────────────────────────────────────────────
// Funciones compartidas de transición de estado del conductor.
// WhatsApp webhook Y Drive API importan estas funciones.
//
// Cada función:
//   1. Valida el estado actual (fetch + derive)
//   2. Aplica patch con ifRevisionId (concurrencia)
//   3. Registra appendOrderEvent
//   4. Ejecuta side effects (Baserow, Dispatch, NIP, settlement)
//   5. Retorna el nuevo estado
//
// WhatsApp aporta: notificaciones WhatsApp (sendBotMessage, etc.)
// driver-actions aporta: transiciones de estado + side effects compartidos
// ────────────────────────────────────────────────────────────────────

import { backendClient } from "@/sanity/lib/backendClient";
import { appendOrderEvent, type OrderEventType } from "@/lib/order-events";
import { mandadoDriverState, type MandadoDriverState } from "@/lib/mandado-driver-flow";
import {
  releaseOrdersForDriver,
  redispatchOrders,
  dispatchWaitingOrdersForDriver,
} from "@/lib/delivery-dispatch";
import { resolveSettlementStatusOnDelivery } from "@/lib/order-state";
import { syncBaserowOrderById } from "@/lib/baserow";
import { notifyRestaurantDriverEnRoute } from "@/lib/restaurant-notifications";
import { after } from "next/server";
import {
  checkDeliveryPinGate,
  validateDeliveryPin,
  buildFailedPinPatch,
  type DeliveryPinOrder,
  type GateCheckResult,
  type PinValidationResult,
} from "@/lib/delivery-pin-gate";
import { backendClient as sanityClient } from "@/sanity/lib/backendClient";

// ── Queries ────────────────────────────────────────────────────────

const ORDER_BY_NUMBER_QUERY = `*[_type == "order" && orderNumber == $orderNumber][0]{
  _id,
  _rev,
  orderNumber,
  serviceKind,
  orderType,
  orderStatus,
  status,
  dispatchStatus,
  paymentMethod,
  paymentProvider,
  paymentStatus,
  settlementStatus,
  cashCollectedBy,
  totalPrice,
  fulfillmentTiming,
  "repartidorAsignadoRef": repartidorAsignado._ref,
  "offeredToRef": offeredTo._ref,
  deliveryOfertaEnviada,
  deliveryOfertaExpiresAt,
  mandadoPickupAtDoor,
  mandadoEnRuta,
  mandadoEntregaSegura,
  deliveryPinHash,
  deliveryPinCiphertext,
  deliveryPinExpiresAt,
  deliveryPinAttemptCount,
  deliveryPinLockedUntil,
  deliveryVerificationMethod,
  deliveryVerificationStatus,
  nipDeliveryStatus,
  nipIncidentAt,
  nipIncidentType,
  "storeName": coalesce(affiliateStore->name, select(serviceKind == "mandado" => "Punto de inicio")),
  "destLabel": coalesce(shippingAddress.line1, mandadoDestination.label),
  "storeLat": coalesce(affiliateStore->coordinates.latitude, mandadoOrigin.lat),
  "storeLng": coalesce(affiliateStore->coordinates.longitude, mandadoOrigin.lng),
  "destLat": coalesce(shippingAddress.latitude, mandadoDestination.lat),
  "destLng": coalesce(shippingAddress.longitude, mandadoDestination.lng),
  "mandadoOriginLabel": mandadoOrigin.label,
  "mandadoDestinationLabel": mandadoDestination.label,
  mandadoDetails,
  mandadoOriginReference,
  mandadoDestinationReference,
  mandadoRecipientPhone,
  mandadoNipRecipient,
  nipDeliveryChannel,
  "shippingAddress": shippingAddress,
  deliveryNotes,
  customerName,
  phone
}`;

const DRIVER_BY_ID_QUERY = `*[_type == "repartidor" && _id == $driverId][0]{
  _id,
  _rev,
  nombre,
  telefono,
  disponible,
  disponibleHasta,
  estadoDisponibilidad
}`;

const ASSIGNED_ORDERS_QUERY = `*[_type == "order" && repartidorAsignado._ref == $driverId && status == "shipped" && orderStatus != "delivered" && orderStatus != "cancelled" && orderStatus != "completed"] | order(orderDate asc){
  _id,
  _rev,
  orderNumber,
  serviceKind,
  orderType,
  orderStatus,
  status,
  dispatchStatus,
  paymentMethod,
  totalPrice,
  "repartidorAsignadoRef": repartidorAsignado._ref,
  mandadoPickupAtDoor,
  mandadoEnRuta,
  "storeName": coalesce(affiliateStore->name, select(serviceKind == "mandado" => "Punto de inicio")),
  "destLabel": coalesce(shippingAddress.line1, mandadoDestination.label),
  "storeLat": coalesce(affiliateStore->coordinates.latitude, mandadoOrigin.lat),
  "storeLng": coalesce(affiliateStore->coordinates.longitude, mandadoOrigin.lng),
  "destLat": coalesce(shippingAddress.latitude, mandadoDestination.lat),
  "destLng": coalesce(shippingAddress.longitude, mandadoDestination.lng),
  "mandadoOriginLabel": mandadoOrigin.label,
  "mandadoDestinationLabel": mandadoDestination.label,
  mandadoDetails,
  mandadoOriginReference,
  mandadoDestinationReference
}`;

const OFFER_ORDER_QUERY = `*[_type == "order" && orderNumber == $orderNumber && dispatchStatus == "offered" && defined(offeredTo) && defined(deliveryOfertaExpiresAt) && deliveryOfertaExpiresAt > $now][0]{
  _id,
  _rev,
  orderNumber,
  serviceKind,
  orderType,
  orderStatus,
  status,
  dispatchStatus,
  paymentMethod,
  totalPrice,
  fulfillmentTiming,
  "repartidorAsignadoRef": repartidorAsignado._ref,
  "offeredToRef": offeredTo._ref,
  deliveryOfertaEnviada,
  deliveryOfertaExpiresAt,
  mandadoPickupAtDoor,
  mandadoEnRuta,
  "storeName": coalesce(affiliateStore->name, select(serviceKind == "mandado" => "Punto de inicio")),
  "destLabel": coalesce(shippingAddress.line1, mandadoDestination.label),
  "storeLat": coalesce(affiliateStore->coordinates.latitude, mandadoOrigin.lat),
  "storeLng": coalesce(affiliateStore->coordinates.longitude, mandadoOrigin.lng),
  "destLat": coalesce(shippingAddress.latitude, mandadoDestination.lat),
  "destLng": coalesce(shippingAddress.longitude, mandadoDestination.lng),
  "mandadoOriginLabel": mandadoOrigin.label,
  "mandadoDestinationLabel": mandadoDestination.label,
  mandadoDetails,
  mandadoOriginReference,
  mandadoDestinationReference
}`;

/** Lightweight query for reconciling assignment failures by real Sanity state */
const RECONCILE_ORDER_QUERY = `*[_type == "order" && _id == $orderId][0]{
  _id,
  orderNumber,
  orderStatus,
  dispatchStatus,
  deliveryOfertaExpiresAt,
  "driverId": repartidorAsignado._ref,
  "offeredToRef": offeredTo._ref
}`;

/** Orders shipped to a driver (for post-delivery state resolution) */
const ACTIVE_SHIPPED_ORDERS_QUERY = `*[_type == "order" && repartidorAsignado._ref == $driverId && status == "shipped"]{
  _id
}`;

// ── Helpers ────────────────────────────────────────────────────────

function isRevisionConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    (error as { statusCode?: number }).statusCode === 409
  );
}

function toFinite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getDriverNextState(
  driver: { disponible?: boolean; disponibleHasta?: string },
  nowDate: Date
): "available" | "offline" {
  if (!driver.disponible) return "offline";
  if (!driver.disponibleHasta) return "available";
  const availableUntilMs = new Date(driver.disponibleHasta).getTime();
  if (!Number.isFinite(availableUntilMs)) return "available";
  return availableUntilMs > nowDate.getTime() ? "available" : "offline";
}

// ── Types ──────────────────────────────────────────────────────────

export type OrderDoc = {
  _id: string;
  _rev: string;
  orderNumber: string;
  serviceKind?: string;
  orderType?: string;
  orderStatus?: string;
  status?: string;
  dispatchStatus?: string;
  paymentMethod?: string;
  paymentProvider?: string;
  paymentStatus?: string;
  settlementStatus?: string;
  cashCollectedBy?: string;
  totalPrice?: number;
  fulfillmentTiming?: string;
  repartidorAsignadoRef?: string;
  offeredToRef?: string;
  deliveryOfertaEnviada?: boolean;
  deliveryOfertaExpiresAt?: string;
  mandadoPickupAtDoor?: boolean;
  mandadoEnRuta?: boolean;
  mandadoEntregaSegura?: boolean;
  deliveryPinHash?: string;
  deliveryPinCiphertext?: string;
  deliveryPinExpiresAt?: string;
  deliveryPinAttemptCount?: number;
  deliveryPinLockedUntil?: string;
  deliveryVerificationMethod?: string;
  deliveryVerificationStatus?: string;
  nipDeliveryStatus?: string;
  nipIncidentAt?: string;
  nipIncidentType?: string;
  storeName?: string;
  destLabel?: string;
  storeLat?: number;
  storeLng?: number;
  destLat?: number;
  destLng?: number;
  mandadoOriginLabel?: string;
  mandadoDestinationLabel?: string;
  mandadoDetails?: string;
  mandadoOriginReference?: string;
  mandadoDestinationReference?: string;
  mandadoRecipientPhone?: string;
  mandadoNipRecipient?: string;
  nipDeliveryChannel?: string;
  shippingAddress?: Record<string, unknown>;
  deliveryNotes?: string;
  customerName?: string;
  phone?: string;
};

type DriverDoc = {
  _id: string;
  _rev: string;
  nombre: string;
  telefono: string;
  disponible?: boolean;
  disponibleHasta?: string;
  estadoDisponibilidad?: string;
};

export type TransitionResult =
  | { ok: true; newState: string; dispatchStatus: string }
  | { ok: false; error: string };

export type { GateCheckResult, PinValidationResult };

// ── Fetch helpers ──────────────────────────────────────────────────

export async function fetchOrderByNumber(orderNumber: string): Promise<OrderDoc | null> {
  return backendClient.fetch(ORDER_BY_NUMBER_QUERY, { orderNumber });
}

export async function fetchAssignedOrders(driverId: string): Promise<OrderDoc[]> {
  return backendClient.fetch(ASSIGNED_ORDERS_QUERY, { driverId });
}

export async function fetchOfferOrder(orderNumber: string): Promise<OrderDoc | null> {
  const now = new Date().toISOString();
  return backendClient.fetch(OFFER_ORDER_QUERY, { orderNumber, now });
}

// ── Shared side-effect: clear pending offer fields on driver ──────

async function clearPendingOfferForDriver(
  driverId: string,
  now: string,
  nextState: "available" | "busy" | "offline"
) {
  await backendClient
    .patch(driverId)
    .set({
      estadoDisponibilidad: nextState,
      ultimaActividad: now,
    })
    .unset([
      "ultimoPedidoOfertado",
      "pedidosOfertados",
      "restauranteOferta",
      "ofertaTipo",
      "ofertaEnviadaAt",
      "ofertaExpiraAt",
    ])
    .commit()
    .catch((error) =>
      console.error("[driver-actions] clearPendingOfferForDriver error:", error)
    );
}

// ── Shared side-effect: clear competing offers for other drivers ──

async function clearCompetingOffers(
  orderIds: string[],
  acceptedDriverId: string,
  orderNumberLabel: string,
  now: string
) {
  const competingDrivers: Array<{ _id: string; nombre: string; telefono: string }> =
    await backendClient
      .fetch(
        `*[_type == "repartidor" && _id != $acceptedDriverId && (ultimoPedidoOfertado._ref in $orderIds || count(pedidosOfertados[_ref in $orderIds]) > 0)]{
          _id,
          nombre,
          telefono
        }`,
        { acceptedDriverId, orderIds }
      )
      .catch(() => []);

  if (competingDrivers.length === 0) return;

  await Promise.allSettled(
    competingDrivers.map(async (driver) => {
      await clearPendingOfferForDriver(driver._id, now, "available");
      // WhatsApp notification is NOT sent from here — the webhook caller
      // handles that. We only clean the driver state.
    })
  );
}

// ── Shared side-effect: complete delivered order (settlement + Baserow + state) ──

async function completeDeliveredOrder(
  targetOrder: Record<string, unknown>,
  driverId: string,
  nowDate: Date,
  now: string,
  opts: { verifiedByDriver?: boolean } = {}
): Promise<{ nextState: string }> {
  const settlementStatus = resolveSettlementStatusOnDelivery({
    paymentProvider: String(targetOrder.paymentProvider ?? ""),
    paymentMethod: String(targetOrder.paymentMethod ?? ""),
    paymentStatus: String(targetOrder.paymentStatus ?? ""),
    cashCollectedBy: String(targetOrder.cashCollectedBy ?? ""),
    settlementStatus: String(targetOrder.settlementStatus ?? ""),
    orderStatus: "delivered",
  });

  await backendClient
    .patch(String(targetOrder._id))
    .ifRevisionId(String(targetOrder._rev))
    .set({
      status: "delivered",
      orderStatus: "delivered",
      dispatchStatus: "completed",
      ...(String(targetOrder.mandadoContactStatus ?? "") === "active"
        ? { mandadoContactStatus: "closed" }
        : {}),
      deliveredAt: now,
      settlementStatus,
      ...(opts.verifiedByDriver
        ? {
            deliveryPinVerifiedAt: now,
            deliveryPinVerifiedBy: driverId,
            deliveryVerificationStatus: "verified",
          }
        : {}),
      ...(targetOrder.fulfillmentTiming === "scheduled"
        ? { scheduleStatus: "completed" }
        : {}),
      updatedAt: now,
    })
    .commit();

  after(() => syncBaserowOrderById(String(targetOrder._id)));

  if (opts.verifiedByDriver) {
    await appendOrderEvent(String(targetOrder._id), {
      type: "delivery_pin_verified",
      source: "driver-actions",
      actor: driverId,
    }).catch(() => null);
  }

  await appendOrderEvent(String(targetOrder._id), {
    type: "delivered",
    source: "driver-actions",
    actor: driverId,
  }).catch(() => null);

  // Post-delivery: update driver state and dispatch waiting orders
  const remainingOrders = (await backendClient
    .fetch(ACTIVE_SHIPPED_ORDERS_QUERY, { driverId })
    .catch(() => [])) as Array<{ _id: string }>;

  const filteredRemaining = remainingOrders.filter(
    (order) => String(order._id) !== String(targetOrder._id)
  );
  const driver = await backendClient.fetch<DriverDoc>(DRIVER_BY_ID_QUERY, { driverId });
  const nextState = filteredRemaining.length > 0 ? "busy" : getDriverNextState(driver ?? {}, nowDate);

  await backendClient
    .patch(driverId)
    .set({
      disponible: nextState !== "offline",
      estadoDisponibilidad: nextState,
      ultimaActividad: now,
    })
    .commit()
    .catch((error) =>
      console.error("[driver-actions] completeDeliveredOrder driver state error:", error)
    );

  if (nextState === "available") {
    await dispatchWaitingOrdersForDriver(driverId).catch((error) =>
      console.error("[driver-actions] completeDeliveredOrder redispatch error:", error)
    );
  }

  return { nextState };
}

// ── Session functions ──────────────────────────────────────────────

/**
 * Connect a driver session. Reproduces the same behavior as WhatsApp INICIO
 * + duration selection: sets availability fields, clears old offer fields,
 * then dispatches waiting orders (side effect that was missing before).
 *
 * When `durationMinutes` is omitted, an OPEN session is created:
 * no `disponibleHasta` is written (and any stale one is unset). Both
 * /api/driver/state (`!disponibleHasta → connected`) and the cron
 * (only expires drivers with defined(disponibleHasta)) treat this as
 * available indefinitely until manual disconnect.
 */
export async function connectDriverSession(
  driverId: string,
  durationMinutes?: number
): Promise<TransitionResult> {
  const driver = await backendClient.fetch<DriverDoc>(DRIVER_BY_ID_QUERY, { driverId });
  if (!driver) return { ok: false, error: "Repartidor no encontrado." };

  const now = new Date();
  const hasDuration = Number.isFinite(durationMinutes);
  const availableUntil = hasDuration
    ? new Date(now.getTime() + (durationMinutes as number) * 60 * 1000)
    : null;

  try {
    await backendClient
      .patch(driver._id)
      .ifRevisionId(driver._rev)
      .set({
        disponible: true,
        disponibleDesde: now.toISOString(),
        ...(availableUntil
          ? {
              disponibleHasta: availableUntil.toISOString(),
              duracionDisponibilidadMinutos: durationMinutes,
            }
          : {}),
        estadoDisponibilidad: "available",
        ultimaActividad: now.toISOString(),
        esperandoSeleccionDisponibilidad: false,
        extensionPendiente: false,
        pendienteConfirmacion: false,
      })
      .unset([
        "confirmacionEnviadaAt",
        "extensionPreguntadaAt",
        "autoDesconectadoAt",
        "motivoDesconexion",
        "ultimoPedidoOfertado",
        "pedidosOfertados",
        "restauranteOferta",
        "ofertaTipo",
        "ofertaEnviadaAt",
        "ofertaExpiraAt",
        // Open session: clear stale expiry leftovers so the session stays open
        ...(availableUntil ? [] : ["disponibleHasta", "duracionDisponibilidadMinutos"]),
      ])
      .commit();
  } catch (error) {
    if (isRevisionConflict(error)) {
      return { ok: false, error: "Conflicto de concurrencia. Reintenta." };
    }
    console.error("[driver-actions] connectDriverSession error:", error);
    return { ok: false, error: "No se pudo conectar la sesión." };
  }

  // CRITICAL SIDE EFFECT: dispatch waiting orders for the newly connected driver
  await dispatchWaitingOrdersForDriver(driver._id).catch((error) =>
    console.error("[driver-actions] connectDriverSession dispatchWaitingOrders error:", error)
  );

  return { ok: true, newState: "available", dispatchStatus: "connected" };
}

/**
 * Disconnect a driver session. Reproduces the same behavior as WhatsApp FIN:
 * sets unavailable, releases pending offers, redispatches, uses reason "driver_fin".
 */
export async function disconnectDriverSession(
  driverId: string
): Promise<TransitionResult> {
  const driver = await backendClient.fetch<DriverDoc>(DRIVER_BY_ID_QUERY, { driverId });
  if (!driver) return { ok: false, error: "Repartidor no encontrado." };

  const now = new Date().toISOString();

  // Release pending offers (same as getPendingOfferOrderIds in webhook)
  const pendingOrderIds = await backendClient
    .fetch<{ _id: string }[]>(
      `*[_type == "order" && offeredTo._ref == $driverId && dispatchStatus == "offered" && !defined(repartidorAsignado)]{ _id }`,
      { driverId }
    )
    .then((orders) => orders.map((o) => o._id));

  try {
    await backendClient
      .patch(driver._id)
      .ifRevisionId(driver._rev)
      .set({
        disponible: false,
        estadoDisponibilidad: "offline",
        esperandoSeleccionDisponibilidad: false,
        extensionPendiente: false,
        pendienteConfirmacion: false,
        motivoDesconexion: "manual",
        ultimaActividad: now,
      })
      .unset([
        "confirmacionEnviadaAt",
        "disponibleHasta",
        "disponibleDesde",
        "duracionDisponibilidadMinutos",
        "extensionPreguntadaAt",
        "autoDesconectadoAt",
        "ultimoPedidoOfertado",
        "pedidosOfertados",
        "restauranteOferta",
        "ofertaTipo",
        "ofertaEnviadaAt",
        "ofertaExpiraAt",
      ])
      .commit();
  } catch (error) {
    if (isRevisionConflict(error)) {
      return { ok: false, error: "Conflicto de concurrencia. Reintenta." };
    }
    console.error("[driver-actions] disconnectDriverSession error:", error);
    return { ok: false, error: "No se pudo desconectar la sesión." };
  }

  // Release and redispatch — using "driver_fin" to match WhatsApp semantics exactly
  if (pendingOrderIds.length > 0) {
    const released = await releaseOrdersForDriver(pendingOrderIds, driverId, "driver_fin").catch(() => []);
    if (released.length > 0) {
      await redispatchOrders(released, [driverId]).catch((error) =>
        console.error("[driver-actions] disconnectDriverSession redispatch error:", error)
      );
    }
  }

  return { ok: true, newState: "offline", dispatchStatus: "disconnected" };
}

// ── Location ───────────────────────────────────────────────────────

export async function updateDriverLocation(
  driverId: string,
  lat: number,
  lng: number
): Promise<TransitionResult> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, error: "Coordenadas inválidas." };
  }

  const driver = await backendClient.fetch<DriverDoc>(DRIVER_BY_ID_QUERY, { driverId });
  if (!driver) return { ok: false, error: "Repartidor no encontrado." };

  try {
    await backendClient
      .patch(driver._id)
      .set({
        ultimaUbicacion: { lat, lng, reportedAt: new Date().toISOString() },
      })
      .commit();

    return { ok: true, newState: "updated", dispatchStatus: "ok" };
  } catch (error) {
    console.error("[driver-actions] updateDriverLocation error:", error);
    return { ok: false, error: "No se pudo actualizar la ubicación." };
  }
}

// ── Accept / Reject ────────────────────────────────────────────────

/**
 * Accept an offer. Reproduces WhatsApp ACEPTO behavior:
 * 1. Validates offer exists and is for this driver
 * 2. Uses assignOrderToDriver with skipEvents=true (manual events)
 * 3. Handles idempotent assignments
 * 4. Handles assignment failures with reconciliation
 * 5. Clears competing offers
 * 6. Syncs Baserow
 * 7. Notifies restaurant (non-mandado)
 */
export async function acceptDriverOffer(
  orderNumber: string,
  driverId: string
): Promise<TransitionResult> {
  const order = await fetchOrderByNumber(orderNumber);
  if (!order) return { ok: false, error: "El pedido no existe." };

  if (order.repartidorAsignadoRef) {
    if (order.repartidorAsignadoRef === driverId) {
      return { ok: true, newState: "assigned", dispatchStatus: "accepted" };
    }
    return { ok: false, error: "El pedido ya fue asignado a otro repartidor." };
  }

  if (order.offeredToRef !== driverId) {
    return { ok: false, error: "Esta oferta no es para ti." };
  }

  if (!order.deliveryOfertaExpiresAt || new Date(order.deliveryOfertaExpiresAt).getTime() <= Date.now()) {
    return { ok: false, error: "La oferta ya expiró." };
  }

  const driver = await backendClient.fetch<DriverDoc>(DRIVER_BY_ID_QUERY, { driverId });
  const now = new Date().toISOString();
  const nowDate = new Date();

  // Delegate to the same function WhatsApp uses — skipEvents=true because
  // we register events manually below (matching webhook behavior exactly).
  const { assignOrderToDriver } = await import("@/lib/dispatch/dispatch-core");
  const result = await assignOrderToDriver({
    orderId: order._id,
    driverId,
    mode: "auto",
    actorName: driver?.nombre ?? "Drive",
    notifyDriver: false,
    skipEvents: true,
  });

  if (!result.ok) {
    // Reconcile by real state (same as webhook)
    const freshOrder = await backendClient.fetch(RECONCILE_ORDER_QUERY, { orderId: order._id }) as Record<string, unknown> | null;
    if (freshOrder && String(freshOrder.driverId ?? "") === driverId) {
      // Idempotent: already assigned to this driver
      return { ok: true, newState: "assigned", dispatchStatus: "accepted" };
    }
    return { ok: false, error: result.error };
  }

  // Idempotent assignment — skip side effects (the winner already did them)
  if (result.idempotent) {
    return { ok: true, newState: "assigned", dispatchStatus: "accepted" };
  }

  // ── Side effects (matching webhook exactly) ──

  // 1. Baserow sync
  after(() => syncBaserowOrderById(order._id));

  // 2. Manual events (offer_accepted + driver_assigned + scheduled if applicable)
  await appendOrderEvent(order._id, {
    type: "offer_accepted",
    source: "driver-actions",
    actor: driverId,
  }).catch(() => null);

  await appendOrderEvent(order._id, {
    type: "driver_assigned",
    source: "driver-actions",
    actor: driverId,
    payload: { driverId },
  }).catch(() => null);

  if (order.fulfillmentTiming === "scheduled") {
    await appendOrderEvent(order._id, {
      type: "scheduled_order_driver_assigned",
      source: "driver-actions",
      actor: driverId,
      payload: { driverId },
    }).catch(() => null);
  }

  // 3. Restaurant notification (only for non-mandado, same as webhook)
  if (String(order.serviceKind ?? "") !== "mandado") {
    void notifyRestaurantDriverEnRoute(
      order._id,
      driver?.nombre ?? "Driver",
      orderNumber
    ).catch(() => null);
  }

  // 4. Clear competing offers for other drivers
  void clearCompetingOffers([order._id], driverId, `#${orderNumber}`, now).catch((error) =>
    console.error("[driver-actions] acceptDriverOffer clearCompetingOffers error:", error)
  );

  return { ok: true, newState: "assigned", dispatchStatus: "accepted" };
}

/**
 * Reject an offer. Reproduces WhatsApp RECHAZAR behavior:
 * 1. Clears pending offer fields on the driver
 * 2. Releases the order
 * 3. Redispatches
 */
export async function rejectDriverOffer(
  orderNumber: string,
  driverId: string
): Promise<TransitionResult> {
  const order = await fetchOrderByNumber(orderNumber);
  if (!order) return { ok: false, error: "El pedido no existe." };
  if (order.offeredToRef !== driverId) {
    return { ok: false, error: "Esta oferta no es para ti." };
  }

  const driver = await backendClient.fetch<DriverDoc>(DRIVER_BY_ID_QUERY, { driverId });
  const now = new Date().toISOString();
  const nowDate = new Date();
  const nextState = getDriverNextState(driver ?? {}, nowDate);

  // CRITICAL: Clear pending offer fields FIRST (matches webhook order)
  await clearPendingOfferForDriver(driverId, now, nextState);

  // Release the order back to the queue
  const released = await releaseOrdersForDriver([order._id], driverId, "driver_rejected_offer").catch(() => []);
  if (released.length > 0) {
    await redispatchOrders(released, [driverId]).catch((error) =>
      console.error("[driver-actions] rejectDriverOffer redispatch error:", error)
    );
  }

  return { ok: true, newState: "available", dispatchStatus: "waiting_for_driver" };
}

// ── Mandado state transitions ──────────────────────────────────────

/**
 * Generic transition helper: validates order ownership, applies patch with
 * ifRevisionId, registers event, and syncs Baserow.
 */
async function transitionOrder(
  orderNumber: string,
  driverId: string,
  patchFn: (patch: ReturnType<typeof backendClient.patch>) => ReturnType<typeof backendClient.patch>,
  eventType: OrderEventType,
  opts?: { syncBaserow?: boolean }
): Promise<TransitionResult> {
  const order = await fetchOrderByNumber(orderNumber);
  if (!order) return { ok: false, error: "El pedido no existe." };
  if (order.repartidorAsignadoRef !== driverId) {
    return { ok: false, error: "Este pedido no está asignado a ti." };
  }

  try {
    await patchFn(
      backendClient.patch(order._id).ifRevisionId(order._rev)
    ).commit();
  } catch (error) {
    if (isRevisionConflict(error)) {
      const fresh = await fetchOrderByNumber(orderNumber);
      const freshState = fresh ? mandadoDriverState(fresh as Parameters<typeof mandadoDriverState>[0]) : null;
      if (freshState) {
        return { ok: true, newState: freshState, dispatchStatus: fresh?.dispatchStatus ?? "" };
      }
      return { ok: false, error: "Conflicto de concurrencia. Reintenta." };
    }
    console.error(`[driver-actions] ${eventType} error:`, error);
    return { ok: false, error: "No se pudo completar la acción." };
  }

  // Register event
  await appendOrderEvent(order._id, {
    type: eventType,
    source: "driver-actions",
    actor: driverId,
  }).catch(() => null);

  // Baserow sync (default true, can be overridden)
  if (opts?.syncBaserow !== false) {
    after(() => syncBaserowOrderById(order._id));
  }

  const fresh = await fetchOrderByNumber(orderNumber);
  const newState = fresh ? mandadoDriverState(fresh as Parameters<typeof mandadoDriverState>[0]) : null;

  return { ok: true, newState: newState ?? "unknown", dispatchStatus: fresh?.dispatchStatus ?? "" };
}

/**
 * Mandado: EN PUERTA en recolección → mandadoPickupAtDoor=true, mandadoEnRuta=false
 * Side effects: Baserow sync, event "picked_up"
 */
export async function markPickupArrival(
  orderNumber: string,
  driverId: string
): Promise<TransitionResult> {
  const order = await fetchOrderByNumber(orderNumber);
  if (!order) return { ok: false, error: "El pedido no existe." };

  const currentState = mandadoDriverState(order as Parameters<typeof mandadoDriverState>[0]);
  if (currentState !== "assigned") {
    return { ok: false, error: `Acción no válida en estado "${currentState}".` };
  }

  return transitionOrder(orderNumber, driverId, (p) =>
    p.set({ mandadoPickupAtDoor: true, mandadoEnRuta: false, updatedAt: new Date().toISOString() }),
    "picked_up"
  );
}

/**
 * Mandado: Ya recogí → mandadoEnRuta=true
 * Side effects: Baserow sync, event "en_route"
 */
export async function markMandadoEnRoute(
  orderNumber: string,
  driverId: string
): Promise<TransitionResult> {
  const order = await fetchOrderByNumber(orderNumber);
  if (!order) return { ok: false, error: "El pedido no existe." };

  const currentState = mandadoDriverState(order as Parameters<typeof mandadoDriverState>[0]);
  if (currentState !== "pickup_arrival" && currentState !== "en_route") {
    return { ok: false, error: `Acción no válida en estado "${currentState}".` };
  }
  if (order.mandadoEnRuta === true) {
    return { ok: true, newState: "en_route", dispatchStatus: order.dispatchStatus ?? "" };
  }

  return transitionOrder(orderNumber, driverId, (p) =>
    p.set({ mandadoEnRuta: true, updatedAt: new Date().toISOString() }),
    "en_route"
  );
}

/**
 * EN PUERTA en destino (mandado en_route / restaurantes) → dispatchStatus="at_door"
 * Side effects: Baserow sync, event "at_door"
 *
 * Returns a GateCheckResult so the caller (WhatsApp/Drive) knows whether to:
 * - complete directly (no pin required / already verified)
 * - request a PIN from the driver
 * - block the delivery (NIP not delivered or expired)
 */
export async function markAtDoor(
  orderNumber: string,
  driverId: string
): Promise<TransitionResult> {
  const order = await fetchOrderByNumber(orderNumber);
  if (!order) return { ok: false, error: "El pedido no existe." };

  const isMandado = String(order.serviceKind ?? "") === "mandado";
  if (isMandado) {
    const currentState = mandadoDriverState(order as Parameters<typeof mandadoDriverState>[0]);
    if (currentState !== "en_route") {
      return { ok: false, error: `Acción no válida en estado "${currentState}".` };
    }
  }

  const result = await transitionOrder(orderNumber, driverId, (p) =>
    p.set({ dispatchStatus: "at_door", updatedAt: new Date().toISOString() }),
    "at_door"
  );

  if (!result.ok) return result;

  // Check NIP gate — the caller decides what to do based on the result
  const freshOrder = await fetchOrderByNumber(orderNumber);
  const gateCheck = checkDeliveryPinGate(
    freshOrder as unknown as DeliveryPinOrder
  );

  // Attach gate check result to the transition result
  return { ...result, gateCheck } as TransitionResult & { gateCheck: GateCheckResult };
}

/**
 * Entrega sin NIP (order no requiere NIP o NIP ya verificado).
 * Side effects: settlement, Baserow, driver state, redispatch, events.
 */
export async function markDelivered(
  orderNumber: string,
  driverId: string
): Promise<TransitionResult> {
  const order = await fetchOrderByNumber(orderNumber);
  if (!order) return { ok: false, error: "El pedido no existe." };

  const isMandado = String(order.serviceKind ?? "") === "mandado";
  if (isMandado) {
    const currentState = mandadoDriverState(order as Parameters<typeof mandadoDriverState>[0]);
    if (currentState !== "destination_arrival") {
      return { ok: false, error: `Acción no válida en estado "${currentState}".` };
    }
  } else {
    if (order.dispatchStatus !== "at_door") {
      return { ok: false, error: `Acción no válida en estado "${order.dispatchStatus}".` };
    }
  }

  // Server-side NIP gate: reject if NIP is required and not yet verified
  const gateCheck = checkDeliveryPinGate(order as unknown as DeliveryPinOrder);
  if (gateCheck.action === "request_pin") {
    return { ok: false, error: "Esta orden requiere validación de NIP. Solicita el código al cliente." };
  }
  if (gateCheck.action === "block") {
    return { ok: false, error: gateCheck.reason === "expired"
      ? "El código de entrega expiró. Contacta a soporte."
      : "El código de entrega no está disponible aún." };
  }

  const nowDate = new Date();
  const now = nowDate.toISOString();

  await completeDeliveredOrder(
    order as unknown as Record<string, unknown>,
    driverId,
    nowDate,
    now
  );

  return { ok: true, newState: "delivered", dispatchStatus: "completed" };
}

/**
 * Entrega con NIP validado server-side.
 * Validates the pin, records attempt/success, then completes delivery.
 * Returns specific error if pin is invalid, locked, or expired.
 */
export async function markDeliveredWithPin(
  orderNumber: string,
  driverId: string,
  pin: string
): Promise<TransitionResult> {
  const order = await fetchOrderByNumber(orderNumber);
  if (!order) return { ok: false, error: "El pedido no existe." };

  const isMandado = String(order.serviceKind ?? "") === "mandado";
  if (isMandado) {
    const currentState = mandadoDriverState(order as Parameters<typeof mandadoDriverState>[0]);
    if (currentState !== "destination_arrival") {
      return { ok: false, error: `Acción no válida en estado "${currentState}".` };
    }
  } else {
    if (order.dispatchStatus !== "at_door") {
      return { ok: false, error: `Acción no válida en estado "${order.dispatchStatus}".` };
    }
  }

  const nowDate = new Date();
  const now = nowDate.toISOString();

  // Validate NIP server-side
  const pinResult = validateDeliveryPin(
    order as unknown as DeliveryPinOrder,
    pin,
    nowDate
  );

  if (!pinResult.ok) {
    // Record failed attempt (except for cases that don't need pin or are already done)
    if (pinResult.reason === "wrong_pin") {
      const { patch } = buildFailedPinPatch(
        order as unknown as DeliveryPinOrder,
        nowDate
      );
      await backendClient
        .patch(order._id)
        .ifRevisionId(order._rev)
        .set(patch)
        .commit()
        .catch(() => null);

      await appendOrderEvent(order._id, {
        type: "delivery_pin_failed",
        source: "driver-actions",
        actor: driverId,
        payload: { attempt: patch.deliveryPinAttemptCount, locked: pinResult.locked },
      }).catch(() => null);

      return {
        ok: false,
        error: pinResult.locked
          ? "NIP incorrecto. Bloqueado por 15 minutos."
          : `NIP incorrecto. Te quedan ${pinResult.attemptsRemaining} intentos.`,
      };
    }

    if (pinResult.reason === "locked") {
      return { ok: false, error: "El NIP está bloqueado temporalmente. Intenta en 15 minutos." };
    }
    if (pinResult.reason === "expired") {
      return { ok: false, error: "El NIP expiró. Contacta a soporte." };
    }
    if (pinResult.reason === "blocked") {
      return {
        ok: false,
        error: pinResult.blockReason === "expired"
          ? "El código de entrega expiró. Contacta a soporte."
          : "El código de entrega no está disponible aún.",
      };
    }
    if (pinResult.reason === "no_pin_required") {
      return { ok: false, error: "Esta orden no requiere NIP. Usa markDelivered directamente." };
    }
    if (pinResult.reason === "not_at_door") {
      return { ok: false, error: "El pedido no está en puerta." };
    }
    return { ok: false, error: "No se pudo validar el NIP." };
  }

  // NIP validado → registrar evento y completar entrega
  await appendOrderEvent(order._id, {
    type: "delivery_pin_verified",
    source: "driver-actions",
    actor: driverId,
  }).catch(() => null);

  await completeDeliveredOrder(
    order as unknown as Record<string, unknown>,
    driverId,
    nowDate,
    now,
    { verifiedByDriver: true }
  );

  return { ok: true, newState: "delivered", dispatchStatus: "completed" };
}
