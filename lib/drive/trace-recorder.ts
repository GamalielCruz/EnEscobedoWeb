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

export type TraceEvent =
  | TraceMapEvent
  | TraceFollowEvent
  | TracePhaseEvent
  | TraceAnchorMismatchEvent;

export type TraceExport = {
  format: "drive-trace/v1";
  exportedAt: string;
  userAgent: string;
  gps: TraceGpsSample[];
  camera: TraceCameraSample[];
  events: TraceEvent[];
  /** Eventos programáticos agregados por (tipo, segundo) — Fase 2-D. */
  programmaticEvents?: TraceProgrammaticCount[];
};

const MAX_GPS = 12_000;
const MAX_CAMERA = 12_000;
const MAX_EVENTS = 4_000;
const MAX_PROGRAMMATIC = 2_000;

export class TraceRecorder {
  private gps: TraceGpsSample[] = [];
  private camera: TraceCameraSample[] = [];
  private events: TraceEvent[] = [];
  private programmatic: TraceProgrammaticCount[] = [];
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
    const bucket = Math.floor(t / 1000) * 1000;
    const last = this.programmatic[this.programmatic.length - 1];
    if (last && last.type === type && last.t === bucket) {
      last.count += 1;
    } else {
      this.programmatic.push({ t: bucket, type, count: 1 });
      if (this.programmatic.length > MAX_PROGRAMMATIC)
        this.programmatic.splice(0, this.programmatic.length - MAX_PROGRAMMATIC);
    }
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
    this.programmatic = [];
  }

  toJSON(): TraceExport {
    return {
      format: "drive-trace/v1",
      exportedAt: new Date().toISOString(),
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      gps: this.gps,
      camera: this.camera,
      events: this.events,
      programmaticEvents: this.programmatic,
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
