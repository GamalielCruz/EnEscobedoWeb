/**
 * Señal de red del repartidor (Fase 9) — decisiones puras.
 *
 * El enunciado de la Fase 9 prohíbe la precarga de teselas (Product Terms
 * §1.9/§2.10.1) y limita el alcance a lo que no toca contenido de Mapbox:
 * avisar de que no hay red, no borrar la ruta y reintentar al reconectar.
 *
 * `navigator.onLine` NO es fiable en LTE: puede decir `true` con la red
 * caída (o `false` un instante al cambiar de celda). Por eso la señal
 * combina las dos fuentes:
 *  - `navigator.onLine === false` ⇒ offline inmediato (corte real del SO).
 *  - N fallos CONSECUTIVOS del sondeo ⇒ offline aunque el SO diga que sí.
 *
 * Un solo fallo NO marca offline: el sondeo puede fallar por un timeout
 * puntual y el indicador parpadearía. La traza del 23-11 mostró ciclos de
 * sondeo de 10 s; dos fallos seguidos son ≥10 s de red realmente caída.
 */

/** Fallos consecutivos del sondeo necesarios para declarar «sin señal». */
export const OFFLINE_FAILURES_THRESHOLD = 2;

/** Texto del indicador discreto (no bloqueante). */
export const OFFLINE_LABEL = "Sin señal";

/**
 * Aviso cuando un desvío real no se puede recalcular por falta de red. La
 * línea vieja se conserva: nunca se borra la ruta por un fallo de red.
 */
export const OFFLINE_RECALC_LABEL = "Sin señal, recalculo al reconectar";

/** Cada cuánto se reintenta el estilo del mapa mientras no hay red. */
export const STYLE_RETRY_MS = 10_000;

export type NetworkSignal = "online" | "offline" | "unknown";

/**
 * Señal de red efectiva. `navigatorOnline` es `null` mientras no se conoce
 * (SSR / antes del primer efecto).
 */
export function resolveNetworkSignal(
  navigatorOnline: boolean | null,
  consecutiveFailures: number
): NetworkSignal {
  if (navigatorOnline === false) return "offline";
  if (consecutiveFailures >= OFFLINE_FAILURES_THRESHOLD) return "offline";
  if (navigatorOnline == null) return "unknown";
  return "online";
}

/** ¿Debe mostrarse el indicador «Sin señal»? */
export function isNetworkDown(signal: NetworkSignal): boolean {
  return signal === "offline";
}

/**
 * Aviso de la tarjeta cuando el recálculo por desvío quedó pendiente por
 * falta de red. Sin red pero sin desvío no hay aviso en la tarjeta: basta el
 * indicador «Sin señal».
 */
export function routeRecalcNotice(input: {
  networkDown: boolean;
  recalcDeferred: boolean;
}): string | null {
  if (!input.networkDown || !input.recalcDeferred) return null;
  return OFFLINE_RECALC_LABEL;
}

/**
 * `navigator.onLine` en el navegador, o `null` si no se puede leer (SSR,
 * navegador sin la propiedad). Nunca lanza.
 */
export function browserOnline(): boolean | null {
  try {
    if (typeof navigator === "undefined" || typeof navigator.onLine !== "boolean") {
      return null;
    }
    return navigator.onLine;
  } catch {
    return null;
  }
}
