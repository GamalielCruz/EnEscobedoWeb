/**
 * Puerta de aceptación de fixes GPS (puro, sin React ni `navigator`).
 *
 * Vive aquí (y no dentro de hooks/useDriverLocation.ts) para poder reproducir
 * la aceptación/rechazo con trazas reales en Node — Fase 3.1-B. El hook solo
 * aplica la DECISIÓN (setState, reporte al backend); toda la política está
 * aquí:
 *
 *  1. accuracy > 100 m                → `accuracy` (basura del SO);
 *  2. coordenadas idénticas a un fix  → `stale-coords` (Fase 3.1-A: iOS
 *     YA RECIBIDO                        reestampa la posición en caché con
 *     deviceT nuevo; en T4 el fix #2 tenía accuracy 6 m y las mismas
 *     coordenadas que el #0 con 7.3 s de antigüedad, y se aceptaba);
 *  3. ráfaga de la misma posición     → `dedupe` (250 ms y 1.5 m);
 *  4. fix con más de 5 s de antigüedad → `stale` (T1: +21.8 s en el primer fix
 *     pese a `maximumAge: 0`);
 *  5. fix pobre (> 30 m) con un fix bueno (≤ 20 m) fresco (≤ 10 s)
 *                                     → `accuracy` (T4: 79 m y 52 m movieron
 *     el puck 50.2 m en 1.6 s);
 *  6. escape (Fase 3.1-F): si pasan 10 s sin ningún fix ≤ 20 m, se acepta el
 *     MEJOR fix disponible ≤ 50 m para no dejar el mapa congelado en un cañón
 *     urbano.
 */

import { haversineMeters } from "@/lib/dispatch/routing";

/** Precisiones de referencia (m). */
export const GOOD_FIX_ACCURACY_M = 20;
export const POOR_FIX_ACCURACY_M = 30;
/** Un fix de peor precisión que esto no es una posición, es una mancha. */
export const MAX_FIX_ACCURACY_M = 100;
/** Un fix bueno sigue "fresco" este tiempo frente a uno pobre. */
export const GOOD_FIX_TTL_MS = 10_000;
/** F: sin fix ≤ 20 m durante este tiempo, se acepta el mejor ≤ 50 m. */
export const NO_GOOD_FIX_ESCAPE_MS = 10_000;
export const ESCAPE_MAX_ACCURACY_M = 50;
/** Antigüedad máxima de un fix (position.timestamp vs reloj del teléfono). */
export const MAX_FIX_AGE_MS = 5_000;
/** Ventana y distancia de la ráfaga de callbacks con la misma posición. */
export const DEDUPE_INTERVAL_MS = 250;
export const DEDUPE_DISTANCE_M = 1.5;

export type FixRejectionReason = "accuracy" | "dedupe" | "stale" | "stale-coords";

export type FixGateFix = {
  lat: number;
  lng: number;
  accuracy: number | null;
  /** `GeolocationPosition.timestamp` (cuándo midió el SO) o null. */
  deviceT: number | null;
  /** Reloj del teléfono al recibir el callback (ms). */
  arrivedAt: number;
};

export type FixGatePending = {
  lat: number;
  lng: number;
  accuracy: number | null;
  arrivedAt: number;
};

export type FixGateState = {
  /** Llegada del primer fix recibido (base del escape de 10 s). */
  startedAt: number | null;
  /** Coordenadas YA VISTAS (aunque se hayan rechazado): clave `lat|lng`. */
  seenCoords: Set<string>;
  /** Último fix aceptado (para dedupe y para saber de dónde venimos). */
  lastAccepted: { lat: number; lng: number; arrivedAt: number } | null;
  /** Llegada del último fix aceptado con accuracy ≤ 20 m. */
  lastGoodAt: number | null;
  /** Mejor fix pobre (≤ 50 m) rechazado desde el último bueno. */
  bestPending: FixGatePending | null;
};

export function createFixGateState(): FixGateState {
  return {
    startedAt: null,
    seenCoords: new Set(),
    lastAccepted: null,
    lastGoodAt: null,
    bestPending: null,
  };
}

/** Clave EXACTA de coordenadas (sin redondeo: la caché repite el valor). */
export function coordKey(lat: number, lng: number): string {
  return `${lat}|${lng}`;
}

/** Máximo de coordenadas recordadas (≈17 min a 1 Hz). */
const MAX_SEEN_COORDS = 1024;

function rememberCoord(state: FixGateState, key: string): void {
  state.seenCoords.add(key);
  if (state.seenCoords.size > MAX_SEEN_COORDS) {
    const oldest = state.seenCoords.values().next().value;
    if (oldest != null) state.seenCoords.delete(oldest);
  }
}

export type FixGateDecision =
  | { accepted: false; reason: FixRejectionReason }
  | {
      accepted: true;
      lat: number;
      lng: number;
      accuracy: number | null;
      /** true si la posición es la del fix actual (no un candidato previo). */
      useCurrent: boolean;
      /** true si se aceptó por el escape de «sin fix bueno». */
      escaped: boolean;
    };

function isGood(accuracy: number | null): boolean {
  return accuracy == null || accuracy <= GOOD_FIX_ACCURACY_M;
}

function isAllowed(accuracy: number | null): boolean {
  return accuracy == null || accuracy <= MAX_FIX_ACCURACY_M;
}

/**
 * Decide si un fix mueve posición/velocidad/curso. MUTA `state` (registra
 * coordenadas vistas, último aceptado, último bueno y candidato pobre), igual
 * que el hook real: el estado es la memoria de la puerta.
 */
export function evaluateGpsFix(state: FixGateState, fix: FixGateFix): FixGateDecision {
  const now = fix.arrivedAt;
  if (state.startedAt == null) state.startedAt = now;

  const key = coordKey(fix.lat, fix.lng);
  const repeated = state.seenCoords.has(key);
  rememberCoord(state, key);

  if (!isAllowed(fix.accuracy)) {
    return { accepted: false, reason: "accuracy" };
  }

  // A: coordenadas idénticas a cualquier fix ya recibido (la caché del SO
  // reestampa la misma posición). No actualiza posición, velocidad ni curso.
  if (repeated) {
    return { accepted: false, reason: "stale-coords" };
  }

  const prev = state.lastAccepted;
  if (prev) {
    const elapsed = now - prev.arrivedAt;
    const dist = haversineMeters(prev, { lat: fix.lat, lng: fix.lng });
    if (elapsed < DEDUPE_INTERVAL_MS && dist < DEDUPE_DISTANCE_M) {
      return { accepted: false, reason: "dedupe" };
    }
  }

  const ageMs = fix.deviceT != null ? now - fix.deviceT : 0;
  if (ageMs > MAX_FIX_AGE_MS) {
    return { accepted: false, reason: "stale" };
  }

  const goodFresh =
    state.lastGoodAt != null && now - state.lastGoodAt <= GOOD_FIX_TTL_MS;

  const acceptCurrent = (): FixGateDecision => {
    state.lastAccepted = { lat: fix.lat, lng: fix.lng, arrivedAt: now };
    if (isGood(fix.accuracy)) state.lastGoodAt = now;
    state.bestPending = null;
    return {
      accepted: true,
      lat: fix.lat,
      lng: fix.lng,
      accuracy: fix.accuracy,
      useCurrent: true,
      escaped: false,
    };
  };

  if (fix.accuracy != null && fix.accuracy > POOR_FIX_ACCURACY_M) {
    if (goodFresh) {
      return { accepted: false, reason: "accuracy" };
    }
    // F: sin fix bueno durante 10 s, usar el mejor disponible ≤ 50 m.
    const sinceLastGoodMs = now - (state.lastGoodAt ?? state.startedAt ?? now);
    if (sinceLastGoodMs >= NO_GOOD_FIX_ESCAPE_MS) {
      const currentUsable =
        fix.accuracy <= ESCAPE_MAX_ACCURACY_M
          ? ({
              lat: fix.lat,
              lng: fix.lng,
              accuracy: fix.accuracy,
              arrivedAt: now,
            } satisfies FixGatePending)
          : null;
      const pending = state.bestPending;
      const candidates = [currentUsable, pending].filter(
        (c): c is FixGatePending => c != null
      );
      if (candidates.length > 0) {
        const best = candidates.reduce((a, b) =>
          (a.accuracy ?? Infinity) <= (b.accuracy ?? Infinity) ? a : b
        );
        const useCurrent = best.arrivedAt === now && best.lat === fix.lat && best.lng === fix.lng;
        state.lastAccepted = { lat: best.lat, lng: best.lng, arrivedAt: now };
        state.bestPending = null;
        return {
          accepted: true,
          lat: best.lat,
          lng: best.lng,
          accuracy: best.accuracy,
          useCurrent,
          escaped: true,
        };
      }
      return { accepted: false, reason: "accuracy" };
    }
    if (fix.accuracy <= ESCAPE_MAX_ACCURACY_M) {
      const better =
        state.bestPending == null ||
        (fix.accuracy ?? Infinity) < (state.bestPending.accuracy ?? Infinity);
      if (better) {
        state.bestPending = {
          lat: fix.lat,
          lng: fix.lng,
          accuracy: fix.accuracy,
          arrivedAt: now,
        };
      }
    }
    return { accepted: false, reason: "accuracy" };
  }

  return acceptCurrent();
}
