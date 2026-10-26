// ────────────────────────────────────────────────────────────────────
// Máquina de estados del repartidor: DISPONIBILIDAD ≠ SERVICIO ACTIVO.
//
// Dos ejes INDEPENDIENTES (no mezclar):
//
//   A) DISPONIBILIDAD — ¿puede recibir NUEVAS ofertas?
//      derivado de los campos de sesión del repartidor
//      (disponible / estadoDisponibilidad / disponibleHasta /
//       aceptaNuevasOfertas / motivoDesconexion / bloqueado).
//
//   B) SERVICIO ACTIVO — ¿está ejecutando una orden?
//      derivado SIEMPRE de la orden asignada, nunca del repartidor.
//
// Regla fundamental: Desconectar ≠ abandonar una orden.
//   - Con tripStatus ≠ idle/oferta NO se permite terminar la sesión.
//   - "Dejar de recibir pedidos" solo apaga aceptaNuevasOfertas; la
//     orden activa continúa hasta completar/cancelar válidamente.
//
// Este módulo es PURO (sin imports ni I/O) para probarse con
// `node --experimental-strip-types --test`. La persistencia vive en
// lib/driver-actions.ts y las rutas API, que consumen estas decisiones.
// ────────────────────────────────────────────────────────────────────

/** Estados del eje DISPONIBILIDAD (derivados, nunca almacenados como tal). */
export type AvailabilityStatus = "offline" | "available" | "paused" | "blocked";

/** Estados del eje SERVICIO (derivados de la orden asignada). */
export type TripStatus =
  | "idle"
  | "offering"
  | "en_route_to_pickup"
  | "at_pickup"
  | "delivery"
  | "at_delivery"
  | "completed";

/** Orden mínima para derivar tripStatus (ya normalizada por el llamador). */
export type TripOrderInput = {
  serviceKind?: string | null;
  dispatchStatus?: string | null;
  /** Estado mandado ya derivado con mandadoDriverState(). */
  mandadoState?: string | null;
};

// ── Eje SERVICIO ───────────────────────────────────────────────────

/**
 * Deriva el estado del servicio activo.
 *
 * Prioridad: la orden asignada manda sobre la oferta (si existiera una
 * combinación inconsistente orden+oferta, el servicio gana).
 *
 * Restaurantes: accepted → en_route_to_pickup, at_door → at_delivery.
 * Mandados: se mapea 1:1 desde mandadoDriverState().
 */
export function deriveTripStatus(
  orders: TripOrderInput[],
  hasActiveOffer: boolean
): TripStatus {
  const order = orders[0];

  if (order) {
    const isMandado = String(order.serviceKind ?? "") === "mandado";
    const dispatchStatus = String(order.dispatchStatus ?? "");
    const mandadoState = order.mandadoState ?? null;

    if (isMandado) {
      if (mandadoState === "delivered") return "completed";
      if (mandadoState === "destination_arrival") return "at_delivery";
      if (mandadoState === "en_route") return "delivery";
      if (mandadoState === "pickup_arrival") return "at_pickup";
      return "en_route_to_pickup"; // assigned
    }

    if (dispatchStatus === "completed") return "completed";
    if (dispatchStatus === "at_door") return "at_delivery";
    return "en_route_to_pickup"; // accepted / en camino al restaurante
  }

  return hasActiveOffer ? "offering" : "idle";
}

// ── Regla fundamental de desconexión ───────────────────────────────

/**
 * ¿Puede el repartidor TERMINAR SU SESIÓN ahora?
 * Solo con tripStatus idle u offering (sin orden asignada).
 * Con orden activa la respuesta es NO: primero termina el servicio.
 */
export function canEndSession(tripStatus: TripStatus): {
  ok: boolean;
  reason?: string;
} {
  if (tripStatus === "idle" || tripStatus === "offering") {
    return { ok: true };
  }
  return {
    ok: false,
    reason: "Tienes una orden activa. Termina tu servicio actual para desconectarte.",
  };
}

// ── Eje DISPONIBILIDAD ─────────────────────────────────────────────

/** Datos del repartidor para derivar disponibilidad (formato Sanity). */
export type AvailabilityDriverInput = {
  disponible?: boolean | null;
  estadoDisponibilidad?: string | null;
  disponibleHasta?: string | null;
  bloqueado?: boolean | null;
  motivoDesconexion?: string | null;
  aceptaNuevasOfertas?: boolean | null;
};

/** ¿La sesión de disponibilidad sigue vigente a `now`? */
export function isSessionValid(
  driver: Pick<AvailabilityDriverInput, "disponible" | "disponibleHasta">,
  now: Date = new Date()
): boolean {
  if (driver.disponible !== true) return false;
  if (!driver.disponibleHasta) return true; // sesión abierta
  const ms = new Date(driver.disponibleHasta).getTime();
  return Number.isFinite(ms) && ms > now.getTime();
}

/**
 * ¿Puede recibir NUEVAS ofertas AHORA? Ambos ejes deben ser favorables:
 * disponible + sesión vigente + intención de recibir + sin orden activa.
 * Es la regla ÚNICA que deben reflejar los filtros de candidatos de
 * dispatch (GROQ, matching y validación de asignación).
 */
export function isEligibleForNewOffers(input: {
  driver: AvailabilityDriverInput;
  tripStatus: TripStatus;
  now?: Date;
}): boolean {
  if (input.driver.bloqueado) return false;
  if (input.driver.motivoDesconexion === "admin_paused") return false;
  if (input.tripStatus !== "idle") return false;
  if (input.driver.aceptaNuevasOfertas === false) return false;
  return isSessionValid(input.driver, input.now);
}

// ── Resolución post-entrega ────────────────────────────────────────

/**
 * Estado del repartidor al completar la entrega de una orden.
 *
 * - Quedan órdenes activas (multi-orden futuro) → busy.
 * - acceptsNewOffers=false (intención de dejar de recibir) → offline,
 *   aunque la sesión tuviera tiempo restante.
 * - Si no: lo decide la sesión vigente (available u offline).
 */
export function nextStateAfterDelivery(input: {
  hasRemainingOrders: boolean;
  aceptaNuevasOfertas: boolean;
  sessionValid: boolean;
}): "available" | "busy" | "offline" {
  if (input.hasRemainingOrders) return "busy";
  if (!input.aceptaNuevasOfertas) return "offline";
  return input.sessionValid ? "available" : "offline";
}
