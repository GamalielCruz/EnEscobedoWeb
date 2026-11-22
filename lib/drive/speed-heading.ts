/**
 * Derivación robusta de velocidad y rumbo a ritmo de caminata y de vehículo
 * (puro, sin React — testeable en Node).
 *
 * Evidencia que lo motiva (traza real Fase 0, iPhone/Safari, caminata ≤1.9 m/s):
 *  - coords.speed entrega null o valores pegajosos (108°/`speed` empañado);
 *  - el umbral anterior (2 m / 250 ms) NUNCA se cumplía a ~1-1.9 m/s con
 *    fixes de ~1 Hz (1.5 m por fix < 2 m): velocidad y rumbo se quedaban
 *    pegados a los primeros fixes espurios (1784 → 617 → 433 m/s, 2222 km/h).
 *  - tres fixes en 0.2 s (dt≈2 ms, 3.7 m) al inicio produjeron un pico
 *    absurdo que, al no refrescarse después, quedó "pegado".
 *
 * Reglas (Fase 1-C):
 *  - Velocidad por fix: coords.speed si es finito y >= 0; si no, dist/dt
 *    con dt >= 0.5 s. Fixes con dt < 0.25 s se descartan (no aportan señal).
 *    Cap 70 m/s. La velocidad CADUCA a 0 tras 3 s sin fix nuevo.
 *  - Rumbo, en este orden:
 *      (1) curso por posiciones con base >= max(5 m, 2·accuracy) y solo si
 *          velocidad >= 0.7 m/s (con histéresis);
 *      (2) coords.heading solo mientras velocidad >= umbral (iOS lo deja
 *          pegado con speed=0);
 *      (3) rumbo del segmento de ruta proyectado (cuando alguien sobre la
 *          ruta lo provee — el resolvedor lo aplica);
 *      (4) último rumbo confiable.
 *    Nunca se deriva rumbo de posiciones paradas.
 */

import {
  bearingBetween,
  haversineMeters,
  type RoutePoint,
} from "@/lib/dispatch/routing";

/**
 * Velocidad máxima PLAUSIBLE para un repartidor (35 m/s = 126 km/h, Fase
 * 3-B: en T4 `speedMps=42.02` durante 2.6 s con coords.speed real ≈1.2 m/s
 * pasaba el tope anterior de 45). Por encima de esto el valor es basura del
 * SO y se DESCARTA — no se recorta: recortar convertía 1784 m/s en 70 m/s
 * "creíbles" (traza T2: speedMps=70 durante ~0.8 s, el clamp).
 */
export const MAX_PLAUSIBLE_SPEED_MPS = 35;
/**
 * Fase 3-B: la velocidad derivada nunca puede exceder esta envolvente sobre
 * `coords.speed` cuando el SO la reporta (T4: derivada de 42 m/s con
 * coords.speed ≈1.2 m/s por saltos de 50 m con accuracy de 79/52 m).
 */
export const DERIVED_SPEED_ENVELOPE_FACTOR = 3;
export const DERIVED_SPEED_ENVELOPE_SLACK_MPS = 3;
/**
 * Fase 3-B: accuracy máxima para derivar velocidad o curso. Con accuracy
 * mayor el desplazamiento medido está dentro del ruido del fix.
 */
export const GOOD_FIX_ACCURACY_M = 20;
/** Aceleración máxima plausible entre fixes (m/s²), incluye frenada fuerte. */
export const MAX_PLAUSIBLE_ACCEL_MPS2 = 12;
export const MIN_DT_FOR_DERIVED_SPEED_S = 0.5;
export const MIN_DT_ACCEPT_FIX_S = 0.25;
export const SPEED_EXPIRY_MS = 3_000;
export const COURSE_SPEED_THRESHOLD_MPS = 0.7;
export const COURSE_SPEED_HYSTERESIS_MPS = 0.2;
const COURSE_MIN_BASE_M = 5;

export type SpeedHeadingFix = {
  pos: RoutePoint;
  /** Reloj del dispositivo (ms epoch) de ESTE fix; si falta, usar `receiveTs`. */
  ts: number;
  /** coords.speed del SO (m/s) o null. */
  coordsSpeed?: number | null;
  /** Precisión GPS del fix (m) o null. */
  accuracy?: number | null;
};

function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Diferencia dirigida y mínima entre dos ángulos. */
export function shortestAngleDeltaDeg(to: number, from: number): number {
  return ((to - from + 540) % 360) - 180;
}

export type SpeedHeadingState = {
  /** Última velocidad VÁLIDA (m/s) — nunca un valor recortado. */
  speedMps: number;
  /**
   * Timestamp (ms, reloj del dispositivo) de la última velocidad VÁLIDA.
   * Es la base de la expiración: un fix sin velocidad válida no la renueva.
   */
  lastValidSpeedTs: number | null;
  /** Origen de la última velocidad válida (auditoría de la traza). */
  speedSource: "coords" | "dt" | null;
  /** Último rumbo confiable por posiciones (0-360°) o null. */
  courseHeading: number | null;
  /** Timestamp (ms) del último fix aceptado (expiración de velocidad). */
  lastFixTs: number | null;
  /** ¿El track está "en marcha" (histéresis sobre el umbral 0.7 m/s)? */
  moving: boolean;
  prevPos: RoutePoint | null;
  prevTs: number | null;
  /**
   * Ancla del curso por posiciones. NO se mueve en cada fix: se mide contra
   * ella hasta acumular `max(5 m, 2·accuracy)` y entonces se re-ancla. Con
   * fixes de ~1 Hz a ritmo de caminata el desplazamiento por fix (1.3 m)
   * nunca alcanza la base y el rumbo quedaría congelado (causa de T1).
   */
  courseAnchorPos: RoutePoint | null;
  courseAnchorTs: number | null;
  /** Accuracy del fix anterior (m): el curso exige desplazamiento ≥ 2·(acc1+acc2). */
  prevAccuracy: number | null;
  /** Últimos bearings entre fixes consecutivos (curso rápido filtrado). */
  recentBearings: number[];
};

export function initialSpeedHeadingState(): SpeedHeadingState {
  return {
    speedMps: 0,
    lastValidSpeedTs: null,
    speedSource: null,
    courseHeading: null,
    lastFixTs: null,
    moving: false,
    prevPos: null,
    prevTs: null,
    courseAnchorPos: null,
    courseAnchorTs: null,
    prevAccuracy: null,
    recentBearings: [],
  };
}

/**
 * Velocidad efectiva en un instante `now` (aplica la expiración de 3 s).
 * Pura: no muta el estado.
 */
export function effectiveSpeedMps(
  state: SpeedHeadingState,
  now: number
): number {
  if (!hasValidSpeed(state, now)) return 0;
  return state.speedMps;
}

/**
 * ¿Hay una velocidad VÁLIDA y fresca? Distingue "parado con dato" (0 m/s
 * legítimo → el panel muestra 0.0) de "sin dato" (→ el panel muestra —).
 */
export function hasValidSpeed(state: SpeedHeadingState, now: number): boolean {
  return (
    state.lastValidSpeedTs != null &&
    now - state.lastValidSpeedTs <= SPEED_EXPIRY_MS
  );
}

/**
 * ¿Es plausible? > 45 m/s o una aceleración imposible entre fixes ⇒ basura.
 * Un valor así se descarta (se conserva el último válido), nunca se recorta.
 */
export function isPlausibleSpeed(
  speedMps: number,
  previousMps: number | null,
  dtSec: number | null
): boolean {
  if (!Number.isFinite(speedMps) || speedMps < 0) return false;
  if (speedMps > MAX_PLAUSIBLE_SPEED_MPS) return false;
  if (previousMps != null && dtSec != null && dtSec > 0) {
    const accel = Math.abs(speedMps - previousMps) / dtSec;
    if (accel > MAX_PLAUSIBLE_ACCEL_MPS2) return false;
  }
  return true;
}

/**
 * Incorpora un fix GPS al estado y devuelve el estado actualizado (nuevo
 * objeto; el estado es pequeño y se guarda en un ref).
 *
 * Aplica: descarte dt < 0.25 s, coords.speed solo si finito, >= 0 y <= 45 m/s
 * (un valor imposible se DESCARTA, no se recorta), curso por posiciones solo
 * si velocidad >= 0.7 y base >= max(5 m, 2·accuracy).
 */
export function applyGpsFix(
  state: SpeedHeadingState,
  fix: SpeedHeadingFix,
  gpsHeading: number | null
): SpeedHeadingState {
  const next: SpeedHeadingState = { ...state };

  // Descarte: fix con dt insignificante (ráfagas espurias, p. ej. 3 fixes
  // en 0.2 s al arrancar) — no aporta señal de movimiento.
  if (state.prevTs != null) {
    const dt = (fix.ts - state.prevTs) / 1000;
    if (dt < MIN_DT_ACCEPT_FIX_S && dt > -MIN_DT_ACCEPT_FIX_S) {
      return state;
    }
  }

  // 1) Velocidad: coords.speed si aporta; si no, dist/dt con dt >= 0.5 s.
  // Fase 2-C: un valor IMPLAUSIBLE se DESCARTA (no se recorta); se conserva la
  // última velocidad válida y expira a 0 pasados 3 s sin dato válido.
  // Fase 3-B: la derivada solo entre fixes BUENOS (accuracy ≤ 20 m) y nunca
  // por encima de 3·coords.speed + 3 m/s (T4: 42 m/s con coords.speed 1.2).
  const accuracy = fix.accuracy ?? null;
  const fixIsGood = accuracy == null || accuracy <= GOOD_FIX_ACCURACY_M;
  const coordsSpeedValid =
    typeof fix.coordsSpeed === "number" &&
    Number.isFinite(fix.coordsSpeed) &&
    fix.coordsSpeed >= 0;
  let speed: number | null = null;
  let speedSource: "coords" | "dt" | null = null;
  const prevSpeed = hasValidSpeed(state, fix.ts) ? state.speedMps : null;
  if (coordsSpeedValid) {
    speed = fix.coordsSpeed as number;
    speedSource = "coords";
  } else if (
    fixIsGood &&
    state.prevPos &&
    state.prevTs != null &&
    (state.prevAccuracy == null || state.prevAccuracy <= GOOD_FIX_ACCURACY_M)
  ) {
    const dt = (fix.ts - state.prevTs) / 1000;
    if (dt >= MIN_DT_FOR_DERIVED_SPEED_S) {
      const dist = haversineMeters(state.prevPos, fix.pos);
      speed = dist / dt;
      speedSource = "dt";
    }
  }
  if (speed != null && speedSource != null) {
    // dt para la comprobación de aceleración: desde la última velocidad
    // VÁLIDA (no desde el fix anterior, que pudo no aportar velocidad).
    const dtSec =
      state.lastValidSpeedTs != null
        ? Math.abs(fix.ts - state.lastValidSpeedTs) / 1000
        : null;
    // Envolvente sobre el dato del SO (3·coords.speed + 3): una derivada
    // disparatada con saltos de fix imprecisos se descarta aquí.
    const withinEnvelope =
      speedSource !== "dt" ||
      !coordsSpeedValid ||
      speed <= DERIVED_SPEED_ENVELOPE_FACTOR * (fix.coordsSpeed as number) + DERIVED_SPEED_ENVELOPE_SLACK_MPS;
    // Un fix malo NUNCA aporta velocidad si ya hay una buena reciente.
    const fixCanReportSpeed = fixIsGood || !hasValidSpeed(state, fix.ts);
    if (withinEnvelope && fixCanReportSpeed && isPlausibleSpeed(speed, prevSpeed, dtSec)) {
      next.speedMps = speed;
      next.speedSource = speedSource;
      next.lastValidSpeedTs = fix.ts;
    }
  }
  next.lastFixTs = fix.ts;

  // Histéresis de "en marcha" sobre el umbral 0.7 m/s: entrar exige
  // >= 0.7, salir exige caer bajo 0.7 - 0.2. Evita parpadeo en tráfico lento.
  if (!state.moving && next.speedMps >= COURSE_SPEED_THRESHOLD_MPS) {
    next.moving = true;
  } else if (
    state.moving &&
    next.speedMps < COURSE_SPEED_THRESHOLD_MPS - COURSE_SPEED_HYSTERESIS_MPS
  ) {
    next.moving = false;
  }

  // 2) Rumbo: (1) curso por posiciones; (2) coords.heading solo en marcha.
  // Nunca derivar rumbo de posiciones paradas, ni de fixes imprecisos.
  // Fase 3-B: el desplazamiento debe superar 2·(acc1+acc2) — con accuracy de
  // 79/52 m (T4) un salto de 50 m es ruido, no desplazamiento.
  const baseNeeded = Math.max(
    COURSE_MIN_BASE_M,
    accuracy != null
      ? 2 * (accuracy + (state.prevAccuracy ?? accuracy))
      : 0
  );
  // ── Curso RÁPIDO: bearings de fixes consecutivos cuando coinciden ──
  // A ritmo de caminata el ancla tarda ~7 s en juntar 10 m; un giro debe
  // registrarse en ~3 s. Si los últimos 3 bearings concuerdan entre sí
  // (≤25°), es un giro real y no ruido: se aceptan de inmediato. Los saltos
  // de GPS producen bearings incoherentes y se descartan.
  if (next.moving && fixIsGood && state.prevPos && state.prevTs != null) {
    const stepDist = haversineMeters(state.prevPos, fix.pos);
    if (stepDist >= 1) {
      const rawStep = bearingBetween(state.prevPos, fix.pos);
      if (rawStep != null) {
        const recent = [...state.recentBearings, rawStep].slice(-3);
        next.recentBearings = recent;
        // Dos bearings muy alineados (≤12°) también valen: un giro franco se
        // registra en ~2 s (a 1 Hz) sin abrir la puerta al ruido del GPS.
        if (recent.length === 2) {
          const last = recent[1];
          const prevB = recent[0];
          if (Math.abs(shortestAngleDeltaDeg(last, prevB)) <= 12) {
            const mean = normalizeDeg(
              prevB + shortestAngleDeltaDeg(last, prevB) * 0.5
            );
            next.courseHeading =
              state.courseHeading == null
                ? mean
                : normalizeDeg(
                    state.courseHeading +
                      shortestAngleDeltaDeg(mean, state.courseHeading) * 0.6
                  );
          }
        }
        if (recent.length === 3) {
          let consistent = true;
          for (let i = 0; i < recent.length && consistent; i++) {
            for (let k = i + 1; k < recent.length; k++) {
              if (Math.abs(shortestAngleDeltaDeg(recent[i], recent[k])) > 25) {
                consistent = false;
                break;
              }
            }
          }
          if (consistent) {
            // Media circular de los tres bearings (rumbo del giro confirmado).
            let sx = 0;
            let sy = 0;
            for (const b of recent) {
              sx += Math.cos((b * Math.PI) / 180);
              sy += Math.sin((b * Math.PI) / 180);
            }
            const mean = normalizeDeg((Math.atan2(sy, sx) * 180) / Math.PI);
            next.courseHeading =
              state.courseHeading == null
                ? mean
                : normalizeDeg(
                    state.courseHeading +
                      shortestAngleDeltaDeg(mean, state.courseHeading) * 0.7
                  );
          }
        }
      }
    } else {
      next.recentBearings = state.recentBearings;
    }
  }

  // Curso por ANCLA acumulada (base ≥ max(5 m, 2·accuracy)): con 1.3 m por
  // fix, comparar fixes consecutivos nunca cumple el umbral y el rumbo se
  // queda congelado (T1: 180-199° con rumbo real 97–126°).
  if (!next.moving) {
    // Parado: no se deriva rumbo. El ancla se re-sitúa para exigir base
    // recorrida al reanudar la marcha.
    next.courseAnchorPos = fix.pos;
    next.courseAnchorTs = fix.ts;
    next.recentBearings = [];
  } else {
    if (next.courseAnchorPos == null) {
      next.courseAnchorPos = fix.pos;
      next.courseAnchorTs = fix.ts;
    } else {
      const dist = haversineMeters(next.courseAnchorPos, fix.pos);
      if (dist >= baseNeeded) {
        const raw = bearingBetween(next.courseAnchorPos, fix.pos);
        if (raw != null) {
          // Suavizado por el camino más corto (sigue giros reales, filtra
          // saltos aislados).
          next.courseHeading =
            state.courseHeading == null
              ? raw
              : normalizeDeg(
                  state.courseHeading +
                    shortestAngleDeltaDeg(raw, state.courseHeading) * 0.5
                );
        }
        next.courseAnchorPos = fix.pos;
        next.courseAnchorTs = fix.ts;
      }
    }
  }
  // (2) coords.heading NO se mezcla aquí: es una fuente independiente que el
  // resolvedor compara contra el curso medido (si discrepan > 20° manda el
  // curso). Mezclarlo contaminaba el curso con el valor pegado de iOS
  // (T1: 108.149° con el vehículo girando).
  void gpsHeading;

  next.prevPos = fix.pos;
  next.prevTs = fix.ts;
  next.prevAccuracy = accuracy;
  return next;
}

/**
 * Heading efectivo expuesto al resolvedor: curso por posiciones medido (1)
 * o el último rumbo confiable (4). El rumbo de ruta lo aplica el resolvedor
 * (3) y coords.heading se compara aparte (2).
 */
export function effectiveCourseHeading(state: SpeedHeadingState): number | null {
  return state.courseHeading;
}
