/**
 * Controlador del estado de seguimiento de cámara del repartidor
 * (puro, sin React/Mapbox — testeable en Node).
 *
 * Evidencia que lo motiva (traza real Fase 0):
 *  - En mapbox-gl 3.33, `jumpTo` dispara `rotatestart`/`zoomstart`
 *    PROGRAMÁTICO cuando cambia bearing/zoom. Los handlers viejos salían
 *    de seguimiento en esos eventos sin mirar `originalEvent`: 17 ciclos
 *    entrar→salir en 57 s, 0/176 eventos con gesto real.
 *  - La reanudación automática cada ≤5 s (al volver a conducir) generó el
 *    ciclo entrar→matar→entrar permanente.
 *
 * Reglas (Fase 1-A/B):
 *  - Estado único: FOLLOWING | FREE | RECENTERING.
 *  - SOLO un gesto real (Mapbox marca `originalEvent`) saca de FOLLOWING.
 *    Todo movimiento programático se etiqueta (origen "programmatic") y se
 *    ignora en dragstart/rotatestart/zoomstart/movestart/pitchstart.
 *  - NO hay reanudación automática por velocidad. Reentradas permitidas:
 *    inicio de navegación, botón de localizar, y UN ÚNICO temporizador
 *    tras un gesto real (AUTO_REENTER_MS, decisión propuesta: 30 s).
 */

export type FollowState = "FOLLOWING" | "FREE" | "RECENTERING";

/** Evento de mapa normalizado que consume el controlador. */
export type CameraMapEvent = {
  type:
    | "dragstart"
    | "rotatestart"
    | "zoomstart"
    | "pitchstart"
    | "movestart";
  /** Mapbox pone `originalEvent` solo en gestos reales del usuario. */
  isGesture: boolean;
};

/** Tiempo único de reentrada tras un gesto real (TODO-DECISIÓN: 30 s). */
export const AUTO_REENTER_MS = 30_000;

/**
 * ¿Este evento del mapa debe sacar del seguimiento?
 * Solo un gesto real (originalEvent presente). Los programáticos, nunca.
 */
export function shouldExitFollowOnMapEvent(event: CameraMapEvent): boolean {
  return event.isGesture;
}

/** Estado tras recibir un evento de mapa. */
export function nextFollowStateOnMapEvent(
  state: FollowState,
  event: CameraMapEvent
): { state: FollowState; exitedByGesture: boolean } {
  if (state !== "FOLLOWING") {
    return { state, exitedByGesture: false };
  }
  if (shouldExitFollowOnMapEvent(event)) {
    return { state: "FREE", exitedByGesture: true };
  }
  // Movimiento programático: se etiqueta y se ignora (queda en FOLLOWING).
  return { state: "FOLLOWING", exitedByGesture: false };
}

/**
 * Decisión de reentrada (qué puede devolver a FOLLOWING):
 *  - `nav_started`: inicio de navegación (explícito).
 *  - `locate_button`: botón de localizar (explícito, idempotente).
 *  - `gesture_timer`: el ÚNICO temporizador tras un gesto real, una vez
 *    cumplido AUTO_REENTER_MS y aún navegando.
 *  - `velocity`: NUNCA (se eliminó la reanudación automática por marcha).
 */
export type ReenterCause =
  | "nav_started"
  | "locate_button"
  | "gesture_timer"
  | "velocity";

export function shouldReenterFollow(
  state: FollowState,
  cause: ReenterCause,
  opts: {
    navigatingWithRoute: boolean;
    /** ms transcurridos desde el gesto real que sacó del seguimiento. */
    msSinceGestureExit: number | null;
  }
): FollowState {
  if (state === "FOLLOWING") return state;
  switch (cause) {
    case "nav_started":
    case "locate_button":
      return "RECENTERING";
    case "gesture_timer":
      if (
        opts.navigatingWithRoute &&
        opts.msSinceGestureExit != null &&
        opts.msSinceGestureExit >= AUTO_REENTER_MS
      ) {
        return "RECENTERING";
      }
      return state;
    case "velocity":
    default:
      return state;
  }
}

/** Fracción del área visible donde debe quedar el puck (70–75 %). */
export const PUCK_ANCHOR_FRACTION = 0.725;

/**
 * Y (px desde el borde superior del CONTENEDOR) del ancla dentro del área
 * visible: entre la tarjeta superior (`visibleTopPx` = su borde inferior) y
 * el panel inferior (`visibleBottomPx` = su borde superior).
 */
export function anchorYForBand(
  visibleTopPx: number,
  visibleBottomPx: number,
  anchorFraction = PUCK_ANCHOR_FRACTION
): number {
  const visibleHeight = Math.max(0, visibleBottomPx - visibleTopPx);
  return visibleTopPx + anchorFraction * visibleHeight;
}

export type AnchorPadding = { top: number; bottom: number };

/**
 * `padding` que hay que pasar a `jumpTo`/`easeTo` para que el CENTRO del mapa
 * (el vehículo) aparezca en `anchorY` px desde el borde superior del
 * contenedor — 70–75 % del área visible.
 *
 * POR QUÉ `padding` Y NO `offset` (causa confirmada de T1/T2: puck al 49–51 %)
 * En mapbox-gl 3.33, `Map#jumpTo` (dist/mapbox-gl-dev.js:98301-98344) lee
 * `zoom`, `center`, `bearing`, `pitch`, `fov`, `padding`, `preloadOnly` y
 * `retainPadding`: **NO lee `options.offset`**. `offset` solo lo resuelve
 * `_extendCameraOptions` (dist/mapbox-gl-dev.js:97923-97931), que usan
 * `easeTo`/`flyTo`. El seguimiento escribe con `jumpTo`, así que el offset de
 * anclaje se descartaba silenciosamente y el puck quedaba en el centro del
 * contenedor (348–351 px de 699 = 50 %).
 *
 * `padding` sí lo aplica `jumpTo` (líneas 98321-98330: `tr.padding = padding`),
 * y el centro aparente del mapa es `EdgeInsets#getCenter`
 * (dist/mapbox-gl-dev.js:48654-48656):
 *   cy = (padding.top + height - padding.bottom) / 2
 * Para que cy == anchorY:
 *   si anchorY > H/2 → padding.top = 2·anchorY − H, bottom = 0
 *   si anchorY ≤ H/2 → padding.bottom = H − 2·anchorY, top = 0
 */
export function computeAnchorPadding(
  containerHeightPx: number,
  anchorY: number
): AnchorPadding {
  const H = Math.max(1, containerHeightPx);
  const clamped = Math.min(H, Math.max(0, anchorY));
  if (clamped > H / 2) {
    return { top: Math.round(2 * clamped - H), bottom: 0 };
  }
  return { top: 0, bottom: Math.round(H - 2 * clamped) };
}

/** Padding de anclaje a partir de la banda visible medida en el DOM. */
export function computeAnchorPaddingForBand(
  containerHeightPx: number,
  visibleTopPx: number,
  visibleBottomPx: number,
  anchorFraction = PUCK_ANCHOR_FRACTION
): AnchorPadding {
  return computeAnchorPadding(
    containerHeightPx,
    anchorYForBand(visibleTopPx, visibleBottomPx, anchorFraction)
  );
}

/**
 * Escritura de cámara: EL ÚNICO camino por el que el controlador mueve la
 * cámara. Los tests esben con un mapa falso que solo acepta
 * `applyCameraCommand` (ninguna otra pieza llama jumpTo/easeTo).
 */
export type CameraCommand = {
  center?: { lat: number; lng: number };
  heading?: number;
  /**
   * `padding` de anclaje calculado por `computeAnchorPadding` (no `offset`:
   * `jumpTo` lo ignora en mapbox-gl 3.33).
   */
  padding?: AnchorPadding;
  zoom?: number;
  pitch?: number;
  animate?: boolean;
  /** Origen etiquetado: siempre "programmatic" (nunca un gesto). */
  origin: "programmatic";
};

export type CameraSink = {
  jumpTo: (cmd: CameraCommand) => void;
  easeTo: (cmd: CameraCommand) => void;
  stop: () => void;
};

/**
 * Aplica un comando de cámara vía el sink único. Centralizar aquí el
 * `map.stop()` previo (G: botón idempotente con una sola animación) y la
 * etiqueta de origen.
 */
export function applyCameraCommand(sink: CameraSink, cmd: CameraCommand): void {
  // Parar animaciones en vuelo antes de iniciar la nueva: una sola
  // animación a la vez, sin apilar toques (idempotencia del botón).
  if (cmd.animate) sink.stop();
  if (cmd.animate) {
    sink.easeTo(cmd);
  } else {
    sink.jumpTo(cmd);
  }
}
