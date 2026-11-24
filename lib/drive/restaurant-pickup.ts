/**
 * Fase A (recolección de restaurantes): decisión PURA del servidor.
 *
 * Un pedido de restaurante a domicilio no tenía transición entre "aceptado" y
 * "en la puerta del cliente". `dispatchStatus` sólo transita
 * accepted → at_door → completed y `at_door` significa "en la puerta del
 * CLIENTE", así que el repartidor no tenía forma de decir "ya recogí" y la app
 * se quedaba en la recolección (lib/drive/stage-action.ts,
 * app/(drive)/drive/page.tsx).
 *
 * La solución NO crea un estado nuevo: sella un timestamp
 * (`restaurantPickedUpAt`) y la etapa se deriva en la app. `dispatchStatus`
 * sigue siendo `accepted` hasta `at_door`; no se toca `orderStatus` (que ya
 * significa "el cliente recogió" en click & collect).
 *
 * Este módulo decide si la marcación es válida y si ya estaba hecha; la
 * persistencia (CAS con ifRevisionId + evento) vive en lib/driver-actions.ts.
 *
 * Orden de las guardas, deliberado:
 *   1. Propiedad PRIMERO: un pedido de otro repartidor responde el MISMO
 *      mensaje genérico, sin revelar su estado.
 *   2. Ya recogido: idempotente (200 sin efectos, ni evento ni mensajes).
 *   3. Sólo domicilio y sólo en `accepted`.
 */

export type RestaurantPickupOrder = {
  serviceKind?: unknown;
  orderType?: unknown;
  dispatchStatus?: unknown;
  repartidorAsignadoRef?: unknown;
  restaurantPickedUpAt?: unknown;
};

export type RestaurantPickupDecision =
  | { apply: false; error: string }
  | { apply: true; alreadyPickedUp: boolean };

/** Mensaje genérico de propiedad (no filtra el estado del pedido ajeno). */
export const NOT_ASSIGNED_ERROR = "Este pedido no está asignado a ti.";

function isFilled(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function decideRestaurantPickup(
  order: RestaurantPickupOrder | null | undefined,
  driverId: string
): RestaurantPickupDecision {
  if (!order) return { apply: false, error: "El pedido no existe." };

  // 1. Propiedad antes que cualquier otra guarda (mensaje genérico).
  if (String(order.repartidorAsignadoRef ?? "") !== driverId) {
    return { apply: false, error: NOT_ASSIGNED_ERROR };
  }

  // 2. La rama de mandados tiene su propia transición (mandadoEnRuta); aquí no
  //    se inventa nada para ella.
  if (String(order.serviceKind ?? "") === "mandado") {
    return { apply: false, error: "Este pedido no es de restaurante." };
  }

  // 3. Ya recogido → idempotente, incluso si el pedido ya avanzó a at_door.
  if (isFilled(order.restaurantPickedUpAt)) {
    return { apply: true, alreadyPickedUp: true };
  }

  // 4. Sólo pedidos a domicilio asignados y todavía en la recolección.
  if (String(order.orderType ?? "") !== "delivery") {
    return { apply: false, error: "Este pedido no es de entrega." };
  }
  if (String(order.dispatchStatus ?? "") !== "accepted") {
    return {
      apply: false,
      error: `Acción no válida en estado "${String(order.dispatchStatus ?? "")}".`,
    };
  }

  return { apply: true, alreadyPickedUp: false };
}

/**
 * Guarda de la llegada al CLIENTE en el camino de la APP (Drive).
 *
 * `markAtDoor` es compartido con el webhook de WhatsApp, así que la exigencia
 * se activa sólo cuando el llamador lo pide (`requireRestaurantPickup`):
 *  - Mandados: sin cambio (su máquina ya exige EN_ROUTE).
 *  - Restaurantes a domicilio: la llegada al cliente exige recolección
 *    confirmada. Sin esto, la app podría ofrecer "Confirmar entrega" mientras
 *    el repartidor sigue en el restaurante.
 *  - Click & collect / otros: no aplica.
 *
 * Devuelve el mensaje de error o `null` si la llegada puede marcarse.
 */
export function restaurantDestinationArrivalError(
  order: RestaurantPickupOrder | null | undefined,
  requireRestaurantPickup: boolean
): string | null {
  if (!requireRestaurantPickup || !order) return null;
  if (String(order.serviceKind ?? "") === "mandado") return null;
  if (String(order.orderType ?? "") !== "delivery") return null;
  if (isFilled(order.restaurantPickedUpAt)) return null;
  return "Confirma la recolección antes de marcar la llegada.";
}
