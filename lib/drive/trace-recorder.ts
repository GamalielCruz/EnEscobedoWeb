"use client";

/**
 * Grabador de trazas reales de navegación (Fase 0 — solo staging).
 *
 * Captura SIN alterar la lógica de navegación:
 *  - muestras GPS crudas (antes de los filtros del hook), con `accepted`
 *    cuando la app las acepta o descarta y por qué;
 *  - muestreo de cámara a 5 Hz (centro/bearing/zoom, followState, latido
 *    del loop rAF, fuente del resolvedor, brújula) — independiente del loop
 *    de seguimiento, para que grabe también cuando el loop MUERE;
 *  - eventos de mapa (dragstart/rotatestart/zoomstart/…) con su
 *    `originalEvent` (gesto real vs programático);
 *  - transiciones de followState.
 *
 * Buffer circular en memoria (~20 min a 5 Hz + GPS). Exportable a JSON
 * desde el panel de diagnóstico de sensores (staging).
 *
 * Fase 5: además del muestreo a 5 Hz (que no ve las ráfagas de 1 Hz), cada
 * APLICACIÓN de cámara aporta su desplazamiento en px a `perf` (uniformidad:
 * cuadros quietos, media, p95 y paso máximo vs v·dt). Cada exportación lleva
 * `exportedAt` creciente, `sessionStartedAt` y el `build.commit` real.
 *
 * El arnés `scripts/drive-gps-replay.mjs` consume el JSON exportado.
 */

import { BUILD_COMMIT } from "@/lib/drive/build-commit";
import type { SwipeTraceEntry } from "@/lib/drive/swipe-trace";

export type TraceGpsSample = {
  /** Reloj del dispositivo en ms (epoch). */
  t: number;
  /** `GeolocationPosition.timestamp` (cuándo midió el fix el SO). */
  deviceT: number | null;
  lat: number;
  lng: number;
  accuracy: number | null;
  /** `coords.speed` (iOS puede dar null). */
  speed: number | null;
  /** `coords.heading` crudo (iOS puede dar null/-1). */
  heading: number | null;
  /** La app lo aceptó como posición visual. */
  accepted: boolean;
  /** Motivo de descarte (solo cuando accepted=false). */
  rejectedReason?: "accuracy" | "dedupe" | "stale" | "stale-coords";
};

export type TraceCameraSample = {
  t: number;
  centerLat: number | null;
  centerLng: number | null;
  bearing: number | null;
  zoom: number | null;
  followDriver: boolean;
  /** El loop rAF de seguimiento sigue vivo (followRafRef != null). */
  loopAlive: boolean;
  resolverSource: string | null;
  resolvedHeading: number | null;
  visualHeading: number | null;
  /** Velocidad derivada por la página (m/s) o null si aún sin derivar. */
  speedMps: number | null;
  /** Brújula (webkitCompassHeading) si el listener está activo. */
  compassHeading: number | null;
  compassAvailable: string;
  /** Posición del puck en px desde la parte superior del contenedor. */
  puckPxY: number | null;
  /** Posición del puck en px desde la izquierda del contenedor. */
  puckPxX?: number | null;
  /**
   * Fase 6-A2: qué posición se DIBUJÓ en esta muestra. `raw` solo con el A/B
   * «puck GPS crudo» activo; sirve para separar el desfase de POSICIÓN
   * (interpolación) del de RUMBO/render.
   */
  puckSource?: "visual" | "raw" | null;
  /** Fase 6-A1: punta de la flecha (px) calculada desde la posición VISUAL. */
  arrowTipPxX?: number | null;
  arrowTipPxY?: number | null;
  /** Fase 6-A1: punto más cercano de la polilínea a la PUNTA, en pantalla. */
  routeNearestPxX?: number | null;
  routeNearestPxY?: number | null;
  /** Fase 6-A1: desfase en PÍXELES punta de la flecha → polilínea (visual). */
  arrowOffsetPx?: number | null;
  /** Fase 6-A2: misma medición con el GPS CRUDO (sin interpolación). */
  rawPuckPxX?: number | null;
  rawPuckPxY?: number | null;
  rawArrowOffsetPx?: number | null;
  /** Punto más cercano de la ruta activa al puck (null sin ruta). */
  routeNearestLat?: number | null;
  routeNearestLng?: number | null;
  /**
   * Distancia del GPS CRUDO al punto de ruta DEL SENTIDO DE MARCHA (m).
   *
   * Fase 7-D: antes se buscaba en toda la ruta y en una vía con camellón el
   * eje del sentido contrario (a ~12 m) ganaba la búsqueda: el valor medía la
   * separación entre carriles, no el error de posición. Con el filtro de rumbo
   * mide el error real de carril (criterio en dispositivo: ≤4 m).
   */
  routeOffsetMeters?: number | null;
  /** Fase 6-A4: pitch real de la cámara (0 en seguimiento; >0 tras gesto). */
  pitch?: number | null;
  /**
   * Fase 6-A4: escala REAL de pantalla en px por metro, medida con
   * `map.project` de dos puntos separados 10 m junto al puck. No depende de
   * la fórmula de tiles (256 vs 512) ni del pitch: es la referencia para
   * convertir el desfase de píxeles a metros.
   */
  screenPxPerMeter?: number | null;
  /** Fase 6-A4: desfase punta → polilínea en METROS con la escala medida. */
  arrowOffsetMeters?: number | null;
  /**
   * Fase 6-A4: misma distancia puck → ruta buscando SOLO por progreso (tramos
   * vecinos al último índice). Si discrepa de `routeOffsetMeters`, la búsqueda
   * global saltó a otro eje de la misma vía.
   */
  routeOffsetProgressMeters?: number | null;
  /** Fase 6-A4: tramo de la polilínea que da el punto más cercano por progreso. */
  routeNearestSegmentIndex?: number | null;
  /** Fase 7-D: rumbo del tramo de ruta usado como referencia (deg). */
  routeSegmentBearingDeg?: number | null;
  /** Fase 7-D: rumbo del tramo − rumbo resuelto (deg, con signo). */
  routeHeadingDeltaDeg?: number | null;
  /** Fase 7-D: el tramo de referencia va en el sentido de marcha (≤45°). */
  routeSameDirection?: boolean | null;
  /** Fase 7-D: el puck se DIBUJÓ sobre la ruta del sentido (no sobre el GPS). */
  puckRouteSnapped?: boolean | null;
  /** Fase 7-D: distancia del puck DIBUJADO a la ruta del sentido (m). */
  puckRouteOffsetMeters?: number | null;
  /**
   * Fase 7-D: cambios de tramo hacia el sentido contrario RECHAZADOS por el
   * guardián (acumulado en la sesión). Cualquier valor >0 en un tramo recto de
   * vía doble indica que el rumbo y la geometría se contradicen.
   */
  routeOppositeSwitchCount?: number;
  /** Fase 6-A4: global y progreso discrepan >1 m en esta muestra. */
  routeNearestAxisJump?: boolean | null;
  containerHeight: number | null;
  /** Banda visible del mapa (px): borde inferior de la barra superior. */
  visibleTopPx?: number | null;
  /** Banda visible del mapa (px): borde superior del panel inferior. */
  visibleBottomPx?: number | null;
  vehicleLat: number | null;
  vehicleLng: number | null;
};

export type TraceMapEvent = {
  t: number;
  type: string;
  /** true si vino de un gesto real del usuario (Mapbox lo marca). */
  hasOriginalEvent: boolean;
};

/**
 * Conteo de eventos de mapa PROGRAMÁTICOS (Fase 2-D).
 *
 * En T2 hubo 3 452 eventos en 55 s (704 movestart, 341 rotatestart, 89
 * zoomstart + sus exit-check) y todos con hasOriginalEvent=false: guardarlos
 * uno por uno llenaba el buffer de 4 000 y tapaba los gestos reales. Los
 * programáticos se agregan por (tipo, segundo); los gestos reales y las
 * transiciones de follow/etapa se guardan completos.
 */
export type TraceProgrammaticCount = {
  /** Inicio del segundo (ms epoch) al que pertenece el conteo. */
  t: number;
  type: string;
  count: number;
};

/** Guarda de anclaje (Fase 2-A): el puck medido se desvió del ancla >5 %. */
export type TraceAnchorMismatchEvent = {
  t: number;
  kind: "anchor-mismatch";
  /** Y del puck (px desde el borde superior del contenedor). */
  puckPxY: number;
  /** Y del ancla esperada (px desde el borde superior del contenedor). */
  anchorPxY: number;
  /** Desviación como fracción de la altura del contenedor. */
  deviationFraction: number;
  /** Cuánto duró la desviación antes de registrarse (ms). */
  lastsForMs: number;
  paddingTop: number;
  paddingBottom: number;
};

export type TraceFollowEvent = {
  t: number;
  kind: "follow";
  followDriver: boolean;
  navigatingWithRoute: boolean;
};

/**
 * Transición de etapa de navegación (Fase 1-D). "Comienza tu viaje" no cambia
 * de lógica: solo se registra el paso y la distancia a la próxima maniobra en
 * cada transición, para diagnosticar cuándo deja de mostrarse.
 */
export type TracePhaseEvent = {
  t: number;
  kind: "phase";
  phase: string;
  /** Distancia a la próxima maniobra (m) o null si no aplica. */
  distanceToManeuverM: number | null;
  /** Índice del paso activo de la ruta (Fase 2-D). */
  stepIndex: number | null;
  /** Tipo de maniobra del paso activo (turn/uturn/arrive/...). */
  maneuverType: string | null;
  /** Instrucción visible en la tarjeta superior. */
  instruction: string | null;
  /**
   * Fase 6-A3: ¿hubo un fix con accuracy ≤ 20 m en los últimos 5 s? Sin ese
   * fix la posición visual (y por tanto la guía) no avanza.
   */
  fixWithin20mRecent?: boolean | null;
  /** Fase 6-A3: ms desde el último fix ≤20 m (null si aún no hubo). */
  msSinceFix20m?: number | null;
  /** Fase 6-A3: la recolección ya se confirmó desde la UI (deslizador). */
  pickupConfirmed?: boolean | null;
  /** Tipo de pedido de la etapa (auditoría del deslizador). */
  serviceKind?: string | null;
};

/**
 * Fluidez del loop de cámara (Fase 3-C): por segundo, el intervalo de rAF
 * (p50/p95/máx), las aplicaciones de cámara y los eventos `render` de Mapbox.
 * La traza T4 no traía nada de esto: con el video a 60 fps se veían 27/60 y
 * 18/60 cuadros con cambio, pero no se sabía si el cuello era el loop, Mapbox
 * o el hilo principal.
 */
export type TracePerfBucket = {
  /** Inicio del segundo (ms epoch). */
  t: number;
  /** Cuadros de rAF del loop en ese segundo. */
  frames: number;
  /** p50/p95/máx del intervalo entre cuadros (ms). */
  rafP50Ms: number | null;
  rafP95Ms: number | null;
  rafMaxMs: number | null;
  /** Aplicaciones de cámara (jumpTo del controlador) en el segundo. */
  cameraApplies: number;
  /** Eventos `render` de Mapbox en el segundo. */
  mapRenders: number;
  /** Fase 4-D: límite de aplicación de cámara activo (16 o 33 ms). */
  cameraIntervalMs: number;
  /**
   * Fase 5-B: uniformidad por aplicación de cámara, SOLO con v ≥ 3 m/s.
   * El muestreo de cámara a 5 Hz no veía las ráfagas (una de 250 ms cabe
   * dentro de una muestra): estas cifras salen de CADA aplicación del loop.
   */
  movingApplies: number;
  /** Aplicaciones con desplazamiento visual ≈0 px (v ≥ 3 m/s). */
  stillApplies: number;
  /** Fracción de cuadros quietos (criterio en dispositivo: ≤10 %). */
  stillFraction: number | null;
  /** Desplazamiento medio por aplicación (px). */
  movePxMean: number | null;
  movePxP95: number | null;
  movePxMax: number | null;
  /** Paso esperado medio v·dt (px) y máximo/esperado (criterio ≤2). */
  expectedStepPxMean: number | null;
  maxStepRatio: number | null;
};

/**
 * Cronología de arranque (Fase 4-C). Se recogen las marcas y medidas
 * `performance` con prefijo `drive:`: montaje, solicitud/listo de estilo,
 * solicitud/listo de ruta, primer render de Mapbox, primer cuadro del loop,
 * semilla GPS y primer fix bueno. Permite saber qué ocupa los 3–5 s del
 * primer segundo (T6/T7) en vez de atribuirlo a «Mapbox».
 */
export type TraceTimings = {
  marks: Array<{ name: string; startTime: number }>;
  measures: Array<{ name: string; startTime: number; duration: number }>;
};

/**
 * Tarjeta RENDERIZADA (Fase 3-D): lo que el repartidor ve, no lo que calcula
 * guidance. Se registra en cada cambio del texto o de la distancia mostrada
 * para poder comparar «en 360 m» con la distancia real a la maniobra.
 */
export type TraceCardEvent = {
  t: number;
  kind: "card";
  instruction: string | null;
  distanceLabel: string | null;
  /** Distancia numérica RENDERIZADA (m), derivada de distanceLabel. */
  shownDistanceM: number | null;
  maneuver: string | null;
  /** Metros reales hasta la maniobra según la ruta (contraste). */
  realDistanceToManeuverM: number | null;
};

export type TraceEvent =
  | TraceMapEvent
  | TraceFollowEvent
  | TracePhaseEvent
  | TraceAnchorMismatchEvent
  | TraceCardEvent;

/**
 * Ruta ACTIVA en el momento de exportar (Fase 3.1-E).
 *
 * Las trazas T1/T2/T4 no traían la polilínea ni los steps, así que la
 * tarjeta (guidance) no podía reproducirse con la ruta REAL: solo con la
 * geometría inventada del simulador. Con este bloque el arnés recalcula la
 * tarjeta muestra a muestra. La geometría se decima a `MAX_TRACE_PATH_POINTS`
 * para no inflar el JSON (conserva primero, último y cada salto de stride).
 */
export type TraceRouteSnapshot = {
  destination: { lat: number; lng: number };
  distanceMeters: number | null;
  durationSeconds: number | null;
  steps: Array<{
    maneuver: string | null;
    instruction: string | null;
    distanceMeters: number;
    start: { lat: number; lng: number };
    end: { lat: number; lng: number };
  }>;
  path: Array<{ lat: number; lng: number }>;
};

const MAX_TRACE_PATH_POINTS = 1500;

function decimatePath(path: Array<{ lat: number; lng: number }>) {
  if (path.length <= MAX_TRACE_PATH_POINTS) {
    return path.map((p) => ({ lat: p.lat, lng: p.lng }));
  }
  const stride = Math.ceil(path.length / MAX_TRACE_PATH_POINTS);
  const out: Array<{ lat: number; lng: number }> = [];
  for (let i = 0; i < path.length; i += stride) {
    out.push({ lat: path[i].lat, lng: path[i].lng });
  }
  const last = path[path.length - 1];
  const tail = out[out.length - 1];
  if (!tail || tail.lat !== last.lat || tail.lng !== last.lng) {
    out.push({ lat: last.lat, lng: last.lng });
  }
  return out;
}

/**
 * Punto más cercano de una polilínea a (lat, lng), en metros de distancia.
 * Proyección local equirectangular: exacta a la escala de una ruta urbana.
 */
type PathPoint = { lat: number; lng: number };

/** Proyector local equirectangular centrado en (lat, lng), en metros. */
function localProjector(lat: number, lng: number) {
  const kLng = Math.cos((lat * Math.PI) / 180) * 111_320;
  const kLat = 110_540;
  return (p: PathPoint) => ({
    x: (p.lng - lng) * kLng,
    y: (p.lat - lat) * kLat,
  });
}

/** Proyección del origen sobre el tramo `i` (path[i] → path[i+1]). */
function projectOnSegment(
  path: ReadonlyArray<PathPoint>,
  i: number,
  toXY: (p: PathPoint) => { x: number; y: number }
) {
  const a = toXY(path[i]);
  const b = toXY(path[i + 1]);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, -(a.x * dx + a.y * dy) / len2));
  const x = a.x + dx * t;
  const y = a.y + dy * t;
  return {
    d2: x * x + y * y,
    lat: path[i].lat + (path[i + 1].lat - path[i].lat) * t,
    lng: path[i].lng + (path[i + 1].lng - path[i].lng) * t,
  };
}

export function nearestPointOnPath(
  path: ReadonlyArray<PathPoint>,
  lat: number,
  lng: number
): { lat: number; lng: number; distanceMeters: number } | null {
  if (path.length === 0) return null;
  const toXY = localProjector(lat, lng);
  if (path.length === 1) {
    const a = toXY(path[0]);
    return {
      lat: path[0].lat,
      lng: path[0].lng,
      distanceMeters: Math.sqrt(a.x * a.x + a.y * a.y),
    };
  }
  let best: { lat: number; lng: number; distanceMeters: number } | null = null;
  let bestD2 = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const p = projectOnSegment(path, i, toXY);
    if (best == null || p.d2 < bestD2) {
      bestD2 = p.d2;
      best = {
        lat: p.lat,
        lng: p.lng,
        distanceMeters: Math.sqrt(p.d2),
      };
    }
  }
  return best;
}

export type PathProgressHit = PathPoint & {
  distanceMeters: number;
  /** Índice del tramo (path[i] → path[i+1]) que contiene el punto. */
  segmentIndex: number;
};

/**
 * Punto más cercano de la polilínea buscando SOLO por progreso.
 *
 * `nearestPointOnPath` recorre TODA la ruta: cuando la vía tiene dos ejes
 * (ida y vuelta) a ~12 m, el mínimo global puede caer en el eje contrario y
 * la distancia salta de 9.5 m a 2.8 m sin que el vehículo se mueva (traza del
 * 23-11, t=125.4 s). Esta búsqueda se limita a los tramos vecinos al último
 * índice conocido, que es el criterio del avance real sobre la ruta.
 *
 * Con `prevSegmentIndex == null` explora toda la ruta (primera muestra).
 */
export function nearestPointOnPathByProgress(
  path: ReadonlyArray<PathPoint>,
  lat: number,
  lng: number,
  prevSegmentIndex: number | null,
  behindSegments = 8,
  aheadSegments = 16
): PathProgressHit | null {
  if (path.length === 0) return null;
  const toXY = localProjector(lat, lng);
  if (path.length === 1) {
    const a = toXY(path[0]);
    return {
      lat: path[0].lat,
      lng: path[0].lng,
      distanceMeters: Math.sqrt(a.x * a.x + a.y * a.y),
      segmentIndex: 0,
    };
  }
  const lastSegment = path.length - 2;
  const from =
    prevSegmentIndex == null ? 0 : Math.max(0, prevSegmentIndex - Math.max(0, behindSegments));
  const to =
    prevSegmentIndex == null
      ? lastSegment
      : Math.min(lastSegment, prevSegmentIndex + Math.max(0, aheadSegments));
  let best: PathProgressHit | null = null;
  let bestD2 = Infinity;
  for (let i = from; i <= to; i++) {
    const p = projectOnSegment(path, i, toXY);
    if (best == null || p.d2 < bestD2) {
      bestD2 = p.d2;
      best = {
        lat: p.lat,
        lng: p.lng,
        distanceMeters: Math.sqrt(p.d2),
        segmentIndex: i,
      };
    }
  }
  return best;
}

export type TraceExport = {
  format: "drive-trace/v1";
  exportedAt: string;
  /**
   * Inicio de ESTA sesión de grabación (montaje de la página). Dos trazas con
   * el mismo `exportedAt` o el mismo `sessionStartedAt` son la MISMA
   * exportación: el video de la Fase 5 llegó con un JSON idéntico (mismo md5
   * y exportedAt 12:41:28Z) a la exportación anterior, una hora antes.
   */
  sessionStartedAt: string;
  userAgent: string;
  /** Build que se estaba sirviendo (Fase 3.1-E): hash del commit. */
  build?: { commit: string };
  gps: TraceGpsSample[];
  camera: TraceCameraSample[];
  events: TraceEvent[];
  /** Eventos programáticos agregados por (tipo, segundo) — Fase 2-D. */
  programmaticEvents?: TraceProgrammaticCount[];
  /** Fluidez por segundo (rAF, cámaras aplicadas, renders de Mapbox). */
  perf?: TracePerfBucket[];
  /**
   * Deslizador "desliza para confirmar" (auditoría): montajes, puntero,
   * cancelaciones, fin del gesto con % y resultado de la acción.
   */
  swipe?: SwipeTraceEntry[];
  /** Ruta activa (polilínea + steps) al exportar — Fase 3.1-E. */
  route?: TraceRouteSnapshot | null;
  /** Cronología de arranque (Fase 4-C). */
  timings?: TraceTimings;
};

const MAX_GPS = 12_000;
const MAX_CAMERA = 12_000;
const MAX_EVENTS = 4_000;
const MAX_PROGRAMMATIC = 2_000;
/** Filas de la traza del deslizador (un gesto son ~10–40). */
const MAX_SWIPE = 600;
/** Intervalos de rAF guardados por segundo (60 fps sobra; acota la memoria). */
const MAX_RAF_INTERVALS = 128;
/** Desplazamientos por aplicación guardados por segundo (acota la memoria). */
const MAX_MOVE_SAMPLES = 128;
/**
 * Debajo de esto (px) el cuadro se considera SIN desplazamiento visual. Es un
 * umbral sub-píxel (0.02 px): en el video se contaban píxeles enteros, aquí se
 * mide el centro real de Mapbox y un paso de 3 m/s a 60 Hz son ~0.15 px, que
 * NO es un cuadro quieto.
 */
export const STILL_FRAME_PX = 0.02;
/** Por debajo de esta velocidad no se evalúa la uniformidad (m/s). */
export const UNIFORMITY_MIN_SPEED_MPS = 3;

export class TraceRecorder {
  private gps: TraceGpsSample[] = [];
  private camera: TraceCameraSample[] = [];
  private events: TraceEvent[] = [];
  private swipeEntries: SwipeTraceEntry[] = [];
  private programmaticByKey = new Map<string, TraceProgrammaticCount>();
  /** Por segundo: conteos + intervalos de rAF (máx. 128 por segundo). */
  private perfBySecond = new Map<
    number,
    {
      frames: number;
      cameraApplies: number;
      mapRenders: number;
      intervals: number[];
      cameraIntervalMs: number;
      /** Fase 5-B: aplicaciones con v≥3 m/s (px desplazados y esperados). */
      movingMovedPx: number[];
      movingExpectedPx: number[];
      stillApplies: number;
    }
  >();
  /** Sello de la última exportación (ms) para que `exportedAt` no se repita. */
  private lastExportedAtMs = 0;
  readonly startedAt = Date.now();
  /** Última ruta activa (se reemplaza al recalcular; null sin navegación). */
  private routeSnapshot: TraceRouteSnapshot | null = null;
  /** Fase 4-D: intervalo de aplicación de cámara vigente (33 ms por defecto). */
  private cameraIntervalMs = 33;

  constructor() {
    this.mark("recorder-start");
  }

  /** Marca `performance` con el prefijo que recoge `timings` al exportar. */
  mark(name: string): void {
    if (typeof performance === "undefined" || typeof performance.mark !== "function") return;
    try {
      performance.mark(`drive:${name}`);
    } catch {
      /* performance no disponible */
    }
  }

  /** Fase 4-D: configura el límite de aplicación de cámara (solo staging). */
  setCameraInterval(intervalMs: number): void {
    if (intervalMs === 16 || intervalMs === 33) this.cameraIntervalMs = intervalMs;
  }

  private static collectTimings(): TraceTimings | undefined {
    if (typeof performance === "undefined" || typeof performance.getEntriesByType !== "function") {
      return undefined;
    }
    const prefix = "drive:";
    const marks = performance
      .getEntriesByType("mark")
      .filter((e) => e.name.startsWith(prefix))
      .map((e) => ({ name: e.name, startTime: e.startTime }));
    const measures = performance
      .getEntriesByType("measure")
      .filter((e) => e.name.startsWith(prefix))
      .map((e) => ({ name: e.name, startTime: e.startTime, duration: e.duration }));
    return { marks, measures };
  }

  /**
   * Ruta activa para la exportación (Fase 3.1-E). Se llama al cambiar
   * `roadRoute`; no se guarda historia (solo la vigente al exportar).
   */
  setRoute(
    route: {
      destination: { lat: number; lng: number };
      distanceMeters: number | null;
      durationSeconds: number | null;
      steps: Array<{
        maneuver?: string | null;
        instruction?: string | null;
        distanceMeters: number;
        start: { lat: number; lng: number };
        end: { lat: number; lng: number };
      }>;
      path: Array<{ lat: number; lng: number }>;
    } | null
  ): void {
    if (!route) {
      this.routeSnapshot = null;
      return;
    }
    this.routeSnapshot = {
      destination: { lat: route.destination.lat, lng: route.destination.lng },
      distanceMeters: route.distanceMeters,
      durationSeconds: route.durationSeconds,
      steps: route.steps.map((s) => ({
        maneuver: s.maneuver ?? null,
        instruction: s.instruction ?? null,
        distanceMeters: s.distanceMeters,
        start: { lat: s.start.lat, lng: s.start.lng },
        end: { lat: s.end.lat, lng: s.end.lng },
      })),
      path: decimatePath(route.path),
    };
  }

  recordGps(sample: TraceGpsSample): void {
    this.gps.push(sample);
    if (this.gps.length > MAX_GPS) this.gps.splice(0, this.gps.length - MAX_GPS);
  }

  recordCamera(sample: TraceCameraSample): void {
    this.camera.push(sample);
    if (this.camera.length > MAX_CAMERA)
      this.camera.splice(0, this.camera.length - MAX_CAMERA);
  }

  /**
   * Evento de mapa. Los PROGRAMÁTICOS se agregan (tipo, segundo) para no
   * inundar el buffer; los gestos reales se guardan uno por uno.
   */
  recordMapEvent(type: string, hasOriginalEvent: boolean): void {
    const t = Date.now();
    if (hasOriginalEvent) {
      this.events.push({ t, type, hasOriginalEvent });
      if (this.events.length > MAX_EVENTS)
        this.events.splice(0, this.events.length - MAX_EVENTS);
      return;
    }
    // Clave por (tipo, segundo): el orden de llegada alterna tipos
    // (movestart, movestart:exit-check, moveend, rotatestart…), así que agrupar
    // solo contra la última fila creaba una fila por evento (T3: 2 000 filas
    // para 2 000 eventos, justo el tope del buffer).
    const bucket = Math.floor(t / 1000) * 1000;
    const key = `${type}@${bucket}`;
    const row = this.programmaticByKey.get(key);
    if (row) {
      row.count += 1;
      return;
    }
    if (this.programmaticByKey.size >= MAX_PROGRAMMATIC) {
      const oldest = this.programmaticByKey.keys().next().value;
      if (oldest != null) this.programmaticByKey.delete(oldest);
    }
    this.programmaticByKey.set(key, { t: bucket, type, count: 1 });
  }

  /**
   * Fluidez (Fase 3-C): un intervalo de rAF del loop de cámara. Clave por
   * segundo; los intervalos se guardan para calcular p50/p95/máx al exportar.
   */
  recordRafInterval(intervalMs: number): void {
    if (!Number.isFinite(intervalMs) || intervalMs < 0) return;
    const row = this.perfRow(this.currentSecond());
    row.frames += 1;
    if (row.intervals.length < MAX_RAF_INTERVALS) row.intervals.push(intervalMs);
  }

  /**
   * Una aplicación de cámara (jumpTo del controlador) en el segundo actual.
   * Fase 5-B: con `sample` y v ≥ 3 m/s se acumula la uniformidad por cuadro.
   */
  recordCameraApply(sample?: {
    movedPx: number;
    speedMps: number;
    expectedStepPx: number;
  }): void {
    const row = this.perfRow(this.currentSecond());
    row.cameraApplies += 1;
    if (!sample || !Number.isFinite(sample.movedPx)) return;
    if (sample.speedMps < UNIFORMITY_MIN_SPEED_MPS) return;
    if (sample.movedPx < STILL_FRAME_PX) row.stillApplies += 1;
    if (row.movingMovedPx.length < MAX_MOVE_SAMPLES) {
      row.movingMovedPx.push(sample.movedPx);
      row.movingExpectedPx.push(
        Number.isFinite(sample.expectedStepPx) ? sample.expectedStepPx : 0
      );
    }
  }

  /** Un evento `render` de Mapbox en el segundo actual. */
  recordMapRender(): void {
    this.perfRow(this.currentSecond()).mapRenders += 1;
  }

  private currentSecond(): number {
    return Math.floor(Date.now() / 1000) * 1000;
  }

  private perfRow(bucket: number) {
    let row = this.perfBySecond.get(bucket);
    if (!row) {
      row = {
        frames: 0,
        cameraApplies: 0,
        mapRenders: 0,
        intervals: [],
        cameraIntervalMs: this.cameraIntervalMs,
        movingMovedPx: [],
        movingExpectedPx: [],
        stillApplies: 0,
      };
      if (this.perfBySecond.size >= 3_600) {
        const oldest = this.perfBySecond.keys().next().value;
        if (oldest != null) this.perfBySecond.delete(oldest);
      }
      this.perfBySecond.set(bucket, row);
    }
    return row;
  }

  /**
   * Tarjeta renderizada (Fase 3-D): se llama cuando cambia lo que se ve.
   */
  recordCard(event: Omit<TraceCardEvent, "t" | "kind">): void {
    this.events.push({ t: Date.now(), kind: "card", ...event });
    if (this.events.length > MAX_EVENTS)
      this.events.splice(0, this.events.length - MAX_EVENTS);
  }

  /** Guarda de anclaje: el puck se desvió >5 % de la altura durante >2 s. */
  recordAnchorMismatch(event: Omit<TraceAnchorMismatchEvent, "t" | "kind">): void {
    this.events.push({ t: Date.now(), kind: "anchor-mismatch", ...event });
    if (this.events.length > MAX_EVENTS)
      this.events.splice(0, this.events.length - MAX_EVENTS);
  }

  /**
   * Deslizador de confirmación: un evento ya normalizado por
   * `lib/drive/swipe-trace.ts`. Nunca cambia la lógica del control.
   */
  recordSwipe(entry: SwipeTraceEntry): void {
    this.swipeEntries.push(entry);
    if (this.swipeEntries.length > MAX_SWIPE)
      this.swipeEntries.splice(0, this.swipeEntries.length - MAX_SWIPE);
  }

  recordFollow(followDriver: boolean, navigatingWithRoute: boolean): void {
    this.events.push({ t: Date.now(), kind: "follow", followDriver, navigatingWithRoute });
    if (this.events.length > MAX_EVENTS)
      this.events.splice(0, this.events.length - MAX_EVENTS);
  }

  recordPhase(
    phase: string,
    distanceToManeuverM: number | null,
    context?: {
      stepIndex?: number | null;
      maneuverType?: string | null;
      instruction?: string | null;
      fixWithin20mRecent?: boolean | null;
      msSinceFix20m?: number | null;
      pickupConfirmed?: boolean | null;
      /** Tipo de pedido (la recolección de restaurante no tiene acción). */
      serviceKind?: string | null;
    }
  ): void {
    this.events.push({
      t: Date.now(),
      kind: "phase",
      phase,
      distanceToManeuverM,
      stepIndex: context?.stepIndex ?? null,
      maneuverType: context?.maneuverType ?? null,
      instruction: context?.instruction ?? null,
      fixWithin20mRecent: context?.fixWithin20mRecent ?? null,
      msSinceFix20m: context?.msSinceFix20m ?? null,
      pickupConfirmed: context?.pickupConfirmed ?? null,
      serviceKind: context?.serviceKind ?? null,
    });
    if (this.events.length > MAX_EVENTS)
      this.events.splice(0, this.events.length - MAX_EVENTS);
  }

  counts(): { gps: number; camera: number; events: number } {
    return { gps: this.gps.length, camera: this.camera.length, events: this.events.length };
  }

  clear(): void {
    this.gps = [];
    this.camera = [];
    this.events = [];
    this.swipeEntries = [];
    this.programmaticByKey.clear();
    this.perfBySecond.clear();
  }

  /** Fluidez agregada por segundo (p50/p95/máx del intervalo de rAF). */
  perfBuckets(): TracePerfBucket[] {
    const percentile = (sorted: number[], q: number): number | null =>
      sorted.length === 0
        ? null
        : sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))];
    return [...this.perfBySecond.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([t, row]) => {
        const sorted = [...row.intervals].sort((a, b) => a - b);
        const moving = row.movingMovedPx.length;
        const sortedPx = [...row.movingMovedPx].sort((a, b) => a - b);
        const mean =
          moving > 0
            ? row.movingMovedPx.reduce((a, b) => a + b, 0) / moving
            : null;
        const maxPx = sortedPx.length ? sortedPx[sortedPx.length - 1] : null;
        const expectedMean =
          moving > 0
            ? row.movingExpectedPx.reduce((a, b) => a + b, 0) / moving
            : null;
        // Relación de CADA cuadro con su paso esperado v·dt (no con la media
        // del segundo): un cambio de velocidad dentro del segundo no infla la
        // métrica.
        let maxStepRatio: number | null = null;
        for (let i = 0; i < row.movingMovedPx.length; i++) {
          const expected = row.movingExpectedPx[i] ?? 0;
          if (expected < 0.02) continue;
          const ratio = row.movingMovedPx[i] / expected;
          if (maxStepRatio == null || ratio > maxStepRatio) maxStepRatio = ratio;
        }
        return {
          t,
          frames: row.frames,
          rafP50Ms: percentile(sorted, 0.5),
          rafP95Ms: percentile(sorted, 0.95),
          rafMaxMs: sorted.length ? sorted[sorted.length - 1] : null,
          cameraApplies: row.cameraApplies,
          mapRenders: row.mapRenders,
          cameraIntervalMs: row.cameraIntervalMs,
          movingApplies: moving,
          stillApplies: row.stillApplies,
          stillFraction: moving > 0 ? row.stillApplies / moving : null,
          movePxMean: mean,
          movePxP95: percentile(sortedPx, 0.95),
          movePxMax: maxPx,
          expectedStepPxMean: expectedMean,
          maxStepRatio,
        };
      });
  }

  /**
   * Hash del build en curso. `lib/drive/build-commit.ts` se reescribe con el
   * hash real antes de `next build` (el build lo restaura al terminar), porque
   * `process.env.NEXT_PUBLIC_*` no se inlinea en este bundle de cliente: se
   * resolvía al shim de `process` con `env` vacío y `build.commit` seguía
   * saliendo 'unknown'.
   */
  static buildCommit(): string {
    const commit =
      typeof BUILD_COMMIT === "string" && BUILD_COMMIT.length > 0
        ? BUILD_COMMIT
        : "";
    return commit || process.env.NEXT_PUBLIC_BUILD_COMMIT || "unknown";
  }

  /**
   * `exportedAt` ESTRICTAMENTE creciente aunque se pulse dos veces en el mismo
   * milisegundo: dos exportaciones nunca pueden compartir sello (el md5 de dos
   * trazas idénticas ya no puede confundir dos grabaciones distintas).
   */
  private nextExportedAt(): string {
    const ms = Math.max(Date.now(), this.lastExportedAtMs + 1);
    this.lastExportedAtMs = ms;
    return new Date(ms).toISOString();
  }

  toJSON(): TraceExport {
    return {
      format: "drive-trace/v1",
      exportedAt: this.nextExportedAt(),
      sessionStartedAt: new Date(this.startedAt).toISOString(),
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      build: { commit: TraceRecorder.buildCommit() },
      gps: this.gps,
      camera: this.camera,
      events: this.events,
      programmaticEvents: [...this.programmaticByKey.values()].sort((a, b) => a.t - b.t),
      perf: this.perfBuckets(),
      swipe: this.swipeEntries,
      route: this.routeSnapshot,
      timings: TraceRecorder.collectTimings(),
    };
  }

  /** Nombre con fecha y hora LOCAL: dos exportaciones no se sobrescriben. */
  static defaultFilename(now = new Date()): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    return (
      "drive-trace-" +
      `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
      `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.json`
    );
  }

  /**
   * Descarga la traza. CADA llamada construye un Blob NUEVO con su propio
   * `exportedAt` (y nombre con fecha/hora): el archivo exportado justo después
   * de una grabación no puede ser el de una sesión anterior.
   */
  exportDownload(filename?: string): void {
    if (typeof document === "undefined") return;
    const blob = new Blob([JSON.stringify(this.toJSON())], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename ?? TraceRecorder.defaultFilename();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5_000);
  }
}
