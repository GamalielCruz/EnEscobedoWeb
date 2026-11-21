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
 *  - cuántos px se movió el vehículo en el frame (para verificar que no hay
 *    saltos > 15 px entre frames).
 *
 * Portado sin cambios de comportamiento del loop histórico de page.tsx
 * (suavizado de posición/rumbo, punto de mira adelantado, zoom por velocidad
 * y por maniobra). Cambios de la Fase 1:
 *  - el anclaje 70–75 % del área visible se aplica SIEMPRE (antes solo con
 *    `centerOnGps`, y sin compensar el punto adelantado);
 *  - el paso del vehículo por frame se acota a 15 px (sin saltos visibles,
 *    incluida la corrección de un fix impreciso al arrancar).
 */

import {
  bearingBetween,
  haversineMeters,
  movePointAlong,
  pathLengthMeters,
  projectOntoPath,
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
/** Velocidad angular máxima del giro de cámara (deg/s). */
export const MAX_HEADING_ROTATION_DEG_PER_SEC = 150;
/** Interpolación de posición del vehículo entre ticks de GPS. */
export const POSITION_SMOOTH_FACTOR = 0.18;
export const POSITION_MIN_STEP_METERS = 1.5;
/** Paso máximo del vehículo por frame (px) — sin saltos visibles. */
export const MAX_VEHICLE_STEP_PX = 15;
/** Velocidad que alcanza el zoom lejano (≈65 km/h). */
export const NAV_SPEED_REF_MPS = 18;
export const TURN_AWARENESS_METERS = 220;
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
  /** Velocidad de navegación (m/s) para el zoom por velocidad. */
  speedMps: number;
  route: FollowRouteInput | null;
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
};

export type FollowFrameResult = {
  state: FollowCameraState;
  command: {
    center: RoutePoint;
    bearing: number;
    pitch: 0;
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
  const heading = visualHeading ?? targetHeading ?? 0;

  // ── 2) Posición del vehículo: interpolación exponencial con tope de px ──
  const zoomNow =
    typeof input.mapZoom === "number" ? input.mapZoom : NAV_ZOOM_BASE;
  const cur = state.vehiclePos;
  const dist = haversineMeters(cur, target);
  let vehiclePos = cur;
  const mpp = Math.max(0.01, metersPerPixelAt(zoomNow, cur.lat));
  if (dist < 0.5) {
    vehiclePos = target;
  } else {
    // Calentamiento (accuracy > 20 m): amortiguar la corrección (~1 s ya de
    // por sí con POSITION_SMOOTH_FACTOR) y nunca superar 15 px por frame.
    const smooth = input.accuracy != null && input.accuracy > 20
      ? POSITION_SMOOTH_FACTOR * 0.6
      : POSITION_SMOOTH_FACTOR;
    const smoothFactor = 1 - Math.pow(1 - smooth, frameScale);
    let stepMeters = Math.max(
      POSITION_MIN_STEP_METERS,
      Math.min(dist, dist * smoothFactor)
    );
    stepMeters = Math.min(stepMeters, MAX_VEHICLE_STEP_PX * mpp);
    const brg = bearingBetween(cur, target);
    vehiclePos = brg == null ? cur : movePointAlong(cur, brg, stepMeters);
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
  if (cameraHeading != null) {
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
  {
    let targetZoom =
      NAV_ZOOM_SLOW -
      (input.speedMps / NAV_SPEED_REF_MPS) * (NAV_ZOOM_SLOW - NAV_ZOOM_FAST);
    targetZoom = Math.max(NAV_ZOOM_MIN, Math.min(NAV_ZOOM_MAX, targetZoom));
    const route = input.route;
    if (route?.path && route.path.length >= 2 && route.steps.length > 0) {
      const total = pathLengthMeters(route.path);
      const done = Math.min(
        Math.max(projectOntoPath(route.path, vehiclePos), 0),
        total
      );
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
      let openFactor = turnOpenFactor(curStep, nextStep, distToTurn);
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
    // Histéresis del objetivo: no recalcular para micro-variaciones.
    if (
      zoomTarget == null ||
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
    bearing: cameraHeading ?? 0,
    pitch: 0,
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
    },
    command,
    headingChanged,
    vehicleStepPx,
    pendingZoom,
  };
}
