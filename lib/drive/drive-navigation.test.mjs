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
  applyCameraCommand,
  computeAnchorOffsetPx,
  nextFollowStateOnMapEvent,
  PUCK_ANCHOR_FRACTION,
  shouldReenterFollow,
  AUTO_REENTER_MS,
} from "./camera-controller.ts";
import {
  applyGpsFix,
  effectiveCourseHeading,
  effectiveSpeedMps,
  initialSpeedHeadingState,
  MAX_SPEED_MPS,
  SPEED_EXPIRY_MS,
} from "./speed-heading.ts";
import {
  computeFollowFrame,
  metersPerPixelAt,
  NAV_ZOOM_BASE,
} from "./follow-frame.ts";
import { createDriveHeadingResolver } from "./heading-resolver.ts";

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
  state = applyGpsFix(state, { pos: a, ts: T0, accuracy: 26 }, null);
  state = applyGpsFix(state, { pos: north(a, 1.8), ts: T0 + 2, accuracy: 26 }, null);
  state = applyGpsFix(state, { pos: north(a, 3.7), ts: T0 + 4, accuracy: 26 }, null);
  assert.equal(state.speedMps, 0, "los fixes con dt<0.25 s no aportan velocidad");
  // Fix normal 1 s después, 1.4 m recorridos (caminata ~1.4 m/s).
  state = applyGpsFix(
    state,
    { pos: north(a, 1.4), ts: T0 + 1_000, accuracy: 8 },
    null
  );
  assert.ok(state.speedMps > 0.5 && state.speedMps < 4, `velocidad ${state.speedMps}`);
  assert.ok(state.speedMps <= MAX_SPEED_MPS);
});

test("velocidad: cap de 70 m/s y preferencia por coords.speed", () => {
  let state = initialSpeedHeadingState();
  const a = P(25.0, -100.0);
  state = applyGpsFix(state, { pos: a, ts: T0, accuracy: 10 }, null);
  state = applyGpsFix(
    state,
    { pos: north(a, 200), ts: T0 + 500, accuracy: 10 },
    null
  );
  assert.equal(state.speedMps, MAX_SPEED_MPS, "200 m en 0.5 s → capado a 70 m/s");
  state = applyGpsFix(
    state,
    { pos: north(a, 201), ts: T0 + 1_000, accuracy: 10, coordsSpeed: 1.2 },
    null
  );
  assert.equal(state.speedMps, 1.2, "coords.speed válida manda");
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

test("anclaje: el puck queda al 72.5 % del área visible (todas las fracciones)", () => {
  const H = 800;
  const top = 60;
  const bottom = 500; // borde superior del panel inferior
  const base = computeAnchorOffsetPx(H, top, bottom, PUCK_ANCHOR_FRACTION);
  const screenY = H / 2 + base;
  const fraction = (screenY - top) / (bottom - top);
  assert.ok(
    fraction >= 0.7 && fraction <= 0.75,
    `fracción ${fraction.toFixed(4)} fuera de 70–75 %`
  );
  // El default también respeta la banda.
  const def = computeAnchorOffsetPx(H, top, bottom) + H / 2;
  const defFraction = (def - top) / (bottom - top);
  assert.ok(defFraction >= 0.7 && defFraction <= 0.75);
});

test("frame: paso del vehículo ≤15 px y puck al 72.5 % del área visible", () => {
  const zoom = NAV_ZOOM_BASE;
  const H = 800;
  const base = computeAnchorOffsetPx(H, 60, 500, PUCK_ANCHOR_FRACTION);
  const vehicle = P(25.0, -100.0);
  const target = north(vehicle, 60); // salto de 60 m (fix impreciso al arrancar)
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
      baseOffsetY: base,
      pendingZoom: null,
      accuracy: 30,
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
  // Puck al 72.5 % del área visible (por offset).
  const puckY = H / 2 + r1.command.offset[1];
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
