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
 * El arnés `scripts/drive-trace-replay.js` consume el JSON exportado.
 */

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
  rejectedReason?: "accuracy" | "dedupe" | "stale";
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

export type TraceExport = {
  format: "drive-trace/v1";
  exportedAt: string;
  userAgent: string;
  gps: TraceGpsSample[];
  camera: TraceCameraSample[];
  events: TraceEvent[];
  /** Eventos programáticos agregados por (tipo, segundo) — Fase 2-D. */
  programmaticEvents?: TraceProgrammaticCount[];
  /** Fluidez por segundo (rAF, cámaras aplicadas, renders de Mapbox). */
  perf?: TracePerfBucket[];
};

const MAX_GPS = 12_000;
const MAX_CAMERA = 12_000;
const MAX_EVENTS = 4_000;
const MAX_PROGRAMMATIC = 2_000;
/** Intervalos de rAF guardados por segundo (60 fps sobra; acota la memoria). */
const MAX_RAF_INTERVALS = 128;

export class TraceRecorder {
  private gps: TraceGpsSample[] = [];
  private camera: TraceCameraSample[] = [];
  private events: TraceEvent[] = [];
  private programmaticByKey = new Map<string, TraceProgrammaticCount>();
  /** Por segundo: conteos + intervalos de rAF (máx. 128 por segundo). */
  private perfBySecond = new Map<
    number,
    {
      frames: number;
      cameraApplies: number;
      mapRenders: number;
      intervals: number[];
    }
  >();
  readonly startedAt = Date.now();

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

  /** Una aplicación de cámara (jumpTo del controlador) en el segundo actual. */
  recordCameraApply(): void {
    this.perfRow(this.currentSecond()).cameraApplies += 1;
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
      row = { frames: 0, cameraApplies: 0, mapRenders: 0, intervals: [] };
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
        return {
          t,
          frames: row.frames,
          rafP50Ms: percentile(sorted, 0.5),
          rafP95Ms: percentile(sorted, 0.95),
          rafMaxMs: sorted.length ? sorted[sorted.length - 1] : null,
          cameraApplies: row.cameraApplies,
          mapRenders: row.mapRenders,
        };
      });
  }

  toJSON(): TraceExport {
    return {
      format: "drive-trace/v1",
      exportedAt: new Date().toISOString(),
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      gps: this.gps,
      camera: this.camera,
      events: this.events,
      programmaticEvents: [...this.programmaticByKey.values()].sort((a, b) => a.t - b.t),
      perf: this.perfBuckets(),
    };
  }

  exportDownload(filename = "drive-trace.json"): void {
    if (typeof document === "undefined") return;
    const blob = new Blob([JSON.stringify(this.toJSON())], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5_000);
  }
}
