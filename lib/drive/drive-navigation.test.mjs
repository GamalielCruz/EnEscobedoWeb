/**
 * Pruebas de la navegación del repartidor (Fase 1) — puras, sin dispositivo.
 *
 * Ejecutar:
 *   npm run test:drive
 *
 * Cubren las correcciones A–G sobre módulos puros (el controlador de cámara,
 * el frame de cámara, la derivación de velocidad/rumbo y el resolvedor), que
 * es lo que puede reproducirse en Node sin Mapbox ni Safari:
 *  - velocidad con dt≈2 ms (ráfaga inicial) y con fix caducado;
 *  - curso parado no cambia el rumbo;
 *  - eventos programáticos del mapa no sacan de FOLLOWING;
 *  - solo el controlador escribe la cámara (spy de jumpTo/easeTo) y el
 *    botón de localizar es idempotente (stop antes de cada animación);
 *  - anclaje del puck al 70–75 % del área visible y ≤ 15 px entre frames;
 *  - vuelta en U confirmada por dos fuentes independientes;
 *  - estando sobre la ruta no se marca DEVIATING y el rumbo queda ≤ 15° del
 *    segmento.
 */

import assert from "node:assert/strict";
import test, { mock } from "node:test";

import {
  anchorYForBand,
  applyCameraCommand,
  computeAnchorPadding,
  computeAnchorPaddingForBand,
  nextFollowStateOnMapEvent,
  PUCK_ANCHOR_FRACTION,
  shouldReenterFollow,
  AUTO_REENTER_MS,
} from "./camera-controller.ts";
import {
  applyGpsFix,
  effectiveCourseHeading,
  effectiveSpeedMps,
  hasValidSpeed,
  initialSpeedHeadingState,
  MAX_PLAUSIBLE_SPEED_MPS,
  SPEED_EXPIRY_MS,
} from "./speed-heading.ts";
import { TraceRecorder } from "./trace-recorder.ts";
import {
  computeFollowFrame,
  metersPerPixelAt,
  NAV_ZOOM_BASE,
} from "./follow-frame.ts";
import { createDriveHeadingResolver } from "./heading-resolver.ts";
import {
  computeGuidance,
  initialGuidanceState,
  nextGuidanceState,
  stepEnds,
} from "./guidance.ts";
import { createFixGateState, evaluateGpsFix } from "./fix-gate.ts";
import { haversineMeters } from "@/lib/dispatch/routing";

const T0 = Date.parse("2026-11-20T12:00:00.000Z");
const P = (lat, lng) => ({ lat, lng });
/** Lat/lng desplazado `m` metros al norte/sur/este. */
const north = (base, m) => P(base.lat + m / 111_320, base.lng);
const east = (base, m) =>
  P(base.lat, base.lng + m / (111_320 * Math.cos((base.lat * Math.PI) / 180)));

// ── C: velocidad y rumbo robustos ───────────────────────────────────

test("velocidad: ráfaga de fixes con dt≈2 ms no produce un pico (T1: 1784 m/s)", () => {
  let state = initialSpeedHeadingState();
  const a = P(25.0, -100.0);
  // Tres fixes en 0.2 s, 3.7 m de salto, sin coords.speed (como iOS).
  // Fase 3-B: accuracy ≤ 20 m (con fixes pobres la derivada está prohibida).
  state = applyGpsFix(state, { pos: a, ts: T0, accuracy: 8 }, null);
  state = applyGpsFix(state, { pos: north(a, 1.8), ts: T0 + 2, accuracy: 8 }, null);
  state = applyGpsFix(state, { pos: north(a, 3.7), ts: T0 + 4, accuracy: 8 }, null);
  assert.equal(state.speedMps, 0, "los fixes con dt<0.25 s no aportan velocidad");
  // Fix normal 1 s después, 1.4 m recorridos (caminata ~1.4 m/s).
  state = applyGpsFix(
    state,
    { pos: north(a, 1.4), ts: T0 + 1_000, accuracy: 8 },
    null
  );
  assert.ok(state.speedMps > 0.5 && state.speedMps < 4, `velocidad ${state.speedMps}`);
  assert.ok(state.speedMps <= MAX_PLAUSIBLE_SPEED_MPS);
});

test("velocidad: un valor imposible se DESCARTA (no se recorta a 70) — T2", () => {
  let state = initialSpeedHeadingState();
  const a = P(25.0, -100.0);
  state = applyGpsFix(state, { pos: a, ts: T0, accuracy: 10 }, null);
  // 200 m en 0.5 s = 400 m/s: imposible → se descarta (antes: 70 m/s).
  state = applyGpsFix(
    state,
    { pos: north(a, 200), ts: T0 + 500, accuracy: 10 },
    null
  );
  assert.equal(state.speedMps, 0, "400 m/s no puede quedar como 70 m/s");
  assert.equal(hasValidSpeed(state, T0 + 500), false, "sin velocidad válida no hay dato");

  // coords.speed basura (1784 m/s, traza T1): descartada, NO recortada.
  state = applyGpsFix(
    state,
    { pos: north(a, 201), ts: T0 + 1_000, accuracy: 10, coordsSpeed: 1.2 },
    null
  );
  assert.equal(state.speedMps, 1.2, "coords.speed válida manda");
  state = applyGpsFix(
    state,
    { pos: north(a, 202), ts: T0 + 2_000, accuracy: 10, coordsSpeed: 1784 },
    null
  );
  assert.equal(state.speedMps, 1.2, "1784 m/s se descarta y se conserva la última válida");
  assert.equal(hasValidSpeed(state, T0 + 2_000), true);
});

test("velocidad: una aceleración imposible entre fixes también se descarta", () => {
  let state = initialSpeedHeadingState();
  const a = P(25.0, -100.0);
  state = applyGpsFix(state, { pos: a, ts: T0, accuracy: 8 }, null);
  state = applyGpsFix(
    state,
    { pos: north(a, 1.4), ts: T0 + 1_000, accuracy: 8, coordsSpeed: 1.4 },
    null
  );
  // 1 s después, 40 m/s (144 km/h) partiendo de 1.4 m/s: 38.6 m/s² → basura.
  state = applyGpsFix(
    state,
    { pos: north(a, 41), ts: T0 + 2_000, accuracy: 8, coordsSpeed: 40 },
    null
  );
  assert.equal(state.speedMps, 1.4, "aceleración imposible: se conserva la última válida");
});

test("velocidad: caduca a 0 tras 3 s sin fix nuevo", () => {
  let state = initialSpeedHeadingState();
  const a = P(25.0, -100.0);
  state = applyGpsFix(state, { pos: a, ts: T0, accuracy: 8 }, null);
  state = applyGpsFix(
    state,
    { pos: north(a, 1.4), ts: T0 + 1_000, accuracy: 8, coordsSpeed: 1.4 },
    null
  );
  assert.ok(effectiveSpeedMps(state, T0 + 1_500) > 1);
  assert.equal(effectiveSpeedMps(state, T0 + 1_000 + SPEED_EXPIRY_MS + 1), 0);
});

test("rumbo: parado (sin movimiento) el curso no cambia", () => {
  let state = initialSpeedHeadingState();
  let pos = P(25.0, -100.0);
  // 6 fixes caminando al este. La base mínima de curso es
  // max(5 m, 2·accuracy) = 10 m con accuracy 5 → 12 m por fix.
  for (let i = 1; i <= 6; i++) {
    pos = east(P(25.0, -100.0), i * 12);
    state = applyGpsFix(state, { pos, ts: T0 + i * 1_000, accuracy: 5 }, null);
  }
  const course = effectiveCourseHeading(state);
  assert.ok(course != null && Math.abs(course - 90) < 3, `curso ${course}`);
  // Parado: micro-jitter de 0.4 m y coords.speed 0.
  for (let i = 1; i <= 5; i++) {
    pos = north(pos, i % 2 === 0 ? 0.4 : -0.4);
    state = applyGpsFix(
      state,
      { pos, ts: T0 + 6_000 + i * 1_000, accuracy: 5, coordsSpeed: 0 },
      null
    );
  }
  assert.equal(state.speedMps, 0);
  assert.equal(
    Math.round(effectiveCourseHeading(state)),
    Math.round(course),
    "el jitter parado no debe girar el rumbo"
  );
});

// ── A: estado de seguimiento ─────────────────────────────────────────

test("eventos programáticos del mapa NO sacan de FOLLOWING; un gesto sí", () => {
  for (const type of [
    "dragstart",
    "rotatestart",
    "zoomstart",
    "movestart",
    "pitchstart",
  ]) {
    const prog = nextFollowStateOnMapEvent("FOLLOWING", { type, isGesture: false });
    assert.equal(prog.state, "FOLLOWING", `${type} programático mantiene el follow`);
    assert.equal(prog.exitedByGesture, false);
    const gesture = nextFollowStateOnMapEvent("FOLLOWING", { type, isGesture: true });
    assert.equal(gesture.state, "FREE", `${type} real sale del follow`);
    assert.equal(gesture.exitedByGesture, true);
  }
});

test("reentrada: la velocidad NUNCA reanuda; solo el único temporizador tras gesto", () => {
  assert.equal(
    shouldReenterFollow("FREE", "velocity", {
      navigatingWithRoute: true,
      msSinceGestureExit: 60_000,
    }),
    "FREE"
  );
  assert.equal(
    shouldReenterFollow("FREE", "gesture_timer", {
      navigatingWithRoute: true,
      msSinceGestureExit: AUTO_REENTER_MS - 1,
    }),
    "FREE"
  );
  assert.equal(
    shouldReenterFollow("FREE", "gesture_timer", {
      navigatingWithRoute: true,
      msSinceGestureExit: AUTO_REENTER_MS,
    }),
    "RECENTERING"
  );
  assert.equal(
    shouldReenterFollow("FREE", "locate_button", {
      navigatingWithRoute: true,
      msSinceGestureExit: null,
    }),
    "RECENTERING"
  );
  assert.equal(
    shouldReenterFollow("FOLLOWING", "velocity", {
      navigatingWithRoute: true,
      msSinceGestureExit: null,
    }),
    "FOLLOWING"
  );
});

// ── B/G: controlador único de cámara ─────────────────────────────────

test("solo el controlador escribe la cámara (spy) y el botón es idempotente", () => {
  const calls = [];
  const sink = {
    jumpTo: (cmd) => calls.push(["jumpTo", cmd]),
    easeTo: (cmd) => calls.push(["easeTo", cmd]),
    stop: () => calls.push(["stop"]),
  };
  applyCameraCommand(sink, { center: P(25, -100), origin: "programmatic" });
  assert.deepEqual(calls.map((c) => c[0]), ["jumpTo"], "sin animación: 1 jumpTo");

  calls.length = 0;
  // Dos toques seguidos del botón: cada animación va precedida de stop() →
  // nunca se apilan animaciones.
  applyCameraCommand(sink, { center: P(25, -100), animate: true, origin: "programmatic" });
  applyCameraCommand(sink, { center: P(25, -100), animate: true, origin: "programmatic" });
  assert.deepEqual(calls.map((c) => c[0]), ["stop", "easeTo", "stop", "easeTo"]);
  assert.ok(calls.every((c, i) => (c[0] === "easeTo" ? calls[i - 1][0] === "stop" : true)));
});

// ── E: anclaje 70–75 % del área visible ──────────────────────────────

/**
 * Y del centro aparente del mapa según mapbox-gl (EdgeInsets#getCenter,
 * dist/mapbox-gl-dev.js:48654-48656): cy = (top + H - bottom) / 2.
 * Es la fórmula que `jumpTo({ padding })` aplica de verdad —`offset` NO se lee
 * (dist/mapbox-gl-dev.js:98301-98344)—.
 */
const mapCenterYFromPadding = (H, padding) =>
  (padding.top + H - padding.bottom) / 2;

test("anclaje: el padding deja el puck al 70–75 % del área visible", () => {
  const H = 699; // alto real del contenedor en T2 (iPhone)
  const top = 106; // borde inferior de la tarjeta superior
  const bottom = 599; // borde superior del panel inferior
  const anchorY = anchorYForBand(top, bottom, PUCK_ANCHOR_FRACTION);
  const padding = computeAnchorPadding(H, anchorY);
  // Reproduce la fórmula de Mapbox, no una propia.
  const centerY = mapCenterYFromPadding(H, padding);
  assert.ok(Math.abs(centerY - anchorY) <= 0.5, `centro en ${centerY} vs ancla ${anchorY}`);
  const fraction = (centerY - top) / (bottom - top);
  assert.ok(
    fraction >= 0.7 && fraction <= 0.75,
    `fracción ${fraction.toFixed(4)} fuera de 70–75 %`
  );
});

test("anclaje: padding cuando el ancla está arriba y cuando está abajo del centro", () => {
  const H = 800;
  // Ancla abajo del centro → padding TOP (empuja el centro hacia abajo).
  const low = computeAnchorPadding(H, 600);
  assert.deepEqual(low, { top: 400, bottom: 0 });
  assert.equal(mapCenterYFromPadding(H, low), 600);
  // Ancla arriba del centro → padding BOTTOM.
  const high = computeAnchorPadding(H, 200);
  assert.deepEqual(high, { top: 0, bottom: 400 });
  assert.equal(mapCenterYFromPadding(H, high), 200);
  // Justo en el centro → sin padding.
  assert.deepEqual(computeAnchorPadding(H, 400), { top: 0, bottom: 0 });
  // Nunca negativo y acotado al contenedor.
  const clamped = computeAnchorPadding(H, 900);
  assert.equal(clamped.top, H);
  assert.ok(clamped.bottom >= 0);
  // La variante por banda coincide con la de ancla.
  assert.deepEqual(
    computeAnchorPaddingForBand(H, 60, 500, PUCK_ANCHOR_FRACTION),
    computeAnchorPadding(H, anchorYForBand(60, 500, PUCK_ANCHOR_FRACTION))
  );
});

test("frame: paso del vehículo ≤15 px y puck al 72.5 % del área visible", () => {
  const zoom = NAV_ZOOM_BASE;
  const H = 800;
  const anchorY = anchorYForBand(60, 500, PUCK_ANCHOR_FRACTION);
  const vehicle = P(25.0, -100.0);
  // Corrección de un fix impreciso al arrancar: 30 m. Un salto >50 m ya no se
  // desliza, se reubica (Fase 3-B, prueba aparte).
  const target = north(vehicle, 30);
  const r1 = computeFollowFrame(
    {
      vehiclePos: vehicle,
      visualHeading: 0,
      cameraHeading: 0,
      cameraHeadingTs: T0,
      zoomTarget: zoom,
    },
    {
      now: T0 + 33,
      frameScale: 1,
      mapZoom: zoom,
      target,
      targetHeading: 0,
      simHeading: null,
      speedMps: 0,
      route: null,
      anchorY,
      containerHeightPx: H,
      pendingZoom: null,
      accuracy: 30,
      firstGoodFixSeen: true,
      mapBearing: 0,
    }
  );
  assert.ok(
    r1.vehicleStepPx <= 15.001,
    `paso ${r1.vehicleStepPx.toFixed(2)} px > 15 px`
  );

  // El centro de cámara es el VEHÍCULO (criterio: <5 m del vehículo).
  const centerToVehicle = Math.hypot(
    (r1.command.center.lat - r1.state.vehiclePos.lat) * 111_320,
    (r1.command.center.lng - r1.state.vehiclePos.lng) *
      111_320 *
      Math.cos((vehicle.lat * Math.PI) / 180)
  );
  assert.ok(centerToVehicle < 5, `centro a ${centerToVehicle.toFixed(2)} m del vehículo`);
  // Puck al 72.5 % del área visible (por padding, como lo aplica Mapbox).
  const puckY = mapCenterYFromPadding(H, r1.command.padding);
  const fraction = (puckY - 60) / (500 - 60);
  assert.ok(
    fraction >= 0.7 && fraction <= 0.75,
    `puck al ${(fraction * 100).toFixed(1)} % del área visible`
  );
});

// ── C: resolvedor sobre la ruta y vuelta en U ────────────────────────

function makeResolver(opts) {
  return createDriveHeadingResolver({
    getSimHeading: () => ({ active: false, simHeading: null }),
    getGpsHeading: () => opts.gpsHeading,
    getSpeedMps: () => opts.speedMps ?? 3,
    getMovementHeading: () => opts.movementHeading ?? null,
    getDeviceHeading: () => ({
      heading: 0,
      available: "unavailable",
      permission: "denied",
    }),
    getRouteGeometry: () => ({
      path: opts.path,
      vehiclePos: opts.vehiclePos(),
    }),
    minMovementMeters: 5,
    minMovementMs: 500,
  });
}

test("sobre la ruta: no DEVIATING y rumbo ≤15° del segmento con coords.heading obsoleto", () => {
  mock.timers.enable({ apis: ["Date"], now: T0 });
  try {
    // Ruta rumbo 90° (este). El curso MEDIDO por posiciones es 90°; el
    // coords.heading del SO está pegado en 190° (T1: 108.149° obsoleto).
    const path = [P(25.0, -100.0), P(25.0, -99.9)];
    const resolver = makeResolver({
      gpsHeading: 190,
      movementHeading: 90,
      path,
      vehiclePos: () => P(25.0, -99.95),
    });
    let heading = null;
    for (let i = 0; i < 40; i++) {
      heading = resolver.resolve();
      mock.timers.tick(50);
    }
    const dbg = resolver.state.debug;
    assert.equal(resolver.state.deviating, false, "no debe marcar desvío estando sobre la ruta");
    assert.equal(dbg.source, "FOLLOWING_ROUTE");
    const err = Math.abs(((heading - 90 + 540) % 360) - 180);
    assert.ok(err <= 15, `error ${err.toFixed(1)}° > 15° del segmento`);
  } finally {
    mock.timers.reset();
  }
});

test("vuelta en U: se reconoce cuando dos fuentes independientes la confirman", () => {
  mock.timers.enable({ apis: ["Date"], now: T0 });
  try {
    // Ruta rumbo 0° (norte); el vehículo gira 180° y avanza al sur.
    const path = [P(25.0, -100.0), P(25.1, -100.0)];
    let pos = P(25.05, -100.0);
    const opts = {
      gpsHeading: 180,
      movementHeading: 180,
      path,
      speedMps: 5,
      vehiclePos: () => pos,
    };
    const resolver = makeResolver(opts);
    let heading = null;
    for (let i = 0; i < 30; i++) {
      heading = resolver.resolve();
      mock.timers.tick(500);
      pos = P(pos.lat - 6 / 111_320, pos.lng); // 6 m al sur por tick
    }
    const err = Math.abs(((heading - 180 + 540) % 360) - 180);
    assert.ok(err <= 25, `la vuelta en U debe reconocerse: error ${err.toFixed(1)}°`);
  } finally {
    mock.timers.reset();
  }
});

// ── B: rumbo inicial desde el segmento con ruta activa (T2) ──────────

test("rumbo inicial: con ruta y sin curso se toma el segmento (vehículo parado)", () => {
  mock.timers.enable({ apis: ["Date"], now: T0 });
  try {
    // Ruta al ESTE (90°). coords.heading del SO pegado en 202° (T2), sin
    // curso medido y sin velocidad: antes se resolvía con el bearing entre
    // ticks hacia un GPS impreciso (268° durante 27 s).
    const path = [P(25.0, -100.0), east(P(25.0, -100.0), 600)];
    const resolver = createDriveHeadingResolver({
      getSimHeading: () => ({ active: false, simHeading: null }),
      getGpsHeading: () => 202,
      getSpeedMps: () => 0,
      getMovementHeading: () => null,
      getDeviceHeading: () => ({ heading: 0, available: "unavailable", permission: "denied" }),
      getRouteGeometry: () => ({ path, vehiclePos: P(25.0, -100.00005) }),
    });
    const headings = [];
    for (let i = 0; i < 10; i++) {
      headings.push(resolver.resolve());
      mock.timers.tick(200);
    }
    // Criterio: ≤20° del segmento desde el PRIMER frame.
    for (const h of headings) {
      assert.ok(h != null, "hay rumbo desde el primer frame");
      const err = Math.abs(((h - 90 + 540) % 360) - 180);
      assert.ok(err <= 20, `error ${err.toFixed(1)}° respecto al segmento (90°)`);
    }
    assert.equal(resolver.state.debug.source, "FOLLOWING_ROUTE", "fuente honesta");
    // Sin ningún salto: el rumbo es el del segmento desde el inicio.
    assert.ok(Math.abs(((headings[0] - 90 + 540) % 360) - 180) < 1);
  } finally {
    mock.timers.reset();
  }
});

test("rumbo: un bearing entre ticks VIEJO no sostiene la cámara", () => {
  mock.timers.enable({ apis: ["Date"], now: T0 });
  try {
    // Sin ruta, sin coords.heading, sin curso: solo un bearing de tick que se
    // midió una vez y ya caducó (4 s). El rumbo no puede seguir saliendo de él.
    let pos = P(25.0, -100.0);
    const resolver = createDriveHeadingResolver({
      getSimHeading: () => ({ active: false, simHeading: null }),
      getGpsHeading: () => null,
      getSpeedMps: () => 0,
      getMovementHeading: () => null,
      getDeviceHeading: () => ({ heading: 0, available: "unavailable", permission: "denied" }),
      getRouteGeometry: () => ({ path: null, vehiclePos: pos }),
    });
    resolver.resolve();
    pos = east(pos, 30); // 30 m al este → bearing 90 medido aquí
    resolver.resolve();
    mock.timers.tick(1_000);
    pos = east(pos, 30);
    resolver.resolve();
    const acquired = resolver.state.acceptedHeading;
    assert.ok(acquired != null, "se adquirió un rumbo con el desplazamiento real");
    // 6 s después del último desplazamiento real: el bearing caduca. El
    // rumbo puede MANTENERSE (HELD) —el puck no debe volver a norte— pero no
    // puede seguir atribuyéndose a la señal de movimiento (GPS).
    mock.timers.tick(6_000);
    const after = resolver.resolve();
    assert.equal(resolver.state.debug.source, "HELD", "fuente honesta tras caducar");
    assert.equal(after, acquired, "mantiene el último rumbo confiable");
  } finally {
    mock.timers.reset();
  }
});

// ── D: traza liviana ─────────────────────────────────────────────────

test("traza: los eventos programáticos se agregan por tipo y segundo", () => {
  mock.timers.enable({ apis: ["Date"], now: T0 });
  try {
    const rec = new TraceRecorder();
    for (let i = 0; i < 50; i++) rec.recordMapEvent("movestart", false);
    for (let i = 0; i < 7; i++) rec.recordMapEvent("movestart:exit-check", false);
    mock.timers.tick(1_000);
    for (let i = 0; i < 10; i++) rec.recordMapEvent("movestart", false);
    rec.recordMapEvent("dragstart", true);
    mock.timers.tick(1_000);
    for (let i = 0; i < 5; i++) rec.recordMapEvent("rotatestart", false);

    const json = rec.toJSON();
    const gestures = json.events.filter((e) => e.type === "dragstart");
    assert.equal(gestures.length, 1, "los gestos reales se guardan completos");
    assert.equal(gestures[0].hasOriginalEvent, true);
    assert.equal(
      json.events.filter((e) => e.hasOriginalEvent === false).length,
      0,
      "los programáticos NO se guardan uno por uno"
    );
    const counts = json.programmaticEvents ?? [];
    const total = counts.reduce((s, e) => s + e.count, 0);
    assert.equal(total, 72, "no se pierde ningún evento, solo se agrega");
    // movestart: dos segundos distintos → dos filas (50 y 10).
    const moves = counts.filter((e) => e.type === "movestart");
    assert.equal(moves.length, 2);
    assert.deepEqual(moves.map((m) => m.count), [50, 10]);
    // El buffer de eventos reales no se inunda.
    assert.ok(json.events.length < 10, `eventos reales: ${json.events.length}`);
  } finally {
    mock.timers.reset();
  }
});

test("traza: los programáticos INTERCALADOS del mismo segundo se agrupan igual", () => {
  // T3 real: movestart, movestart:exit-check, moveend, rotatestart,
  // rotatestart:exit-check, rotateend se alternan en cada frame. Agrupar solo
  // contra la última fila creaba una fila por evento y 2 000 filas en 41 s
  // (el tope del buffer) — los tipos nunca eran consecutivos.
  mock.timers.enable({ apis: ["Date"], now: T0 });
  try {
    const rec = new TraceRecorder();
    const cycle = [
      "movestart",
      "movestart:exit-check",
      "moveend",
      "rotatestart",
      "rotatestart:exit-check",
      "rotateend",
    ];
    for (let i = 0; i < 8; i++) for (const type of cycle) rec.recordMapEvent(type, false);
    const counts = rec.toJSON().programmaticEvents ?? [];
    assert.equal(counts.reduce((s, e) => s + e.count, 0), 48, "no se pierde ningún evento");
    assert.equal(counts.length, 6, `una fila por tipo: ${counts.length}`);
    for (const row of counts) assert.equal(row.count, 8);
    mock.timers.tick(1_000);
    for (let i = 0; i < 2; i++) for (const type of cycle) rec.recordMapEvent(type, false);
    const after = rec.toJSON().programmaticEvents ?? [];
    assert.equal(after.length, 12, "segundo distinto → filas nuevas");
  } finally {
    mock.timers.reset();
  }
});

test("rumbo: un vehículo parado no adquiere rumbo del heading del SO", () => {
  // T3: al montar, el primer fix traía heading=314° con 0.22 m/s y la cámara
  // arrancó en 31° para barrer 119° en 1 s hasta el segmento (108°).
  mock.timers.enable({ apis: ["Date"], now: T0 });
  try {
    const resolver = createDriveHeadingResolver({
      getSimHeading: () => ({ active: false, simHeading: null }),
      getGpsHeading: () => 314,
      getSpeedMps: () => 0.22,
      getMovementHeading: () => null,
      getDeviceHeading: () => ({ heading: 0, available: "unavailable", permission: "denied" }),
      getRouteGeometry: () => ({ path: null, vehiclePos: null }),
    });
    const first = resolver.resolve();
    assert.equal(first, null, "quieto y sin ruta: no hay rumbo que inventar");
    assert.equal(resolver.state.debug.source, "NONE");
  } finally {
    mock.timers.reset();
  }
});

test("traza: guarda de anclaje y contexto de etapa se registran", () => {
  const rec = new TraceRecorder();
  rec.recordAnchorMismatch({
    puckPxY: 350,
    anchorPxY: 506.8,
    deviationFraction: 0.22,
    lastsForMs: 2_400,
    paddingTop: 0,
    paddingBottom: 0,
  });
  rec.recordPhase("navigating", 120, {
    stepIndex: 1,
    maneuverType: "turn-left",
    instruction: "Gira a la izquierda",
  });
  const json = rec.toJSON();
  const mismatch = json.events.find((e) => e.kind === "anchor-mismatch");
  assert.ok(mismatch, "se registra anchor-mismatch");
  assert.ok(mismatch.deviationFraction > 0.05);
  const phase = json.events.find((e) => e.kind === "phase");
  assert.equal(phase.stepIndex, 1);
  assert.equal(phase.maneuverType, "turn-left");
  assert.equal(phase.instruction, "Gira a la izquierda");
});

// ── Fase 3-A: tarjeta de guía (próxima maniobra + distancia real) ──────

const step = (distanceMeters, maneuver, instruction) => ({
  distanceMeters,
  durationSeconds: distanceMeters,
  maneuver,
  instruction,
  start: P(25.0, -100.0),
  end: P(25.0, -100.0),
});

// Ruta tipo T4: depart 116.8 m → turn-left 300 m → arrive 200 m.
const T4_STEPS = [
  step(116.8, "depart", "Comienza tu viaje"),
  step(300, "turn-left", "Gira a la izquierda en Camino Real a la Lira"),
  step(200, "arrive", "Llega a tu destino"),
];
const T4_TOTAL = 616.8;

function cardAt(done, state = { state: initialGuidanceState() }) {
  return computeGuidance(state.state, T4_STEPS, T4_TOTAL, done);
}

test("tarjeta: la distancia mostrada es la REAL a la próxima maniobra (T4: 360 m con el giro a 60 m)", () => {
  // T4: ~55 m recorridos y la tarjeta decía «en 360 m» (accEnd + next.distance).
  const g = cardAt(56);
  assert.equal(g.maneuver, "turn-left");
  const real = 116.8 - 56; // ~60.8 m
  assert.ok(
    Math.abs(g.distanceToManeuver - real) <= 15,
    `distancia ${g.distanceToManeuver} vs real ${real.toFixed(1)}`
  );
  // En ningún punto del trayecto la distancia se aleja >15 m de la real.
  const state = { state: initialGuidanceState() };
  for (let done = 0; done <= T4_TOTAL; done += 5) {
    const r = computeGuidance(state.state, T4_STEPS, T4_TOTAL, done);
    if (r.maneuver === "depart") continue; // etapa sin desplazamiento real
    const ends = stepEnds(T4_STEPS);
    // La maniobra mostrada ocurre al FINAL del step pendiente (para la
    // llegada, el último step termina en el destino).
    const expected = Math.max(0, ends[r.stepIndex] - done);
    assert.ok(
      Math.abs(r.distanceToManeuver - expected) <= 15,
      `done=${done}: ${r.distanceToManeuver} vs ${expected.toFixed(1)}`
    );
  }
});

test("tarjeta: la maniobra ejecutada no vuelve a mostrarse (ni al retroceder)", () => {
  const state = { state: initialGuidanceState() };
  // Avanza hasta pasar el giro (fin del step 1 = 416.8 m).
  for (let done = 0; done <= 430; done += 10) {
    computeGuidance(state.state, T4_STEPS, T4_TOTAL, done);
  }
  const after = computeGuidance(state.state, T4_STEPS, T4_TOTAL, 430);
  assert.notEqual(after.maneuver, "turn-left", "el giro ya ejecutado no se repite");
  // Retroceso fuerte: sigue sin reaparecer la maniobra ejecutada.
  for (const done of [300, 150, 60, 0]) {
    const g = computeGuidance(state.state, T4_STEPS, T4_TOTAL, done);
    assert.notEqual(g.maneuver, "turn-left", `reapareció turn-left en done=${done}`);
    assert.notEqual(g.maneuver, "depart", `volvió a «Comienza tu viaje» en done=${done}`);
  }
});

test("tarjeta: «Comienza tu viaje» solo sin desplazamiento real y no regresa", () => {
  const state = { state: initialGuidanceState() };
  const start = computeGuidance(state.state, T4_STEPS, T4_TOTAL, 0);
  assert.equal(start.maneuver, "depart");
  assert.equal(start.instruction, "Comienza tu viaje");
  // 20 m: aún no hay desplazamiento real (umbral 40 m) → sigue depart.
  assert.equal(computeGuidance(state.state, T4_STEPS, T4_TOTAL, 20).maneuver, "depart");
  // 60 m: ya se desplazó → próxima maniobra.
  const moved = computeGuidance(state.state, T4_STEPS, T4_TOTAL, 60);
  assert.equal(moved.maneuver, "turn-left");
  // Histéresis: retrocede a 10 m y NO vuelve a «Comienza tu viaje».
  assert.equal(computeGuidance(state.state, T4_STEPS, T4_TOTAL, 10).maneuver, "turn-left");
});

test("guía: un recálculo a mitad de viaje no reabre «Comienza tu viaje» (3.1-G)", () => {
  // Viaje original: ya se recorrieron 250 m con la tarjeta en turn-left.
  const before = { state: initialGuidanceState() };
  for (let done = 0; done <= 250; done += 10) {
    computeGuidance(before.state, T4_STEPS, T4_TOTAL, done);
  }
  assert.equal(before.state.departed, true);
  // Recálculo: ruta nueva que arranca en la posición actual (done ≈ 0).
  const RECALC_STEPS = [
    step(150, "depart", "Comienza tu viaje"),
    step(350, "turn-right", "Gira a la derecha en Av. Central"),
    step(200, "arrive", "Llega a tu destino"),
  ];
  const recalc = nextGuidanceState(before.state, "ruta-recalculada");
  assert.equal(recalc.departed, true, "el estado de viaje se hereda");
  assert.equal(recalc.maxDoneM, 0, "el progreso sí es de la ruta nueva");
  const g = computeGuidance(recalc, RECALC_STEPS, 700, 5);
  assert.equal(g.maneuver, "turn-right");
  assert.notEqual(g.maneuver, "depart");
  assert.ok(Math.abs(g.distanceToManeuver - 145) <= 1, `distancia ${g.distanceToManeuver}`);
  assert.ok(g.fractionCompleted < 0.02, "el progreso nuevo no se reinicia en falso");
  // Cambiar de etapa (recolección → entrega) SÍ empieza de cero.
  const newLeg = nextGuidanceState(null, "otra-etapa");
  assert.equal(newLeg.departed, false);
  assert.equal(computeGuidance(newLeg, RECALC_STEPS, 700, 2).maneuver, "depart");
});

// ── Fase 3.1-A/B/F: puerta de aceptación de fixes GPS ──────────────────

test("gate: coordenadas reestampadas en caché se rechazan (T4: primer fix aceptado = #5)", () => {
  const state = createFixGateState();
  const cached = P(25.0, -100.0);
  const real = north(cached, 20.7); // #5, 20.7 m al norte del caché
  const t0 = T0;
  // #0 y #1: posición en caché con 7.3 s de antigüedad.
  const r0 = evaluateGpsFix(state, {
    ...cached,
    accuracy: 6,
    deviceT: t0 - 7_290,
    arrivedAt: t0,
  });
  assert.equal(r0.accepted, false);
  assert.equal(r0.reason, "stale");
  const r1 = evaluateGpsFix(state, {
    ...cached,
    accuracy: 6,
    deviceT: t0 - 7_290,
    arrivedAt: t0,
  });
  assert.equal(r1.accepted, false);
  // #2: MISMO lat/lng que #0 con deviceT nuevo y accuracy 6 (el bug de T4).
  const r2 = evaluateGpsFix(state, {
    ...cached,
    accuracy: 6,
    deviceT: t0 - 90,
    arrivedAt: t0,
  });
  assert.equal(r2.accepted, false);
  assert.equal(r2.reason, "stale-coords");
  // #3 (79 m) y #4 (52 m): precisión inaceptable sin fix bueno fresco.
  assert.equal(
    evaluateGpsFix(state, {
      ...north(cached, 55),
      accuracy: 79,
      deviceT: t0,
      arrivedAt: t0,
    }).accepted,
    false
  );
  const r4 = evaluateGpsFix(state, {
    ...north(cached, 30),
    accuracy: 52,
    deviceT: t0,
    arrivedAt: t0 + 580,
  });
  assert.equal(r4.accepted, false);
  // #5: primer fix real (accuracy 5 m) → único aceptado.
  const r5 = evaluateGpsFix(state, {
    ...real,
    accuracy: 5,
    deviceT: t0 + 1_100,
    arrivedAt: t0 + 1_110,
  });
  assert.equal(r5.accepted, true);
  assert.equal(r5.lat, real.lat);
  assert.equal(r5.accuracy, 5);
});

test("gate: sin fix bueno durante 10 s se usa el mejor ≤ 50 m (3.1-F)", () => {
  const state = createFixGateState();
  const a = P(25.0, -100.0);
  const b = north(a, 12);
  const c = north(a, 25);
  assert.equal(
    evaluateGpsFix(state, { ...a, accuracy: 45, deviceT: T0, arrivedAt: T0 }).accepted,
    false
  );
  assert.equal(
    evaluateGpsFix(state, { ...b, accuracy: 48, deviceT: T0, arrivedAt: T0 + 3_000 }).accepted,
    false
  );
  // A los 10 s sin fix ≤ 20 m: se acepta el MEJOR disponible (A, 45 m).
  const esc = evaluateGpsFix(state, {
    ...c,
    accuracy: 48,
    deviceT: T0 + 10_000,
    arrivedAt: T0 + 10_000,
  });
  assert.equal(esc.accepted, true);
  assert.equal(esc.escaped, true);
  assert.equal(esc.lat, a.lat, "usa el candidato de 45 m, no el fix actual de 48 m");
  assert.equal(esc.useCurrent, false);
  // Un fix realmente bueno entra normalmente.
  const good = evaluateGpsFix(state, {
    ...north(a, 40),
    accuracy: 4,
    deviceT: T0 + 11_000,
    arrivedAt: T0 + 11_000,
  });
  assert.equal(good.accepted, true);
  assert.equal(good.escaped, false);
});

// ── Fase 3-B: arranque robusto con fixes pobres (T4: 79 m y 52 m) ──────

test("arranque: un fix de 79 m no deriva velocidad disparatada (T4: 42.02 m/s)", () => {
  let state = initialSpeedHeadingState();
  const a = P(25.0, -100.0);
  // coords.speed real ≈1.2 m/s, pero el primer fix llega con accuracy 79 m y
  // el siguiente a 50 m de distancia (T4).
  state = applyGpsFix(state, { pos: a, ts: T0, accuracy: 79, coordsSpeed: 1.2 }, null);
  state = applyGpsFix(
    state,
    { pos: north(a, 50), ts: T0 + 1_000, accuracy: 52, coordsSpeed: 1.2 },
    null
  );
  assert.ok(state.speedMps <= 3 * 1.2 + 3, `velocidad ${state.speedMps} > envolvente`);
  // Sin coords.speed, un salto de 50 m con accuracy 52 m NO deriva velocidad.
  let bare = initialSpeedHeadingState();
  bare = applyGpsFix(bare, { pos: a, ts: T0, accuracy: 79 }, null);
  bare = applyGpsFix(bare, { pos: north(a, 50), ts: T0 + 1_000, accuracy: 52 }, null);
  assert.equal(bare.speedMps, 0, "fixes pobres no derivan velocidad");
  // Tampoco derivan rumbo.
  assert.equal(effectiveCourseHeading(bare), null, "fixes pobres no derivan rumbo");
});

test("arranque: la velocidad derivada nunca excede 3·coords.speed + 3 m/s", () => {
  let state = initialSpeedHeadingState();
  const a = P(25.0, -100.0);
  state = applyGpsFix(state, { pos: a, ts: T0, accuracy: 8, coordsSpeed: 1 }, null);
  // 30 m en 1 s (30 m/s) con coords.speed 1 m/s: fuera de la envolvente.
  state = applyGpsFix(
    state,
    { pos: north(a, 30), ts: T0 + 1_000, accuracy: 8 },
    null
  );
  assert.ok(
    state.speedMps === 0 || state.speedMps <= 3 * 1 + 3,
    `velocidad ${state.speedMps} excede la envolvente`
  );
});

test("arranque: sin fix bueno, un fix pobre no mueve el vehículo visual", () => {
  const zoom = NAV_ZOOM_BASE;
  const H = 800;
  const vehicle = P(25.0, -100.0);
  const r = computeFollowFrame(
    {
      vehiclePos: vehicle,
      visualHeading: null,
      cameraHeading: null,
      cameraHeadingTs: null,
      zoomTarget: null,
    },
    {
      now: T0 + 33,
      frameScale: 1,
      mapZoom: zoom,
      target: north(vehicle, 18.5), // salto del primer fix (T4)
      targetHeading: null,
      simHeading: null,
      speedMps: 0,
      route: null,
      anchorY: anchorYForBand(60, 500, PUCK_ANCHOR_FRACTION),
      containerHeightPx: H,
      pendingZoom: null,
      accuracy: 79,
      firstGoodFixSeen: false,
      mapBearing: 0,
    }
  );
  assert.equal(r.vehicleStepPx, 0, "sin fix bueno el puck no se mueve");
  // Y no se inventa rumbo: la cámara se queda en el bearing actual del mapa.
  assert.equal(r.state.visualHeading, null);
  assert.equal(r.state.cameraHeading, null);
  assert.equal(r.command.bearing, 0);
});

test("arranque: el primer fix bueno lejano se reubica (snap) en vez de deslizarse", () => {
  const zoom = NAV_ZOOM_BASE;
  const H = 800;
  const vehicle = P(25.0, -100.0);
  const target = north(vehicle, 55); // 55 m del primer fix bueno
  const r = computeFollowFrame(
    {
      vehiclePos: vehicle,
      visualHeading: null,
      cameraHeading: null,
      cameraHeadingTs: null,
      zoomTarget: null,
    },
    {
      now: T0 + 33,
      frameScale: 1,
      mapZoom: zoom,
      target,
      targetHeading: null,
      simHeading: null,
      speedMps: 0,
      route: null,
      anchorY: anchorYForBand(60, 500, PUCK_ANCHOR_FRACTION),
      containerHeightPx: H,
      pendingZoom: null,
      accuracy: 9,
      firstGoodFixSeen: true,
      mapBearing: 0,
    }
  );
  const moved = haversineMeters(vehicle, r.state.vehiclePos);
  assert.ok(moved >= 54, `se reubicó ${moved.toFixed(1)} m (esperado ~55)`);
});

test("arranque: la primera adquisición de rumbo es de un golpe, sin barrido desde 0°", () => {
  const zoom = NAV_ZOOM_BASE;
  const H = 800;
  const vehicle = P(25.0, -100.0);
  const input = {
    now: T0,
    frameScale: 1,
    mapZoom: zoom,
    target: vehicle,
    targetHeading: 175,
    simHeading: null,
    speedMps: 3,
    route: null,
    anchorY: anchorYForBand(60, 500, PUCK_ANCHOR_FRACTION),
    containerHeightPx: H,
    pendingZoom: null,
    accuracy: 8,
    firstGoodFixSeen: true,
    mapBearing: 0, // el mapa venía norte arriba
  };
  const r = computeFollowFrame(
    {
      vehiclePos: vehicle,
      visualHeading: null,
      cameraHeading: null,
      cameraHeadingTs: null,
      zoomTarget: null,
    },
    input
  );
  // Un solo cuadro: la cámara ya está en 175° (antes: 0 → 175 a 150°/s).
  assert.equal(Math.round(r.command.bearing), 175);
  // Después del golpe, el límite es 60°/s: 200 ms ⇒ 12°.
  const next = computeFollowFrame(r.state, {
    ...input,
    now: T0 + 200,
    targetHeading: 175 + 90,
  });
  const delta = Math.abs(((next.command.bearing - 175 + 540) % 360) - 180);
  assert.ok(delta <= 12.5, `giro de ${delta.toFixed(1)}° en 200 ms (>60°/s)`);
});
