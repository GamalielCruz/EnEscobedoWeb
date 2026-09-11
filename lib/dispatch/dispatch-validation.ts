// Validación de asignación (pura, sin dependencias de runtime).
// Es la ÚNICA definición de reglas de validación de asignación: la usa el
// servicio único assignOrderToDriver (lib/dispatch/dispatch-core.ts) y sus
// tests comparten exactamente las mismas reglas. NO duplicar esta lógica en
// otro lugar.
import type { DispatchConfig } from "./dispatch-config";

export type AssignmentOrderLike = {
  _id?: string;
  orderType?: string;
  orderStatus?: string;
  driverId?: string | null;
  storeId?: string | null;
  storeHasOwnDelivery?: boolean;
  serviceKind?: string;
};

export type AssignmentDriverLike = {
  _id?: string;
  activo?: boolean;
  bloqueado?: boolean;
  disponible?: boolean;
  estadoDisponibilidad?: string;
  disponibleHasta?: string;
  storeId?: string | null;
  activeOrders?: Array<{ _id?: string }>;
};

/**
 * Estado real mínimo de un pedido para decidir el resultado de una asignación
 * tras un conflicto/fallo (idempotencia). Lo usan tanto assignOrderToDriver
 * (lib/dispatch/dispatch-core.ts) como el webhook de WhatsApp: es la ÚNICA
 * fuente de verdad para interpretar "qué ocurrió realmente" en Sanity.
 */
export type FreshOrderForAssignment = {
  _id?: string;
  orderNumber?: string;
  orderStatus?: string;
  dispatchStatus?: string;
  deliveryOfertaExpiresAt?: string;
  driverId?: string | null;
  offeredToRef?: string;
};

export type AssignmentOutcome =
  | { kind: "order_missing" }
  | { kind: "assigned_to_me"; order: FreshOrderForAssignment }
  | { kind: "assigned_to_other"; order: FreshOrderForAssignment; otherDriverId: string }
  | { kind: "still_offered"; order: FreshOrderForAssignment }
  | { kind: "offer_released"; order: FreshOrderForAssignment };

/**
 * Clasifica el estado real de un pedido después de un intento de asignación
 * fallido/conflictivo, dado el repartidor que intentó aceptar.
 *
 * - assigned_to_me: el pedido quedó asignado a ESTE repartidor (éxito idempotente).
 * - assigned_to_other: otro repartidor ganó (no asignar, no liberar).
 * - still_offered: la oferta sigue vigente para este repartidor (se puede
 *   reintentar o liberar solo si hubo una falla de validación real).
 * - offer_released: la oferta ya no existe (rechazada, expirada o cancelada).
 */
export function classifyAssignmentOutcome(
  order: FreshOrderForAssignment | null | undefined,
  driverId: string,
  now = Date.now()
): AssignmentOutcome {
  if (!order) return { kind: "order_missing" };
  if (order.driverId && order.driverId === driverId) return { kind: "assigned_to_me", order };
  if (order.driverId) return { kind: "assigned_to_other", order, otherDriverId: order.driverId };
  if (order.dispatchStatus === "offered" && order.offeredToRef === driverId) {
    // Oferta vencida: no se asigna ni se conserva como vigente (regla
    // "Si la oferta expiró: no asignar").
    if (order.deliveryOfertaExpiresAt && new Date(order.deliveryOfertaExpiresAt).getTime() <= now) {
      return { kind: "offer_released", order };
    }
    return { kind: "still_offered", order };
  }
  return { kind: "offer_released", order };
}

// ──────────────────────────────────────────────────────────────────────
// Conflictos de revisión de Sanity (409) — helpers compartidos por
// assignOrderToDriver y releaseOrderFromDriverCore (patrón único).
// ──────────────────────────────────────────────────────────────────────

/**
 * Detecta un conflicto de revisión de Sanity (documentRevisionIDDoesNotMatchError,
 * status 409): el documento cambió entre el fetch y el commit. NO es un error de
 * negocio: el estado real debe releerse antes de decidir.
 */
export function isRevisionConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    (error as { statusCode?: number }).statusCode === 409
  );
}

/** Extrae del mensaje del error 409 los ids de revisión para trazabilidad. */
export function extractRevisionInfo(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return {
    documentId: message.match(/Document "([^"]+)"/)?.[1],
    currentRevision: message.match(/currentRevisionID:\s*([A-Za-z0-9_-]+)/)?.[1],
    expectedRevision: message.match(/expectedRevisionID:\s*([A-Za-z0-9_-]+)/)?.[1],
  };
}

// ──────────────────────────────────────────────────────────────────────
// Liberación (unassign): clasificador puro del estado real de un pedido al
// intentar liberarlo de un repartidor. Lo usa releaseOrderFromDriverCore
// (lib/dispatch/dispatch-release.ts) y sus tests.
// ──────────────────────────────────────────────────────────────────────

export type ReleaseStateOutcome =
  | { kind: "order_missing" }
  | { kind: "already_released"; order: FreshOrderForAssignment }
  | { kind: "assigned_to_other"; order: FreshOrderForAssignment }
  | { kind: "terminal"; order: FreshOrderForAssignment }
  | { kind: "assigned_to_me"; order: FreshOrderForAssignment };

/**
 * Clasifica el estado real de un pedido para una operación de LIBERACIÓN
 * (unassign), dado el repartidor del que se quiere liberar.
 *
 * - already_released: el pedido ya no tiene repartidor → éxito idempotente
 *   (la liberación ya ocurrió; NO se re-ejecutan eventos ni notificaciones).
 * - assigned_to_other: otro repartidor tiene el pedido (no liberar).
 * - terminal: pedido entregado/completado/cancelado (no liberar).
 * - assigned_to_me: el pedido sigue asignado a este repartidor (liberar).
 *
 * Precedencia idéntica a la validación original: pedido inexistente → no
 * asignado a este repartidor → terminado → asignado a mí.
 */
export function classifyReleaseState(
  order: FreshOrderForAssignment | null | undefined,
  driverId: string
): ReleaseStateOutcome {
  if (!order) return { kind: "order_missing" };
  if (!order.driverId) return { kind: "already_released", order };
  if (order.driverId !== driverId) return { kind: "assigned_to_other", order };
  if (["delivered", "completed", "cancelled"].includes(order.orderStatus ?? "")) {
    return { kind: "terminal", order };
  }
  return { kind: "assigned_to_me", order };
}

/**
 * Valida que una asignación siga siendo correcta en el momento exacto en que
 * se intenta aplicar (seguridad frente a concurrencia entre operadores y a
 * cambios de estado del repartidor).
 *
 * - `mode === "auto"` (aceptación de oferta por WhatsApp): el repartidor ya
 *   pasó la validación del flujo de ofertas y queda en `offer_pending`; no se
 *   revalida disponibilidad aquí.
 * - `mode` manual/asistido (operador del Dispatch Center): se exige que el
 *   repartidor siga `disponible`, con estado `available`/`busy` (pausado o
 *   desconectado NO es válido) y con sesión de disponibilidad vigente.
 */
export function validateAssignment(
  order: AssignmentOrderLike | null,
  driver: AssignmentDriverLike | null,
  config: DispatchConfig,
  mode?: "auto" | "manual" | "assisted",
  now = Date.now()
): string | null {
  if (!order) return "El pedido no existe.";
  if (!driver) return "El repartidor no existe.";
  if (order.orderType !== "delivery") return "El pedido no es de entrega.";
  if (["cancelled", "delivered", "completed", "picked_up"].includes(order.orderStatus ?? "")) {
    return "El pedido ya está terminado o cancelado.";
  }
  if (order.driverId && order.driverId === driver._id) return "El pedido ya está asignado a este repartidor.";
  if (order.driverId && order.driverId !== driver._id) {
    return "El pedido ya fue asignado a otro repartidor; refresca la vista e inténtalo de nuevo.";
  }
  if (!driver.activo) return "El repartidor está inactivo.";
  if (driver.bloqueado) return "El repartidor está bloqueado.";

  if (mode !== "auto") {
    if (!driver.disponible) return "El repartidor no está disponible en este momento.";
    const estado = driver.estadoDisponibilidad;
    if (estado !== "available" && estado !== "busy") {
      if (estado === "offer_pending") {
        return "El repartidor tiene una oferta pendiente por WhatsApp; libérala antes de asignar manualmente.";
      }
      return "El repartidor está pausado o desconectado; no puede recibir asignaciones.";
    }
    if (estado === "busy" && !config.allowMultipleOrders) {
      return "El repartidor está ocupado y no se permiten múltiples pedidos.";
    }
    if (driver.disponibleHasta && new Date(driver.disponibleHasta).getTime() <= now) {
      return "La sesión de disponibilidad del repartidor venció; reanúdalo antes de asignar.";
    }
  }

  const activeCount = Array.isArray(driver.activeOrders) ? driver.activeOrders.length : 0;
  if (!config.allowMultipleOrders && activeCount >= 1) {
    return "No se permiten múltiples pedidos por repartidor.";
  }
  if (activeCount >= config.maxOrdersPerDriver) {
    return `El repartidor alcanzó su máximo de ${config.maxOrdersPerDriver} pedidos activos.`;
  }
  if (order.storeHasOwnDelivery && order.storeId && driver.storeId && driver.storeId !== order.storeId && !config.allowMixStores) {
    return "El repartidor pertenece a otra tienda y no está permitido mezclar restaurantes.";
  }
  if (order.serviceKind === "mandado" && driver.storeId && !config.allowMixRestaurantMandado) {
    return "El repartidor de tienda no atiende Mandados (no está permitido mezclar Restaurante + Mandado).";
  }
  return null;
}
