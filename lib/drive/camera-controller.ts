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

/**
 * Offset vertical (px) que debe recibir `jumpTo({ offset })` para anclar el
 * puck al `anchorFraction` del ÁREA VISIBLE (entre la tarjeta superior y
 * el panel inferior): 70–75 % según el requisito. Mapbox `offset` es el
 * desplazamiento en px de la posición del punto (positivo hacia abajo en
 * pantalla desde el centro… en realidad desplaza el centro del mapa SIEMPRE
 * hacia arriba en pantalla para que el punto aparezca abajo).
 *
 * Cálculo: el punto debe quedar al `anchorFraction` de la altura visible
 * medida desde la parte SUPERIOR del área visible. El área visible va de
 * `visibleTopPx` a `visibleBottomPx` (px desde la parte superior del
 * contenedor). Su centro está en
 * `center = (visibleTopPx + visibleBottomPx) / 2`; Mapbox coloca el punto
 * en el centro del contenedor y `offset: [0, oy]` lo desplaza `oy` px hacia
 * abajo. Para que el punto quede en la fracción del área visible:
 *   oy = (visibleTop + f·visibleHeight) - containerHeight/2.
 */
export function computeAnchorOffsetPx(
  containerHeightPx: number,
  visibleTopPx: number,
  visibleBottomPx: number,
  anchorFraction = 0.725
): number {
  const visibleHeight = Math.max(0, visibleBottomPx - visibleTopPx);
  const anchorY = visibleTopPx + anchorFraction * visibleHeight;
  return anchorY - containerHeightPx / 2;
}

/** Fracción del área visible donde debe quedar el puck (70–75 %). */
export const PUCK_ANCHOR_FRACTION = 0.725;

/**
 * Escritura de cámara: EL ÚNICO camino por el que el controlador mueve la
 * cámara. Los tests esben con un mapa falso que solo acepta
 * `applyCameraCommand` (ninguna otra pieza llama jumpTo/easeTo).
 */
export type CameraCommand = {
  center?: { lat: number; lng: number };
  heading?: number;
  /** `offset` de anclaje (px) calculado por `computeAnchorOffsetPx`. */
  offsetPx?: number;
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
