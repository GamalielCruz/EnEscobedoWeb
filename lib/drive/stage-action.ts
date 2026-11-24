/**
 * Fase 6-B: acción de servidor que corresponde a la etapa que el repartidor
 * VE, pura y testeable.
 *
 * La etapa de la pantalla (`navPhase`) es LOCAL: al entrar en la geocerca de
 * 50 m se convierte en `at_pickup`/`at_delivery` al instante, mientras la
 * acción del pedido (`orderAction`) solo cambia cuando llega el siguiente
 * sondeo de `/api/driver/state` (hasta 10 s) o cuando responde la marcación de
 * llegada en segundo plano. Por eso manda la etapa mostrada y se usa la MISMA
 * transición de servidor.
 *
 * Recolección por servicio (Fase A):
 *  - mandado     → `picked_up` = `mandadoEnRuta` (Ya recogí el mandado).
 *  - restaurante → `picked_up` = sello `restaurantPickedUpAt` (sin
 *    dispatchStatus nuevo; el endpoint ramifica por `serviceKind`).
 * La recolección de restaurantes YA tiene acción de servidor: no hay hueco.
 */

export type DriveStageAction = "picked_up" | "delivered";

export function stageActionFor(
  phase: string | null | undefined,
  orderAction: string | null | undefined,
  serviceKind: "mandado" | "restaurant" | null | undefined
): DriveStageAction | null {
  if (phase === "at_pickup") {
    // En el punto de recogida ambos servicios confirman la recolección. El
    // servidor valida el estado real (asignado + accepted) y el doble envío es
    // idempotente. Sin tipo de pedido no se inventa la acción.
    return serviceKind === "mandado" || serviceKind === "restaurant"
      ? "picked_up"
      : null;
  }
  if (phase === "at_delivery") return "delivered";
  if (orderAction === "picked_up" || orderAction === "delivered") return orderAction;
  return null;
}

/**
 * Mensaje VISIBLE cuando una etapa sin acción de servidor ocuparía el lugar
 * del control.
 *
 * Se conserva para etapas futuras: hoy todas las etapas con control
 * (`at_pickup`, `at_delivery`) tienen acción para ambos servicios, así que
 * devuelve `null`. Antes explicaba el hueco de la recolección de restaurantes;
 * ese hueco se cerró con `restaurantPickedUpAt`.
 *
 * Devuelve `null` ⇔ la etapa tiene acción (o no se pinta control en ella).
 */
export function stageActionGapMessage(
  phase: string | null | undefined,
  serviceKind: "mandado" | "restaurant" | null | undefined
): string | null {
  void phase;
  void serviceKind;
  return null;
}
