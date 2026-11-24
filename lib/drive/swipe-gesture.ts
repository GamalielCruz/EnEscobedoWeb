/**
 * Lógica PURA del control "desliza para confirmar" (`DriveSwipeConfirm`).
 *
 * Vive aquí para poder probarla en Node sin framer-motion ni Safari:
 *  - el recorrido útil del thumb a partir del ancho del track;
 *  - el progreso del RECORRIDO (0 = inicio, 100 = umbral) y el del RELLENO
 *    (0–100 % del ancho del track, que es lo que se ve en pantalla);
 *  - la clasificación del final del gesto:
 *      · `cancelled` — el navegador se quedó el gesto (pointercancel /
 *        touchcancel): NO es que el repartidor soltara el dedo;
 *      · `threshold` — llegó al extremo: confirmar;
 *      · `release`   — se soltó antes del extremo: volver a 0.
 *
 * framer-motion NO distingue cancelar de soltar: `PanSession` registra
 * `pointercancel` en el MISMO handler que `pointerup`
 * (node_modules/framer-motion/dist/es/gestures/pan/PanSession.mjs), así que
 * `onDragEnd` recibe ambos casos igual. Por eso la clasificación recibe
 * `cancelled` desde una bandera propia del componente.
 */

/** Ancho del thumb (clase `w-12`). */
export const SWIPE_THUMB_WIDTH_PX = 48;
/** Inset del thumb dentro del track (`left-1` + `bottom-1`). */
export const SWIPE_TRACK_INSET_PX = 4;
/** Tolerancia del umbral: no exigir el último píxel del recorrido. */
export const SWIPE_CONFIRM_TOLERANCE_PX = 4;

export type SwipeEndReason = "cancelled" | "threshold" | "release";

/**
 * Recorrido máximo del thumb en px. Nunca 0: sin medición (ref nula, layout
 * aún no aplicado) devuelve 1 para no dividir por cero en los porcentajes.
 */
export function swipeTravelPx(trackWidthPx: number): number {
  const width = Number.isFinite(trackWidthPx) ? trackWidthPx : 0;
  return Math.max(1, width - SWIPE_THUMB_WIDTH_PX - SWIPE_TRACK_INSET_PX * 2);
}

/**
 * Progreso del RECORRIDO en % (0 = inicio, 100 = recorrido completo), con un
 * decimal. Es la magnitud que decide el umbral, no el ancho del relleno.
 */
export function swipeProgressPct(x: number, maxX: number): number {
  if (!Number.isFinite(x) || !Number.isFinite(maxX) || maxX <= 0) return 0;
  const ratio = Math.max(0, Math.min(1, x / maxX));
  return Math.round(ratio * 1000) / 10;
}

/**
 * Progreso del RELLENO en % del ancho del track. Es lo que se ve como barra
 * roja: con el thumb de 48 px y los insets, el recorrido completo llena
 * ~84 % del track, así que un relleno del 60–65 % está muy lejos del umbral.
 */
export function swipeFillPct(x: number, trackWidthPx: number): number {
  if (!Number.isFinite(x) || !Number.isFinite(trackWidthPx) || trackWidthPx <= 0) return 0;
  const ratio = Math.max(0, Math.min(1, x / trackWidthPx));
  return Math.round(ratio * 1000) / 10;
}

/** ¿El thumb llegó al extremo derecho (con la tolerancia del control)? */
export function swipeReachedThreshold(x: number, maxX: number): boolean {
  return x >= maxX - SWIPE_CONFIRM_TOLERANCE_PX;
}

/**
 * Clasifica el final del gesto. Un `cancelled` NUNCA cuenta como umbral: si el
 * navegador se quedó el gesto no hay intención completa del repartidor.
 */
export function classifySwipeEnd({
  x,
  maxX,
  cancelled,
}: {
  x: number;
  maxX: number;
  cancelled: boolean;
}): SwipeEndReason {
  if (cancelled) return "cancelled";
  return swipeReachedThreshold(x, maxX) ? "threshold" : "release";
}
