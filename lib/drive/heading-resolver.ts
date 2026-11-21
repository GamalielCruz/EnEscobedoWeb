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
  distanceToPathMeters,
  haversineMeters,
  headingAlongPath,
  pathLengthMeters,
  projectOntoPath,
  type RoutePoint,
} from "@/lib/dispatch/routing";

function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/**
 * Progreso (m) sobre la ruta buscando SOLO en la ventana [lo, hi].
 *
 * Necesario cuando la ruta pasa dos veces por el mismo punto (vuelta en U:
 * se vuelve por la misma calle): la proyección "más cercana" puede caer en el
 * tramo anterior y devolver el rumbo contrario. Buscando en una ventana hacia
 * ADELANTE desde el último progreso conocido, el rumbo sigue la maniobra.
 */
function progressInWindow(
  path: RoutePoint[],
  cum: number[],
  point: RoutePoint,
  lo: number,
  hi: number
): number | null {
  let best: { progress: number; dist: number } | null = null;
  for (let i = 1; i < path.length; i++) {
    if (cum[i] < lo || cum[i - 1] > hi) continue;
    const a = path[i - 1];
    const b = path[i];
    const mx = (point.lng - a.lng) * Math.cos((a.lat * Math.PI) / 180) * 111_320;
    const my = (point.lat - a.lat) * 111_320;
    const sx = (b.lng - a.lng) * Math.cos((a.lat * Math.PI) / 180) * 111_320;
    const sy = (b.lat - a.lat) * 111_320;
    const len2 = sx * sx + sy * sy;
    const t = len2 > 0 ? Math.min(1, Math.max(0, (mx * sx + my * sy) / len2)) : 0;
    const dx = mx - t * sx;
    const dy = my - t * sy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const progress = cum[i - 1] + t * (cum[i] - cum[i - 1]);
    if (progress < lo || progress > hi) continue;
    if (!best || dist < best.dist) best = { progress, dist };
  }
  return best ? best.progress : null;
}

/** Diferencia dirigida y mínima entre dos ángulos: 350° → 5° = +15°. */
function shortestAngleDelta(to: number, from: number): number {
  return ((to - from + 540) % 360) - 180;
}

const ROUTE_ALIGN_TOLERANCE_DEG = 15;
const HEADING_DEVIATION_START_DEG = 25;
const HEADING_DEVIATION_CONFIRM_MS = 1200;
const HEADING_DEVIATION_MIN_SAMPLES = 3;
// Fase 1-C: DEVIATING exige distancia lateral real a la ruta (no basta una
// diferencia de rumbo entre una señal vieja y el segmento). En la traza T1
// el puck iba SOBRE la ruta pero el rumbo viejo (180-199°) difería del
// segmento (97-126°) de forma sostenida → DEVIATING permanente.
const ROUTE_ON_PATH_LATERAL_M = 30;
const ROUTE_DEVIATION_LATERAL_M = 40;
// Límite de velocidad angular del rumbo aceptado (deg/s) y confirmación de
// vuelta en U con dos fuentes independientes (gpsHeading + bearing entre
// ticks dentro de 25°).
const MAX_ANGULAR_RATE_DEG_PER_S = 150;
const UTURN_CONFIRM_TOLERANCE_DEG = 25;

export type DriveHeadingSource =
  | "NONE"
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
    lastResolveTs: number | null;
    /** Progreso (m) sobre la ruta; monótono para no saltar de tramo. */
    routeProgressM: number | null;
    /** Referencia del path con el que se calculó `routeProgressM`. */
    routePathRef: RoutePoint[] | null;
    /** Longitudes acumuladas del path (índice para la ventana de progreso). */
    routeCum: number[] | null;
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
    lastResolveTs: null,
    routeProgressM: null,
    routePathRef: null,
    routeCum: null,
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
      if (state.routePathRef !== path) {
        // Ruta nueva: reanudar el seguimiento de progreso desde cero.
        state.routePathRef = path;
        state.routeProgressM = null;
        state.routeCum = null;
      }
      if (state.routeCum == null) {
        const cum: number[] = [0];
        for (let i = 1; i < path.length; i++) {
          cum.push(cum[i - 1] + haversineMeters(path[i - 1], path[i]));
        }
        state.routeCum = cum;
      }
      // Progreso MONÓTONO en una ventana hacia adelante (ver
      // progressInWindow): evita que la vuelta en U devuelva el rumbo del
      // tramo de ida. Bug real detectado con la traza simulada: la cámara se
      // quedaba 180° al volver sobre la misma calle.
      const prevProgress = state.routeProgressM;
      let driven: number | null;
      if (prevProgress != null) {
        const lo = Math.max(0, prevProgress - 20);
        const hi = Math.min(total, prevProgress + 80);
        driven =
          progressInWindow(path, state.routeCum, vehiclePos, lo, hi) ??
          Math.min(Math.max(projectOntoPath(path, vehiclePos), lo), hi);
      } else {
        driven = Math.min(Math.max(projectOntoPath(path, vehiclePos), 0), total);
      }
      state.routeProgressM = driven;
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
    // El ancla solo avanza cuando se CUMPLE el umbral (antes avanzaba con
    // >1 m, así que a ritmo de caminata el desplazamiento desde el ancla
    // nunca llegaba a 5 m y el bearing entre ticks jamás se actualizaba).
    if (vehiclePos && state.lastGpsTickPos) {
      const tickDist = haversineMeters(state.lastGpsTickPos, vehiclePos);
      const tickElapsed = state.lastGpsTickTs != null ? now - state.lastGpsTickTs : 0;
      if (tickDist >= minMovementMeters && tickElapsed >= minMovementMs) {
        state.gpsTickBearing = bearingBetween(state.lastGpsTickPos, vehiclePos);
        state.tickSpeedMps = tickDist / (tickElapsed / 1000);
        state.lastGpsTickPos = vehiclePos;
        state.lastGpsTickTs = now;
      }
    } else if (vehiclePos) {
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

    // Distancia lateral a la ruta (¿el vehículo está SOBRE ella?).
    const lateralMeters =
      path && path.length >= 2 && vehiclePos
        ? distanceToPathMeters(path, vehiclePos)
        : null;
    const onPath = lateralMeters != null && lateralMeters <= ROUTE_ON_PATH_LATERAL_M;

    // ── Coincidencia GPS vs ruta (histéresis CON distancia lateral) ──
    // Fase 1: DEVIATING solo si hay evidencia de desvío en AMBOS dominios:
    // rumbo que difiere > 25° SOSTENIDO y el vehículo físicamente fuera de
    // la ruta (> 40 m lateral). Una señal de rumbo vieja (p. ej. el curso
    // por posiciones pegado a 180-199° en la traza T1) no basta: estando
    // sobre la ruta, el rumbo se orienta al segmento (bucle de abajo).
    const gpsRef = gpsHeading ?? movementHeading;
    const gpsVsRouteDeltaDeg =
      gpsRef != null && routeHeading != null
        ? Math.abs(shortestAngleDelta(routeHeading, gpsRef))
        : null;

    if (gpsVsRouteDeltaDeg != null && lateralMeters != null) {
      const laterallyOff = lateralMeters > ROUTE_DEVIATION_LATERAL_M;
      if (!state.deviating) {
        if (laterallyOff && gpsVsRouteDeltaDeg > HEADING_DEVIATION_START_DEG) {
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
        if (
          gpsVsRouteDeltaDeg < ROUTE_ALIGN_TOLERANCE_DEG ||
          lateralMeters <= ROUTE_ON_PATH_LATERAL_M
        ) {
          state.deviating = false;
          state.deviationStreak = 0;
          state.deviationStartedAt = null;
        }
      }
    }
    const deviatingForMs =
      state.deviating && state.deviationStartedAt != null ? now - state.deviationStartedAt : 0;

    // ── Selección de fuente por velocidad ──
    // Fase 1-F: con ruta activa la brújula NO influye en cámara ni puck (ni
    // siquiera como adquisición inicial). Además evita depender del permiso
    // de orientación que iOS pide al conducir.
    const hasRoute = Boolean(path && path.length >= 2);
    const compassOk = deviceCompassUsable() && !hasRoute;
    const compassHeading = compassOk ? options.getDeviceHeading().heading : null;

    let heading: number | null = null;
    let source: DriveHeadingSource = "GPS";

    // INVARIANTE DE ORIENTACIÓN: una vez adquirido un rumbo GPS/movimiento
    // confiable, la brújula NUNCA lo sobreescribe. Girar o inclinar el
    // teléfono en la mano no debe rotar la cámara ni el puck. La brújula
    // solo actúa como adquisición inicial (sin rumbo previo) y como
    // respaldo cuando no existe ninguna señal de movimiento.
    const heldHeading = state.acceptedHeading;

    // Sesgo a la ruta: la ruta ESTABILIZA el rumbo (orden de fuentes pedido:
    // 1) curso por posiciones, 2) coords.heading, 3) segmento, 4) último
    // confiable). NO sobreescribe la señal de movimiento: cuando el vehículo
    // vuelve por la misma calle (vuelta en U) la proyección es ambigua y
    // forzarla dejaba la cámara 180° al revés (bug visto en la traza
    // simulada). Solo se aplica cuando ambas señales ya concuerdan, o
    // cuando el desacuerdo es moderado y el vehículo está SOBRE la ruta.
    const applyRouteBias = (h: number): { h: number; viaRoute: boolean } => {
      if (state.deviating || routeHeading == null) return { h, viaRoute: false };
      const d = Math.abs(shortestAngleDelta(routeHeading, h));
      if (d <= ROUTE_ALIGN_TOLERANCE_DEG) {
        return {
          h: normalizeDeg(h + shortestAngleDelta(routeHeading, h) * 0.5),
          viaRoute: true,
        };
      }
      if (onPath && d <= HEADING_DEVIATION_START_DEG) {
        return {
          h: normalizeDeg(h + shortestAngleDelta(routeHeading, h) * 0.5),
          viaRoute: true,
        };
      }
      return { h, viaRoute: false };
    };

    // ── ORDEN DE FUENTES (Fase 1-C) ──
    // 1) curso por POSICIONES (medido, filtrado por consistencia y velocidad);
    // 2) coords.heading, solo mientras hay marcha (iOS lo deja pegado parado)
    //    y solo si CONCUERDA con el curso medido — si discrepan > 20° manda el
    //    curso, porque el `heading` del SO se queda obsoleto (T1: 108.149°
    //    pegado con el vehículo girando).
    // 3) rumbo del segmento de ruta proyectado (estabiliza cuando hay ruta);
    // 4) último rumbo confiable (HELD).
    // En adquisición inicial, y solo sin ruta activa (F/1-F), la brújula
    // puede fijar el primer rumbo; nunca sobreescribe uno ya adquirido.
    const course = movementHeading; // ya validado por lib/drive/speed-heading
    const courseAgreesWithGps =
      course != null &&
      gpsHeading != null &&
      Math.abs(shortestAngleDelta(gpsHeading, course)) <= 20;
    const motionHeading: number | null = course != null
      ? courseAgreesWithGps
        ? normalizeDeg(course + shortestAngleDelta(gpsHeading as number, course) * 0.4)
        : course
      : (gpsHeading ?? state.gpsTickBearing);

    if (speedMps > 0 && motionHeading != null) {
      const biased = applyRouteBias(motionHeading);
      heading = biased.h;
      source = biased.viaRoute
        ? "FOLLOWING_ROUTE"
        : state.deviating
          ? "DEVIATING"
          : course != null
            ? "GPS"
            : "GPS";
      if (biased.viaRoute) {
        // Ruta presente y coherente: queda estabilizado por el segmento.
      } else if (routeHeading != null && !state.deviating) {
        source = "GPS";
      }
    } else if (heldHeading != null) {
      // Sin señal de movimiento fresca: mantener el último rumbo confiable
      // (no dar la cámara a la brújula en pleno desplazamiento).
      heading = heldHeading;
      source = "HELD";
    } else if (gpsHeading != null || state.gpsTickBearing != null) {
      heading = gpsHeading ?? state.gpsTickBearing;
      source = "GPS";
    } else if (compassOk) {
      heading = compassHeading;
      source = "COMPASS_FALLBACK";
    }

    // ── Límite de velocidad angular + vuelta en U confirmada ──
    // Interpolar siempre por el camino más corto ya está en los efectos
    // consumidores; aquí se acota CUÁNTO puede cambiar el rumbo aceptado
    // por llamada (filtro contra saltos). Una vuelta en U (~180°) se
    // acepta solo si DOS fuentes independientes de movimiento (gpsHeading
    // y bearing entre ticks) coinciden entre sí dentro de 25°.
    if (heading != null && state.acceptedHeading != null) {
      const delta = shortestAngleDelta(heading, state.acceptedHeading);
      const dtSec =
        state.lastResolveTs != null
          ? Math.max(0.05, (now - state.lastResolveTs) / 1000)
          : 0.5;
      const maxStep = MAX_ANGULAR_RATE_DEG_PER_S * dtSec;
      if (Math.abs(delta) > maxStep) {
        const uturnConfirmed =
          gpsHeading != null &&
          state.gpsTickBearing != null &&
          Math.abs(
            shortestAngleDelta(gpsHeading, state.gpsTickBearing)
          ) <= UTURN_CONFIRM_TOLERANCE_DEG;
        if (!uturnConfirmed) {
          heading = normalizeDeg(
            state.acceptedHeading + Math.sign(delta) * maxStep
          );
        }
      }
    } else if (heading != null && state.acceptedHeading == null) {
      // Primera adquisición: sin límite.
    }
    state.lastResolveTs = now;

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
      source: heading == null ? "NONE" : source,
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
