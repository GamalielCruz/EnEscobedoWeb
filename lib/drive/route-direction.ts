/**
 * Proyección POSICIÓN + RUMBO sobre la ruta (Fase 7) — puro, sin React/Mapbox.
 *
 * Bug real (traza del 23-11, build b4eade28): en una vía con camellón el
 * `routeOffsetMeters` subía de ~5 m a ~13 m y se quedaba 20 s ahí mientras el
 * rumbo resuelto era estable en 228–230°. El punto más cercano se buscaba en
 * TODA la ruta: los dos sentidos de la vía son casi paralelos a ~12 m, así que
 * el eje del sentido contrario ganaba cuando el GPS quedaba más cerca de él.
 * Consecuencia: el puck y la flecha se dibujaban con la referencia de posición
 * equivocada (la del carril de vuelta), no sobre su carril.
 *
 * Este módulo da una única referencia de ruta para puck, cámara y traza:
 *  - un tramo candidato solo vale si su rumbo está a ≤45° del rumbo resuelto;
 *  - la búsqueda se limita a una ventana alrededor del último tramo aceptado y,
 *    si dentro de la ventana no hay ningún tramo del sentido de marcha, se
 *    reintenta globalmente CON el mismo filtro de rumbo;
 *  - el fallback por distancia lateral (sin filtro) solo se usa cuando no hay
 *    rumbo fiable o no existe ningún tramo del mismo sentido;
 *  - un cambio a un tramo de sentido contrario (>90° respecto al último
 *    aceptado) no se acepta hasta que el progreso avance de forma consistente
 *    durante `ROUTE_OPPOSITE_CONFIRM_MS` (protege la vuelta en U real sin
 *    permitir saltos por ruido).
 */

import { bearingBetween, haversineMeters, type RoutePoint } from "@/lib/dispatch/routing";

/** Diferencia máxima (deg) entre el rumbo del tramo y el rumbo resuelto. */
export const ROUTE_DIRECTION_MATCH_DEG = 45;
/** A partir de esta diferencia (deg) el tramo es del SENTIDO contrario. */
export const ROUTE_OPPOSITE_DEG = 90;
/** Progreso consistente exigido para aceptar un cambio de sentido (>90°). */
export const ROUTE_OPPOSITE_CONFIRM_MS = 3_000;
/** Distancia lateral máxima (m) para dibujar el puck sobre la ruta. */
export const ROUTE_SNAP_MAX_LATERAL_M = 15;

/** Diferencia dirigida y mínima entre dos ángulos: 350° → 5° = +15°. */
export function angleDeltaDeg(to: number, from: number): number {
  return ((to - from + 540) % 360) - 180;
}

function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

const cumulativeCache = new WeakMap<RoutePoint[], Float64Array>();

function cumulativeLengths(path: RoutePoint[]): Float64Array {
  let cached = cumulativeCache.get(path);
  if (cached && cached.length === path.length) return cached;
  cached = new Float64Array(path.length);
  for (let i = 1; i < path.length; i++) {
    cached[i] = cached[i - 1] + haversineMeters(path[i - 1], path[i]);
  }
  cumulativeCache.set(path, cached);
  return cached;
}

/** Proyección del punto sobre el tramo `i` (path[i-1] → path[i]). */
type SegmentProjection = {
  /** Índice del tramo: path[i-1] → path[i]. */
  segmentIndex: number;
  lat: number;
  lng: number;
  distanceMeters: number;
  /** Progreso (m) desde el inicio de la ruta. */
  meters: number;
  /** Rumbo del tramo (null en tramos de longitud cero). */
  bearingDeg: number | null;
};

function projectSegment(
  path: RoutePoint[],
  cum: Float64Array,
  i: number,
  point: RoutePoint
): SegmentProjection {
  const a = path[i - 1];
  const b = path[i];
  const midLatRad = ((a.lat + b.lat) / 2) * (Math.PI / 180);
  const cosLat = Math.cos(midLatRad) || 1;
  const bx = (b.lng - a.lng) * cosLat;
  const by = b.lat - a.lat;
  const px = (point.lng - a.lng) * cosLat;
  const py = point.lat - a.lat;
  const denom = bx * bx + by * by;
  const t = denom === 0 ? 0 : Math.min(1, Math.max(0, (px * bx + py * by) / denom));
  const lat = a.lat + (b.lat - a.lat) * t;
  const lng = a.lng + (b.lng - a.lng) * t;
  return {
    segmentIndex: i,
    lat,
    lng,
    distanceMeters: haversineMeters({ lat, lng }, point),
    meters: cum[i - 1] + t * (cum[i] - cum[i - 1]),
    bearingDeg: denom === 0 ? null : bearingBetween(a, b),
  };
}

function nearestInRange(
  path: RoutePoint[],
  cum: Float64Array,
  point: RoutePoint,
  from: number,
  to: number,
  accept?: (hit: SegmentProjection) => boolean
): SegmentProjection | null {
  let best: SegmentProjection | null = null;
  for (let i = Math.max(1, from); i <= Math.min(path.length - 1, to); i++) {
    const candidate = projectSegment(path, cum, i, point);
    if (accept && !accept(candidate)) continue;
    if (best == null || candidate.distanceMeters < best.distanceMeters) {
      best = candidate;
    }
  }
  return best;
}

export type RouteDirectionHit = SegmentProjection & {
  /** Rumbo del tramo − rumbo resuelto (deg, con signo). */
  headingDeltaDeg: number | null;
  /** El tramo usado va en el sentido de marcha (≤45° del rumbo resuelto). */
  sameDirection: boolean;
};

/**
 * Punto de la ruta más cercano a `point` PREFIRIENDO los tramos del sentido de
 * marcha. Sin rumbo fiable (`headingDeg == null`) equivale a la búsqueda por
 * distancia lateral.
 */
export function projectRouteByDirection(
  path: RoutePoint[],
  point: RoutePoint,
  headingDeg: number | null,
  options?: { fromIndex?: number; toIndex?: number }
): RouteDirectionHit | null {
  if (path.length < 2) return null;
  const cum = cumulativeLengths(path);
  const n = path.length - 1;
  const heading =
    headingDeg != null && Number.isFinite(headingDeg) ? normalizeDeg(headingDeg) : null;
  const from = options?.fromIndex ?? 1;
  const to = options?.toIndex ?? n;
  const within = (hit: SegmentProjection) =>
    heading != null &&
    hit.bearingDeg != null &&
    Math.abs(angleDeltaDeg(hit.bearingDeg, heading)) <= ROUTE_DIRECTION_MATCH_DEG;

  const hit =
    heading == null
      ? nearestInRange(path, cum, point, from, to)
      : nearestInRange(path, cum, point, from, to, within) ??
        // La ventana no tiene tramos del sentido de marcha (entrada a la vía,
        // recálculo de ruta, salto de GPS): se busca en toda la ruta, siempre
        // con el filtro de rumbo. El lateral puro solo si NO hay ninguno.
        nearestInRange(path, cum, point, 1, n, within) ??
        nearestInRange(path, cum, point, from, to);
  if (!hit) return null;
  return {
    ...hit,
    headingDeltaDeg:
      heading != null && hit.bearingDeg != null
        ? angleDeltaDeg(hit.bearingDeg, heading)
        : null,
    sameDirection: heading != null && within(hit),
  };
}

export type RouteDirectionTracker = {
  /**
   * Punto de la ruta del sentido de marcha más cercano a `point`.
   * `nowMs` es el mismo reloj que se use para el progreso/confirmación.
   */
  project(
    path: RoutePoint[],
    point: RoutePoint,
    headingDeg: number | null,
    nowMs: number
  ): RouteDirectionHit | null;
  /** Cambios de tramo hacia sentido contrario RECHAZADOS (acumulado). */
  readonly rejections: number;
  /** Cambios de sentido aceptados tras progreso consistente (acumulado). */
  readonly acceptedSwitches: number;
  /** Último tramo aceptado (null antes de la primera muestra). */
  readonly lastSegmentIndex: number | null;
  /** Rumbo del último tramo aceptado (null si era de longitud cero). */
  readonly lastBearingDeg: number | null;
  reset(): void;
};

export type RouteDirectionTrackerOptions = {
  behindSegments?: number;
  aheadSegments?: number;
  matchDeg?: number;
  oppositeDeg?: number;
  confirmMs?: number;
};

/**
 * Tracker con estado: ventana de progreso + guardián de sentido contrario.
 *
 * El estado NO se mezcla entre consumidores: el loop de seguimiento y el
 * muestreo de traza usan instancias distintas (dos búsquedas independientes
 * sobre la misma geometría).
 */
export function createRouteDirectionTracker(
  options: RouteDirectionTrackerOptions = {}
): RouteDirectionTracker {
  const behind = options.behindSegments ?? 8;
  const ahead = options.aheadSegments ?? 16;
  const matchDeg = options.matchDeg ?? ROUTE_DIRECTION_MATCH_DEG;
  const oppositeDeg = options.oppositeDeg ?? ROUTE_OPPOSITE_DEG;
  const confirmMs = options.confirmMs ?? ROUTE_OPPOSITE_CONFIRM_MS;

  let lastSegmentIndex: number | null = null;
  let lastBearingDeg: number | null = null;
  let oppositeBearingDeg: number | null = null;
  let oppositeSinceMs = 0;
  let oppositeProgressM = 0;
  let rejections = 0;
  let acceptedSwitches = 0;

  const project = (
    path: RoutePoint[],
    point: RoutePoint,
    headingDeg: number | null,
    nowMs: number
  ): RouteDirectionHit | null => {
    if (path.length < 2) return null;
    const cum = cumulativeLengths(path);
    const n = path.length - 1;
    const heading =
      headingDeg != null && Number.isFinite(headingDeg)
        ? normalizeDeg(headingDeg)
        : null;
    const within = (hit: SegmentProjection) =>
      heading != null &&
      hit.bearingDeg != null &&
      Math.abs(angleDeltaDeg(hit.bearingDeg, heading)) <= matchDeg;
    const from = lastSegmentIndex == null ? 1 : Math.max(1, lastSegmentIndex - behind);
    const to = lastSegmentIndex == null ? n : Math.min(n, lastSegmentIndex + ahead);

    // Mientras un cambio de sentido espera confirmación, la búsqueda NO se
    // limita a la ventana del último tramo aceptado: ese índice ya no sigue al
    // vehículo (se queda en el eje rechazado) y la ventana retrocedería,
    // reiniciando la confirmación de 3 s una y otra vez.
    const pendingOpposite = oppositeBearingDeg != null;
    let hit: SegmentProjection | null;
    if (heading == null) {
      hit = nearestInRange(path, cum, point, from, to);
    } else if (pendingOpposite) {
      hit =
        nearestInRange(path, cum, point, 1, n, within) ??
        nearestInRange(path, cum, point, from, to, within) ??
        nearestInRange(path, cum, point, from, to);
    } else {
      hit =
        nearestInRange(path, cum, point, from, to, within) ??
        nearestInRange(path, cum, point, 1, n, within) ??
        nearestInRange(path, cum, point, from, to);
    }
    if (!hit) return null;
    let sameDirection = heading != null && within(hit);

    // ── Guardián de sentido contrario ──
    // Solo puede dispararse cuando el RUMBO ya cambió (si no, un tramo del
    // sentido contrario nunca pasaría el filtro de 45°). Un cambio >90°
    // respecto al último tramo aceptado exige progreso consistente 3 s.
    if (
      sameDirection &&
      lastBearingDeg != null &&
      hit.bearingDeg != null &&
      Math.abs(angleDeltaDeg(hit.bearingDeg, lastBearingDeg)) > oppositeDeg
    ) {
      let accepted = false;
      if (oppositeBearingDeg == null) {
        oppositeBearingDeg = hit.bearingDeg;
        oppositeSinceMs = nowMs;
        oppositeProgressM = hit.meters;
        rejections += 1;
      } else if (
        Math.abs(angleDeltaDeg(hit.bearingDeg, oppositeBearingDeg)) <= matchDeg
      ) {
        if (hit.meters >= oppositeProgressM - 1) {
          oppositeProgressM = hit.meters;
          if (nowMs - oppositeSinceMs >= confirmMs) accepted = true;
        } else {
          // El progreso retrocede: se reinicia la ventana de confirmación.
          oppositeSinceMs = nowMs;
          oppositeProgressM = hit.meters;
        }
      } else {
        // Otro tramo contrario distinto: se reinicia el episodio.
        oppositeBearingDeg = hit.bearingDeg;
        oppositeSinceMs = nowMs;
        oppositeProgressM = hit.meters;
      }
      if (!accepted) {
        // Mientras no se confirme, la referencia sigue siendo el último
        // sentido aceptado (si no hay ninguno, no se informa punto).
        const keep = nearestInRange(path, cum, point, from, to, (candidate) =>
          candidate.bearingDeg != null &&
          Math.abs(angleDeltaDeg(candidate.bearingDeg, lastBearingDeg as number)) <=
            oppositeDeg
        );
        if (!keep) return null;
        hit = keep;
        sameDirection =
          heading != null &&
          keep.bearingDeg != null &&
          Math.abs(angleDeltaDeg(keep.bearingDeg, heading)) <= matchDeg;
      } else {
        acceptedSwitches += 1;
        oppositeBearingDeg = null;
      }
    } else if (oppositeBearingDeg != null && lastBearingDeg != null && hit.bearingDeg != null) {
      // El candidato contrario desapareció: se cierra el episodio sin contar.
      if (
        Math.abs(angleDeltaDeg(hit.bearingDeg, lastBearingDeg)) <= oppositeDeg
      ) {
        oppositeBearingDeg = null;
      }
    }

    lastSegmentIndex = hit.segmentIndex;
    if (hit.bearingDeg != null) lastBearingDeg = hit.bearingDeg;
    return {
      ...hit,
      headingDeltaDeg:
        heading != null && hit.bearingDeg != null
          ? angleDeltaDeg(hit.bearingDeg, heading)
          : null,
      sameDirection,
    };
  };

  return {
    project,
    get rejections() {
      return rejections;
    },
    get acceptedSwitches() {
      return acceptedSwitches;
    },
    get lastSegmentIndex() {
      return lastSegmentIndex;
    },
    get lastBearingDeg() {
      return lastBearingDeg;
    },
    reset() {
      lastSegmentIndex = null;
      lastBearingDeg = null;
      oppositeBearingDeg = null;
      oppositeSinceMs = 0;
      oppositeProgressM = 0;
      rejections = 0;
      acceptedSwitches = 0;
    },
  };
}
