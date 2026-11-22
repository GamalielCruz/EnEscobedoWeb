/**
 * drive-gps-replay.mjs — reproducción de la cadena de navegación sobre GPS
 * REAL (Fase 3.1-C).
 *
 * Alimenta, con las muestras GPS de una traza real trasladada a un origen
 * arbitrario (lib/drive/__fixtures__/gps-*.json):
 *   1. la PUERTA de aceptación de fixes (lib/drive/fix-gate.ts),
 *   2. la derivación de velocidad/rumbo (lib/drive/speed-heading.ts),
 *   3. el resolvedor de rumbo (lib/drive/heading-resolver.ts),
 *   4. el frame de cámara (lib/drive/follow-frame.ts),
 *   5. la tarjeta (lib/drive/guidance.ts) — solo si la traza trae la ruta,
 *
 * y comprueba los criterios de la Fase 3.1. Cada fixture se corre dos veces:
 *  - «antes»: aceptando exactamente lo que aceptó el build que grabó la traza
 *    (`recorded.accepted`), para tener la columna de comparación;
 *  - «después»: con la puerta actual.
 *
 * NO es evidencia de Mapbox ni de Safari: el mapa es virtual (se aplican los
 * comandos del controlador). Los números «antes» del módulo de velocidad usan
 * el código ACTUAL sobre la selección de fixes ANTERIOR: miden el efecto de la
 * puerta, no del build viejo completo.
 *
 * Uso:
 *   npm run replay:drive
 *   npm run replay:drive -- lib/drive/__fixtures__/gps-t4.json
 */

import fs from "node:fs";
import path from "node:path";

import {
  bearingBetween,
  haversineMeters,
  movePointAlong,
  projectOntoPath,
} from "../lib/dispatch/routing.ts";
import { createFixGateState, evaluateGpsFix } from "../lib/drive/fix-gate.ts";
import {
  applyGpsFix,
  courseAgeMs,
  effectiveCourseHeading,
  effectiveMovementSpeedMps,
  effectiveSpeedMps,
  initialSpeedHeadingState,
  MAX_PLAUSIBLE_SPEED_MPS,
  DERIVED_SPEED_ENVELOPE_FACTOR,
  DERIVED_SPEED_ENVELOPE_SLACK_MPS,
} from "../lib/drive/speed-heading.ts";
import { createDriveHeadingResolver } from "../lib/drive/heading-resolver.ts";
import {
  anchorYForBand,
  PUCK_ANCHOR_FRACTION,
} from "../lib/drive/camera-controller.ts";
import {
  computeFollowFrame,
  metersPerPixelAt,
  NAV_ZOOM_BASE,
} from "../lib/drive/follow-frame.ts";
import { computeGuidance, nextGuidanceState } from "../lib/drive/guidance.ts";

// ── Geometría de pantalla (iPhone del repartidor, banda visible) ──────
const H = 800;
const TOP = 60;
const BOTTOM = 500;
const anchorY = anchorYForBand(TOP, BOTTOM, PUCK_ANCHOR_FRACTION);
const FRAME_MS = 16.7;
const WINDOW_MS = 10_000;
const T0 = Date.parse("2026-11-20T12:00:00.000Z");

const FIXTURES = [
  "lib/drive/__fixtures__/gps-t1.json",
  "lib/drive/__fixtures__/gps-t2.json",
  "lib/drive/__fixtures__/gps-t4.json",
  // T6/T7 se generan con `npm run fixture:drive -- <traza> <salida> --source T6`
  // cuando el usuario entrega los JSON; el arnés los incluye si existen.
  ...["lib/drive/__fixtures__/gps-t6.json", "lib/drive/__fixtures__/gps-t7.json"].filter(
    (file) => fs.existsSync(file)
  ),
];

/** Expectativa explícita de la Fase 3.1: primer fix aceptado en T4 = #5. */
const FIRST_ACCEPTED_EXPECTED = { T4: 5 };

const rad = Math.PI / 180;

function shortestAngleDelta(to, from) {
  return ((to - from + 540) % 360) - 180;
}

/**
 * Rumbo de referencia del arranque: dirección real de los primeros 20 m
 * recorridos con fixes buenos (accuracy ≤ 20 m y frescos). Es la mejor
 * aproximación al segmento de ruta cuando la traza no incluye la polilínea.
 */
function referenceSegmentBearing(samples) {
  const good = samples.filter(
    (s) => (s.accuracy ?? 999) <= 20 && (s.deviceT == null || s.t - s.deviceT <= 5_000)
  );
  if (good.length < 2) return null;
  let cum = 0;
  for (let i = 1; i < good.length; i++) {
    cum += haversineMeters(good[i - 1], good[i]);
    if (cum >= 20) return bearingBetween(good[0], good[i]);
  }
  return bearingBetween(good[0], good[good.length - 1]);
}

/**
 * Segmento LOCAL en el instante de la primera adquisición: rumbo entre el
 * último fix bueno previo y el que esté ~5 s después (si hay ≥10 m de
 * desplazamiento). La primera adquisición puede llegar tarde (sin fuente de
 * rumbo al arrancar) y comparar contra el segmento del arranque sería
 * injusto si el vehículo ya giró.
 */
function localSegmentBearing(samples, tMs) {
  const good = samples.filter(
    (s) => (s.accuracy ?? 999) <= 20 && (s.deviceT == null || s.t - s.deviceT <= 5_000)
  );
  let before = null;
  for (const s of good) {
    if (s.t <= tMs) before = s;
    else break;
  }
  if (!before) return null;
  const after = good.find((s) => s.t >= tMs + 5_000);
  if (!after) return null;
  if (haversineMeters(before, after) < 10) return null;
  return bearingBetween(before, after);
}

/** Velocidad cruda entre fixes consecutivos (la que usaba el build viejo). */
function rawDerivedSpeeds(samplesToUse) {
  const out = [];
  for (let i = 1; i < samplesToUse.length; i++) {
    const a = samplesToUse[i - 1];
    const b = samplesToUse[i];
    const dt = (b.t - a.t) / 1000;
    if (dt < 0.5) continue;
    out.push({ t: b.t, speed: haversineMeters(a, b) / dt, coords: b.speed ?? null });
  }
  return out;
}

/**
 * Corre la cadena completa sobre un fixture.
 * @param {any} fixture
 * @param {{mode: "before" | "after", fps?: number}} options
 */
function simulate(fixture, { mode, fps = 60 }) {
  const frameMs = 1000 / fps;
  const samples = fixture.samples;
  const route = fixture.route ?? null;
  const lastT = samples[samples.length - 1].t;

  let gateState = createFixGateState();
  let speedState = initialSpeedHeadingState();
  let gpsHeading = null;
  let movementHeading = null;
  let coordsSpeedNow = null;
  let lastAccepted = null;
  let lastGood = null;
  let firstGoodFixSeen = false;

  // Posición inicial REAL de la app si la fixture la declara (DEFAULT_CENTER
  // cuando aún no había fix). Así T6 reproduce el salto inicial y no arranca
  // «ya en el GPS».
  const initial = fixture.initialVisual ?? { lat: samples[0].lat, lng: samples[0].lng };
  let visualPos = { lat: initial.lat, lng: initial.lng };
  let visualHeading = null;
  let cameraHeading = null;
  let cameraHeadingTs = null;
  let zoomTarget = null;
  let pendingZoom = null;
  let mapZoom = NAV_ZOOM_BASE;
  let mapBearing = 0;
  // Fase 5-A: memoria del frame (dt real, fix integrado y corrección
  // pendiente). Sin persistirla, cada cuadro se trataría como el primero.
  let frameTs = null;
  let integratedFixTs = null;
  let correctionMeters = 0;
  let correctionBearing = null;

  const accepted = [];
  const rejections = {};
  const envelopeViolations = [];
  const speedOverCap = [];
  let maxRotationPerSecond = 0;
  // Eventos de rotación para la ventana deslizante de 1 s (medida real de °/s).
  const rotationEvents = [];
  let rotationWindowSum = 0;
  let rotationWindowStart = 0;
  let firstAcquisition = null;
  let maxVisualError = 0;
  let maxVisualErrorT = null;
  let zoomAtFirstAccepted = null;
  let maxZoomDeltaWindow = 0;
  const cardChanges = [];
  let guidanceState = null;
  let guidanceRouteKey = null;
  let acceptedCount = 0;
  let maxStateSpeed = 0;
  // Fase 5-B: uniformidad por aplicación de cámara (solo v ≥ 3 m/s).
  const uniformity = new Map();
  const uniformityRow = (sec) => {
    let row = uniformity.get(sec);
    if (!row) {
      row = { movedPx: [], expectedPx: [], still: 0, speedSum: 0 };
      uniformity.set(sec, row);
    }
    return row;
  };

  let nowOffset = 0;
  // El resolvedor mide con Date.now(): hay que anclarlo al reloj del replay.
  Date.now = () => T0 + nowOffset;

  // Resolvedor creado ANTES del bucle: los getters leen las variables vivas
  // del replay (gpsHeading, movementHeading, visualPos...).
  const resolver = createDriveHeadingResolver({
    getSimHeading: () => ({ active: false, simHeading: null }),
    getGpsHeading: () => gpsHeading,
    getSpeedMps: () => effectiveSpeedMps(speedState, Date.now()),
    getMovementHeading: () => movementHeading,
    getCourseHeading: () => ({
      heading: speedState.courseHeading,
      ageMs: courseAgeMs(speedState, Date.now()),
    }),
    getMovementSpeedMps: () => effectiveMovementSpeedMps(speedState, Date.now()),
    getCoordsSpeedMps: () => coordsSpeedNow,
    getDeviceHeading: () => ({
      heading: 0,
      available: "unavailable",
      permission: "denied",
    }),
    getRouteGeometry: () => ({ path: route?.path ?? null, vehiclePos: visualPos }),
    minMovementMeters: 8,
    minMovementMs: 1_000,
  });

  const handleFix = (s, index) => {
    let isAccepted;
    let reason = null;
    // Posición/accuracy EFECTIVAS tras la puerta (en el escape pueden ser las
    // de un candidato pobre anterior, no las del fix actual).
    let pos = { lat: s.lat, lng: s.lng };
    let acc = s.accuracy;
    let useCurrent = true;
    if (mode === "before") {
      isAccepted = s.recorded?.accepted === true;
      reason = s.recorded?.rejectedReason ?? null;
    } else {
      const decision = evaluateGpsFix(gateState, {
        lat: s.lat,
        lng: s.lng,
        accuracy: s.accuracy,
        deviceT: s.deviceT,
        arrivedAt: s.t,
      });
      isAccepted = decision.accepted;
      reason = decision.accepted ? null : decision.reason;
      if (decision.accepted) {
        pos = { lat: decision.lat, lng: decision.lng };
        acc = decision.accuracy;
        useCurrent = decision.useCurrent;
      }
    }
    if (!isAccepted) {
      if (reason) rejections[reason] = (rejections[reason] ?? 0) + 1;
      return;
    }
    acceptedCount++;
    accepted.push({ ...s, index, lat: pos.lat, lng: pos.lng, accuracy: acc });
    if (acceptedCount === 1) {
      visualPos = { ...pos };
      zoomAtFirstAccepted = mapZoom;
    }
    // Sin `useCurrent` (candidato previo del escape) no se actualizan
    // velocidad, rumbo GPS ni curso: solo la posición.
    const coords = s.speed ?? null;
    if (useCurrent) {
      gpsHeading = s.heading;
      coordsSpeedNow = s.speed ?? null;
      speedState = applyGpsFix(
        speedState,
        {
          pos: { ...pos },
          ts: T0 + s.t,
          coordsSpeed: coords,
          accuracy: acc,
        },
        s.heading
      );
      const course = effectiveCourseHeading(speedState, T0 + s.t);
      if (course != null) movementHeading = course;
    }
    if ((acc ?? 999) <= 20) {
      if (!firstGoodFixSeen) {
        // El primer fix ≤20 m sustituye la semilla (misma regla que la página).
        firstGoodFixSeen = true;
        visualPos = { ...pos };
      }
      lastGood = { ...pos };
    }
    lastAccepted = { ...pos, t: s.t, accuracy: acc };

    // Envolvente de la velocidad: el estado nunca debe superar
    // 3·coords.speed + 3 (ni el tope de plausibilidad).
    const reported = speedState.speedMps;
    if (reported != null) {
      maxStateSpeed = Math.max(maxStateSpeed, reported);
      if (reported > MAX_PLAUSIBLE_SPEED_MPS + 1e-6) {
        speedOverCap.push({ t: s.t, speed: reported });
      }
      if (coords != null) {
        const limit =
          DERIVED_SPEED_ENVELOPE_FACTOR * coords + DERIVED_SPEED_ENVELOPE_SLACK_MPS;
        if (reported > limit + 1e-6) {
          envelopeViolations.push({ t: s.t, speed: reported, limit, coords });
        }
      }
    }

    // Tarjeta: solo con ruta en la traza (Fase 3.1-E la incluye) y con un fix
    // ≤20 m (Fase 4-B: sin posición buena no hay progreso).
    if (firstGoodFixSeen && route && route.steps?.length && route.path?.length >= 2) {
      if (guidanceRouteKey == null) {
        guidanceRouteKey = `replay|${route.path.length}|${route.steps.length}`;
        guidanceState = nextGuidanceState(null, guidanceRouteKey);
      }
      const total = route.path.reduce(
        (acc, p, i) => (i === 0 ? acc : acc + haversineMeters(route.path[i - 1], p)),
        0
      );
      const done = projectOntoPath(route.path, visualPos);
      const g = computeGuidance(guidanceState, route.steps, total, done);
      const cardKey = `${g.shownStepIndex}|${g.instruction}|${Math.round(g.distanceToManeuver ?? -1)}`;
      if (cardChanges.length === 0 || cardChanges[cardChanges.length - 1].key !== cardKey) {
        cardChanges.push({ key: cardKey, t: s.t, ...g });
      }
    }
  };

  let fixIdx = 0;
  for (let t = 0; t <= lastT + frameMs; t += frameMs) {
    nowOffset = t;
    while (fixIdx < samples.length && samples[fixIdx].t <= t) {
      handleFix(samples[fixIdx], fixIdx);
      fixIdx++;
    }

    const target = lastAccepted ?? visualPos;
    const targetHeading = resolver.resolve();
    const speedForFrame = effectiveSpeedMps(speedState, T0 + t);
    const prevVisual = visualPos;

    const frame = computeFollowFrame(
      {
        vehiclePos: visualPos,
        visualHeading,
        cameraHeading,
        cameraHeadingTs,
        zoomTarget,
        frameTs,
        fixTs: integratedFixTs,
        correctionMeters,
        correctionBearing,
      },
      {
        now: t,
        frameScale: 1,
        mapZoom,
        target,
        targetHeading,
        simHeading: null,
        mapBearing,
        speedMps: speedForFrame,
        route: route ? { path: route.path, steps: route.steps } : null,
        firstGoodFixSeen,
        navigationReady: firstGoodFixSeen || Boolean(fixture.navigationReady),
        anchorY,
        containerHeightPx: H,
        pendingZoom,
        accuracy: lastAccepted?.accuracy ?? null,
        // Fase 5-A: la estima necesita la hora del último fix para avanzar
        // entre fixes y detenerse si el fix caduca.
        fixTs: lastAccepted ? T0 + lastAccepted.t : null,
      }
    );

    // Fase 5-B: píxeles desplazados en ESTA aplicación de cámara. Es lo que
    // el muestreo a 5 Hz no veía.
    if (speedForFrame >= 3) {
      const mpp = Math.max(0.01, metersPerPixelAt(mapZoom, prevVisual.lat));
      const movedPx = haversineMeters(prevVisual, frame.state.vehiclePos) / mpp;
      const row = uniformityRow(Math.floor(t / 1000));
      row.movedPx.push(movedPx);
      row.expectedPx.push((speedForFrame * frameMs) / 1000 / mpp);
      row.speedSum += speedForFrame;
      if (movedPx < 0.02) row.still += 1;
    }

    const prevBearing = mapBearing;
    visualPos = frame.state.vehiclePos;
    visualHeading = frame.state.visualHeading;
    cameraHeading = frame.state.cameraHeading;
    cameraHeadingTs = frame.state.cameraHeadingTs;
    zoomTarget = frame.state.zoomTarget;
    frameTs = frame.state.frameTs ?? null;
    integratedFixTs = frame.state.fixTs ?? null;
    correctionMeters = frame.state.correctionMeters ?? 0;
    correctionBearing = frame.state.correctionBearing ?? null;
    pendingZoom = frame.pendingZoom;
    mapBearing = frame.command.bearing;
    if (frame.command.zoom != null) mapZoom = frame.command.zoom;

    if (cameraHeading != null && firstAcquisition == null) {
      firstAcquisition = { t, heading: cameraHeading };
      // La adquisición es un golpe deliberado (el snap inicial): la rotación
      // que la produce NO cuenta como barrido. El contador arranca aquí.
      rotationEvents.length = 0;
      rotationWindowSum = 0;
      rotationWindowStart = 0;
    }
    // Rotación de cámara por segundo (solo después de la primera adquisición:
    // la adquisición es un golpe deliberado, no un barrido).
    if (firstAcquisition != null && cameraHeading != null && t > firstAcquisition.t) {
      const delta = Math.abs(shortestAngleDelta(mapBearing, prevBearing));
      rotationEvents.push({ t, delta });
      rotationWindowSum += delta;
      while (
        rotationEvents.length > 0 &&
        rotationEvents[0].t <= t - 1_000
      ) {
        rotationWindowSum -= rotationEvents.shift().delta;
      }
      maxRotationPerSecond = Math.max(maxRotationPerSecond, rotationWindowSum);
    }
    void rotationWindowStart;

    // Desplazamiento visual espurio: distancia entre el vehículo dibujado y el
    // último fix BUENO, en los primeros 10 s tras el primer fix aceptado.
    if (acceptedCount > 0 && lastGood) {
      const firstAcceptedT = accepted[0].t;
      if (t - firstAcceptedT <= WINDOW_MS) {
        const err = haversineMeters(visualPos, lastGood);
        if (err > maxVisualError) {
          maxVisualError = err;
          maxVisualErrorT = t;
        }
        if (zoomAtFirstAccepted != null) {
          maxZoomDeltaWindow = Math.max(
            maxZoomDeltaWindow,
            Math.abs(mapZoom - zoomAtFirstAccepted)
          );
        }
      }
    }
  }

  const rawSpeeds = rawDerivedSpeeds(accepted);
  const maxRawSpeed = rawSpeeds.reduce((m, r) => Math.max(m, r.speed), 0);
  const referenceBearing = referenceSegmentBearing(samples);
  const localBearing = firstAcquisition
    ? localSegmentBearing(samples, firstAcquisition.t)
    : null;

  return {
    mode,
    total: samples.length,
    acceptedCount,
    rejections,
    firstAcceptedIndex: accepted.length ? accepted[0].index : null,
    firstAccepted: accepted.length ? accepted[0] : null,
    acceptedDuplicatedCoords: (() => {
      // Ningún fix aceptado puede repetir coordenadas de otro fix (A).
      const seen = new Set();
      let dup = 0;
      for (const s of samples) {
        const key = `${s.lat}|${s.lng}`;
        const repeated = seen.has(key);
        seen.add(key);
        const wasAccepted =
          mode === "before" ? s.recorded?.accepted === true : accepted.some((a) => a.index === s.index);
        if (repeated && wasAccepted) dup++;
      }
      return dup;
    })(),
    maxVisualError,
    maxVisualErrorT,
    maxRotationPerSecond,
    firstAcquisition,
    referenceBearing,
    maxRawSpeed,
    localBearing,
    maxStateSpeed,
    envelopeViolations,
    speedOverCap,
    maxZoomDeltaWindow,
    cardChanges,
    uniformity: summarizeUniformity(uniformity),
  };
}

/** Agrega la uniformidad de todos los segundos con v ≥ 3 m/s. */
function summarizeUniformity(map) {
  const movedPx = [];
  const expectedPx = [];
  let still = 0;
  for (const row of map.values()) {
    movedPx.push(...row.movedPx);
    expectedPx.push(...row.expectedPx);
    still += row.still;
  }
  if (movedPx.length === 0) return null;
  const sorted = [...movedPx].sort((a, b) => a - b);
  const percentile = (q) =>
    sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))];
  const mean = movedPx.reduce((a, b) => a + b, 0) / movedPx.length;
  const expectedMean =
    expectedPx.reduce((a, b) => a + b, 0) / expectedPx.length;
  const max = sorted[sorted.length - 1];
  // Paso máximo respecto al esperado DE SU PROPIO cuadro (v·dt).
  let maxStepRatio = null;
  for (let i = 0; i < movedPx.length; i++) {
    const expected = expectedPx[i] ?? 0;
    if (expected < 0.02) continue;
    const ratio = movedPx[i] / expected;
    if (maxStepRatio == null || ratio > maxStepRatio) maxStepRatio = ratio;
  }
  return {
    applies: movedPx.length,
    still,
    stillFraction: still / movedPx.length,
    mean,
    p95: percentile(0.95),
    max,
    expectedMean,
    maxStepRatio,
    p95OverMean: mean > 0.01 ? percentile(0.95) / mean : null,
  };
}

function fmt(v, digits = 1) {
  return v == null ? "—" : Number(v).toFixed(digits);
}

function printFixture(file, fixture) {
  const name = fixture.source;
  const before = simulate(fixture, { mode: "before" });
  const after = simulate(fixture, { mode: "after" });
  const failures = [];
  const observations = [];
  // Las aserciones de arranque de la Fase 3.1 son de T4 (la traza que motivó
  // el cambio). En T1/T2 se REPORTAN como observaciones: sin ruta en la traza
  // no hay rumbo de ruta que usar y el GPS en parado mete ruido de metros.
  // Las invariantes universales (A, envolvente, tope) sí bloquean en todas.
  const isT4 = name === "T4";
  const check = (hard, msg) => (hard ? failures : observations).push(msg);

  const expected = FIRST_ACCEPTED_EXPECTED[name];
  if (expected != null && after.firstAcceptedIndex !== expected) {
    failures.push(
      `primer fix aceptado ${after.firstAcceptedIndex} ≠ ${expected}`
    );
  }
  // A: ningún fix aceptado puede tener coordenadas repetidas.
  if (after.acceptedDuplicatedCoords > 0) {
    failures.push(
      `${after.acceptedDuplicatedCoords} fix(es) aceptados con coordenadas repetidas`
    );
  }
  // B: sin desplazamiento visual > 10 m en los primeros 10 s.
  if (after.maxVisualError > 10) {
    check(isT4, `desplazamiento visual ${fmt(after.maxVisualError)} m > 10 m`);
  }
  // B: envolvente de velocidad y tope de plausibilidad.
  if (after.envelopeViolations.length > 0) {
    const v = after.envelopeViolations[0];
    failures.push(
      `velocidad ${fmt(v.speed, 2)} > 3·coords.speed+3 (${fmt(v.limit, 2)}) en t=${fmt(v.t / 1000)} s`
    );
  }
  if (after.speedOverCap.length > 0) {
    failures.push(`velocidad ${fmt(after.speedOverCap[0].speed, 2)} > tope 35 m/s`);
  }
  // B: rumbo inicial ≤ 30° del segmento de referencia. Se usa el segmento
  // local en el instante de la adquisición; si no hay desplazamiento local
  // suficiente, el del arranque; si tampoco, el criterio no aplica.
  const refBearing = after.localBearing ?? after.referenceBearing;
  if (
    after.firstAcquisition &&
    refBearing != null &&
    Math.abs(shortestAngleDelta(after.firstAcquisition.heading, refBearing)) > 30
  ) {
    check(
      isT4,
      `rumbo inicial ${fmt(after.firstAcquisition.heading)}° se aleja >30° del segmento ${fmt(refBearing)}°`
    );
  }
  // B: sin barrido > 60°/s después de la primera adquisición.
  if (after.maxRotationPerSecond > 60) {
    check(isT4, `giro de cámara ${fmt(after.maxRotationPerSecond)}°/s > 60°/s`);
  }
  // B: zoom sin cambio > 0.3 en los primeros 10 s.
  if (after.maxZoomDeltaWindow > 0.3) {
    check(isT4, `zoom cambió ${fmt(after.maxZoomDeltaWindow, 2)} en los primeros 10 s`);
  }

  console.log(`\n══ ${name} — ${path.basename(file)} ═════════════════════════════`);
  console.log(
    `  Aceptación (antes → después): ${before.acceptedCount} → ${after.acceptedCount} de ${after.total} fixes`
  );
  console.log(
    `  Primer fix aceptado: #${before.firstAcceptedIndex} → #${after.firstAcceptedIndex}` +
      (expected != null ? ` (criterio #${expected})` : "") +
      (after.firstAccepted
        ? ` · t=${fmt(after.firstAccepted.t / 1000, 2)} s · acc ${fmt(after.firstAccepted.accuracy)} m`
        : "")
  );
  const reasons = ["accuracy", "stale", "stale-coords", "dedupe"]
    .map((r) => `${r} ${after.rejections[r] ?? 0}`)
    .join(" · ");
  console.log(`  Rechazos: ${reasons}`);
  console.log(
    `  Fixes aceptados con coordenadas repetidas: ${before.acceptedDuplicatedCoords} → ${after.acceptedDuplicatedCoords}`
  );
  console.log(
    `  Desplazamiento visual espurio ≤10 m (10 s): ${fmt(before.maxVisualError)} m → ${fmt(after.maxVisualError)} m`
  );
  console.log(
    `  Velocidad cruda máx (dist/dt, reglas viejas): ${fmt(before.maxRawSpeed, 2)} m/s → ${fmt(after.maxRawSpeed, 2)} m/s`
  );
  console.log(
    `  Velocidad del estado máx: ${fmt(before.maxStateSpeed, 2)} → ${fmt(after.maxStateSpeed, 2)} m/s` +
      ` · violaciones de envolvente: ${after.envelopeViolations.length}`
  );
  console.log(
    `  Rumbo inicial: ${fmt(after.firstAcquisition?.heading)}° en t=${fmt(after.firstAcquisition ? after.firstAcquisition.t / 1000 : null, 2)} s` +
      ` vs segmento ${fmt(refBearing)}°` +
      ` (arranque ${fmt(after.referenceBearing)}°, local ${fmt(after.localBearing)}°)` +
      ` (${fmt(after.firstAcquisition && refBearing != null ? shortestAngleDelta(after.firstAcquisition.heading, refBearing) : null)}°)`
  );
  console.log(
    `  Instante del error visual máx: t=${fmt(after.maxVisualErrorT != null ? after.maxVisualErrorT / 1000 : null, 2)} s` +
      ` · primer fix en t=${fmt(after.firstAccepted ? after.firstAccepted.t / 1000 : null, 2)} s`
  );
  console.log(
    `  Rotación de cámara máx: ${fmt(before.maxRotationPerSecond)}°/s → ${fmt(after.maxRotationPerSecond)}°/s (criterio ≤60)`
  );
  console.log(
    `  Cambio de zoom en 10 s: ${fmt(after.maxZoomDeltaWindow, 2)} (criterio ≤0.3)`
  );
  // Fase 5-B: uniformidad real por aplicación de cámara (v ≥ 3 m/s).
  const after30 = simulate(fixture, { mode: "after", fps: 30 });
  printUniformity("60 Hz", after.uniformity);
  printUniformity("30 Hz", after30.uniformity);
  // Criterios 5-B. Bloquean si hay una muestra sostenida (≥300 aplicaciones
  // con v ≥ 3 m/s); con menos, se reportan como observación (un solo segundo
  // cerca del umbral de 3 m/s no caracteriza la uniformidad del viaje).
  const uni = after.uniformity;
  if (uni) {
    const hard = uni.applies >= 300;
    if (uni.stillFraction > 0.1) {
      check(hard, `cuadros quietos ${fmt(uni.stillFraction * 100)} % > 10 %`);
    }
    if (uni.p95OverMean > 2) {
      check(hard, `p95/medio ${fmt(uni.p95OverMean, 2)} > 2`);
    }
    if (uni.maxStepRatio > 2) {
      check(hard, `paso máx/esperado ${fmt(uni.maxStepRatio, 2)} > 2`);
    }
  }
  if (fixture.route) {
    console.log(
      `  Tarjeta (ruta real en la traza): ${after.cardChanges.length} cambios · ` +
        `primera «${after.cardChanges[0]?.instruction ?? "—"}» en ${fmt(after.cardChanges[0]?.distanceToManeuver)} m`
    );
  } else {
    console.log(
      "  Tarjeta: la traza NO incluye ruta (polilínea + steps) → no reproducible; " +
        "se valida con la tabla unitaria (Fase 3.1-E ya la exporta)."
    );
  }

  if (observations.length > 0) {
    console.log("  Observaciones (no bloquean; ver limitaciones):");
    for (const o of observations) console.log(`    · ${o}`);
  }
  if (failures.length === 0 && observations.length === 0) {
    console.log("  ✓ Todos los criterios de la Fase 3.1 se cumplen");
  } else if (failures.length === 0) {
    console.log("  ✓ Sin fallos duros (con observaciones arriba)");
  } else {
    for (const f of failures) console.log(`  ✗ ${f}`);
  }
  return failures;
}

function printUniformity(label, u) {
  if (!u) {
    console.log(
      `  Uniformidad ${label}: sin tramos con v ≥ 3 m/s (no aplica el criterio por cuadro)`
    );
    return;
  }
  console.log(
    `  Uniformidad ${label} (v ≥ 3 m/s, ${u.applies} aplicaciones): ` +
      `quietos ${(u.stillFraction * 100).toFixed(1)} % · medio ${u.mean.toFixed(2)} px · ` +
      `p95 ${u.p95.toFixed(2)} px · máx ${u.max.toFixed(2)} px · ` +
      `p95/medio ${fmt(u.p95OverMean, 2)} · máx/esperado ${fmt(u.maxStepRatio, 2)}`
  );
}

// ── Fase 5-C: flujos sintéticos de 1 Hz a 15 y 25 m/s, 30 y 60 Hz ────
//
// Reproduce la evidencia del video (movimiento a ráfagas de 1 Hz) sobre la
// lógica pura: mismo GPS de 1 Hz que en la calle, cámara a 30 y 60 Hz. Los
// criterios son los de la Fase 5-B: quietos ≤10 %, p95/medio ≤2.0 y paso
// máximo ≤2× el esperado (v·dt).
function syntheticFlow({ speed, fps, mode = "new" }) {
  const frameMs = 1000 / fps;
  const origin = { lat: 25.0, lng: -100.0 };
  const path = Array.from({ length: 41 }, (_, i) =>
    ({ lat: origin.lat + (i * 50) / 111_320, lng: origin.lng })
  );
  const steps = [
    {
      maneuver: "depart",
      instruction: "Continúa recto",
      distanceMeters: 2_000,
      start: path[0],
      end: path[40],
    },
  ];
  let state = {
    vehiclePos: path[0],
    visualHeading: 0,
    cameraHeading: 0,
    cameraHeadingTs: 0,
    zoomTarget: NAV_ZOOM_BASE,
  };
  let target = path[0];
  let fixTs = 0;
  let nextFix = 0;
  let prev = state.vehiclePos;
  const buckets = new Map();
  const row = (sec) => {
    let r = buckets.get(sec);
    if (!r) {
      r = { movedPx: [], expectedPx: [], still: 0 };
      buckets.set(sec, r);
    }
    return r;
  };
  const durationMs = 12_000;
  for (let t = 0; t <= durationMs; t += frameMs) {
    if (t >= nextFix) {
      target = {
        lat: origin.lat + (speed * t) / 1000 / 111_320,
        lng: origin.lng,
      };
      fixTs = t;
      nextFix += 1_000;
    }
    const r =
      mode === "old"
        ? oldFrameToward(state, target, frameMs)
        : computeFollowFrame(state, {
            now: t,
            frameScale: 1,
            mapZoom: NAV_ZOOM_BASE,
            target,
            targetHeading: 0,
            simHeading: null,
            mapBearing: 0,
            speedMps: speed,
            route: { path, steps },
            anchorY,
            containerHeightPx: H,
            pendingZoom: null,
            accuracy: 6,
            firstGoodFixSeen: true,
            navigationReady: true,
            fixTs,
          });
    state = r.state;
    const mpp = Math.max(0.01, metersPerPixelAt(NAV_ZOOM_BASE, prev.lat));
    const movedPx = haversineMeters(prev, r.state.vehiclePos) / mpp;
    const b = row(Math.floor(t / 1000));
    b.movedPx.push(movedPx);
    b.expectedPx.push((speed * frameMs) / 1000 / mpp);
    if (movedPx < 0.02) b.still += 1;
    prev = r.state.vehiclePos;
  }
  // El primer cuadro no tiene dt (arranque): se retira del cómputo.
  const first = buckets.get(0);
  if (first && first.movedPx.length > 0) {
    first.movedPx.shift();
    first.expectedPx.shift();
  }
  return summarizeUniformity(buckets);
}

/**
 * Algoritmo ANTERIOR (Fase 4) reproducido tal cual, solo para la columna
 * «antes»: suavizado exponencial 0.18 con paso MÍNIMO de 1.5 m y tope de 15 px
 * por cuadro hacia el último fix. Es el que producía las ráfagas de 1 Hz.
 */
function oldFrameToward(state, target, frameMs) {
  const mpp =
    (156543.03392 * Math.cos((state.vehiclePos.lat * Math.PI) / 180)) /
    Math.pow(2, NAV_ZOOM_BASE);
  const dist = haversineMeters(state.vehiclePos, target);
  let pos = state.vehiclePos;
  if (dist > 0.5) {
    const smooth = 0.18;
    const factor = 1 - Math.pow(1 - smooth, frameMs / 33);
    let step = Math.max(1.5, Math.min(dist, dist * factor));
    step = Math.min(step, 15 * mpp);
    const brg = bearingBetween(pos, target);
    pos = brg == null ? pos : movePointAlong(pos, brg, step);
  } else {
    pos = target;
  }
  return { state: { ...state, vehiclePos: pos } };
}

function runUniformitySuite() {
  console.log("\n══ Fase 5-C · uniformidad de la estima (lógica, no dispositivo) ══");
  let failures = 0;
  for (const speed of [15, 25]) {
    for (const fps of [30, 60]) {
      const before = syntheticFlow({ speed, fps, mode: "old" });
      const u = syntheticFlow({ speed, fps });
      console.log(
        `  antes · ${String(speed).padStart(2)} m/s · ${fps} Hz: ` +
          `quietos ${(before.stillFraction * 100).toFixed(1)} % · ` +
          `medio ${before.mean.toFixed(2)} px · p95 ${before.p95.toFixed(2)} px · ` +
          `máx ${before.max.toFixed(2)} px · p95/medio ${before.p95OverMean.toFixed(2)}`
      );
      const flags = [];
      if (u.stillFraction > 0.1) flags.push(`quietos ${(u.stillFraction * 100).toFixed(1)} % > 10 %`);
      if (u.p95OverMean > 2) flags.push(`p95/medio ${u.p95OverMean.toFixed(2)} > 2`);
      if (u.maxStepRatio > 2) flags.push(`máx/esperado ${u.maxStepRatio.toFixed(2)} > 2`);
      console.log(
        `  ${String(speed).padStart(2)} m/s · ${fps} Hz: ` +
          `${u.applies} aplicaciones · quietos ${(u.stillFraction * 100).toFixed(1)} % · ` +
          `medio ${u.mean.toFixed(2)} px · p95 ${u.p95.toFixed(2)} px · ` +
          `máx ${u.max.toFixed(2)} px · p95/medio ${u.p95OverMean.toFixed(2)} · ` +
          `máx/esperado ${u.maxStepRatio.toFixed(2)}` +
          (flags.length ? `  ✗ ${flags.join(" · ")}` : "  ✓")
      );
      failures += flags.length;
    }
  }
  return failures;
}

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const files = args.length > 0 ? args : FIXTURES;
let failures = 0;
for (const file of files) {
  const fixture = JSON.parse(fs.readFileSync(file, "utf8"));
  failures += printFixture(file, fixture).length;
}
failures += runUniformitySuite();
console.log(
  failures === 0
    ? `\n✓ Reproducción completa: ${files.length} trazas + uniformidad sintética, 0 fallos.`
    : `\n✗ ${failures} criterio(s) incumplido(s).`
);
process.exit(failures === 0 ? 0 : 1);
