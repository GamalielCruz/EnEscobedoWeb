#!/usr/bin/env node
/**
 * make-drive-fixture.mjs — convierte una traza `drive-trace/v1` exportada del
 * iPhone en una fixture `drive-gps-fixture/v1` con las coordenadas TRASLADADAS
 * a un origen arbitrario (Fase 4).
 *
 * Conserva distancias y rumbos locales (proyección ENU alrededor del primer
 * fix) y los tiempos relativos a la primera muestra. Incluye la ruta activa
 * (polilínea + steps) cuando la traza la trae, para poder reproducir también
 * la tarjeta y el proyecto sobre ruta.
 *
 * Uso:
 *   node scripts/make-drive-fixture.mjs <traza.json> [salida.json] [--source T6]
 *
 * NUNCA escribas en la fixture las coordenadas reales del usuario.
 */

import fs from "node:fs";
import path from "node:path";

const input = process.argv[2];
if (!input || !fs.existsSync(input)) {
  console.error("Uso: node scripts/make-drive-fixture.mjs <traza.json> [salida.json] [--source T6]");
  process.exit(2);
}
const sourceIdx = process.argv.indexOf("--source");
const source =
  sourceIdx !== -1 && process.argv[sourceIdx + 1]
    ? process.argv[sourceIdx + 1]
    : path.basename(input).replace(/\..*$/, "");
const output =
  process.argv[3] && !process.argv[3].startsWith("--")
    ? process.argv[3]
    : `lib/drive/__fixtures__/gps-${source.toLowerCase()}.json`;

const trace = JSON.parse(fs.readFileSync(input, "utf8"));
if (trace.format !== "drive-trace/v1") {
  console.error("Formato no reconocido (se esperaba drive-trace/v1).");
  process.exit(2);
}
const gps = Array.isArray(trace.gps) ? trace.gps : [];
if (gps.length === 0) {
  console.error("La traza no contiene muestras GPS.");
  process.exit(2);
}

const ORIGIN = { lat: 25.0, lng: -100.0 };
const anchor = { lat: gps[0].lat, lng: gps[0].lng };
const t0 = gps[0].t;
const rad = Math.PI / 180;
const mPerDegLat = 111_320;
const mPerDegLngAnchor = 111_320 * Math.cos(anchor.lat * rad);
const mPerDegLngOrigin = 111_320 * Math.cos(ORIGIN.lat * rad);

function translate(point) {
  if (!point || typeof point.lat !== "number" || typeof point.lng !== "number") {
    return point;
  }
  const eastM = (point.lng - anchor.lng) * mPerDegLngAnchor;
  const northM = (point.lat - anchor.lat) * mPerDegLat;
  return {
    lat: ORIGIN.lat + northM / mPerDegLat,
    lng: ORIGIN.lng + eastM / mPerDegLngOrigin,
  };
}

const samples = gps.map((g) => ({
  t: g.t - t0,
  deviceT: g.deviceT != null ? g.deviceT - t0 : null,
  ...translate({ lat: g.lat, lng: g.lng }),
  accuracy: g.accuracy ?? null,
  speed: g.speed ?? null,
  heading: g.heading ?? null,
  recorded: {
    accepted: g.accepted === true,
    ...(g.rejectedReason ? { rejectedReason: g.rejectedReason } : {}),
  },
}));

let route = null;
if (trace.route && Array.isArray(trace.route.path) && trace.route.path.length >= 2) {
  route = {
    destination: translate(trace.route.destination),
    distanceMeters: trace.route.distanceMeters ?? null,
    durationSeconds: trace.route.durationSeconds ?? null,
    steps: (trace.route.steps ?? []).map((s) => ({
      maneuver: s.maneuver ?? null,
      instruction: s.instruction ?? null,
      distanceMeters: s.distanceMeters,
      start: translate(s.start),
      end: translate(s.end),
    })),
    path: trace.route.path.map(translate),
  };
}

// La cámara de la traza también contiene ubicaciones: se traslada igual.
const camera = Array.isArray(trace.camera)
  ? trace.camera.map((c) => {
      const center = translate({ lat: c.centerLat, lng: c.centerLng });
      const vehicle = translate({ lat: c.vehicleLat, lng: c.vehicleLng });
      return {
        ...c,
        centerLat: center?.lat ?? null,
        centerLng: center?.lng ?? null,
        vehicleLat: vehicle?.lat ?? null,
        vehicleLng: vehicle?.lng ?? null,
      };
    })
  : undefined;

const fixture = {
  format: "drive-gps-fixture/v1",
  source,
  note:
    `GPS real de la traza ${source} con las coordenadas TRASLADADAS a un origen ` +
    `arbitrario (${ORIGIN.lat}, ${ORIGIN.lng}; distancias y rumbos locales ` +
    "conservados) y los tiempos relativos a la primera muestra. No contiene " +
    "ubicaciones reales.",
  startedAt: t0,
  durationMs: samples[samples.length - 1].t,
  route,
  build: trace.build ?? null,
  // Posición inicial de la app cuando aún no había fix: DEFAULT_CENTER.
  initialVisual: { lat: 20.502, lng: -100.145 },
  samples,
  ...(camera ? { camera } : {}),
  ...(trace.timings ? { timings: trace.timings } : {}),
};

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(fixture)}\n`);
console.log(
  `Fixture escrita: ${output} · ${samples.length} muestras · ruta ${
    route ? "sí" : "no"
  } · build ${fixture.build?.commit ?? "unknown"}`
);
