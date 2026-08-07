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
  mode?: "auto" | "manual" | "assisted"
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
    if (driver.disponibleHasta && new Date(driver.disponibleHasta).getTime() <= Date.now()) {
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
