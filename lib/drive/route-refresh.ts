/**
 * Decisiones puras del refresco de la ruta de navegación (Fase 8).
 *
 * Traza real del 23-11 (build `4ec20ef`, carretera 500/501): la línea azul y
 * la guía desaparecieron 63.9 s. El registro muestra dos causas encadenadas:
 *
 *  1. `t=45.377 s` — el sondeo de `/api/driver/state` entregó el pedido un
 *     instante sin etapa navegable (`navTarget` null). El efecto de ruta
 *     interpretó ese parpadeo como cambio de tramo y ejecutó
 *     `setRoadRoute(null)`: se borraron la polilínea, la tarjeta y el modo de
 *     seguimiento (la cámara saltó a la vista amplia de las capturas 4:07).
 *  2. El primer refresco de Directions falló (timeout) y
 *     `getRoadRoute` devuelve `null`. La página hacía `setRoadRoute(route)`
 *     sin comprobar, así que cualquier fallo transitorio también borraba la
 *     ruta viva; y la caché de fallos de routing suprimió los reintentos
 *     60 s (`FAILURE_REUSE_MS`). La ruta reapareció a `t=109.3 s`.
 *
 * Estas funciones no tienen estado: la página solo aplica su resultado.
 */

/**
 * Ventana en la que un objetivo de navegación ausente NO borra la ruta viva.
 * Un parpadeo del sondeo dura un ciclo; una llegada real (etapa confirmada)
 * deja de tener objetivo de forma sostenida y se descarta tras la gracia.
 */
export const ROUTE_CLEAR_GRACE_MS = 2_000;

/**
 * Cadencia mínima del reintento forzado (sin caché de fallos) mientras NO hay
 * ninguna ruta que conservar. Sin esto, un fallo en la primera petición deja
 * la pantalla sin línea ni guía durante los 60 s de la caché de fallos.
 */
export const ROUTE_FORCE_RETRY_MS = 10_000;

/**
 * ¿Debe descartarse la ruta activa al cambiar el objetivo de navegación?
 *
 * Solo cuando llega un destino NUEVO y distinto (recolección → entrega). Un
 * `nextKey` null es el parpadeo del sondeo: la ruta se conserva y la página
 * la descarta, si el objetivo sigue ausente, al vencer `ROUTE_CLEAR_GRACE_MS`.
 */
export function shouldClearRouteOnTargetChange(
  prevKey: string | null,
  nextKey: string | null
): boolean {
  if (nextKey == null) return false;
  return prevKey != null && prevKey !== nextKey;
}

/**
 * ¿Toca reintentar la ruta forzando la omisión de la caché de fallos?
 * Solo sin ruta viva y respetando la cadencia, para no castigar Directions
 * durante una caída sostenida.
 */
export function shouldForceRouteRetry(
  hasRoute: boolean,
  nowMs: number,
  nextAllowedAtMs: number
): boolean {
  return !hasRoute && nowMs >= nextAllowedAtMs;
}

/**
 * ¿La respuesta de un refresco sustituye a la ruta viva?
 *
 * `null`/geometría vacía = fallo transitorio del proveedor: NO debe borrar la
 * ruta que el repartidor está siguiendo. Solo una ruta con al menos dos puntos
 * reemplaza a la anterior.
 */
export function shouldApplyRouteRefresh(
  route: { path: unknown } | null | undefined
): boolean {
  return Boolean(
    route && Array.isArray(route.path) && (route.path as unknown[]).length >= 2
  );
}
