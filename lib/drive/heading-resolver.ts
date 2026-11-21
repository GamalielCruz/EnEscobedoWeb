/**
 * Resolvedor de TARGET HEADING para navegación del repartidor (puro, sin React).
 *
 * Vive aquí (y no dentro de app/(drive)/drive/page.tsx) para poder probarse
 * con simulaciones de trayecto (recto, curvas, vuelta en U, pérdida de GPS)
 * sin montar la página completa.
 *
 * Estrategia:
 *  - En movimiento (>= 2 m/s): el GPS domina (coords.heading, o el bearing
 *    entre ticks de GPS si el course no es válido).
 *  - INVARIANTE: una vez adquirido un rumbo confiable, la brújula nunca lo
 *    sobreescribe. Detenido o lento, el rumbo se mantiene ("HELD"); la
 *    brújula solo sirve como adquisición inicial. Girar/inclinar el
 *    teléfono en la mano NUNCA rota la cámara ni el puck — la cámara sigue
 *    al vehículo, no a la mano.
 *  - Siguiendo la ruta: el bearing del segmento de ruta estabiliza el rumbo
 *    cuando GPS y ruta concuerdan (<= ROUTE_ALIGN_TOLERANCE_DEG).
 *  - Desvío real: GPS vs ruta con diferencia grande (> HEADING_DEVIATION_START_DEG)
 *    y sostenida antes de aceptarse (histéresis). Samples aislados que ni el
 *    bearing entre ticks ni la ruta corroboran se ignoran.
 *  - Giros grandes (90°/180°, p. ej. vuelta en U): si el heading GPS y el
 *    bearing entre ticks concuerdan entre sí, se aceptan de inmediato aunque
 *    difieran del rumbo aceptado (dos fuentes de movimiento independientes).
 */

import {
  bearingBetween,
  haversineMeters,
  headingAlongPath,
  pathLengthMeters,
  projectOntoPath,
  type RoutePoint,
} from "@/lib/dispatch/routing";

function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Diferencia dirigida y mínima entre dos ángulos: 350° → 5° = +15°. */
function shortestAngleDelta(to: number, from: number): number {
  return ((to - from + 540) % 360) - 180;
}

const ROUTE_ALIGN_TOLERANCE_DEG = 15;
const HEADING_DEVIATION_START_DEG = 25;
const HEADING_DEVIATION_CONFIRM_MS = 1200;
const HEADING_DEVIATION_MIN_SAMPLES = 3;
const GPS_SPEED_DOMINANT_MPS = 2;
const COMPASS_SPEED_MAX_MPS = 1;

export type DriveHeadingSource =
  | "SIMULATOR"
  | "GPS"
  | "FOLLOWING_ROUTE"
  | "DEVIATING"
  | "COMPASS_FALLBACK"
  | "HELD";

export type DriveHeadingDebugInfo = {
  source: DriveHeadingSource;
  speedMps: number;
  gpsHeading: number | null;
  movementHeading: number | null;
  routeHeading: number | null;
  nextSegmentBearing: number | null;
  compassHeading: number | null;
  gpsVsRouteDeltaDeg: number | null;
  deviatingForMs: number;
};

export type DriveHeadingResolverOptions = {
  getSimHeading: () => { active: boolean; simHeading: number | null };
  getGpsHeading: () => number | null;
  getSpeedMps: () => number;
  getMovementHeading: () => number | null;
  getDeviceHeading: () => { heading: number; available: string; permission: string };
  getRouteGeometry: () => {
    path: RoutePoint[] | null;
    /** Posición actual del vehículo (visual) para proyectar sobre la ruta. */
    vehiclePos: RoutePoint | null;
  };
  /** Desplazamiento mínimo (m) para derivar rumbo por movimiento. */
  minMovementMeters?: number;
  /** Intervalo mínimo (ms) para derivar rumbo por movimiento. */
  minMovementMs?: number;
};

/**
 * Crea el resolvedor de heading objetivo con su estado interno (máquina de
 * estados). El estado vive en el closure para que el loop rAF pueda llamar
 * `resolve()` cada frame SIN recrear callbacks ni depender de re-renders.
 */
export function createDriveHeadingResolver(options: DriveHeadingResolverOptions) {
  const minMovementMeters = options.minMovementMeters ?? 2;
  const minMovementMs = options.minMovementMs ?? 250;

  type ResolverState = {
    deviating: boolean;
    deviationStartedAt: number | null;
    deviationStreak: number;
    gpsHeadingSpikeStreak: number;
    lastGpsTickPos: RoutePoint | null;
    lastGpsTickTs: number | null;
    gpsTickBearing: number | null;
    /** Velocidad derivada del bearing entre ticks (m/s), para selección de fuente. */
    tickSpeedMps: number | null;
    lastGpsHeadingTs: number | null;
    gpsHeadingConfirmStreak: number;
    acceptedHeading: number | null;
    debug: DriveHeadingDebugInfo | null;
  };
  const state: ResolverState = {
    deviating: false,
    deviationStartedAt: null,
    deviationStreak: 0,
    gpsHeadingSpikeStreak: 0,
    lastGpsTickPos: null,
    lastGpsTickTs: null,
    gpsTickBearing: null,
    tickSpeedMps: null,
    lastGpsHeadingTs: null,
    gpsHeadingConfirmStreak: 0,
    acceptedHeading: null,
    debug: null,
  };

  const deviceCompassUsable = () => {
    const d = options.getDeviceHeading();
    return d.available === "available" && d.permission === "granted";
  };

  const resolve = (): number | null => {
    const now = Date.now();
    const sim = options.getSimHeading();
    const reportedSpeedMps = options.getSpeedMps();
    const gpsHeadingRaw = options.getGpsHeading();
    const movementHeading = options.getMovementHeading();
    const { path, vehiclePos } = options.getRouteGeometry();

    // ── Simulador: prioridad absoluta, sin máquina de estados ──
    if (sim.active && sim.simHeading != null) {
      state.acceptedHeading = sim.simHeading;
      state.debug = {
        source: "SIMULATOR",
        speedMps: reportedSpeedMps,
        gpsHeading: gpsHeadingRaw,
        movementHeading,
        routeHeading: null,
        nextSegmentBearing: null,
        compassHeading: deviceCompassUsable() ? options.getDeviceHeading().heading : null,
        gpsVsRouteDeltaDeg: null,
        deviatingForMs: 0,
      };
      return sim.simHeading;
    }

    // ── Geometría de ruta: bearing del segmento actual y del siguiente ──
    let routeHeading: number | null = null;
    let nextSegmentBearing: number | null = null;
    if (path && path.length >= 2 && vehiclePos) {
      const total = pathLengthMeters(path);
      const driven = Math.min(Math.max(projectOntoPath(path, vehiclePos), 0), total);
      routeHeading = headingAlongPath(path, driven);
      let acc = 0;
      for (let i = 1; i < path.length; i++) {
        const segLen = haversineMeters(path[i - 1], path[i]);
        if (acc + segLen > driven) {
          nextSegmentBearing = bearingBetween(path[i - 1], path[i]);
          break;
        }
        acc += segLen;
      }
    }

    // ── Bearing + velocidad entre ticks de posición consecutivos ──
    // (curso real medido; en giros lentos como una vuelta en U estos umbrales
    // bajos son los que permiten que el rumbo siga al vehículo en lugar de
    // quedarse congelado en el rumbo anterior).
    if (vehiclePos && state.lastGpsTickPos) {
      const tickDist = haversineMeters(state.lastGpsTickPos, vehiclePos);
      const tickElapsed = state.lastGpsTickTs != null ? now - state.lastGpsTickTs : 0;
      if (tickDist >= minMovementMeters && tickElapsed >= minMovementMs) {
        state.gpsTickBearing = bearingBetween(state.lastGpsTickPos, vehiclePos);
        state.tickSpeedMps = tickDist / (tickElapsed / 1000);
      }
    }
    if (vehiclePos && (!state.lastGpsTickPos || haversineMeters(state.lastGpsTickPos, vehiclePos) > 1)) {
      state.lastGpsTickPos = vehiclePos;
      state.lastGpsTickTs = now;
    }

    // Velocidad efectiva: la reportada puede ir con retardo (se deriva de
    // ticks con histéresis); la velocidad entre ticks es más fresca.
    const speedMps = Math.max(reportedSpeedMps, state.tickSpeedMps ?? 0);

    // ── Detección de spikes de GPS heading ──
    // Un salto grande del coords.heading solo se acepta si el bearing entre
    // ticks O la ruta lo respaldan; si no, exige varias muestras consecutivas.
    // Tras una vuelta en U real, GPS heading y bearing entre ticks giran
    // juntos → se acepta de inmediato (corroboratedBy).
    const corroboratedBy = (h: number): boolean => {
      if (state.gpsTickBearing != null && Math.abs(shortestAngleDelta(h, state.gpsTickBearing)) <= HEADING_DEVIATION_START_DEG) return true;
      const ref = routeHeading ?? nextSegmentBearing;
      return ref != null && Math.abs(shortestAngleDelta(h, ref)) <= HEADING_DEVIATION_START_DEG;
    };
    let gpsHeading = gpsHeadingRaw;
    if (gpsHeadingRaw != null) {
      const accepted = state.acceptedHeading;
      const jumped = accepted != null && Math.abs(shortestAngleDelta(gpsHeadingRaw, accepted)) > HEADING_DEVIATION_START_DEG;
      if (jumped && !corroboratedBy(gpsHeadingRaw)) {
        state.gpsHeadingSpikeStreak += 1;
        if (state.gpsHeadingSpikeStreak < HEADING_DEVIATION_MIN_SAMPLES) {
          gpsHeading = null;
        }
      } else {
        state.gpsHeadingSpikeStreak = 0;
      }
    }

    // ── Coincidencia GPS vs ruta (histéresis) ──
    const gpsRef = gpsHeading ?? movementHeading;
    const gpsVsRouteDeltaDeg =
      gpsRef != null && routeHeading != null
        ? Math.abs(shortestAngleDelta(routeHeading, gpsRef))
        : null;

    if (gpsVsRouteDeltaDeg != null) {
      if (!state.deviating) {
        if (gpsVsRouteDeltaDeg > HEADING_DEVIATION_START_DEG) {
          state.deviationStreak += 1;
          if (
            state.deviationStartedAt == null &&
            state.deviationStreak >= 2
          ) {
            state.deviationStartedAt = now;
          }
          const sustainedMs = state.deviationStartedAt != null ? now - state.deviationStartedAt : 0;
          if (
            sustainedMs >= HEADING_DEVIATION_CONFIRM_MS ||
            state.deviationStreak >= HEADING_DEVIATION_MIN_SAMPLES + 2
          ) {
            state.deviating = true;
          }
        } else {
          state.deviationStreak = 0;
          state.deviationStartedAt = null;
        }
      } else {
        if (gpsVsRouteDeltaDeg < ROUTE_ALIGN_TOLERANCE_DEG) {
          state.deviating = false;
          state.deviationStreak = 0;
          state.deviationStartedAt = null;
        }
      }
    }
    const deviatingForMs =
      state.deviating && state.deviationStartedAt != null ? now - state.deviationStartedAt : 0;

    // ── Selección de fuente por velocidad ──
    const compassOk = deviceCompassUsable();
    const compassHeading = compassOk ? options.getDeviceHeading().heading : null;

    let heading: number | null = null;
    let source: DriveHeadingSource = "GPS";

    // INVARIANTE DE ORIENTACIÓN: una vez adquirido un rumbo GPS/movimiento
    // confiable, la brújula NUNCA lo sobreescribe. Girar o inclinar el
    // teléfono en la mano no debe rotar la cámara ni el puck. La brújula
    // solo actúa como adquisición inicial (sin rumbo previo) y como
    // respaldo cuando no existe ninguna señal de movimiento.
    const heldHeading = state.acceptedHeading;

    if (speedMps >= GPS_SPEED_DOMINANT_MPS) {
      if (gpsHeading != null) {
        heading = gpsHeading;
        if (!state.deviating && routeHeading != null) {
          const d = Math.abs(shortestAngleDelta(routeHeading, heading));
          if (d <= ROUTE_ALIGN_TOLERANCE_DEG) {
            heading = normalizeDeg(
              heading + shortestAngleDelta(routeHeading, heading) * 0.35
            );
            source = "FOLLOWING_ROUTE";
          } else {
            source = "GPS";
          }
        } else {
          source = state.deviating ? "DEVIATING" : "GPS";
        }
      } else if (movementHeading != null) {
        heading = movementHeading;
        if (!state.deviating && routeHeading != null && Math.abs(shortestAngleDelta(routeHeading, heading)) <= ROUTE_ALIGN_TOLERANCE_DEG) {
          heading = normalizeDeg(heading + shortestAngleDelta(routeHeading, heading) * 0.35);
          source = "FOLLOWING_ROUTE";
        } else {
          source = state.deviating ? "DEVIATING" : "GPS";
        }
      } else if (state.gpsTickBearing != null) {
        // Sin course GPS válido: el bearing entre ticks es la mejor señal
        // de movimiento disponible (cubre el caso coords.heading == null).
        heading = state.gpsTickBearing;
        source = state.deviating ? "DEVIATING" : "GPS";
      } else if (heldHeading != null) {
        // Sin señal de movimiento fresca: mantener el último rumbo confiable
        // (no dar la cámara a la brújula en pleno desplazamiento).
        heading = heldHeading;
        source = "HELD";
      } else if (compassOk) {
        heading = compassHeading;
        source = "COMPASS_FALLBACK";
      }
    } else if (speedMps >= COMPASS_SPEED_MAX_MPS) {
      // Movimiento lento (1–2 m/s, p. ej. tráfico): solo señales de
      // MOVIMIENTO (GPS/movimiento entre ticks). La brújula NO se mezcla:
      // a esta velocidad el teléfono suele estar en la mano y cualquier
      // giro de la muñeca se convertiría en rotación de la cámara.
      const motionRef = gpsHeading ?? movementHeading ?? state.gpsTickBearing;
      if (motionRef != null) {
        heading = motionRef;
        source = state.deviating ? "DEVIATING" : "GPS";
      } else if (heldHeading != null) {
        heading = heldHeading;
        source = "HELD";
      } else if (compassOk) {
        heading = compassHeading;
        source = "COMPASS_FALLBACK";
      }
    } else {
      // Detenido (< 1 m/s): el rumbo se MANTIENE. Si ya hay un rumbo
      // confiable, no se toca (la cámara no sigue a la mano). Solo en la
      // adquisición inicial (sin rumbo previo) se acepta la brújula.
      if (heldHeading != null) {
        heading = heldHeading;
        source = "HELD";
      } else if (gpsHeading != null || movementHeading != null || state.gpsTickBearing != null) {
        heading = gpsHeading ?? movementHeading ?? state.gpsTickBearing;
        source = "GPS";
      } else if (compassOk) {
        heading = compassHeading;
        source = "COMPASS_FALLBACK";
      }
    }

    if (heading != null) {
      if (gpsHeading != null) {
        const agrees =
          state.acceptedHeading != null
            ? Math.abs(shortestAngleDelta(gpsHeading, state.acceptedHeading)) <= HEADING_DEVIATION_START_DEG
            : true;
        state.gpsHeadingConfirmStreak = agrees ? state.gpsHeadingConfirmStreak + 1 : 1;
      } else {
        state.gpsHeadingConfirmStreak = 0;
      }
      state.acceptedHeading = heading;
      state.lastGpsHeadingTs = gpsHeading != null ? now : state.lastGpsHeadingTs;
    }

    state.debug = {
      source: heading == null ? "COMPASS_FALLBACK" : source,
      speedMps,
      gpsHeading: gpsHeadingRaw,
      movementHeading,
      routeHeading,
      nextSegmentBearing,
      compassHeading,
      gpsVsRouteDeltaDeg,
      deviatingForMs,
    };
    return heading;
  };

  return { resolve, state };
}
