/**
 * Tarjeta de guía (Fase 3-A): SEMÁNTICA de la próxima maniobra, pura y
 * testeable. La página solo proyecta la posición visual sobre la ruta
 * (`done`, metros recorridos) y renderiza el resultado.
 *
 * Causas corregidas (evidencia T4, iPhone/Safari):
 *  (a) Distancia inflada: la rama `pastDepart` mostraba
 *      `accEnd + next.distanceMeters - done` (el FIN del step siguiente: el
 *      giro quedaba a 360 m cuando estaba a ~60 m). La maniobra del step
 *      N+1 ocurre al EMPEZAR ese step, así que la distancia real es
 *      `accEnd(pending) - done` — sin sumar el step siguiente.
 *  (b) Instrucción repetida tras el giro: con `distToTurn > NEXT_MANEUVER`
 *      se mostraba la instrucción del step EN CURSO, cuya maniobra ya se
 *      había ejecutado (stepIndex 0 y 1 llevaban la misma instrucción en
 *      T4). Ahora la tarjeta SIEMPRE muestra la PRÓXIMA maniobra con su
 *      distancia real (estilo Waze), sin ventana de 120 m.
 *
 * Invariantes:
 *  - La maniobra ejecutada nunca vuelve a mostrarse, aunque `done`
 *    retroceda (progreso monótono para SELECCIONAR el step; la distancia se
 *    calcula desde el `done` real).
 *  - «Comienza tu viaje» (depart) solo mientras no haya desplazamiento real
 *    (`done <= DEPART_ADVANCE_METERS`) y nunca regresa una vez abandonado en
 *    el mismo paso (histéresis con estado).
 */

import type { RouteStep } from "@/lib/dispatch/routing";

export const DEPART_ADVANCE_METERS = 40;

export type GuidanceState = {
  /** Clave de ruta (identidad del array de steps); al cambiar, se reinicia. */
  routeKey: unknown;
  /** Progreso máximo visto: seleccionar el step nunca retrocede. */
  maxDoneM: number;
  /** ¿Se abandonó «Comienza tu viaje» en este paso? (histéresis). */
  departed: boolean;
};

export function initialGuidanceState(): GuidanceState {
  return { routeKey: null, maxDoneM: 0, departed: false };
}

export type GuidanceResult = {
  total: number;
  remaining: number;
  /** Step cuyo tramo contiene al vehículo (para la traza). */
  stepIndex: number | null;
  /** Step de la maniobra MOSTRADA (el siguiente, salvo depart/arrive). */
  shownStepIndex: number | null;
  maneuver: string | null;
  instruction: string | null;
  street: string | null;
  /** Metros REALES hasta la maniobra mostrada (sobre la ruta). */
  distanceToManeuver: number | null;
  fractionCompleted: number;
};

// La instrucción y la calle se normalizan en la página (capa de idioma);
// este módulo devuelve la instrucción CRUDa del step mostrado.

/**
 * Totales de steps: `ends[i]` = metros acumulados al terminar el step i
 * (la maniobra del step i+1 ocurre exactamente ahí).
 */
export function stepEnds(steps: RouteStep[]): number[] {
  const ends: number[] = [];
  let acc = 0;
  for (const s of steps) {
    acc += s.distanceMeters;
    ends.push(acc);
  }
  return ends;
}

/**
 * Núcleo puro: dado `done` (metros proyectados, ya acotado por el llamador)
 * y un estado con histéresis, devuelve la tarjeta.
 */
export function computeGuidance(
  state: GuidanceState,
  steps: RouteStep[],
  total: number,
  doneRaw: number
): GuidanceResult {
  const done = Math.min(Math.max(doneRaw, 0), total);
  const remaining = Math.max(0, total - done);
  const ends = stepEnds(steps);

  // Progreso monótono para SELECCIÓN (la maniobra ejecutada nunca vuelve),
  // distancia siempre desde el `done` real.
  state.maxDoneM = Math.max(state.maxDoneM, done);

  // Step pendiente: el primero que aún no termina sobre el progreso máximo
  // (la monotonía de `maxDoneM` ya evita el vaivén en el borde del step).
  let pendingIdx = steps.length - 1;
  for (let i = 0; i < steps.length; i++) {
    if (ends[i] > state.maxDoneM) {
      pendingIdx = i;
      break;
    }
  }

  const step = steps[pendingIdx] ?? null;
  const next = steps[pendingIdx + 1] ?? null;

  // Histéresis de «Comienza tu viaje»: una vez que hay desplazamiento real
  // en el paso depart, no se regresa aunque `done` retroceda.
  if (step?.maneuver === "depart" && done > DEPART_ADVANCE_METERS) {
    state.departed = true;
  }

  let shownIdx: number | null = pendingIdx >= 0 ? pendingIdx : null;
  let distanceToManeuver: number | null = null;

  if (step && step.maneuver === "depart" && !state.departed && next) {
    // Sin desplazamiento real: «Comienza tu viaje», con la distancia real a
    // la primera maniobra (fin de este step).
    shownIdx = pendingIdx;
    distanceToManeuver = Math.max(0, ends[pendingIdx] - done);
  } else if (next) {
    // PRÓXIMA maniobra (la del step siguiente ocurre al empezar ese step):
    // distancia real = fin del step pendiente − done. Sin ventana de 120 m.
    shownIdx = pendingIdx + 1;
    distanceToManeuver = Math.max(0, ends[pendingIdx] - done);
  } else if (step) {
    // Último step (llegada): su maniobra ocurre al final del tramo.
    shownIdx = pendingIdx;
    distanceToManeuver = Math.max(0, ends[pendingIdx] - done);
  }

  const shownStep = shownIdx != null ? steps[shownIdx] ?? null : null;
  return {
    total,
    remaining,
    stepIndex: pendingIdx >= 0 ? pendingIdx : null,
    shownStepIndex: shownIdx,
    maneuver: shownStep?.maneuver ?? null,
    instruction: shownStep?.instruction ?? null,
    street: null,
    distanceToManeuver,
    fractionCompleted: total > 0 ? Math.min(1, Math.max(0, done / total)) : 0,
  };
}

