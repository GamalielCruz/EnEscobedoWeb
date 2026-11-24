/**
 * Fase 6-B: acción de servidor que corresponde a la etapa que el repartidor
 * VE, pura y testeable.
 *
 * La etapa de la pantalla (`navPhase`) es LOCAL: al entrar en la geocerca de
 * 50 m se convierte en `at_pickup`/`at_delivery` al instante, mientras la
 * acción del pedido (`orderAction`) solo cambia cuando llega el siguiente
 * sondeo de `/api/driver/state` (hasta 10 s) o cuando responde la marcación de
 * llegada en segundo plano.
 *
 * Antes, el deslizador exigía que `orderAction.action` ya fuera
 * `picked_up`/`delivered`; en esa ventana devolvía `false` sin mensaje y la
 * confirmación no hacía nada (había que volver a deslizar). Aquí la etapa
 * mostrada manda y se usa la MISMA transición de servidor de siempre.
 *
 * Regla de servicio: solo los MANDADOS tienen transición de recolección
 * (`markMandadoEnRoute`, lib/driver-actions.ts:1194). En restaurantes la
 * recolección es navegación pura (page.tsx `getRestaurantAction`), así que no
 * se inventa una acción que el servidor va a rechazar.
 */

export type DriveStageAction = "picked_up" | "delivered";

export function stageActionFor(
  phase: string | null | undefined,
  orderAction: string | null | undefined,
  serviceKind: "mandado" | "restaurant" | null | undefined
): DriveStageAction | null {
  if (phase === "at_pickup") return serviceKind === "mandado" ? "picked_up" : null;
  if (phase === "at_delivery") return "delivered";
  if (orderAction === "picked_up" || orderAction === "delivered") return orderAction;
  return null;
}

/**
 * Mensaje VISIBLE cuando la etapa no tiene acción de servidor.
 *
 * Antes, `handleStageAction` devolvía `false` sin mensaje: el deslizador volvía
 * al inicio y el repartidor no sabía si el toque se perdió o el pedido no se
 * podía confirmar. Con esto el control ni siquiera promete la acción: en la
 * etapa sin acción se pinta el mensaje en lugar del deslizador.
 *
 * Hoy el ÚNICO hueco real es la RECOLECCIÓN de un pedido de restaurante:
 *  - `/api/driver/action` no tiene acción de recolección de restaurante
 *    (app/api/driver/action/route.ts: las únicas transiciones de recolección
 *    son `pickup_arrival` y `picked_up`, ambas de MANDADOS:
 *    lib/driver-actions.ts `markPickupArrival` exige `mandadoState === "assigned"`
 *    y `markMandadoEnRoute` exige `pickup_arrival`/`en_route`);
 *  - el restaurante solo transita `dispatchStatus` accepted → at_door →
 *    completed (lib/driver-actions.ts:838, :1240, :1311).
 * No se inventa una acción que el servidor va a rechazar.
 *
 * TODO(negocio): definir el flujo de recolección de restaurantes (¿marcar en
 * la tienda? ¿sin confirmación? ¿acción nueva en el servidor?) antes de
 * sustituir este mensaje por un control real.
 *
 * Devuelve `null` ⇔ la etapa tiene acción (o no se pinta control en ella).
 */
export function stageActionGapMessage(
  phase: string | null | undefined,
  serviceKind: "mandado" | "restaurant" | null | undefined
): string | null {
  if (stageActionFor(phase, null, serviceKind)) return null;
  if (phase === "at_pickup" && serviceKind === "restaurant") {
    return "Este pedido no se confirma desde aquí: la recolección de restaurantes todavía no tiene acción en el servidor.";
  }
  return null;
}
