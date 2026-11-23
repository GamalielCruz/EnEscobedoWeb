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
