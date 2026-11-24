/**
 * FRAME de la cámara de navegación (puro, sin React/Mapbox — testeable en Node).
 *
 * Es el cuerpo del loop rAF extraído a función pura: recibe el estado visual
 * (posición del vehículo, rumbo visual, rumbo de cámara, zoom objetivo) y los
 * insumos del frame (target GPS, rumbo resuelto, ruta, zoom del mapa,
 * anclaje del área visible) y devuelve:
 *  - el siguiente estado visual,
 *  - el COMANDO de cámara (center/bearing/offset/zoom) — el único camino de
 *    escritura de cámara (`applyCameraCommand` en camera-controller.ts),
 *  - cuántos px se movió el vehículo en el frame (métrica de uniformidad).
 *
 * Portado sin cambios de comportamiento del loop histórico de page.tsx
 * (suavizado de rumbo, punto de mira adelantado, zoom por velocidad y por
 * maniobra). Cambios de la Fase 1:
 *  - el anclaje 70–75 % del área visible se aplica SIEMPRE (antes solo con
 *    `centerOnGps`, y sin compensar el punto adelantado).
 *
 * Fase 5-A: la posición ya NO persigue el último fix con suavizado exponencial
 * (eso producía ráfagas de ~0.25 s cada 1 s). Ahora avanza en cada cuadro con
 * estima muerta (v·dt), se corta 1.5 s después del último fix y cada fix nuevo
 * corrige el error con una mezcla suave sin reiniciar la velocidad.
 */

import {
  bearingBetween,
  haversineMeters,
  headingAlongPath,
  movePointAlong,
  pathLengthMeters,
  projectOntoPathDetailed,
  type RoutePoint,
  type RouteStep,
} from "@/lib/dispatch/routing";
import { computeAnchorPadding, type AnchorPadding } from "@/lib/drive/camera-controller";

export const NAV_ZOOM_BASE = 18.6;
export const NAV_ZOOM_MAX = 19;
export const NAV_ZOOM_MIN = 17.9;
export const NAV_ZOOM_SLOW = NAV_ZOOM_BASE;
export const NAV_ZOOM_FAST = NAV_ZOOM_BASE - 0.4;
/** No girar el mapa por variaciones menores de rumbo (anti-jitter). */
export const NAV_HEADING_SKIP_DEG = 2.5;
/**
 * Velocidad angular máxima del giro de cámara (deg/s) — Fase 3-B.
 *
 * Este es el limitador del lado CÁMARA (el otro está en el resolvedor:
 * heading-resolver.ts → MAX_ANGULAR_RATE_DEG_PER_S = 60). Antes era 150 y era
 * el que barría 0°→175° en 1.2 s en T4, porque la cámara arrancaba en 0 (el
 * frame fabricaba rumbo 0 cuando aún no había rumbo) y perseguía al rumbo
 * real con este tope. Ahora la primera adquisición es de un golpe
 * (`cameraHeading == null`) y, ya adquirida, no pasa de 60°/s.
 */
export const MAX_HEADING_ROTATION_DEG_PER_SEC = 60;

// ── Fase 5-A: estima continua entre fixes ────────────────────────────
/**
 * Edad máxima del último fix con extrapolación PLENA (ms).
 *
 * Evidencia: video de iPhone a 60 fps en vehículo — 365/419 cuadros (87 %)
 * sin desplazamiento, en ráfagas de ~0.25 s cada 1.0 s (autocorrelación 0.53
 * en lag 1 s), con picos de 140–270 px/s frente a 66 px/s de media. La
 * posición visual solo se movía al llegar cada fix (1 Hz). Aquí el vehículo
 * (y la cámara, que es la misma) avanza en CADA cuadro.
 */
export const DEAD_RECKON_MAX_FIX_AGE_MS = 1_500;
/** Tras ese plazo la estima se detiene suavemente durante este tiempo. */
export const DEAD_RECKON_STOP_FADE_MS = 900;
/** Constante de tiempo de la corrección al llegar un fix nuevo (s). */
export const FIX_CORRECTION_TAU_S = 0.8;
/**
 * Tasa máxima de la corrección (m/s): un fix que revela 15 m de error se
 * absorbe en ~4 s en vez de con un tirón de 15 m en un cuadro. Por debajo del
 * paso normal de avance, así que no rompe la uniformidad por cuadro.
 */
export const FIX_CORRECTION_MAX_MPS = 4;
/** Sin movimiento, solo se corrige un error mayor que esto (m). */
export const REST_CORRECTION_MIN_M = 2.5;
export const REST_CORRECTION_TAU_S = 1.5;
export const REST_CORRECTION_MAX_MPS = 1.5;
/** Por debajo de esta velocidad el vehículo no avanza (m/s). */
export const MIN_MOVING_SPEED_MPS = 0.5;
/** Distancia lateral máxima para considerar que el vehículo está SOBRE la ruta (m). */
export const ON_ROUTE_LATERAL_M = 25;
/** Delta de tiempo máximo aceptado por cuadro (s): evita saltos tras un stall. */
export const MAX_FRAME_DT_S = 0.2;
/** Velocidad que alcanza el zoom lejano (≈65 km/h). */
export const NAV_SPEED_REF_MPS = 18;
export const TURN_AWARENESS_METERS = 220;
/** Distancia de activación de la vista de anticipación para cruces. */
export const TURN_CAMERA_AWARENESS_METERS = 1_000;
/** Pitch máximo de la cámara al aproximarse a una maniobra real. */
export const TURN_CAMERA_PITCH = 35;
/** Zoom máximo de alejamiento adicional al aproximarse al cruce. */
export const TURN_CAMERA_ZOOM_OUT = 0.7;
/** Velocidad de interpolación del pitch por segundo. */
export const NAV_PITCH_SMOOTH = 0.045;
export const TURN_ZOOM_OUT = 0.9;
export const TURN_ANGLE_SIGNIFICANT_DEG = 40;
export const TURN_ANGLE_STRONG_DEG = 80;
export const TURN_ZOOM_OUT_STRONG = 1.25;
export const CONSECUTIVE_MANEUVER_METERS = 150;
export const NAV_ZOOM_SMOOTH = 0.06;
export const NAV_ZOOM_EPSILON = 0.01;
export const NAV_ZOOM_HYSTERESIS = 0.18;

function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

function shortestAngleDelta(to: number, from: number): number {
  return ((to - from + 540) % 360) - 180;
}

/** Metros por píxel a un zoom/latitud dados (Web Mercator). */
export function metersPerPixelAt(zoom: number, lat: number): number {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
}

export type FollowCameraState = {
  vehiclePos: RoutePoint;
  visualHeading: number | null;
  cameraHeading: number | null;
  cameraHeadingTs: number | null;
  zoomTarget: number | null;
  /** Pitch interpolado actual de la cámara. */
  pitch?: number | null;
  /**
   * Fase 5-A: estado de la estima entre fixes. Opcionales para no romper a los
   * consumidores que construyen el estado a mano: el primer cuadro los
   * inicializa (dt = frameScale, sin corrección pendiente).
   */
  frameTs?: number | null;
  /** `now` del último fix YA integrado (mismo reloj que `now`). */
  fixTs?: number | null;
  /** Corrección pendiente (metros y rumbo) hacia el último fix. */
  correctionMeters?: number;
  correctionBearing?: number | null;
};

export type FollowRouteInput = {
  path: RoutePoint[];
  steps: RouteStep[];
};

export type FollowFrameInput = {
  /** `performance.now()` del frame. */
  now: number;
  /** Escala del delta time respecto a 33 ms (acotada 0.5–4 por el llamador). */
  frameScale: number;
  mapZoom: number;
  /** Posición GPS real del vehículo (target de la interpolación). */
  target: RoutePoint;
  /** Rumbo resuelto (target heading) del resolvedor. */
  targetHeading: number | null;
  /** Rumbo del simulador si está activo (prioridad), si no null. */
  simHeading: number | null;
  /** Rumbo ACTUAL del mapa (deg): se mantiene mientras no haya rumbo. */
  mapBearing: number;
  /** Velocidad de navegación (m/s) para el zoom por velocidad. */
  speedMps: number;
  route: FollowRouteInput | null;
  /**
   * ¿Ya hubo un fix con accuracy ≤ 20 m? Antes del primero, un fix pobre
   * (>30 m) no mueve la posición visual (T4: accuracy 79 m desplazó el puck
   * 50.2 m en 1.6 s).
   */
  firstGoodFixSeen: boolean;
  /**
   * Fase 4-B: hay una posición de navegación utilizable (fix ≤20 m). Sin ella
   * no se dispara el zoom por maniobra ni se proyecta progreso: la posición
   * inicial puede ser una semilla ≤50 m o el centro por defecto.
   */
  navigationReady: boolean;
  /**
   * Y del ancla (px desde el borde superior del contenedor) dentro del área
   * visible: 70–75 %. Se aplica con `padding` y NO con `offset`, porque
   * `jumpTo` ignora `offset` en mapbox-gl 3.33 (ver camera-controller.ts).
   */
  anchorY: number;
  /** Altura del contenedor del mapa (px): base del cálculo de `padding`. */
  containerHeightPx: number;
  /** Zoom pendiente de plegar en esta llamada (frame anterior). */
  pendingZoom: number | null;
  /** Precisión GPS conocida (m) o null: >20 m = calentamiento. */
  accuracy: number | null;
  /**
   * Fase 5-A: `now` (mismo reloj) del último fix GPS aceptado. Sin él no hay
   * extrapolación: la estima no inventa movimiento.
   */
  fixTs?: number | null;
};

export type FollowFrameResult = {
  state: FollowCameraState;
  command: {
    center: RoutePoint;
    bearing: number;
    pitch: number;
    padding: AnchorPadding;
    zoom?: number;
  };
  /** El rumbo visual cambió (hay que rotar el icono del puck). */
  headingChanged: boolean;
  /** Desplazamiento del vehículo en este frame (px). */
  vehicleStepPx: number;
  /** El zoom objetivo o el pendiente cambió en este frame. */
  pendingZoom: number | null;
};

export function computeFollowFrame(
  state: FollowCameraState,
  input: FollowFrameInput
): FollowFrameResult {
  const { now, frameScale, target } = input;

  // ── 1) Rumbo visual (suavizado por el camino más corto) ──
  const targetHeading = input.targetHeading;
  let visualHeading = state.visualHeading;
  let headingChanged = false;
  if (targetHeading != null && visualHeading != null) {
    const delta = shortestAngleDelta(targetHeading, visualHeading);
    if (Math.abs(delta) > NAV_HEADING_SKIP_DEG) {
      const baseFactor = Math.abs(delta) > 45 ? 0.38 : 0.22;
      const factor = 1 - Math.pow(1 - baseFactor, frameScale);
      visualHeading = normalizeDeg(visualHeading + delta * factor);
      headingChanged = true;
    }
  } else if (targetHeading != null && visualHeading == null) {
    visualHeading = targetHeading;
    headingChanged = true;
  }
  // Sin rumbo todavía NO se fabrica 0°: se mantiene la cámara donde está y la
  // primera adquisición real se aplica de un solo golpe (T4: barrido de 0° a
  // 175° en 1.2 s porque el frame inventaba norte).
  const heading = visualHeading ?? targetHeading;

  // ── 2) Posición del vehículo: ESTIMA CONTINUA entre fixes (Fase 5-A) ──
  //
  // Antes: la posición perseguía el último fix con un suavizado exponencial y
  // un paso mínimo de 1.5 m por cuadro. Como el objetivo solo cambiaba al
  // llegar un fix (1 Hz), la posición se quedaba quieta y luego corría para
  // «alcanzarlo»: ráfagas de ~0.25 s cada 1 s (87 % de cuadros sin movimiento
  // en el video). Ahora:
  //   1. el vehículo avanza en cada cuadro `v·dt` a lo largo de la ruta (si
  //      está sobre ella, lateral ≤25 m) o del rumbo resuelto;
  //   2. la extrapolación se corta a 1.5 s del último fix y se apaga en 0.9 s;
  //   3. cada fix nuevo corrige el error acumulado con constante ~0.8 s, sin
  //      reiniciar la velocidad;
  //   4. sin velocidad válida (<0.5 m/s) o sin fix con hora, no se avanza.
  const zoomNow =
    typeof input.mapZoom === "number" ? input.mapZoom : NAV_ZOOM_BASE;
  const cur = state.vehiclePos;
  let vehiclePos = cur;
  const mpp = Math.max(0.01, metersPerPixelAt(zoomNow, cur.lat));
  // Fase 3-B — arranque: sin ningún fix bueno todavía, un fix pobre no mueve
  // el vehículo visual (T4: accuracy 79/52 m ⇒ 50.2 m de salto en 1.6 s).
  const poorStart =
    !input.firstGoodFixSeen && input.accuracy != null && input.accuracy > 20;
  const speedMps = Math.max(0, input.speedMps);
  // dt real desde el cuadro anterior de cámara (el primero usa `frameScale`).
  const prevFrameTs = state.frameTs ?? null;
  const dtSec =
    prevFrameTs == null
      ? Math.min(MAX_FRAME_DT_S, 0.033 * Math.max(0.5, frameScale))
      : Math.min(
          MAX_FRAME_DT_S,
          Math.max(0, (now - prevFrameTs) / 1000)
        );
  const fixTs = input.fixTs ?? null;
  const fixAgeMs = fixTs != null ? Math.max(0, now - fixTs) : Infinity;
  // Extrapolación plena hasta 1.5 s; se apaga suavemente en 0.9 s más.
  let extrapolation = 0;
  if (fixAgeMs <= DEAD_RECKON_MAX_FIX_AGE_MS) {
    extrapolation = 1;
  } else if (fixAgeMs <= DEAD_RECKON_MAX_FIX_AGE_MS + DEAD_RECKON_STOP_FADE_MS) {
    extrapolation =
      1 - (fixAgeMs - DEAD_RECKON_MAX_FIX_AGE_MS) / DEAD_RECKON_STOP_FADE_MS;
  }
  if (speedMps < MIN_MOVING_SPEED_MPS || fixTs == null) extrapolation = 0;

  // Proyección única sobre la ruta: sirve al avance y al zoom por maniobra.
  const routePath =
    input.route?.path && input.route.path.length >= 2 ? input.route.path : null;
  const projection = routePath
    ? projectOntoPathDetailed(routePath, cur)
    : null;
  const onRoute =
    projection != null &&
    projection.distance <= ON_ROUTE_LATERAL_M &&
    routePath != null;

  if (!poorStart && extrapolation > 0) {
    const stepMeters = speedMps * dtSec * extrapolation;
    let along: number | null = null;
    if (onRoute && routePath) {
      // Sobre la ruta: avanzar siguiendo la polilínea (tangente del tramo).
      along = headingAlongPath(
        routePath,
        projection.meters + Math.max(1, stepMeters)
      );
    }
    if (along == null) {
      // Fuera de la ruta: avanzar por el rumbo resuelto (no por la geometría
      // vieja que el vehículo ya abandonó).
      along = input.simHeading ?? input.targetHeading ?? heading;
    }
    if (stepMeters > 0 && along != null) {
      vehiclePos = movePointAlong(vehiclePos, along, stepMeters);
    }
  }

  // Corrección por fix nuevo: mezcla suave, sin reiniciar velocidad. Un salto
  // mayor que max(50 m, 3·v) es una re-adquisición del GPS, no desplazamiento
  // → snap (se conserva el comportamiento confirmado en dispositivo).
  let correctionMeters = state.correctionMeters ?? 0;
  let correctionBearing = state.correctionBearing ?? null;
  const fixIsNew = fixTs != null && fixTs !== (state.fixTs ?? null);
  if (fixTs == null) {
    // Consumidores sin hora de fix (llamadas de una sola vez, pruebas viejas):
    // se conserva la reubicación por salto grande, sin estima ni corrección.
    if (
      !poorStart &&
      haversineMeters(vehiclePos, target) > Math.max(50, 3 * speedMps)
    ) {
      vehiclePos = target;
    }
  } else if (fixIsNew && !poorStart) {
    const errMeters = haversineMeters(vehiclePos, target);
    if (errMeters > Math.max(50, 3 * speedMps)) {
      vehiclePos = target;
      correctionMeters = 0;
      correctionBearing = null;
    } else if (errMeters > 0.05) {
      correctionMeters = errMeters;
      correctionBearing = bearingBetween(vehiclePos, target);
    } else {
      correctionMeters = 0;
      correctionBearing = null;
    }
  }
  if (correctionMeters > 0 && correctionBearing != null) {
    const moving = speedMps >= MIN_MOVING_SPEED_MPS;
    // Parado: un temblor de GPS de 1–2 m no debe mover el puck; un error
    // real (p. ej. el exceso de la extrapolación al frenar) sí se absorbe.
    if (!moving && correctionMeters <= REST_CORRECTION_MIN_M) {
      correctionMeters = 0;
      correctionBearing = null;
    } else {
      const tau = moving ? FIX_CORRECTION_TAU_S : REST_CORRECTION_TAU_S;
      // La corrección NUNCA puede duplicar el paso del cuadro: se limita a
      // 0.5·v además del tope absoluto. Así el desplazamiento por cuadro queda
      // ≤1.5·v·dt (criterio 5-B: paso máximo ≤2× el esperado) incluso cuando
      // el GPS va retrasado y la corrección empuja en el mismo sentido.
      const maxMps = moving
        ? Math.min(FIX_CORRECTION_MAX_MPS, Math.max(0.5, speedMps * 0.5))
        : REST_CORRECTION_MAX_MPS;
      const blend = 1 - Math.exp(-dtSec / tau);
      const applyMeters = Math.min(
        correctionMeters,
        correctionMeters * blend,
        maxMps * dtSec
      );
      if (applyMeters > 0) {
        vehiclePos = movePointAlong(vehiclePos, correctionBearing, applyMeters);
        correctionMeters = Math.max(0, correctionMeters - applyMeters);
      }
      if (correctionMeters <= 0.02) {
        correctionMeters = 0;
        correctionBearing = null;
      }
    }
  }
  const vehicleStepPx = haversineMeters(cur, vehiclePos) / mpp;

  // ── 3) Centro de cámara = VEHÍCULO, con anclaje por offset ──
  // Fase 1-E: el puck queda al 72.5 % del área visible por OFFSET, no por un
  // punto de mira adelantado. Así se cumplen a la vez:
  //  - cámara a <5 m del vehículo en ≥95 % de las muestras, y
  //  - puck al 70–75 % del área visible (la carretera por delante sigue
  //    ocupando la parte alta de la pantalla porque el puck está abajo).
  // (Antes: punto de mira 90 m adelantado ⇒ el centro quedaba a >20 m del
  // vehículo en el 75 % de las muestras y el puck al 50 % de la altura.)
  const navHeading = input.simHeading ?? heading;
  const desiredCenter = vehiclePos;
  // Anclaje por PADDING (no por offset: jumpTo lo ignora en mapbox-gl 3.33).
  const anchorY = Math.round(input.anchorY);

  // ── 4) Rumbo de cámara con límite de velocidad angular ──
  let cameraHeading = state.cameraHeading;
  let cameraHeadingTs = state.cameraHeadingTs;
  if (navHeading == null) {
    // Sin rumbo de navegación: la cámara se queda como está (el comando usa el
    // bearing actual del mapa más abajo) y NO se marca un rumbo de cámara.
    cameraHeading = state.cameraHeading;
    cameraHeadingTs = state.cameraHeadingTs;
  } else if (cameraHeading != null) {
    const deltaDeg = shortestAngleDelta(navHeading, cameraHeading);
    if (Math.abs(deltaDeg) > NAV_HEADING_SKIP_DEG) {
      const dtSec = Math.max(0.001, (now - (cameraHeadingTs ?? now)) / 1000);
      const maxDeg = Math.min(
        Math.abs(deltaDeg),
        MAX_HEADING_ROTATION_DEG_PER_SEC * dtSec
      );
      const sign = deltaDeg > 0 ? 1 : -1;
      cameraHeading = normalizeDeg(cameraHeading + sign * maxDeg);
    } else {
      cameraHeading = navHeading;
    }
    cameraHeadingTs = now;
  } else {
    cameraHeading = navHeading;
    cameraHeadingTs = now;
  }

  // ── 5) Zoom adaptativo (velocidad + maniobra), persecución suave ──
  let zoomTarget = state.zoomTarget;
  let pendingZoom = input.pendingZoom;
  let pitch = state.pitch ?? 0;
  let turnApproachActive = false;
  {
    let targetZoom =
      NAV_ZOOM_SLOW -
      (input.speedMps / NAV_SPEED_REF_MPS) * (NAV_ZOOM_SLOW - NAV_ZOOM_FAST);
    targetZoom = Math.max(NAV_ZOOM_MIN, Math.min(NAV_ZOOM_MAX, targetZoom));
    const route = input.route;
    if (
      input.navigationReady &&
      route?.path &&
      route.path.length >= 2 &&
      route.steps.length > 0
    ) {
      const total = pathLengthMeters(route.path);
      // Reutiliza la proyección del avance si la ruta es la misma.
      const offsetNow =
        routePath === route.path && projection != null
          ? projection.meters
          : projectOntoPathDetailed(route.path, vehiclePos).meters;
      const done = Math.min(Math.max(offsetNow, 0), total);
      let accEnd = 0;
      let idx = route.steps.length - 1;
      for (let i = 0; i < route.steps.length; i++) {
        accEnd += route.steps[i].distanceMeters;
        if (accEnd > done) {
          idx = i;
          break;
        }
      }
      const stepEnd = accEnd;
      const distToTurn = Math.max(0, stepEnd - done);
      const curStep = route.steps[idx];
      const nextStep = route.steps[idx + 1];
      const realManeuver =
        nextStep != null && !["straight", "depart", "arrive", "unknown"].includes(nextStep.maneuver ?? "");
      const pitchGoal =
        input.navigationReady && realManeuver && distToTurn <= TURN_CAMERA_AWARENESS_METERS
          ? TURN_CAMERA_PITCH
          : 0;
      pitch += (pitchGoal - pitch) * (1 - Math.pow(1 - NAV_PITCH_SMOOTH, frameScale));
      if (Math.abs(pitch - pitchGoal) < 0.1) pitch = pitchGoal;
      const nextNextStep = route.steps[idx + 2];
      const turnOpenFactor = (
        fromStep: RouteStep | undefined,
        toStep: RouteStep | undefined,
        distanceToManeuver: number
      ): number => {
        if (!fromStep || !toStep) return 0;
        const before = bearingBetween(fromStep.start, fromStep.end);
        const after = bearingBetween(toStep.start, toStep.end);
        if (before == null || after == null) return 0;
        const angle = Math.abs(shortestAngleDelta(after, before));
        const strength =
          angle >= TURN_ANGLE_STRONG_DEG
            ? TURN_ZOOM_OUT_STRONG
            : angle >= TURN_ANGLE_SIGNIFICANT_DEG
              ? TURN_ZOOM_OUT
              : 0;
        if (strength === 0) return 0;
        const rampIn =
          1 - Math.min(1, distanceToManeuver / TURN_AWARENESS_METERS);
        return strength * rampIn;
      };
      const approachFactor = realManeuver
        ? TURN_CAMERA_ZOOM_OUT * (1 - Math.min(1, distToTurn / TURN_CAMERA_AWARENESS_METERS))
        : 0;
      turnApproachActive = approachFactor > 0;
      let openFactor = Math.max(
        turnOpenFactor(curStep, nextStep, distToTurn),
        approachFactor
      );
      if (nextStep != null && nextNextStep != null) {
        const nextStepEnd = stepEnd + nextStep.distanceMeters;
        const distToNextTurn = Math.max(0, nextStepEnd - done);
        if (distToNextTurn <= CONSECUTIVE_MANEUVER_METERS) {
          openFactor = Math.max(
            openFactor,
            turnOpenFactor(nextStep, nextNextStep, distToNextTurn)
          );
        }
      }
      if (openFactor > 0) {
        const maneuverTarget = NAV_ZOOM_BASE - openFactor;
        targetZoom = Math.min(targetZoom, maneuverTarget);
        targetZoom = Math.max(NAV_ZOOM_MIN - 0.4, targetZoom);
      }
    }
    // Si Directions está recalculando o no hay una geometría utilizable, vuelve
    // también desde la inclinación anterior sin esperar a que llegue otra ruta.
    if (!input.route?.path || input.route.path.length < 2 || input.route.steps.length === 0) {
      pitch += (0 - pitch) * (1 - Math.pow(1 - NAV_PITCH_SMOOTH, frameScale));
      if (pitch < 0.1) pitch = 0;
    }
    // Histéresis del objetivo: no recalcular para micro-variaciones. Durante la
    // aproximación al cruce sí se siguen las variaciones del factor para que el
    // zoom empiece a abrirse dentro de la ventana de 1 km.
    if (
      zoomTarget == null ||
      turnApproachActive ||
      Math.abs(targetZoom - zoomTarget) >= NAV_ZOOM_HYSTERESIS
    ) {
      zoomTarget = targetZoom;
    }
    const zoomDelta = zoomTarget - zoomNow;
    if (Math.abs(zoomDelta) > NAV_ZOOM_EPSILON) {
      const stepZoom = zoomNow + zoomDelta * NAV_ZOOM_SMOOTH;
      pendingZoom = Math.max(
        NAV_ZOOM_MIN - 0.4,
        Math.min(NAV_ZOOM_MAX, stepZoom)
      );
    } else {
      pendingZoom = null;
    }
  }

  const command: FollowFrameResult["command"] = {
    center: desiredCenter,
    bearing: cameraHeading ?? input.mapBearing,
    pitch,
    padding: computeAnchorPadding(input.containerHeightPx, anchorY),
    ...(pendingZoom != null ? { zoom: pendingZoom } : {}),
  };

  return {
    state: {
      vehiclePos,
      visualHeading,
      cameraHeading,
      cameraHeadingTs,
      zoomTarget,
      pitch,
      frameTs: now,
      fixTs: fixTs ?? state.fixTs ?? null,
      correctionMeters,
      correctionBearing,
    },
    command,
    headingChanged,
    vehicleStepPx,
    pendingZoom,
  };
}
