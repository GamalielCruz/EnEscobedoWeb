/**
 * drive-trace-simulate.mjs — Genera una traza `drive-trace/v1` SIN dispositivo
 * alimentando los MÓDULOS PUROS de la Fase 1 con un GPS con la MISMA forma que
 * la traza T1 (57 s, caminata ≤1.9 m/s, headings nulos, ráfaga inicial,
 * saltos de 10.7/13.1 m, precisión 26→5 m, cierre con coords.heading pegado).
 *
 * No es evidencia de Safari: es la reproducción del CONTROLADOR sobre la misma
 * entrada, para medir con `scripts/drive-trace-replay.js` los criterios de
 * aceptación sin teléfono. El mapa se emula: al cambiar bearing/zoom el sink
 * dispara `rotatestart`/`zoomstart` PROGRAMÁTICOS (como mapbox-gl 3.33), y el
 * controlador debe ignorarlos.
 *
 * Uso:
 *   npm run sim:drive -- /tmp/t1-sim.json
 *   node scripts/drive-trace-replay.js /tmp/t1-sim.json
 */

import fs from "node:fs";

import { applyGpsFix, effectiveCourseHeading, effectiveSpeedMps, initialSpeedHeadingState } from "../lib/drive/speed-heading.ts";
import { createDriveHeadingResolver } from "../lib/drive/heading-resolver.ts";
import { computeFollowFrame } from "../lib/drive/follow-frame.ts";
import { anchorYForBand, applyCameraCommand, computeAnchorPaddingForBand, PUCK_ANCHOR_FRACTION, nextFollowStateOnMapEvent } from "../lib/drive/camera-controller.ts";

const outFile = process.argv[2] || "/tmp/t1-sim.json";

// Geometría de pantalla del iPhone del repartidor (banda visible).
const H = 800;
const TOP = 60;
const BOTTOM = 500;
const anchorY = anchorYForBand(TOP, BOTTOM, PUCK_ANCHOR_FRACTION);
const anchorPadding = computeAnchorPaddingForBand(H, TOP, BOTTOM, PUCK_ANCHOR_FRACTION);

const R = 6371000;
const rad = Math.PI / 180;
const hav = (a, b) => {
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
};
const brg = (a, b) => {
  const l1 = a.lat * rad, l2 = b.lat * rad, dl = (b.lng - a.lng) * rad;
  const y = Math.sin(dl) * Math.cos(l2);
  const x = Math.cos(l1) * Math.sin(l2) - Math.sin(l1) * Math.cos(l2) * Math.cos(dl);
  return (Math.atan2(y, x) / rad + 360) % 360;
};
const move = (p, bearingDeg, meters) => {
  const dLat = (meters * Math.cos(bearingDeg * rad)) / 111_320;
  const dLng = (meters * Math.sin(bearingDeg * rad)) / (111_320 * Math.cos(p.lat * rad));
  return { lat: p.lat + dLat, lng: p.lng + dLng };
};

// ── Ruta T1: este 25 s → giro al sur → vuelta en U a los 45 s ──
const ORIGIN = { lat: 25.6866, lng: -100.3161 };
const WALK_MPS = 1.35;
const routeLegs = [
  { bearing: 90, meters: 25 * WALK_MPS },
  { bearing: 180, meters: 20 * WALK_MPS },
  { bearing: 0, meters: 12 * WALK_MPS },
];
const path = [ORIGIN];
{
  let p = ORIGIN;
  for (const leg of routeLegs) {
    const end = move(p, leg.bearing, leg.meters);
    path.push(end);
    p = end;
  }
}
const totalPath = routeLegs.reduce((s, l) => s + l.meters, 0);
const pointAtDistance = (d) => {
  let acc = 0;
  for (let i = 1; i < path.length; i++) {
    const len = hav(path[i - 1], path[i]);
    if (acc + len >= d) return move(path[i - 1], brg(path[i - 1], path[i]), d - acc);
    acc += len;
  }
  return path[path.length - 1];
};

// ── GPS con la forma de T1 ──
const T0 = Date.parse("2026-11-20T18:00:00.000Z");
const gps = [];
const pushFix = (t, pos, accuracy, speed, heading, accepted = true, rejectedReason) => {
  gps.push({ t: T0 + t, deviceT: T0 + t, lat: pos.lat, lng: pos.lng, accuracy, speed, heading, accepted, ...(rejectedReason ? { rejectedReason } : {}) });
};
// Ráfaga inicial: tres fixes en 0.2 s (dt≈2 ms, 3.7 m) que en T1 quedaron
// pegados como velocidad de 1784 m/s.
pushFix(0, pointAtDistance(0), 26, null, null);
pushFix(100, pointAtDistance(3.7), 26, null, null);
pushFix(200, pointAtDistance(4.1), 26, null, null);
for (let s = 1; s <= 57; s++) {
  const t = s * 1000;
  let pos = pointAtDistance(Math.min(totalPath, s * WALK_MPS));
  // Saltos de GPS de 10.7 m y 13.1 m a los 7–8 s.
  if (s === 7) pos = move(pos, 240, 10.7);
  if (s === 8) pos = move(pos, 200, 13.1);
  // Precisión 26 → 5 m en ~10 s.
  const accuracy = s < 3 ? 26 : s < 6 ? 15 : s < 10 ? 9 : 5;
  // coords.heading nulo salvo al final (iOS lo entrega tarde y lo deja pegado).
  const heading = s >= 50 ? 108.149 : null;
  // coords.speed válida salvo los primeros 2 s.
  const speed = s < 2 ? null : WALK_MPS;
  // Parado los últimos 4 s (53–57): el rumbo por posiciones oscila en T1.
  const parked = s >= 53;
  if (parked) {
    pos = move(pos, (s % 2 ? 118 : 302), 0.4);
    pushFix(t, pos, accuracy, 0, heading);
    continue;
  }
  pushFix(t, pos, accuracy, speed, heading);
}

// ── Controlador: estado de follow, resolvedor y frame de cámara ──
const events = [];
const camera = [];
let followState = "FOLLOWING";
let virtualCenter = { ...path[0] };
let virtualBearing = 0;
let virtualZoom = 18.6;
let virtualPadding = null;

const markerEvents = (type, isGesture) => {
  events.push({ t: T0 + nowOffset, type, hasOriginalEvent: isGesture });
  followState = nextFollowStateOnMapEvent(followState, { type, isGesture }).state;
};

const sink = {
  jumpTo: (cmd) => {
    if (cmd.center) virtualCenter = { ...cmd.center };
    if (cmd.padding) virtualPadding = cmd.padding;
    if (cmd.heading != null && Math.abs(((cmd.heading - virtualBearing + 540) % 360) - 180) > 0.12) {
      virtualBearing = cmd.heading;
      // mapbox-gl 3.33 dispara rotatestart SIN originalEvent (programático).
      markerEvents("rotatestart", false);
    }
    if (cmd.zoom != null && Math.abs(cmd.zoom - virtualZoom) > 0.01) {
      virtualZoom = cmd.zoom;
      markerEvents("zoomstart", false);
    }
  },
  easeTo: (cmd) => sink.jumpTo(cmd),
  stop: () => {},
};

let speedState = initialSpeedHeadingState();
let movementHeading = null;
let gpsHeading = null;
let fixIdx = 0;
let vehiclePos = { ...path[0] };
let visualHeading = null;
let cameraHeading = null;
let cameraHeadingTs = null;
let zoomTarget = null;
let pendingZoom = null;
let nowOffset = 0;

const resolver = createDriveHeadingResolver({
  getSimHeading: () => ({ active: false, simHeading: null }),
  getGpsHeading: () => gpsHeading,
  getSpeedMps: () => effectiveSpeedMps(speedState, T0 + nowOffset),
  getMovementHeading: () => movementHeading,
  getDeviceHeading: () => ({ heading: 0, available: "unavailable", permission: "denied" }),
  getRouteGeometry: () => ({ path, vehiclePos }),
  minMovementMeters: 8,
  minMovementMs: 1_000,
});

const FRAME_MS = 33;
let lastSample = -1;
for (let t = 0; t <= 57_000; t += FRAME_MS) {
  nowOffset = t;
  // Fix GPS "nuevo" cuando toca.
  while (fixIdx < gps.length && gps[fixIdx].t - T0 <= t) {
    const g = gps[fixIdx++];
    if (!g.accepted) continue;
    gpsHeading = g.heading;
    speedState = applyGpsFix(
      speedState,
      { pos: { lat: g.lat, lng: g.lng }, ts: g.t, coordsSpeed: g.speed, accuracy: g.accuracy },
      g.heading
    );
    const course = effectiveCourseHeading(speedState);
    if (course != null) movementHeading = course;
    followState = followState === "FOLLOWING" ? "FOLLOWING" : followState;
  }

  const target = (() => {
    for (let i = fixIdx - 1; i >= 0; i--) if (gps[i].accepted) return { lat: gps[i].lat, lng: gps[i].lng };
    return path[0];
  })();

  const frame = computeFollowFrame(
    { vehiclePos, visualHeading, cameraHeading, cameraHeadingTs, zoomTarget },
    {
      now: t,
      frameScale: 1,
      mapZoom: virtualZoom,
      target,
      targetHeading: resolver.resolve(),
      simHeading: null,
      speedMps: effectiveSpeedMps(speedState, T0 + t),
      route: null,
      anchorY,
      containerHeightPx: H,
      pendingZoom,
      accuracy: gps[Math.max(0, fixIdx - 1)]?.accuracy ?? null,
    }
  );
  vehiclePos = frame.state.vehiclePos;
  visualHeading = frame.state.visualHeading;
  cameraHeading = frame.state.cameraHeading;
  cameraHeadingTs = frame.state.cameraHeadingTs;
  zoomTarget = frame.state.zoomTarget;
  pendingZoom = frame.pendingZoom;
  applyCameraCommand(sink, {
    center: frame.command.center,
    heading: frame.command.bearing,
    padding: frame.command.padding,
    ...(frame.command.zoom != null ? { zoom: frame.command.zoom } : {}),
    pitch: 0,
    origin: "programmatic",
  });

  // Muestreo a 5 Hz (igual que el grabador real).
  if (t - lastSample >= 200) {
    lastSample = t;
    const dbg = resolver.state.debug;
    if (process.env.SIM_DEBUG && t >= 44000 && t <= 56000) {
      console.log(
        `${(t / 1000).toFixed(0)}s course=${movementHeading?.toFixed(0)} gps=${gpsHeading ?? "-"} acc=${resolver.state.acceptedHeading?.toFixed(0)} src=${dbg?.source} route=${dbg?.routeHeading?.toFixed(0)} dev=${resolver.state.deviating}`
      );
    }
    const mpp = (156543.03392 * Math.cos((vehiclePos.lat * rad))) / Math.pow(2, virtualZoom);
    // Mapa VIRTUAL: se aplica la MISMA fórmula que mapbox-gl para el centro
    // aparente con padding (EdgeInsets#getCenter). No es evidencia de Mapbox.
    const applied = virtualPadding ?? anchorPadding;
    const puckPxY = (applied.top + H - applied.bottom) / 2;
    camera.push({
      t: T0 + t,
      centerLat: virtualCenter.lat,
      centerLng: virtualCenter.lng,
      bearing: virtualBearing,
      zoom: virtualZoom,
      followDriver: followState === "FOLLOWING",
      loopAlive: true,
      resolverSource: dbg?.source ?? null,
      resolvedHeading: resolver.state.acceptedHeading,
      visualHeading,
      speedMps: effectiveSpeedMps(speedState, T0 + t),
      compassHeading: null,
      compassAvailable: "permission_required",
      puckPxY,
      containerHeight: H,
      visibleTopPx: TOP,
      visibleBottomPx: BOTTOM,
      vehicleLat: vehiclePos.lat,
      vehicleLng: vehiclePos.lng,
      __mpp: mpp,
    });
  }
  events.push({ t: T0 + t, kind: "follow", followDriver: followState === "FOLLOWING", navigatingWithRoute: true });
}

// Transiciones de follow: solo las que cambian de valor.
const followSamples = events.filter((e) => e.kind === "follow");
const compact = [];
let prev = null;
for (const f of followSamples) {
  if (prev === null || prev !== f.followDriver) compact.push(f);
  prev = f.followDriver;
}
// Un solo evento de follow al inicio + cambios reales.
const finalEvents = [
  ...events.filter((e) => e.kind !== "follow"),
  ...(compact.length ? compact : [followSamples[0]]),
].sort((a, b) => a.t - b.t);

const trace = {
  format: "drive-trace/v1",
  exportedAt: new Date().toISOString(),
  userAgent: "drive-trace-simulate (T1-shaped, SIN dispositivo · mapa VIRTUAL)",
  gps: gps.map((g) => ({ ...g })),
  camera: camera.map(({ __mpp, ...c }) => c),
  events: finalEvents,
};
fs.writeFileSync(outFile, JSON.stringify(trace));
console.log(
  `Traza T1-simulada escrita en ${outFile}: ${trace.gps.length} GPS · ${trace.camera.length} cámara · ${trace.events.length} eventos`
);
