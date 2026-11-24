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
import { readFileSync } from "node:fs";
import test, { mock } from "node:test";

import {
  ROUTE_CLEAR_GRACE_MS,
  ROUTE_FORCE_RETRY_MS,
  shouldApplyRouteRefresh,
  shouldClearRouteOnTargetChange,
  shouldForceRouteRetry,
} from "./route-refresh.ts";
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
  courseAgeMs,
  COURSE_EXPIRY_MS,
  effectiveCourseHeading,
  effectiveMovementSpeedMps,
  effectiveSpeedMps,
  expiredCourseHeading,
  hasValidSpeed,
  initialSpeedHeadingState,
  MAX_PLAUSIBLE_SPEED_MPS,
  SPEED_EXPIRY_MS,
} from "./speed-heading.ts";
import {
  nearestPointOnPath,
  nearestPointOnPathByProgress,
  TraceRecorder,
} from "./trace-recorder.ts";
import {
  computeFollowFrame,
  metersPerPixelAt,
  NAV_ZOOM_BASE,
} from "./follow-frame.ts";
import { createDriveHeadingResolver } from "./heading-resolver.ts";
import {
  createRouteDirectionTracker,
  projectRouteByDirection,
  ROUTE_SNAP_MAX_LATERAL_M,
} from "./route-direction.ts";
import {
  computeGuidance,
  GPS_STALE_DISTANCE_MS,
  GPS_WEAK_GRACE_MS,
  initialGuidanceState,
  isGpsWeak,
  nextGuidanceState,
  shouldHideManeuverDistance,
  shouldHoldLastGuidance,
  stepEnds,
} from "./guidance.ts";
import {
  DRIVER_STATE_SNAPSHOT_KEY,
  DRIVER_STATE_SNAPSHOT_TTL_MS,
  ORDER_EXCLUDED_FROM_SNAPSHOT,
  clearDriverStateSnapshot,
  decodeDriverStateSnapshot,
  encodeDriverStateSnapshot,
  hasActiveWork,
  readDriverStateSnapshot,
  sanitizeDriverStateForSnapshot,
  writeDriverStateSnapshot,
} from "./driver-state-snapshot.ts";
import {
  OFFLINE_FAILURES_THRESHOLD,
  OFFLINE_LABEL,
  OFFLINE_RECALC_LABEL,
  isNetworkDown,
  resolveNetworkSignal,
  routeRecalcNotice,
} from "./connection.ts";
import { createFixGateState, evaluateGpsFix } from "./fix-gate.ts";
import { stageActionFor, stageActionGapMessage } from "./stage-action.ts";
import {
  NOT_ASSIGNED_ERROR,
  decideRestaurantPickup,
  restaurantDestinationArrivalError,
} from "./restaurant-pickup.ts";
import {
  classifySwipeEnd,
  swipeFillPct,
  swipeProgressPct,
  swipeReachedThreshold,
  swipeTravelPx,
} from "./swipe-gesture.ts";
import { getRoadRoute, haversineMeters } from "@/lib/dispatch/routing";

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

test("frame: avance continuo por cuadro (sin saltos) y puck al 72.5 % del área visible", () => {
  const zoom = NAV_ZOOM_BASE;
  const H = 800;
  const anchorY = anchorYForBand(60, 500, PUCK_ANCHOR_FRACTION);
  const vehicle = P(25.0, -100.0);
  // Fix 30 m por delante con el vehículo a 15 m/s (arranque con corrección
  // pendiente): el cuadro avanza v·dt con la corrección limitada, nunca salta.
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
      speedMps: 15,
      route: null,
      anchorY,
      containerHeightPx: H,
      pendingZoom: null,
      accuracy: 30,
      firstGoodFixSeen: true,
      navigationReady: true,
      mapBearing: 0,
      fixTs: T0 + 33,
    }
  );
  // Un cuadro de 33 ms a 15 m/s = 0.5 m; la corrección de 30 m no produce
  // ningún tirón (tasa limitada a 4 m/s). El criterio se mide en METROS con la
  // escala real de Mapbox (tiles de 512): el umbral anterior de 3 px estaba
  // calibrado con la fórmula de 256 y equivalía a 1.3 m por cuadro.
  const pasoM = r1.vehicleStepPx * metersPerPixelAt(zoom, vehicle.lat);
  assert.ok(
    pasoM <= 1,
    `paso ${pasoM.toFixed(2)} m en un cuadro (${r1.vehicleStepPx.toFixed(2)} px)`
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
    ...(opts.course !== undefined
      ? {
          getCourseHeading: () => ({
            heading: opts.course,
            ageMs: opts.courseAgeMs ?? 0,
          }),
        }
      : {}),
    getMovementSpeedMps: () => opts.movementSpeed ?? opts.speedMps ?? 3,
    getCoordsSpeedMps: () => opts.coordsSpeed ?? null,
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
    mock.timers.tick(1_000);
    pos = east(pos, 30); // 30 m al este → bearing 90 medido aquí
    resolver.resolve();
    mock.timers.tick(6_000);
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

// ── Fase 6-B: paso de guía tras confirmar la recolección ──────────────

test("etapa: al llegar, la acción del deslizador sale de la ETAPA, no del sondeo (6-B)", () => {
  // Dentro de la geocerca navPhase ya es at_pickup mientras orderAction sigue
  // en navigate_pickup (el sondeo tarda hasta 10 s). Antes el deslizador
  // devolvía false sin mensaje y había que volver a deslizar.
  assert.equal(stageActionFor("at_pickup", "navigate_pickup", "mandado"), "picked_up");
  // Con el sondeo ya refrescado, la misma acción canónica.
  assert.equal(stageActionFor("at_pickup", "picked_up", "mandado"), "picked_up");
  // Mismo caso en la entrega.
  assert.equal(stageActionFor("at_delivery", "navigate_delivery", "mandado"), "delivered");
  assert.equal(stageActionFor("at_delivery", "delivered", "restaurant"), "delivered");
  // Restaurante: también confirma la recolección (restaurantPickedUpAt, Fase A).
  assert.equal(stageActionFor("at_pickup", "navigate_pickup", "restaurant"), "picked_up");
  // Fuera de las etapas de acción no hay nada que confirmar.
  assert.equal(stageActionFor("to_pickup", "navigate_pickup", "mandado"), null);
  assert.equal(stageActionFor("done", null, "mandado"), null);
  assert.equal(stageActionFor(null, null, null), null);
});

test("guía: la recolección antes del final del tramo no deja la tarjeta en la llegada (6-B2)", () => {
  // Tramo de recolección: depart 120 m + arrive 80 m. La geocerca de 50 m hace
  // que la recolección se confirme a ~30 m del final, así que el progreso
  // NUNCA llega al total del tramo viejo.
  const PICKUP_STEPS = [
    step(120, "depart", "Comienza tu viaje"),
    step(80, "arrive", "Llega al punto de recogida"),
  ];
  const PICKUP_TOTAL = 200;
  const tracker = initialGuidanceState();
  for (let done = 0; done <= PICKUP_TOTAL; done += 10) {
    computeGuidance(tracker, PICKUP_STEPS, PICKUP_TOTAL, done);
  }
  const atPickup = computeGuidance(tracker, PICKUP_STEPS, PICKUP_TOTAL, 170);
  assert.equal(atPickup.maneuver, "arrive");
  assert.ok(
    atPickup.distanceToManeuver > 0 && atPickup.distanceToManeuver <= 50,
    `distancia a la llegada ${atPickup.distanceToManeuver}`
  );

  // Confirmada la recolección, la ENTREGA es una ruta nueva que nace en la
  // posición actual: el estado de la tarjeta pertenece a la etapa nueva.
  const DELIVERY_STEPS = [
    step(60, "depart", "Comienza tu viaje"),
    step(300, "turn-right", "Gira a la derecha en Av. Central"),
    step(150, "arrive", "Llega a tu destino"),
  ];
  const DELIVERY_TOTAL = 510;
  const delivery = nextGuidanceState(null, "entrega");
  const start = computeGuidance(delivery, DELIVERY_STEPS, DELIVERY_TOTAL, 0);
  assert.equal(start.maneuver, "depart", "la etapa nueva arranca en su propio paso");
  // A 45 m la tarjeta muestra la PRIMERA maniobra real de la entrega con su
  // distancia real sobre la ruta nueva (fin del depart 60 m − 45 m = 15 m).
  const moved = computeGuidance(delivery, DELIVERY_STEPS, DELIVERY_TOTAL, 45);
  assert.equal(moved.maneuver, "turn-right");
  assert.notEqual(moved.maneuver, "arrive", "no se queda en la llegada anterior");
  assert.ok(
    Math.abs(moved.distanceToManeuver - 15) <= 1,
    `distancia ${moved.distanceToManeuver}`
  );
  assert.ok(moved.fractionCompleted < 0.1, "el progreso es de la ruta nueva");
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
  // Primer fix: semilla buena (fija lastGoodAt para medir el escape).
  assert.equal(
    evaluateGpsFix(state, { ...a, accuracy: 5, deviceT: T0, arrivedAt: T0 }).accepted,
    true
  );
  assert.equal(
    evaluateGpsFix(state, { ...b, accuracy: 45, deviceT: T0, arrivedAt: T0 + 3_000 }).accepted,
    false
  );
  assert.equal(
    evaluateGpsFix(state, { ...c, accuracy: 48, deviceT: T0, arrivedAt: T0 + 6_000 }).accepted,
    false
  );
  // A los 10 s sin fix ≤ 20 m: se acepta el MEJOR disponible (B, 45 m).
  const esc = evaluateGpsFix(state, {
    ...north(a, 30),
    accuracy: 48,
    deviceT: T0 + 10_000,
    arrivedAt: T0 + 10_000,
  });
  assert.equal(esc.accepted, true);
  assert.equal(esc.escaped, true);
  assert.equal(esc.lat, b.lat, "usa el candidato de 45 m, no el fix actual de 48 m");
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
      navigationReady: false,
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
      navigationReady: true,
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
    navigationReady: true,
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


// ── Fase 4-A: curso robusto a baja velocidad y calentamiento ──────────

test("curso: un salto fuera de la envolvente 3·coords.speed+3 no fija el rumbo (T7)", () => {
  let state = initialSpeedHeadingState();
  const start = P(25.0, -100.0);
  // Caminata real al este: 1.3 m/s durante 10 s (10 m desde el ancla).
  for (let i = 1; i <= 10; i++) {
    state = applyGpsFix(
      state,
      {
        pos: east(start, i * 1.3),
        ts: T0 + i * 1_000,
        accuracy: 4,
        coordsSpeed: 1.3,
      },
      null
    );
  }
  const course = effectiveCourseHeading(state, T0 + 10_000);
  assert.ok(course != null && Math.abs(course - 90) < 8, `curso ${course}`);
  // Corrección de 8.7 m al norte en 1.1 s con coords.speed 1.2 (T7 #6):
  // 7.9 m/s > 3·1.2+3 = 6.6 → NO es movimiento.
  const before = state.courseHeading;
  state = applyGpsFix(
    state,
    { pos: north(east(start, 13), 8.7), ts: T0 + 11_100, accuracy: 4, coordsSpeed: 1.2 },
    null
  );
  assert.equal(state.courseHeading, before, "el salto no puede girar el curso");
  // Tampoco renueva el movimiento confirmado.
  assert.ok(
    (courseAgeMs(state, T0 + 11_100) ?? Infinity) <= COURSE_EXPIRY_MS,
    "el movimiento confirmado previo sigue fresco"
  );
});

test("curso: no se actualiza con coords.speed < 0.5 m/s ni con accuracy > 10 m", () => {
  let low = initialSpeedHeadingState();
  let wide = initialSpeedHeadingState();
  const start = P(25.0, -100.0);
  for (let i = 1; i <= 12; i++) {
    low = applyGpsFix(
      low,
      { pos: east(start, i * 2), ts: T0 + i * 1_000, accuracy: 4, coordsSpeed: 0.4 },
      null
    );
    wide = applyGpsFix(
      wide,
      { pos: east(start, i * 12), ts: T0 + i * 1_000, accuracy: 15, coordsSpeed: 1.5 },
      null
    );
  }
  assert.equal(effectiveCourseHeading(low, T0 + 12_000), null);
  assert.equal(effectiveCourseHeading(wide, T0 + 12_000), null);
});

test("curso: un curso sin movimiento confirmado caduca como fuente a los 3 s", () => {
  let state = initialSpeedHeadingState();
  const start = P(25.0, -100.0);
  for (let i = 1; i <= 10; i++) {
    state = applyGpsFix(
      state,
      { pos: east(start, i * 1.3), ts: T0 + i * 1_000, accuracy: 4, coordsSpeed: 1.3 },
      null
    );
  }
  assert.ok(effectiveCourseHeading(state, T0 + 10_000) != null);
  // Parado 4 s (velocidad 0, sin desplazamiento): el valor existe pero ya no
  // es fuente fresca; el respaldo es `expiredCourseHeading`.
  let pos = east(start, 13);
  for (let i = 1; i <= 4; i++) {
    pos = north(pos, i % 2 === 0 ? 0.3 : -0.3);
    state = applyGpsFix(
      state,
      { pos, ts: T0 + 10_000 + i * 1_000, accuracy: 4, coordsSpeed: 0 },
      null
    );
  }
  assert.equal(effectiveCourseHeading(state, T0 + 14_000), null);
  assert.equal(expiredCourseHeading(state, T0 + 14_000), state.courseHeading);
  assert.equal(effectiveMovementSpeedMps(state, T0 + 14_000), 0);
});

test("fuentes: el segmento de ruta gana a un curso caducado; el GPS fresco gana al segmento", () => {
  mock.timers.enable({ apis: ["Date"], now: T0 });
  try {
    const path = [P(25.0, -100.0), east(P(25.0, -100.0), 600)]; // 90°
    const vehicle = east(P(25.0, -100.0), 20);
    // Curso caducado 200°, sin GPS y parado, SOBRE la ruta: manda el segmento.
    const resolver = makeResolver({
      gpsHeading: null,
      movementHeading: null,
      course: 200,
      courseAgeMs: COURSE_EXPIRY_MS + 1_000,
      speedMps: 0,
      movementSpeed: 0,
      path,
      vehiclePos: () => vehicle,
    });
    let heading = null;
    for (let i = 0; i < 10; i++) {
      heading = resolver.resolve();
      mock.timers.tick(200);
    }
    assert.equal(resolver.state.debug.source, "FOLLOWING_ROUTE");
    assert.ok(Math.abs(((heading - 90 + 540) % 360) - 180) <= 20, `heading ${heading}`);
  } finally {
    mock.timers.reset();
  }
  mock.timers.enable({ apis: ["Date"], now: T0 });
  try {
    const path = [P(25.0, -100.0), east(P(25.0, -100.0), 600)];
    const vehicle = east(P(25.0, -100.0), 20);
    const resolver = makeResolver({
      gpsHeading: 84,
      movementHeading: null,
      course: 200,
      courseAgeMs: COURSE_EXPIRY_MS + 1_000,
      speedMps: 1.2,
      movementSpeed: 1.2,
      path,
      vehiclePos: () => vehicle,
    });
    let heading = null;
    for (let i = 0; i < 15; i++) {
      heading = resolver.resolve();
      mock.timers.tick(200);
    }
    const err = Math.abs(((heading - 84 + 540) % 360) - 180);
    assert.ok(err <= 20, `GPS fresco debe mandar: heading ${heading}`);
    assert.notEqual(resolver.state.debug.source, "HELD");
  } finally {
    mock.timers.reset();
  }
});

test("arranque: el curso por jitter no sobrevive a la caminata (escenario T6, lógica)", () => {
  mock.timers.enable({ apis: ["Date"], now: T0 });
  try {
    const path = [P(25.0, -100.0), east(P(25.0, -100.0), 800)]; // ~90°
    const resolver = makeResolver({
      gpsHeading: 100,
      movementHeading: null,
      speedMps: 1,
      movementSpeed: 1,
      path,
      vehiclePos: () => east(P(25.0, -100.0), 30),
    });
    // 4 s de resolución: el arranque se apoya en el segmento/GPS, no en un
    // curso inventado por correcciones.
    let heading = null;
    for (let i = 0; i < 20; i++) {
      heading = resolver.resolve();
      mock.timers.tick(200);
    }
    assert.ok(
      Math.abs(((heading - 100 + 540) % 360) - 180) <= 30,
      `heading ${heading} lejos del rumbo real ~100°`
    );
  } finally {
    mock.timers.reset();
  }
});

test("frame: sin posición de navegación lista no hay zoom por maniobra", () => {
  const path = [P(25.0, -100.0), east(P(25.0, -100.0), 40), north(east(P(25.0, -100.0), 40), 200)];
  const steps = [
    { distanceMeters: 40, durationSeconds: 40, maneuver: "turn-left", instruction: "Gira", start: path[0], end: path[1] },
    { distanceMeters: 200, durationSeconds: 200, maneuver: "arrive", instruction: "Llega", start: path[1], end: path[2] },
  ];
  const base = {
    now: T0 + 33,
    frameScale: 1,
    mapZoom: NAV_ZOOM_BASE,
    target: P(25.0, -100.0),
    targetHeading: 90,
    simHeading: null,
    speedMps: 0,
    route: { path, steps },
    anchorY: anchorYForBand(60, 500, PUCK_ANCHOR_FRACTION),
    containerHeightPx: 800,
    pendingZoom: null,
    accuracy: 38.8,
    firstGoodFixSeen: false,
    mapBearing: 90,
  };
  const state = {
    vehiclePos: P(25.0, -100.0),
    visualHeading: 90,
    cameraHeading: 90,
    cameraHeadingTs: T0,
    zoomTarget: null,
  };
  const blocked = computeFollowFrame(state, { ...base, navigationReady: false });
  assert.equal(blocked.pendingZoom, null, "sin fix ≤20 m no debe abrir el zoom");
  const ready = computeFollowFrame(state, { ...base, navigationReady: true });
  assert.ok(ready.pendingZoom != null, "con posición lista el giro sí abre el zoom");
});

test("gate: el primer fix ≤50 m se usa como semilla, no DEFAULT_CENTER (T6)", () => {
  const state = createFixGateState();
  const seedPos = north(P(25.0, -100.0), 38);
  const seed = evaluateGpsFix(state, {
    ...seedPos,
    accuracy: 38.8,
    deviceT: T0 - 4_400,
    arrivedAt: T0,
  });
  assert.equal(seed.accepted, true, "la semilla inicial debe aceptarse");
  assert.equal(state.lastGoodAt, null, "sembrar no equivale a fix bueno");
  // El segundo fix pobre no mueve la posición ya sembrada.
  const poor = evaluateGpsFix(state, {
    ...north(seedPos, 12),
    accuracy: 38,
    deviceT: T0 + 1_000,
    arrivedAt: T0 + 1_100,
  });
  assert.equal(poor.accepted, false);
  const good = evaluateGpsFix(state, {
    ...north(seedPos, 3),
    accuracy: 8,
    deviceT: T0 + 2_000,
    arrivedAt: T0 + 2_100,
  });
  assert.equal(good.accepted, true);
  assert.equal(state.lastGoodAt, T0 + 2_100);
});


test("resolvedor: la velocidad entre ticks también respeta 3·coords.speed+3 (T7 #6/#9)", () => {
  mock.timers.enable({ apis: ["Date"], now: T0 });
  try {
    let pos = P(25.0, -100.0);
    const resolver = createDriveHeadingResolver({
      getSimHeading: () => ({ active: false, simHeading: null }),
      getGpsHeading: () => null,
      getSpeedMps: () => 1.2,
      getMovementHeading: () => null,
      getMovementSpeedMps: () => 1.2,
      getCoordsSpeedMps: () => 1.2,
      getDeviceHeading: () => ({ heading: 0, available: "unavailable", permission: "denied" }),
      getRouteGeometry: () => ({ path: null, vehiclePos: pos }),
      minMovementMeters: 8,
      minMovementMs: 1_000,
    });
    resolver.resolve();
    mock.timers.tick(1_100);
    pos = north(pos, 8.7); // 7.9 m/s implícitos con coords.speed 1.2
    resolver.resolve();
    assert.ok(
      resolver.state.debug.speedMps <= 3 * 1.2 + 3,
      `velocidad resuelta ${resolver.state.debug.speedMps} > 6.6`
    );
    assert.equal(resolver.state.tickSpeedMps, null, "el tick fuera de envolvente no se usa");
  } finally {
    mock.timers.reset();
  }
});

test("resolvedor: un curso que contradice al GPS >45° deja de ser fuente a los 3 s", () => {
  mock.timers.enable({ apis: ["Date"], now: T0 });
  try {
    const resolver = makeResolver({
      gpsHeading: 100,
      movementHeading: 200,
      course: 200,
      courseAgeMs: 0,
      speedMps: 1.2,
      movementSpeed: 1.2,
      path: null,
      vehiclePos: () => P(25.0, -100.0),
    });
    let heading = null;
    for (let i = 0; i < 25; i++) {
      heading = resolver.resolve();
      mock.timers.tick(200);
    }
    assert.ok(
      Math.abs(((heading - 100 + 540) % 360) - 180) <= 30,
      `el GPS debe imponerse tras 3 s de desacuerdo: heading ${heading}`
    );
  } finally {
    mock.timers.reset();
  }
});


test("curso: caminar a 0.7 m/s mantiene el curso fresco (umbral del criterio)", () => {
  let state = initialSpeedHeadingState();
  const origin = P(25.0, -100.0);
  let fix = null;
  for (let i = 0; i <= 12; i++) {
    // 0.7 m/s a 1 Hz hacia el ESTE (90°), accuracy 4 m, coords.speed 0.7.
    const pos = east(origin, 0.7 * i);
    fix = {
      ts: T0 + i * 1_000,
      pos,
      accuracy: 4,
      coordsSpeed: 0.7,
      coordsHeading: 90,
    };
    state = applyGpsFix(state, fix);
  }
  assert.equal(state.moving, true);
  assert.ok(effectiveCourseHeading(state, fix.ts) != null, "el curso debe existir y estar fresco");
  assert.ok(
    Math.abs(((effectiveCourseHeading(state, fix.ts) - 90 + 540) % 360) - 180) <= 30,
    "el curso debe apuntar al rumbo real"
  );
  assert.ok(effectiveMovementSpeedMps(state, fix.ts) >= 0.5);
});

// ── Fase 5-A: estima continua entre fixes ────────────────────────────

/**
 * Corre `seconds` segundos de cuadros a `fps` con fixes de `fixHz` que
 * avanzan a `speed` m/s hacia el norte. Devuelve los pasos por cuadro (m) y
 * la posición final.
 */
function runContinuous({ fps, fixHz, speed, seconds, start = P(25.0, -100.0), route = null }) {
  const dtMs = 1000 / fps;
  const fixMs = 1000 / fixHz;
  let state = {
    vehiclePos: start,
    visualHeading: 0,
    cameraHeading: 0,
    cameraHeadingTs: T0,
    zoomTarget: NAV_ZOOM_BASE,
  };
  let target = start;
  let fixTs = T0;
  let nextFix = T0;
  const steps = [];
  let prev = start;
  for (let t = T0; t <= T0 + seconds * 1000; t += dtMs) {
    if (t >= nextFix) {
      const travelled = (speed * (t - T0)) / 1000;
      target = north(start, travelled);
      fixTs = t;
      nextFix += fixMs;
    }
    const r = computeFollowFrame(state, {
      now: t,
      frameScale: 1,
      mapZoom: NAV_ZOOM_BASE,
      target,
      targetHeading: 0,
      simHeading: null,
      mapBearing: 0,
      speedMps: speed,
      route,
      anchorY: anchorYForBand(60, 500, PUCK_ANCHOR_FRACTION),
      containerHeightPx: 800,
      pendingZoom: null,
      accuracy: 6,
      firstGoodFixSeen: true,
      navigationReady: true,
      fixTs,
    });
    state = r.state;
    steps.push(haversineMeters(prev, r.state.vehiclePos));
    prev = r.state.vehiclePos;
  }
  return { steps, end: state.vehiclePos, state };
}

test("Fase 5-A: a 1 Hz de GPS el vehículo avanza en CADA cuadro (sin ráfagas)", () => {
  const speed = 15;
  const { steps, end } = runContinuous({ fps: 60, fixHz: 1, speed, seconds: 6 });
  // El primer cuadro no tiene dt (arranque): se descarta.
  const motion = steps.slice(1);
  const expected = (speed * (1000 / 60)) / 1000;
  const stopped = motion.filter((s) => s < 0.01).length;
  const mean = motion.reduce((a, b) => a + b, 0) / motion.length;
  assert.equal(stopped, 0, `${stopped} cuadros sin movimiento entre fixes`);
  assert.ok(
    Math.abs(mean - expected) < expected * 0.2,
    `paso medio ${mean.toFixed(3)} m ≠ v·dt ${expected.toFixed(3)} m`
  );
  // 6 s a 15 m/s: la posición avanza ~90 m (no se queda en el último fix).
  const travelled = haversineMeters(P(25.0, -100.0), end);
  assert.ok(travelled > 88 && travelled < 91, `avanzó ${travelled.toFixed(1)} m`);
});

test("Fase 5-A: el avance por cuadro no depende del ritmo de cámara (30 vs 60 Hz)", () => {
  const speed = 25;
  const at60 = runContinuous({ fps: 60, fixHz: 1, speed, seconds: 4 });
  const at30 = runContinuous({ fps: 30, fixHz: 1, speed, seconds: 4 });
  const mean = (steps) => {
    const m = steps.slice(1);
    return m.reduce((a, b) => a + b, 0) / m.length;
  };
  // El paso por cuadro escala con dt (30 Hz ⇒ el doble de metros por cuadro).
  const ratio = mean(at30.steps) / mean(at60.steps);
  assert.ok(ratio > 1.8 && ratio < 2.2, `paso 30/60 = ${ratio.toFixed(2)}`);
  // Y la distancia total recorrida es la misma.
  const d60 = haversineMeters(P(25.0, -100.0), at60.end);
  const d30 = haversineMeters(P(25.0, -100.0), at30.end);
  assert.ok(Math.abs(d60 - d30) < 1.5, `recorrido 60 Hz ${d60.toFixed(1)} vs 30 Hz ${d30.toFixed(1)}`);
});

test("Fase 5-A: sin fix nuevo la estima se detiene ~1.5 s después (no inventa movimiento)", () => {
  const start = P(25.0, -100.0);
  let state = {
    vehiclePos: start,
    visualHeading: 0,
    cameraHeading: 0,
    cameraHeadingTs: T0,
    zoomTarget: NAV_ZOOM_BASE,
  };
  const target = start; // el último fix no se mueve
  let prev = start;
  const positions = [];
  for (let i = 0; i <= 240; i++) {
    const t = T0 + i * (1000 / 60);
    const r = computeFollowFrame(state, {
      now: t,
      frameScale: 1,
      mapZoom: NAV_ZOOM_BASE,
      target,
      targetHeading: 0,
      simHeading: null,
      mapBearing: 0,
      speedMps: 15,
      route: null,
      anchorY: anchorYForBand(60, 500, PUCK_ANCHOR_FRACTION),
      containerHeightPx: 800,
      pendingZoom: null,
      accuracy: 6,
      firstGoodFixSeen: true,
      navigationReady: true,
      fixTs: T0,
    });
    state = r.state;
    positions.push({ t, moved: haversineMeters(prev, r.state.vehiclePos) });
    prev = r.state.vehiclePos;
  }
  const total = haversineMeters(start, state.vehiclePos);
  // 1.5 s a 15 m/s + el desvanecido de 0.9 s ⇒ ≈29 m, nunca más de ~35 m.
  assert.ok(total > 20 && total < 35, `deriva total ${total.toFixed(1)} m`);
  const movingAfter = (tMs) =>
    positions.filter((p) => p.t > T0 + tMs && p.moved > 0.01).length;
  assert.equal(movingAfter(2_450), 0, "después de 2.4 s ya no debe moverse");
});

test("Fase 5-A: un fix nuevo corrige suave y NO reinicia la velocidad", () => {
  const speed = 15;
  const start = P(25.0, -100.0);
  let state = {
    vehiclePos: start,
    visualHeading: 0,
    cameraHeading: 0,
    cameraHeadingTs: T0,
    zoomTarget: NAV_ZOOM_BASE,
  };
  let prev = start;
  // 1 s de avance con fix en el origen (la estima se adelanta ~15 m).
  for (let i = 1; i <= 60; i++) {
    const r = computeFollowFrame(state, {
      now: T0 + i * (1000 / 60),
      frameScale: 1,
      mapZoom: NAV_ZOOM_BASE,
      target: start,
      targetHeading: 0,
      simHeading: null,
      mapBearing: 0,
      speedMps: speed,
      route: null,
      anchorY: anchorYForBand(60, 500, PUCK_ANCHOR_FRACTION),
      containerHeightPx: 800,
      pendingZoom: null,
      accuracy: 6,
      firstGoodFixSeen: true,
      navigationReady: true,
      fixTs: T0,
    });
    state = r.state;
    prev = r.state.vehiclePos;
  }
  // Fix nuevo 3 m por delante de la estima: corrección pendiente.
  const fix = north(state.vehiclePos, 3);
  const r = computeFollowFrame(state, {
    now: T0 + 60 * (1000 / 60) + 1000 / 60,
    frameScale: 1,
    mapZoom: NAV_ZOOM_BASE,
    target: fix,
    targetHeading: 0,
    simHeading: null,
    mapBearing: 0,
    speedMps: speed,
    route: null,
    anchorY: anchorYForBand(60, 500, PUCK_ANCHOR_FRACTION),
    containerHeightPx: 800,
    pendingZoom: null,
    accuracy: 6,
    firstGoodFixSeen: true,
    navigationReady: true,
    fixTs: T0 + 1_000,
  });
  const step = haversineMeters(prev, r.state.vehiclePos);
  // Un cuadro normal son 0.25 m; con 3 m de corrección, la tasa se limita y
  // no hay tirón: menos de 1 m en este cuadro.
  assert.ok(step < 1, `la corrección dio un tirón de ${step.toFixed(3)} m`);
  assert.ok(r.state.correctionMeters > 0, "la corrección debe quedar pendiente");
  // La velocidad no se toca (se sigue avanzando a 15 m/s en el cuadro).
  assert.ok(step > 0.2, `no avanzó (${step.toFixed(3)} m)`);
});

test("Fase 5-A: velocidad <0.5 m/s mantiene el vehículo quieto entre fixes", () => {
  const start = P(25.0, -100.0);
  let state = {
    vehiclePos: start,
    visualHeading: 0,
    cameraHeading: 0,
    cameraHeadingTs: T0,
    zoomTarget: NAV_ZOOM_BASE,
  };
  let prev = start;
  let maxStep = 0;
  // Fixes que saltan 2 m cada segundo (temblor de GPS al estar parado).
  for (let i = 0; i <= 180; i++) {
    const t = T0 + i * (1000 / 60);
    const target = north(start, (Math.floor(t / 1000) % 2) * 2);
    const r = computeFollowFrame(state, {
      now: t,
      frameScale: 1,
      mapZoom: NAV_ZOOM_BASE,
      target,
      targetHeading: 0,
      simHeading: null,
      mapBearing: 0,
      speedMps: 0,
      route: null,
      anchorY: anchorYForBand(60, 500, PUCK_ANCHOR_FRACTION),
      containerHeightPx: 800,
      pendingZoom: null,
      accuracy: 6,
      firstGoodFixSeen: true,
      navigationReady: true,
      fixTs: t - (t % 1000),
    });
    state = r.state;
    maxStep = Math.max(maxStep, haversineMeters(prev, r.state.vehiclePos));
    prev = r.state.vehiclePos;
  }
  assert.ok(maxStep < 0.05, `se movió ${maxStep.toFixed(3)} m estando parado`);
});

test("Fase 5-A: sobre la ruta el avance sigue la polilínea aunque el rumbo sea otro", () => {
  const start = P(25.0, -100.0);
  // Ruta recta hacia el norte, 600 m, 10 puntos.
  const path = Array.from({ length: 11 }, (_, i) => north(start, i * 60));
  const stepsRoute = [
    {
      maneuver: "depart",
      instruction: "Sal",
      distanceMeters: 600,
      start: path[0],
      end: path[10],
    },
  ];
  let state = {
    vehiclePos: east(start, 5), // 5 m a la derecha de la ruta
    visualHeading: 90, // rumbo ESTE (equivocado)
    cameraHeading: 90,
    cameraHeadingTs: T0,
    zoomTarget: NAV_ZOOM_BASE,
  };
  let prev = state.vehiclePos;
  for (let i = 1; i <= 60; i++) {
    const t = T0 + i * (1000 / 60);
    const r = computeFollowFrame(state, {
      now: t,
      frameScale: 1,
      mapZoom: NAV_ZOOM_BASE,
      target: path[0],
      targetHeading: 90,
      simHeading: null,
      mapBearing: 90,
      speedMps: 15,
      route: { path, steps: stepsRoute },
      anchorY: anchorYForBand(60, 500, PUCK_ANCHOR_FRACTION),
      containerHeightPx: 800,
      pendingZoom: null,
      accuracy: 6,
      firstGoodFixSeen: true,
      navigationReady: true,
      fixTs: T0,
    });
    state = r.state;
    prev = r.state.vehiclePos;
  }
  const moved = haversineMeters(east(start, 5), state.vehiclePos);
  const deltaNorth = (state.vehiclePos.lat - start.lat) * 111_320;
  const deltaEast =
    (state.vehiclePos.lng - start.lng) *
    111_320 *
    Math.cos((start.lat * Math.PI) / 180);
  assert.ok(moved > 12, `avanzó ${moved.toFixed(1)} m`);
  assert.ok(deltaNorth > 12, `no avanzó por la ruta (norte ${deltaNorth.toFixed(1)} m)`);
  // Avanza por la ruta (norte) y la corrección lo pega a la polilínea: el
  // desvío lateral inicial de 5 m solo puede BAJAR, nunca crecer.
  assert.ok(deltaEast < 4.5, `se fue de lado ${deltaEast.toFixed(1)} m`);
});

// ── Fase 5-B: métrica de uniformidad en la traza ─────────────────────

test("Fase 5-B: la traza mide cuadros quietos, media, p95 y máximo por aplicación", () => {
  const rec = new TraceRecorder();
  // 60 aplicaciones a 15 m/s: la mitad quietas (0 px) y la otra mitad 1 px.
  for (let i = 0; i < 60; i++) {
    rec.recordCameraApply({
      movedPx: i % 2 === 0 ? 0 : 1,
      speedMps: 15,
      expectedStepPx: 0.7,
    });
  }
  // Una aplicación a ritmo de caminata NO entra en la métrica.
  rec.recordCameraApply({ movedPx: 0, speedMps: 1.2, expectedStepPx: 0.05 });
  const [bucket] = rec.perfBuckets();
  assert.equal(bucket.movingApplies, 60);
  assert.equal(bucket.stillApplies, 30);
  assert.equal(bucket.stillFraction, 0.5);
  assert.equal(bucket.movePxMean, 0.5);
  assert.equal(bucket.movePxP95, 1);
  assert.equal(bucket.movePxMax, 1);
  assert.ok(bucket.maxStepRatio < 2, `paso máx/esperado ${bucket.maxStepRatio}`);
});

test("Fase 5-B: ráfagas de 1 Hz dan quietos y p95/medio altos (lo que el video mostró)", () => {
  const rec = new TraceRecorder();
  // 60 cuadros: solo 8 con movimiento de 4 px (ráfaga), el resto quietos.
  for (let i = 0; i < 60; i++) {
    const burst = i % 8 === 0;
    rec.recordCameraApply({
      movedPx: burst ? 4 : 0,
      speedMps: 18,
      expectedStepPx: 0.6,
    });
  }
  const [bucket] = rec.perfBuckets();
  assert.ok(bucket.stillFraction > 0.8, `quietos ${(bucket.stillFraction * 100).toFixed(0)} %`);
  assert.ok(bucket.movePxP95 / bucket.movePxMean > 2);
  assert.ok(bucket.maxStepRatio > 2);
});

// ── Fase 5-D: exportación con sello propio ───────────────────────────

test("Fase 5-D: dos exportaciones consecutivas tienen contenido, sello y sesión distintos", () => {
  const rec = new TraceRecorder();
  const first = rec.toJSON();
  rec.recordGps({
    t: Date.now(),
    deviceT: null,
    lat: 25,
    lng: -100,
    accuracy: 5,
    speed: 12,
    heading: 90,
    accepted: true,
  });
  const second = rec.toJSON();
  assert.notEqual(first.exportedAt, second.exportedAt);
  assert.ok(second.exportedAt > first.exportedAt, "exportedAt debe ser creciente");
  assert.equal(first.sessionStartedAt, second.sessionStartedAt);
  assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(first.sessionStartedAt));
  assert.notEqual(JSON.stringify(first), JSON.stringify(second));
  // El nombre del archivo lleva fecha y hora (dos exportaciones no se pisan).
  const name = TraceRecorder.defaultFilename(new Date("2026-11-22T19:05:09"));
  assert.equal(name, "drive-trace-20261122-190509.json");
});

// ── Fase 6-A4: escala real de Mapbox y búsqueda por progreso ─────────

test("6-A4: la escala de Mapbox GL (tiles 512) es 4.62 px/m a zoom 18.37", () => {
  const zoom = 18.37;
  const lat = 20.5814;
  const mpp = metersPerPixelAt(zoom, lat);
  // worldSize = 512·2^zoom, no 256·2^zoom: la fórmula slippy clásica (156543)
  // da el doble de metros por píxel y hacía parecer que la flecha estaba a
  // 5.6 m cuando la traza mide 2.8 m.
  const esperado =
    (40_075_016.686 * Math.cos((lat * Math.PI) / 180)) /
    (512 * Math.pow(2, zoom));
  assert.ok(Math.abs(mpp - esperado) < 1e-9, `mpp ${mpp} vs ${esperado}`);
  assert.ok(Math.abs(1 / mpp - 4.623) < 0.01, `px/m ${(1 / mpp).toFixed(3)}`);
});

test("6-A4: la búsqueda por progreso no salta al eje contrario de la vía", () => {
  const base = P(20.58, -100.39);
  // Ida al norte (tramos 0–8) y vuelta al sur 12 m al este (tramos 10–18).
  const ida = Array.from({ length: 10 }, (_, i) => north(base, i * 20));
  const vuelta = Array.from({ length: 10 }, (_, i) =>
    east(north(base, 180 - i * 20), 12)
  );
  const path = [...ida, ...vuelta];
  // Puck a 9 m del eje de ida: 3 m del eje de vuelta.
  const punto = east(north(base, 170), 9);
  const global = nearestPointOnPath(path, punto.lat, punto.lng);
  const progreso = nearestPointOnPathByProgress(
    path,
    punto.lat,
    punto.lng,
    4,
    2,
    3
  );
  assert.ok(global.distanceMeters < 3.5, `global a ${global.distanceMeters.toFixed(2)} m`);
  assert.ok(
    progreso.distanceMeters > 8,
    `progreso a ${progreso.distanceMeters.toFixed(2)} m (debe seguir el eje de ida)`
  );
  assert.ok(progreso.segmentIndex <= 8, `tramo ${progreso.segmentIndex}`);
  // El salto que se registra en la traza (global 1 m más cerca, progreso ≤8 m).
  assert.ok(global.distanceMeters + 1 < progreso.distanceMeters);
});

test("6-A4: la búsqueda por progreso avanza con el vehículo", () => {
  const base = P(20.58, -100.39);
  const path = Array.from({ length: 101 }, (_, i) => north(base, i * 10));
  const punto = north(base, 455); // dentro del tramo 45 (450–460 m)
  const hit = nearestPointOnPathByProgress(path, punto.lat, punto.lng, 40);
  assert.ok(hit, "sin punto");
  assert.equal(hit.segmentIndex, 45);
  assert.ok(hit.distanceMeters < 0.5, `distancia ${hit.distanceMeters.toFixed(2)} m`);
});

// ── Fase 7: puck sobre el sentido de marcha en vías con camellón ─────

/**
 * Vía doble sintética: eje de IDA por x=0 hacia el norte (0→200 m) y eje de
 * VUELTA por x=12 m hacia el sur (200→0 m). Rumbos opuestos a 12 m, como la
 * carretera con camellón de la traza del 23-11.
 */
function viaDoble(base) {
  const ida = Array.from({ length: 11 }, (_, i) => north(base, i * 20));
  const vuelta = Array.from({ length: 11 }, (_, i) =>
    east(north(base, 200 - i * 20), 12)
  );
  // Tramos (path[i-1] → path[i]): ida 1..10, conector 11, vuelta 12..20.
  return [...ida, ...vuelta];
}

test("7-A: en vía doble el punto proyectado se queda en el eje del sentido de marcha", () => {
  const base = P(20.5814, -100.3921);
  const path = viaDoble(base);
  const tracker = createRouteDirectionTracker();
  let t = T0;
  for (let y = 40; y <= 180; y += 10) {
    // GPS 7 m al este del eje de ida: el eje de vuelta queda a 5 m (MÁS cerca).
    const fix = east(north(base, y), 7);
    const global = nearestPointOnPath(path, fix.lat, fix.lng);
    assert.ok(
      global.distanceMeters < 5.5,
      `la búsqueda global debe caer en el eje contrario: ${global.distanceMeters.toFixed(2)} m`
    );
    const hit = tracker.project(path, fix, 0, t);
    t += 200;
    assert.ok(hit, "sin punto de ruta");
    assert.equal(hit.sameDirection, true, `delta de rumbo ${hit.headingDeltaDeg}`);
    assert.ok(hit.segmentIndex <= 10, `tramo ${hit.segmentIndex} (debe ser del eje de ida)`);
    assert.ok(
      Math.abs(hit.distanceMeters - 7) < 0.5,
      `distancia ${hit.distanceMeters.toFixed(2)} m al eje de ida`
    );
    assert.ok(hit.distanceMeters <= ROUTE_SNAP_MAX_LATERAL_M);
  }
  assert.equal(tracker.rejections, 0, "un tramo recto no cambia de sentido");
});

test("7-A: entrada a la vía sin progreso previo usa el rumbo para elegir el sentido", () => {
  const base = P(20.5814, -100.3921);
  const path = viaDoble(base);
  const fix = east(north(base, 120), 7);
  // Sin rumbo fiable el fallback es lateral: cae en el eje de vuelta (5 m).
  const sinRumbo = projectRouteByDirection(path, fix, null);
  assert.ok(sinRumbo.segmentIndex >= 12, `tramo ${sinRumbo.segmentIndex}`);
  // Con rumbo fiable (0°) elige el eje del sentido de marcha aunque esté más lejos.
  const conRumbo = projectRouteByDirection(path, fix, 0);
  assert.ok(conRumbo.segmentIndex <= 10, `tramo ${conRumbo.segmentIndex}`);
  assert.equal(conRumbo.sameDirection, true);
  assert.ok(Math.abs(conRumbo.distanceMeters - 7) < 0.5);
});

test("7-A: un cambio de sentido contrario se rechaza hasta 3 s de progreso consistente", () => {
  const base = P(20.5814, -100.3921);
  const path = viaDoble(base);
  const tracker = createRouteDirectionTracker();
  let t = T0;
  // Sube por el eje de ida: el tramo aceptado es del sentido correcto.
  for (let y = 20; y <= 60; y += 20) {
    tracker.project(path, north(base, y), 0, t);
    t += 200;
  }
  assert.ok(tracker.lastSegmentIndex <= 10, `tramo inicial ${tracker.lastSegmentIndex}`);
  // El rumbo ya cambió 180° (vuelta en U real) y el candidato es el eje
  // contrario: NO se acepta de golpe.
  const pos = east(north(base, 60), 7);
  const first = tracker.project(path, pos, 180, t);
  assert.equal(tracker.rejections, 1, "el cambio a sentido contrario debe rechazarse");
  assert.equal(first.sameDirection, false, "mientras no se confirma no va en el rumbo");
  assert.ok(first.segmentIndex <= 10, `tramo ${first.segmentIndex} (sigue en el eje aceptado)`);
  // Progreso consistente por el eje contrario durante >3 s → se acepta (una
  // vuelta en U real no puede quedar bloqueada).
  let hit = first;
  for (let i = 0; i < 18; i++) {
    t += 200;
    hit = tracker.project(path, east(north(base, 60 - i * 6), 12), 180, t);
  }
  assert.equal(tracker.acceptedSwitches, 1, `aceptados ${tracker.acceptedSwitches}`);
  assert.ok(hit.segmentIndex >= 12, `tramo ${hit.segmentIndex} (ya en el eje de vuelta)`);
  assert.equal(hit.sameDirection, true);
});

test("7-B: el puck va sobre la ruta del sentido y no salta >1 m por cuadro", () => {
  const base = P(20.5814, -100.3921);
  // Ruta con un giro de 90° (cambio de tramo dentro del MISMO sentido).
  const path = [
    ...Array.from({ length: 21 }, (_, i) => north(base, i * 10)),
    ...Array.from({ length: 21 }, (_, i) => east(north(base, 200), i * 10)),
  ];
  const zoom = NAV_ZOOM_BASE;
  const H = 800;
  const anchorY = anchorYForBand(60, 500, PUCK_ANCHOR_FRACTION);
  const tracker = createRouteDirectionTracker();
  const speed = 12;
  let state = {
    vehiclePos: east(north(base, 0), 8),
    visualHeading: 0,
    cameraHeading: 0,
    cameraHeadingTs: T0,
    zoomTarget: zoom,
  };
  let maxStep = 0;
  let snapped = 0;
  let sameDirection = 0;
  const frames = 90;
  for (let f = 1; f <= frames; f++) {
    const now = T0 + f * 33;
    const driven = (speed * (f * 33)) / 1000;
    // GPS con 8 m de desfase a la DERECHA del sentido de marcha.
    const target =
      driven <= 200
        ? east(north(base, driven), 8)
        : north(east(north(base, 200), driven - 200), -8);
    const heading = driven <= 200 ? 0 : 90;
    const prev = state.vehiclePos;
    const frame = computeFollowFrame(state, {
      now,
      frameScale: 1,
      mapZoom: zoom,
      target,
      targetHeading: heading,
      simHeading: null,
      speedMps: speed,
      route: { path, steps: [] },
      anchorY,
      containerHeightPx: H,
      pendingZoom: null,
      accuracy: 6,
      firstGoodFixSeen: true,
      navigationReady: true,
      mapBearing: heading,
      fixTs: now,
      routeDirection: tracker,
    });
    state = frame.state;
    if (frame.routeSnapped) snapped += 1;
    if (frame.routeSameDirection === true) sameDirection += 1;
    maxStep = Math.max(maxStep, haversineMeters(prev, frame.state.vehiclePos));
  }
  assert.ok(maxStep <= 1, `salto máximo ${maxStep.toFixed(3)} m por cuadro`);
  assert.ok(snapped > frames * 0.8, `snap activo en ${snapped}/${frames}`);
  assert.ok(sameDirection > frames * 0.8, `sentido correcto en ${sameDirection}/${frames}`);
  // La referencia dibujada (puck/cámara) queda SOBRE el carril, no sobre el GPS.
  const lastDriven = (speed * (frames * 33)) / 1000;
  const lane =
    lastDriven <= 200
      ? north(base, lastDriven)
      : east(north(base, 200), lastDriven - 200);
  const errM = haversineMeters(state.vehiclePos, lane);
  assert.ok(errM <= 1.5, `puck a ${errM.toFixed(2)} m del carril`);
  const cameraM = haversineMeters(
    { lat: state.vehiclePos.lat, lng: state.vehiclePos.lng },
    lane
  );
  assert.ok(cameraM <= 1.5, `cámara a ${cameraM.toFixed(2)} m del carril`);
});

test("7-C: 12 m laterales con rumbo alineado no marcan DEVIATING (vía doble)", () => {
  mock.timers.enable({ apis: ["Date"], now: T0 });
  try {
    const base = P(20.5814, -100.3921);
    const path = [base, east(base, 600)];
    // 12 m al norte del eje (rumbo este) y rumbo alineado con el segmento.
    const pos = north(base, 12);
    const resolver = makeResolver({
      gpsHeading: 90,
      movementHeading: 90,
      speedMps: 6,
      coordsSpeed: 6,
      path,
      vehiclePos: () => pos,
    });
    for (let i = 0; i < 60; i++) {
      resolver.resolve();
      mock.timers.tick(200);
    }
    assert.equal(resolver.state.deviating, false, "12 m laterales nunca son un desvío");
    assert.ok(
      Math.abs(resolver.state.debug.gpsVsRouteDeltaDeg) < 10,
      `delta ${resolver.state.debug.gpsVsRouteDeltaDeg}`
    );
  } finally {
    mock.timers.reset();
  }
});

test("7-C: 40 m laterales sostenidos sí marcan DEVIATING aunque el rumbo vaya paralelo", () => {
  mock.timers.enable({ apis: ["Date"], now: T0 });
  try {
    const base = P(20.5814, -100.3921);
    const path = [base, east(base, 600)];
    const pos = north(base, 40);
    const resolver = makeResolver({
      gpsHeading: 90,
      movementHeading: 90,
      speedMps: 6,
      coordsSpeed: 6,
      path,
      vehiclePos: () => pos,
    });
    for (let i = 0; i < 10; i++) {
      resolver.resolve();
      mock.timers.tick(200);
    }
    assert.equal(resolver.state.deviating, false, "2 s de lateral no bastan");
    for (let i = 0; i < 30; i++) {
      resolver.resolve();
      mock.timers.tick(200);
    }
    assert.equal(resolver.state.deviating, true, "40 m sostenidos son otro camino");
  } finally {
    mock.timers.reset();
  }
});

// ── Fase 8: la ruta no se borra por un parpadeo ni por un fallo puntual ──
// Traza 23-11 (build 4ec20ef): 63.9 s sin línea ni guía. Primero un parpadeo
// del sondeo dejó `navTarget` null; después la caché de fallos de routing
// suprimió los reintentos 60 s.

test("8-A: un objetivo ausente (parpadeo del sondeo) NO borra la ruta viva", () => {
  assert.equal(shouldClearRouteOnTargetChange("20.66,-100.24", null), false);
  assert.equal(ROUTE_CLEAR_GRACE_MS, 2_000, "gracia de descarte");
});

test("8-A: solo un tramo NUEVO y distinto descarta la ruta anterior", () => {
  assert.equal(shouldClearRouteOnTargetChange(null, "20.66,-100.24"), false);
  assert.equal(shouldClearRouteOnTargetChange("20.66,-100.24", "20.66,-100.24"), false);
  assert.equal(shouldClearRouteOnTargetChange("20.66,-100.24", "20.67,-100.25"), true);
});

test("8-B: un refresco fallido (null o geometría vacía) no sustituye la ruta viva", () => {
  assert.equal(shouldApplyRouteRefresh(null), false);
  assert.equal(shouldApplyRouteRefresh(undefined), false);
  assert.equal(shouldApplyRouteRefresh({ path: [] }), false);
  assert.equal(shouldApplyRouteRefresh({ path: [{ lat: 20.66, lng: -100.24 }] }), false);
  assert.equal(
    shouldApplyRouteRefresh({ path: [{ lat: 20.66, lng: -100.24 }, { lat: 20.67, lng: -100.25 }] }),
    true
  );
});

test("8-C: sin ruta se fuerza reintento, con ruta o antes de la cadencia no", () => {
  const now = 1_000_000;
  assert.equal(shouldForceRouteRetry(true, now, 0), false, "con ruta viva no se fuerza");
  assert.equal(shouldForceRouteRetry(false, now, now + 1), false, "respeta la cadencia");
  assert.equal(shouldForceRouteRetry(false, now, now), true, "sin ruta y cadencia vencida");
  assert.equal(ROUTE_FORCE_RETRY_MS, 10_000, "cadencia del reintento forzado");
});

// ── Fase 9 (P1 sin señal): snapshot del pedido, indicadores y guía conservada ──
// Alcance reformulado por el usuario: la geometría de Directions (path/steps)
// NO se persiste (Product Terms §2.10.1/§1.9). Solo se guarda la respuesta de
// NUESTRO backend, y la navegación conserva lo que ya tiene en memoria.

/** Storage de mentira: permite simular cuota llena y accesos denegados. */
function makeStorage(options = {}) {
  const map = new Map();
  return {
    map,
    getItem(key) {
      if (options.throwGet) throw new Error("SecurityError");
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      if (options.throwSet) throw new Error("QuotaExceededError");
      map.set(key, value);
    },
    removeItem(key) {
      map.delete(key);
    },
  };
}

const ACTIVE_STATE = {
  connected: true,
  estado: "busy",
  orders: [
    {
      orderNumber: "A-1234",
      storeLat: 20.5,
      storeLng: -100.2,
      restaurantPickedUpAt: "2026-11-24T10:00:00.000Z",
    },
  ],
  offer: null,
};
const IDLE_STATE = { connected: true, estado: "available", orders: [], offer: null };

test("9-A: el snapshot del pedido se guarda, caduca a los 10 min y vuelve intacto", () => {
  assert.equal(DRIVER_STATE_SNAPSHOT_TTL_MS, 10 * 60 * 1000, "TTL de 10 min");
  const raw = encodeDriverStateSnapshot(ACTIVE_STATE, T0);
  assert.ok(raw);
  const fresh = decodeDriverStateSnapshot(raw, T0 + 60_000);
  assert.equal(fresh.status, "ok");
  if (fresh.status === "ok") {
    assert.equal(fresh.payload.orders[0].orderNumber, "A-1234");
    // La etapa derivada del restaurante sobrevive a la recarga sin red.
    assert.equal(
      fresh.payload.orders[0].restaurantPickedUpAt,
      "2026-11-24T10:00:00.000Z"
    );
    assert.equal(fresh.savedAt, T0);
  }
  // Justo en el límite sigue valiendo; un ms después no.
  assert.equal(
    decodeDriverStateSnapshot(raw, T0 + DRIVER_STATE_SNAPSHOT_TTL_MS).status,
    "ok"
  );
  assert.equal(
    decodeDriverStateSnapshot(raw, T0 + DRIVER_STATE_SNAPSHOT_TTL_MS + 1).status,
    "expired"
  );
});

test("9-A: JSON corrupto, versión desconocida, reloj adelantado y sin trabajo activo no se restauran", () => {
  assert.equal(decodeDriverStateSnapshot(null, T0).status, "empty");
  assert.equal(decodeDriverStateSnapshot("", T0).status, "empty");
  assert.equal(decodeDriverStateSnapshot("{roto", T0).status, "corrupt");
  assert.equal(decodeDriverStateSnapshot("[]", T0).status, "invalid");
  assert.equal(decodeDriverStateSnapshot("{}", T0).status, "invalid");
  assert.equal(
    decodeDriverStateSnapshot(
      JSON.stringify({ version: 99, savedAt: T0, payload: ACTIVE_STATE }),
      T0
    ).status,
    "invalid",
    "una versión nueva del formato no se interpreta a ciegas"
  );
  assert.equal(
    decodeDriverStateSnapshot(
      JSON.stringify({ version: 1, savedAt: T0 + 10 * 60_000, payload: ACTIVE_STATE }),
      T0
    ).status,
    "invalid",
    "un reloj adelantado (snapshot del futuro) se descarta"
  );
  // Un «disponible» no se restaura: mostraría un estado de conexión viejo.
  assert.equal(hasActiveWork(IDLE_STATE), false);
  assert.equal(hasActiveWork(ACTIVE_STATE), true);
  assert.equal(encodeDriverStateSnapshot(IDLE_STATE, T0), null);
  assert.equal(hasActiveWork({ orders: [], offer: { orderNumber: "O-1" } }), true);
});

test("9-A: storage lleno, ausente o denegado nunca lanza y no rompe la navegación", () => {
  // Sin storage (SSR / navegador restringido).
  assert.equal(readDriverStateSnapshot(null, T0).status, "empty");
  assert.equal(writeDriverStateSnapshot(null, ACTIVE_STATE, T0), false);
  clearDriverStateSnapshot(null); // no lanza

  // Acceso denegado (modo privado de Safari).
  assert.equal(readDriverStateSnapshot(makeStorage({ throwGet: true }), T0).status, "empty");

  // Cuota llena: se intenta liberar la entrada propia y se abandona en silencio.
  const full = makeStorage({ throwSet: true });
  assert.equal(writeDriverStateSnapshot(full, ACTIVE_STATE, T0), false);
  assert.equal(full.map.size, 0);

  // Camino feliz: guardar, leer y borrar (al cerrar el tramo).
  const ok = makeStorage();
  assert.equal(writeDriverStateSnapshot(ok, ACTIVE_STATE, T0), true);
  assert.ok(ok.map.has(DRIVER_STATE_SNAPSHOT_KEY));
  const read = readDriverStateSnapshot(ok, T0 + 1_000);
  assert.equal(read.status, "ok");
  clearDriverStateSnapshot(ok);
  assert.equal(readDriverStateSnapshot(ok, T0 + 1_000).status, "empty");
});

test("9-B: «sin señal» exige dos fallos consecutivos o navigator.onLine=false", () => {
  assert.equal(resolveNetworkSignal(false, 0), "offline", "corte del SO: inmediato");
  assert.equal(resolveNetworkSignal(true, 0), "online");
  assert.equal(
    resolveNetworkSignal(true, OFFLINE_FAILURES_THRESHOLD - 1),
    "online",
    "un timeout suelto no marca sin señal"
  );
  assert.equal(resolveNetworkSignal(true, OFFLINE_FAILURES_THRESHOLD), "offline");
  assert.equal(resolveNetworkSignal(null, 0), "unknown");
  assert.equal(isNetworkDown("unknown"), false);
  assert.equal(isNetworkDown("offline"), true);
  assert.equal(isNetworkDown("online"), false);
});

test("9-B: los avisos distinguen sin señal de desvío pendiente de recálculo", () => {
  assert.equal(OFFLINE_LABEL, "Sin señal");
  assert.equal(OFFLINE_RECALC_LABEL, "Sin señal, recalculo al reconectar");
  assert.equal(routeRecalcNotice({ networkDown: true, recalcDeferred: false }), null);
  assert.equal(routeRecalcNotice({ networkDown: false, recalcDeferred: true }), null);
  assert.equal(
    routeRecalcNotice({ networkDown: true, recalcDeferred: true }),
    OFFLINE_RECALC_LABEL
  );
});

test("9-C: sin red la ruta viva sobrevive a los ticks y se refresca al reconectar", async () => {
  const originalFetch = globalThis.fetch;
  let down = true;
  let fetchCalls = 0;
  const base = P(20.5814, -100.3921);
  const dest = north(base, 900);

  globalThis.fetch = async () => {
    fetchCalls += 1;
    if (down) throw new TypeError("Failed to fetch");
    return new Response(
      JSON.stringify({
        routes: [
          {
            distance: 900,
            duration: 120,
            geometry: {
              coordinates: [
                [base.lng, base.lat],
                [base.lng, dest.lat],
              ],
            },
            legs: [
              {
                steps: [
                  {
                    distance: 900,
                    duration: 120,
                    maneuver: {
                      type: "depart",
                      instruction: "Dirígete al norte",
                      location: [base.lng, base.lat],
                    },
                  },
                ],
              },
            ],
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  try {
    // Corte A MITAD de viaje: hay ruta viva en memoria (React state) y cada
    // tick de GPS vuelve a pedir. La guarda de la Fase 8 decide qué aplicar.
    const live = { path: [base, north(base, 500)] };
    let applied = live;
    for (let tick = 0; tick < 20; tick++) {
      const route = await getRoadRoute(base, dest);
      if (shouldApplyRouteRefresh(route)) applied = route;
    }
    assert.equal(applied, live, "20 ticks sin red no reemplazan la ruta viva");
    assert.equal(fetchCalls, 1, "la caché de fallos evita una petición por tick");

    // Corte AL ARRANCAR: no hay ninguna ruta. Igual no se dibuja nada falso.
    assert.equal(shouldApplyRouteRefresh(null), false);

    // RECONEXIÓN: el reintento forzado (force) salta la caché de fallos y la
    // ruta nueva sí sustituye a la vieja.
    down = false;
    const fresh = await getRoadRoute(base, dest, true);
    assert.ok(fresh, "al volver la red el reintento forzado devuelve ruta");
    assert.equal(fetchCalls, 2);
    if (shouldApplyRouteRefresh(fresh)) applied = fresh;
    assert.equal(applied, fresh, "la ruta refrescada se aplica");
    assert.ok(fresh.path.length >= 2);

    // Y el único borrado sigue siendo por cambio de tramo, nunca por red.
    assert.equal(shouldClearRouteOnTargetChange("20.5,-100.2", null), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("9-D: «GPS débil» solo con ruta viva y tras la gracia de 8 s", () => {
  assert.equal(GPS_WEAK_GRACE_MS, 8_000);
  const base = { routeAlive: true, navigationReady: true };
  assert.equal(isGpsWeak({ ...base, msSinceGoodFix: 1_000 }), false, "un fix perdido no avisa");
  assert.equal(isGpsWeak({ ...base, msSinceGoodFix: 8_000 }), false);
  assert.equal(isGpsWeak({ ...base, msSinceGoodFix: 8_001 }), true);
  assert.equal(isGpsWeak({ ...base, msSinceGoodFix: null }), false, "sin fix previo no aplica");
  assert.equal(
    isGpsWeak({ routeAlive: false, navigationReady: true, msSinceGoodFix: 60_000 }),
    false,
    "sin ruta no hay GPS débil de navegación"
  );
  assert.equal(
    isGpsWeak({ routeAlive: true, navigationReady: false, msSinceGoodFix: 60_000 }),
    false,
    "antes del primer fix bueno es el arranque, no una degradación"
  );
});

test("9-E: con ruta viva la tarjeta conserva la última guía (no vuelve a «Dirígete…»)", () => {
  assert.equal(shouldHoldLastGuidance({ routeAlive: true, hasFreshGuidance: false }), true);
  assert.equal(shouldHoldLastGuidance({ routeAlive: true, hasFreshGuidance: true }), false);
  assert.equal(shouldHoldLastGuidance({ routeAlive: false, hasFreshGuidance: false }), false);
});

// ── Fase 10 (cierre P1): mínimo dato personal, dueño del snapshot y
//    distancia congelada ────────────────────────────────────────────────

/** Pedido «completo»: trae TODO lo personal que el backend manda hoy. */
const FULL_ORDER = {
  orderNumber: "A-9001",
  serviceKind: "mandado",
  storeName: "Farmacia del Valle",
  destLabel: "Calle Falsa 123, Col. Centro",
  storeLat: 20.5,
  storeLng: -100.2,
  destLat: 20.6,
  destLng: -100.3,
  routeKm: 11.9,
  etaMinutes: 22,
  dispatchStatus: "in_progress",
  restaurantPickedUpAt: "2026-11-24T10:00:00.000Z",
  mandadoState: "en_route",
  mandadoOriginLabel: "Farmacia",
  mandadoDestinationLabel: "Casa",
  // Datos personales / sensibles que NO deben quedar en localStorage:
  mandadoDetails: "2 cajas de insulina, mantener frio",
  mandadoOriginReference: "porton negro, timbre 2",
  mandadoDestinationReference: "casa blanca con reja verde",
  storeAddress: "Av. Juarez 456, Col. Moderna",
  itemsSummary: ["Insulina", "Jeringas"],
  itemsQuantity: 2,
  customerName: "Maria Fernanda Lopez",
  // Campo que el backend ni siquiera manda hoy: la lista blanca lo descarta.
  mandadoRecipientPhone: "+5215512341234",
  paymentLabel: "Efectivo",
  totalPrice: 480,
  requiresDeliveryPin: true,
};

const FULL_STATE = {
  connected: true,
  estado: "busy",
  connectedMinutes: 42,
  location: { lat: 20.55, lng: -100.25 },
  orders: [FULL_ORDER],
  offer: null,
  inService: true,
  sessionValid: true,
  aceptaNuevasOfertas: false,
};

const PERSONAL_VALUES = [
  "Maria Fernanda Lopez",
  "Av. Juarez 456",
  "2 cajas de insulina",
  "porton negro",
  "casa blanca con reja verde",
  "Insulina",
  "Jeringas",
  "5512341234",
];

test("10-A: el snapshot guarda solo campos de navegación y ningún dato personal", () => {
  const sanitized = sanitizeDriverStateForSnapshot(FULL_STATE);
  assert.ok(sanitized, "con pedido activo sí se guarda");
  const order = sanitized.orders[0];

  // Lista blanca exacta del pedido (si alguien añade un campo, se ve aquí).
  assert.deepEqual(Object.keys(order).sort(), [
    "destLabel",
    "destLat",
    "destLng",
    "dispatchStatus",
    "etaMinutes",
    "mandadoDestinationLabel",
    "mandadoOriginLabel",
    "mandadoState",
    "orderNumber",
    "paymentLabel",
    "requiresDeliveryPin",
    "restaurantPickedUpAt",
    "routeKm",
    "serviceKind",
    "storeLat",
    "storeLng",
    "storeName",
    "totalPrice",
  ]);
  // Todo lo excluido está fuera, explícitamente.
  for (const field of ORDER_EXCLUDED_FROM_SNAPSHOT) {
    assert.equal(field in order, false, `${field} no debe persistirse`);
  }
  assert.equal("mandadoRecipientPhone" in order, false);
  assert.equal(
    sanitized.location,
    null,
    "la última ubicación del repartidor no se guarda (la da el GPS)"
  );

  // Lo que la navegación SÍ necesita sigue ahí.
  assert.equal(order.orderNumber, "A-9001");
  assert.equal(order.destLat, 20.6);
  assert.equal(order.destLng, -100.3);
  assert.equal(order.mandadoState, "en_route");
  assert.equal(
    order.restaurantPickedUpAt,
    "2026-11-24T10:00:00.000Z",
    "la etapa del restaurante sí se guarda"
  );
  assert.equal(order.requiresDeliveryPin, true, "el booleano de política no es el NIP");
  assert.equal(sanitized.orders.length, 1);
  assert.equal(sanitized.estado, "busy");

  // Lo que queda en el storage: ni un valor personal, ni el NIP tecleado.
  const raw = encodeDriverStateSnapshot(FULL_STATE, T0, "driver_A");
  assert.ok(raw);
  for (const value of PERSONAL_VALUES) {
    assert.equal(raw.includes(value), false, `el snapshot no debe contener «${value}»`);
  }
  // Del booleano `requiresDeliveryPin` no se puede deducir ningún código: el
  // NIP nunca llega al teléfono (el backend no lo manda) y el snapshot no
  // guarda lo que se teclee. Única clave admitida que mencione PIN:
  const pinKeys = raw.match(/[A-Za-z]*[Pp][Ii][Nn][A-Za-z]*/g) ?? [];
  assert.deepEqual([...new Set(pinKeys)], ["requiresDeliveryPin"]);
  assert.equal(/nip/i.test(raw), false, "ni rastro de NIP");

  // «Disponible» no genera snapshot (se sigue borrando el anterior).
  assert.equal(sanitizeDriverStateForSnapshot(IDLE_STATE), null);
  // Sobre v1 (con datos personales) se descarta: hoy el formato es el 2.
  const legacy = JSON.stringify({ version: 1, savedAt: T0, payload: { orders: [FULL_ORDER] } });
  assert.equal(decodeDriverStateSnapshot(legacy, T0 + 1_000).status, "invalid");
});

test("10-B: el snapshot pertenece al usuario y se borra al cambiar de usuario o cerrar sesión", () => {
  const storage = makeStorage();

  // Mismo usuario: se restaura.
  assert.equal(writeDriverStateSnapshot(storage, FULL_STATE, T0, "driver_A"), true);
  const same = readDriverStateSnapshot(storage, T0 + 1_000, undefined, "driver_A");
  assert.equal(same.status, "ok");
  if (same.status === "ok") assert.equal(same.payload.orders[0].orderNumber, "A-9001");

  // Otro usuario en el mismo iPhone: no se restaura y se BORRA en el acto.
  const other = readDriverStateSnapshot(storage, T0 + 1_000, undefined, "driver_B");
  assert.equal(other.status, "foreign");
  assert.equal(storage.map.has(DRIVER_STATE_SNAPSHOT_KEY), false);

  // Cerrar sesión (el hook limpia): el siguiente arranque no restaura nada.
  assert.equal(writeDriverStateSnapshot(storage, FULL_STATE, T0, "driver_A"), true);
  clearDriverStateSnapshot(storage);
  assert.equal(readDriverStateSnapshot(storage, T0, undefined, "driver_A").status, "empty");

  // Sin dueño conocido (Clerk aún resolviendo) se puede leer...
  writeDriverStateSnapshot(storage, FULL_STATE, T0, "driver_A");
  assert.equal(readDriverStateSnapshot(storage, T0, undefined, null).status, "ok");

  // ...pero un sobre sin dueño NO se le entrega a un usuario concreto.
  storage.map.delete(DRIVER_STATE_SNAPSHOT_KEY);
  writeDriverStateSnapshot(storage, FULL_STATE, T0, null);
  assert.equal(
    readDriverStateSnapshot(storage, T0, undefined, "driver_A").status,
    "foreign"
  );
  assert.equal(storage.map.has(DRIVER_STATE_SNAPSHOT_KEY), false);
});

test("10-C: a los 30 s sin fix bueno se oculta la distancia; el aviso de 8 s no cambia", () => {
  assert.equal(GPS_STALE_DISTANCE_MS, 30_000);
  assert.ok(GPS_STALE_DISTANCE_MS > GPS_WEAK_GRACE_MS);
  const base = { routeAlive: true, navigationReady: true };

  // El criterio de aviso de la Fase 9 sigue intacto (8 s).
  assert.equal(isGpsWeak({ ...base, msSinceGoodFix: GPS_WEAK_GRACE_MS }), false);
  assert.equal(isGpsWeak({ ...base, msSinceGoodFix: GPS_WEAK_GRACE_MS + 1 }), true);
  assert.equal(
    shouldHideManeuverDistance({ ...base, msSinceGoodFix: GPS_WEAK_GRACE_MS + 1 }),
    false,
    "avisar de GPS débil NO oculta la distancia todavía"
  );

  // La distancia se oculta solo pasado el umbral de 30 s.
  assert.equal(shouldHideManeuverDistance({ ...base, msSinceGoodFix: 29_999 }), false);
  assert.equal(
    shouldHideManeuverDistance({ ...base, msSinceGoodFix: GPS_STALE_DISTANCE_MS }),
    false
  );
  assert.equal(
    shouldHideManeuverDistance({ ...base, msSinceGoodFix: GPS_STALE_DISTANCE_MS + 1 }),
    true
  );

  // Sin ruta viva, sin navegación iniciada o sin referencia: nunca se oculta.
  assert.equal(
    shouldHideManeuverDistance({ routeAlive: false, navigationReady: true, msSinceGoodFix: 90_000 }),
    false
  );
  assert.equal(
    shouldHideManeuverDistance({ routeAlive: true, navigationReady: false, msSinceGoodFix: 90_000 }),
    false
  );
  assert.equal(shouldHideManeuverDistance({ ...base, msSinceGoodFix: null }), false);

  // Al ocultar la distancia la tarjeta conserva el TEXTO de la maniobra:
  // `computeGuidance` no depende de la antigüedad del fix.
  const steps = [
    { distanceMeters: 400, maneuver: "depart", instruction: "Dirígete al norte" },
    { distanceMeters: 95, maneuver: "ramp-right", instruction: "Toma la rampa a la derecha" },
    { distanceMeters: 300, maneuver: "arrive", instruction: "Llega a tu destino" },
  ];
  const g = computeGuidance(initialGuidanceState(), steps, 795, 300);
  assert.equal(g.maneuver, "ramp-right");
  assert.match(g.instruction, /rampa a la derecha/);
  assert.equal(Math.round(g.distanceToManeuver), 100);
});

// ══════════════════════════════════════════════════════════════════
// Fase 11 — Deslizador "desliza para confirmar" (auditoría del bug:
// se llenaba al ~60-65 % y volvía al inicio sin confirmar).
// ══════════════════════════════════════════════════════════════════

test("Fase 11-A: stageActionFor — matriz etapa × tipo de pedido", () => {
  // at_pickup: AMBOS servicios confirman la recolección. Mandado → mandadoEnRuta;
  // restaurante → restaurantPickedUpAt (Fase A). La acción de servidor es la
  // misma (`picked_up`) y el endpoint ramifica por serviceKind.
  for (const serviceKind of ["mandado", "restaurant"]) {
    for (const orderAction of ["navigate_pickup", "picked_up", null]) {
      assert.equal(stageActionFor("at_pickup", orderAction, serviceKind), "picked_up");
    }
  }
  // Sin tipo de pedido no se inventa una acción.
  assert.equal(stageActionFor("at_pickup", null, null), null);
  assert.equal(stageActionFor("at_pickup", "navigate_pickup", undefined), null);

  // at_delivery: siempre `delivered`, sin importar el tipo de pedido.
  for (const serviceKind of ["mandado", "restaurant", null]) {
    for (const orderAction of ["navigate_delivery", "delivered", "picked_up", null]) {
      assert.equal(stageActionFor("at_delivery", orderAction, serviceKind), "delivered");
    }
  }

  // Etapas sin acción propia: solo el fallback por acción del pedido.
  for (const phase of ["to_pickup", "to_delivery", "done", null]) {
    assert.equal(stageActionFor(phase, "navigate_pickup", "mandado"), null);
    assert.equal(stageActionFor(phase, null, "mandado"), null);
    assert.equal(stageActionFor(phase, null, "restaurant"), null);
    assert.equal(stageActionFor(phase, "picked_up", "mandado"), "picked_up");
    assert.equal(stageActionFor(phase, "delivered", "restaurant"), "delivered");
  }
});

test("Fase 11-B: ya no hay hueco de recolección; el aviso queda solo para etapas futuras", () => {
  // El hueco de restaurantes se cerró con restaurantPickedUpAt: la etapa tiene
  // acción y el deslizador se pinta en lugar del aviso ámbar.
  assert.equal(stageActionGapMessage("at_pickup", "restaurant"), null);
  assert.equal(stageActionGapMessage("at_pickup", "mandado"), null);
  assert.equal(stageActionGapMessage("at_delivery", "restaurant"), null);
  assert.equal(stageActionGapMessage("at_delivery", "mandado"), null);
  assert.equal(stageActionGapMessage("to_pickup", "restaurant"), null);
  assert.equal(stageActionGapMessage("to_delivery", "mandado"), null);
  assert.equal(stageActionGapMessage("done", "mandado"), null);
  assert.equal(stageActionGapMessage(null, null), null);
});

test("Fase 11-C: recorrido del track y progreso (% del recorrido vs % del relleno)", () => {
  // iPhone 390 px con px-4: track ≈ 358 px → recorrido 358 − 48 − 8 = 302 px.
  const max = swipeTravelPx(358);
  assert.equal(max, 302);
  // Suelo de seguridad: sin medición nunca hay recorrido 0.
  assert.equal(swipeTravelPx(0), 1);

  // El relleno que se vio en el video (60-65 % del ancho) son ~220 px: 61 % del
  // track y 73 % del recorrido exigido. NO es el umbral.
  assert.equal(swipeFillPct(220, 358), 61.5);
  assert.equal(swipeProgressPct(220, max), 72.8);

  assert.equal(swipeProgressPct(0, max), 0);
  assert.equal(swipeProgressPct(max / 2, max), 50);
  assert.equal(swipeProgressPct(max, max), 100);
  assert.equal(swipeProgressPct(max + 40, max), 100);
  assert.equal(swipeProgressPct(-10, max), 0);
  // Sin recorrido medido no se divide por cero.
  assert.equal(swipeProgressPct(10, 0), 0);
  assert.equal(swipeFillPct(10, 0), 0);
});

test("Fase 11-D: cancelled ≠ release ≠ threshold (el umbral tolera 4 px)", () => {
  const max = swipeTravelPx(358);

  // Un release al 60-65 % del relleno se reinicia y NO confirma.
  assert.equal(classifySwipeEnd({ x: 220, maxX: max, cancelled: false }), "release");
  // El mismo punto, si el navegador se quedó el gesto, es una cancelación.
  assert.equal(classifySwipeEnd({ x: 220, maxX: max, cancelled: true }), "cancelled");

  assert.equal(swipeReachedThreshold(max, max), true);
  assert.equal(swipeReachedThreshold(max - 4, max), true);
  assert.equal(swipeReachedThreshold(max - 5, max), false);
  assert.equal(classifySwipeEnd({ x: max - 4, maxX: max, cancelled: false }), "threshold");
  assert.equal(classifySwipeEnd({ x: max - 5, maxX: max, cancelled: false }), "release");

  // Un gesto cancelado NUNCA confirma, ni siquiera con el thumb en el extremo.
  assert.equal(classifySwipeEnd({ x: max, maxX: max, cancelled: true }), "cancelled");
  assert.equal(classifySwipeEnd({ x: max + 30, maxX: max, cancelled: true }), "cancelled");
});

// ══════════════════════════════════════════════════════════════════
// Fase 12 — Recolección de RESTAURANTES (decisión A):
// `restaurantPickedUpAt`, sin dispatchStatus/orderStatus nuevos.
// ══════════════════════════════════════════════════════════════════

const PICKUP_NOW = "2026-11-24T10:00:00.000Z";

function restaurantOrder(overrides = {}) {
  return {
    _id: "ord-r1",
    _rev: "rev-1",
    orderNumber: "R-1",
    serviceKind: "restaurant",
    orderType: "delivery",
    dispatchStatus: "accepted",
    repartidorAsignadoRef: "drv-1",
    ...overrides,
  };
}

/** Backend falso con revisión (mismo contrato que el patch condicional). */
function createPickupBackend(initialOrder) {
  return {
    doc: structuredClone(initialOrder),
    rev: 1,
    effects: { patches: [], events: [], baserow: [] },
    read() {
      return structuredClone(this.doc);
    },
    patch(expectedRev, fields) {
      if (String(expectedRev) !== String(this.doc._rev)) {
        const err = new Error("revision mismatch");
        err.status = 409;
        throw err;
      }
      this.effects.patches.push({ ...fields });
      Object.assign(this.doc, fields);
      this.doc._rev = `rev-${++this.rev}`;
    },
    event(type) {
      this.effects.events.push(type);
    },
    sync() {
      this.effects.baserow.push(this.doc._id);
    },
    effectCount() {
      return (
        this.effects.patches.length +
        this.effects.events.length +
        this.effects.baserow.length
      );
    },
  };
}

/**
 * Replica el ORDEN de guardas de markRestaurantPickedUp (lib/driver-actions.ts):
 * decisión pura → ya recogido (200 sin efectos) → patch + evento + Baserow.
 * 12-D fija que la fuente real conserve ese cableado.
 */
function applyRestaurantPickup(backend, driverId) {
  const order = backend.read();
  const decision = decideRestaurantPickup(order, driverId);
  if (!decision.apply) {
    return { status: "rejected", error: decision.error };
  }
  if (decision.alreadyPickedUp) {
    return { status: "idempotent" };
  }
  backend.patch(order._rev, {
    restaurantPickedUpAt: PICKUP_NOW,
    updatedAt: PICKUP_NOW,
  });
  backend.event("picked_up");
  backend.sync();
  return { status: "transition" };
}

test("12-A: decideRestaurantPickup — propiedad, tipo, estado y doble envío", () => {
  // Feliz: restaurante a domicilio propio, todavía en recolección.
  assert.deepEqual(decideRestaurantPickup(restaurantOrder(), "drv-1"), {
    apply: true,
    alreadyPickedUp: false,
  });

  // Pedido de OTRO repartidor: mensaje genérico, sin filtrar el estado ajeno
  // (ni siquiera importa si ya está en at_door).
  assert.deepEqual(decideRestaurantPickup(restaurantOrder(), "drv-2"), {
    apply: false,
    error: NOT_ASSIGNED_ERROR,
  });
  assert.deepEqual(
    decideRestaurantPickup(restaurantOrder({ dispatchStatus: "at_door" }), "drv-2"),
    { apply: false, error: NOT_ASSIGNED_ERROR }
  );

  // Ya recogido: idempotente aunque el pedido haya avanzado a at_door.
  assert.deepEqual(
    decideRestaurantPickup(
      restaurantOrder({ restaurantPickedUpAt: PICKUP_NOW, dispatchStatus: "at_door" }),
      "drv-1"
    ),
    { apply: true, alreadyPickedUp: true }
  );

  // Mandado: tiene su propia transición, aquí no se toca.
  assert.equal(
    decideRestaurantPickup(restaurantOrder({ serviceKind: "mandado" }), "drv-1").error,
    "Este pedido no es de restaurante."
  );

  // Click & collect: nunca es una recolección de repartidor.
  assert.equal(
    decideRestaurantPickup(
      restaurantOrder({ orderType: "pickup", dispatchStatus: "not_required" }),
      "drv-1"
    ).error,
    "Este pedido no es de entrega."
  );

  // Estado inválido del PROPIO pedido.
  assert.equal(
    decideRestaurantPickup(restaurantOrder({ dispatchStatus: "offered" }), "drv-1").error,
    'Acción no válida en estado "offered".'
  );
  assert.equal(decideRestaurantPickup(null, "drv-1").error, "El pedido no existe.");
});

test("12-B: la recolección sella el timestamp UNA vez y el duplicado no tiene efectos", () => {
  const backend = createPickupBackend(restaurantOrder());

  assert.deepEqual(applyRestaurantPickup(backend, "drv-1"), { status: "transition" });
  assert.equal(backend.effects.patches.length, 1);
  assert.equal(backend.effects.patches[0].restaurantPickedUpAt, PICKUP_NOW);
  assert.deepEqual(backend.effects.events, ["picked_up"]);
  assert.equal(backend.effects.baserow.length, 1);
  // El estado de despacho NO cambia: at_door sigue siendo la puerta del cliente.
  assert.equal(backend.doc.dispatchStatus, "accepted");
  assert.equal(backend.doc.orderStatus, undefined);
  assert.equal(backend.doc.status, undefined);

  // Segundo envío: 200 idempotente, CERO efectos (ni evento ni mensajes).
  const before = backend.effectCount();
  assert.deepEqual(applyRestaurantPickup(backend, "drv-1"), { status: "idempotent" });
  assert.equal(backend.effectCount(), before, "el duplicado no debe escribir nada");

  // Pedido ajeno: CERO efectos y el documento queda intacto.
  const foreign = createPickupBackend(restaurantOrder());
  const foreignSnapshot = foreign.read();
  assert.deepEqual(applyRestaurantPickup(foreign, "drv-2"), {
    status: "rejected",
    error: NOT_ASSIGNED_ERROR,
  });
  assert.equal(foreign.effectCount(), 0);
  assert.deepEqual(foreign.read(), foreignSnapshot);
});

test("12-B2: mandado y click & collect quedan intactos (cero efectos)", () => {
  const mandado = createPickupBackend(
    restaurantOrder({ serviceKind: "mandado", orderNumber: "M-1" })
  );
  const mandadoSnapshot = mandado.read();
  assert.equal(applyRestaurantPickup(mandado, "drv-1").status, "rejected");
  assert.equal(mandado.effectCount(), 0);
  assert.deepEqual(mandado.read(), mandadoSnapshot, "el mandado no cambia de estado");

  const clickCollect = createPickupBackend(
    restaurantOrder({ orderType: "pickup", dispatchStatus: "not_required" })
  );
  const pickupSnapshot = clickCollect.read();
  assert.equal(applyRestaurantPickup(clickCollect, "drv-1").status, "rejected");
  assert.equal(clickCollect.effectCount(), 0);
  assert.deepEqual(clickCollect.read(), pickupSnapshot);
});

test("12-C: en el Drive, destination_arrival de restaurante exige recolección", () => {
  // Camino de la APP (requireRestaurantPickup = true).
  assert.equal(
    restaurantDestinationArrivalError(restaurantOrder(), true),
    "Confirma la recolección antes de marcar la llegada."
  );
  assert.equal(
    restaurantDestinationArrivalError(
      restaurantOrder({ restaurantPickedUpAt: PICKUP_NOW }),
      true
    ),
    null
  );
  // Mandados: su máquina ya exige EN_ROUTE, la guarda no aplica.
  assert.equal(
    restaurantDestinationArrivalError(restaurantOrder({ serviceKind: "mandado" }), true),
    null
  );
  // Click & collect: no aplica.
  assert.equal(
    restaurantDestinationArrivalError(restaurantOrder({ orderType: "pickup" }), true),
    null
  );
  // Camino de WHATSAPP (sin la opción): no cambia absolutamente nada.
  assert.equal(restaurantDestinationArrivalError(restaurantOrder(), false), null);
  assert.equal(restaurantDestinationArrivalError(null, true), null);
});

test("12-D: el endpoint ramifica picked_up por serviceKind y el Drive exige recolección", () => {
  const route = readFileSync("app/api/driver/action/route.ts", "utf8");
  const actions = readFileSync("lib/driver-actions.ts", "utf8");

  // picked_up → markPickedUp (que ramifica por serviceKind), nunca directo a
  // markMandadoEnRoute como antes.
  assert.match(route, /case "picked_up":[\s\S]{0,300}?markPickedUp\(orderNumber, repartidor\._id\)/);
  // destination_arrival del Drive pasa la guarda de recolección.
  assert.match(
    route,
    /case "destination_arrival":[\s\S]{0,400}?requireRestaurantPickup:\s*true/
  );
  // La rama de mandados conserva su función de siempre.
  assert.match(
    actions,
    /markPickedUp\([\s\S]{0,400}?markMandadoEnRoute\(orderNumber, driverId\)/
  );
  // Restaurante: decisión pura + CAS por transitionOrder + evento picked_up.
  assert.match(actions, /export async function markRestaurantPickedUp\(/);
  assert.match(actions, /decideRestaurantPickup\(order, driverId\)/);
  assert.match(
    actions,
    /restaurantPickedUpAt: now[\s\S]{0,120}?"picked_up"/
  );
  // markAtDoor sigue siendo el único escritor de at_door y recibe la opción.
  assert.match(actions, /opts: \{ requireRestaurantPickup\?: boolean \}/);
  assert.match(actions, /restaurantDestinationArrivalError\(/);
});

test("12-E: cierre solo-Drive — llegada automática y recuperación sin atajos", () => {
  const page = readFileSync("app/(drive)/drive/page.tsx", "utf8");

  // La llegada al CLIENTE se sigue marcando sola por geocerca, igual que en
  // mandados (el servidor exige la recolección vía requireRestaurantPickup).
  assert.match(page, /navPhase === "at_delivery"[\s\S]{0,90}?"destination_arrival"/);

  // La auto-recuperación de una acción rechazada no manda `pickup_arrival` a un
  // restaurante (esa acción sólo existe para mandados).
  assert.match(
    page,
    /stageAction === "picked_up"[\s\S]{0,240}?serviceKind === "mandado"[\s\S]{0,160}?"pickup_arrival"/
  );
  assert.match(page, /: null\s*\n\s*: "destination_arrival"/);

  // La entrega no se relaja: markDelivered sigue exigiendo at_door y el NIP se
  // valida server-side (esta fase no toca ninguna de las dos guardas).
  const actions = readFileSync("lib/driver-actions.ts", "utf8");
  assert.match(actions, /order\.dispatchStatus !== "at_door"/);
  assert.match(page, /delivered_with_pin/);
});
