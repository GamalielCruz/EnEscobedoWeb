#!/usr/bin/env node
/**
 * drive-trace-replay.js — Arnés de reproducción (Fase 0, oleada v2).
 *
 * Consume un JSON exportado por el grabador de trazas
 * (lib/drive/trace-recorder.ts) y evalúa los umbrales de aceptación contra
 * DATOS REALES de Safari iOS:
 *   - huecos de cámara > 100 ms mientras el vehículo se mueve;
 *   - saltos de cámara > 15 px entre muestreos (salvo recentrado explícito);
 *   - error de rumbo vs. trayectoria (GPS suavizado) en tramo recto;
 *   - cambios > 45° en < 1 s sin vuelta en U confirmada;
 *   - salidas de FOLLOWING sin gesto del usuario (eventos programáticos);
 *   - ancla del puck (% de altura) vs. requisito 70–75%;
 *   - correlación brújula ↔ bearing de cámara (H6).
 *
 * Con --bundle <resolver.cjs> (esbuild de lib/drive/heading-resolver.ts)
 * re-ejecuta el resolvedor sobre la traza GPS y compara su heading con el
 * registrado en vivo (deriva del modelo) y con la verdad de trayectoria.
 *
 * Uso:
 *   node scripts/drive-trace-replay.js <traza.json> [--bundle /tmp/navtest/resolver.cjs]
 *
 * Nota: el controlador de cámara vive inline en page.tsx y no puede
 * importarse en Node; la evidencia de cámara se evalúa sobre las muestras
 * registradas (la cámara REAL ejecutada), no sobre un modelo. Eso es por
 * diseño en Fase 0: el controlador se extraerá en Fase 1.
 */
"use strict";
const fs = require("fs");
const path = require("path");

const file = process.argv[2];
const bundleIdx = process.argv.indexOf("--bundle");
if (!file || !fs.existsSync(file)) {
  console.error("Uso: node scripts/drive-trace-replay.js <traza.json> [--bundle resolver.cjs]");
  process.exit(2);
}
const trace = JSON.parse(fs.readFileSync(file, "utf8"));
if (trace.format !== "drive-trace/v1") {
  console.error("Formato no reconocido (se esperaba drive-trace/v1).");
  process.exit(2);
}

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
const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
// Metros por píxel a un zoom dado (slippy): 156543.03·cos(lat) / 2^zoom.
const mPerPx = (lat, zoom) => (156543.03392 * Math.cos(lat * rad)) / Math.pow(2, zoom);
const pct = (arr, p) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};

const gps = trace.gps || [];
const cam = trace.camera || [];
const events = trace.events || [];
const accepted = gps.filter((g) => g.accepted);

console.log("═".repeat(64));
console.log(`TRAZA: ${path.basename(file)} · exportada ${trace.exportedAt}`);
console.log(`UA: ${trace.userAgent || "(sin UA)"}`);
console.log(`Muestras: ${gps.length} GPS (${accepted.length} aceptadas, ${gps.length - accepted.length} descartadas) · ${cam.length} cámara · ${events.length} eventos`);
console.log("═".repeat(64));

// ── 1 · Sección GPS ────────────────────────────────────────────────────────
if (accepted.length >= 2) {
  const gaps = [];
  for (let i = 1; i < accepted.length; i++) {
    gaps.push(accepted[i].t - accepted[i - 1].t);
  }
  const accs = accepted.map((g) => g.accuracy).filter((a) => a != null);
  const nullSpeed = accepted.filter((g) => g.speed == null).length;
  const nullHeading = accepted.filter((g) => g.heading == null).length;
  const negHeading = accepted.filter((g) => g.heading != null && g.heading < 0).length;
  const rejected = gps.filter((g) => !g.accepted);
  console.log("\n── GPS (cadencia y calidad) ──────────────────────────────────");
  console.log(`  Intervalo entre fixes aceptados: p50=${pct(gaps, 0.5)} ms · p95=${pct(gaps, 0.95)} ms · máx=${Math.max(...gaps)} ms`);
  console.log(`  Accuracy: p50=${pct(accs, 0.5)?.toFixed(1)} m · p95=${pct(accs, 0.95)?.toFixed(1)} m · máx=${Math.max(...accs)?.toFixed(1)} m`);
  console.log(`  coords.speed nula: ${nullSpeed}/${accepted.length} · coords.heading nula: ${nullHeading}/${accepted.length} · heading<0: ${negHeading}`);
  console.log(`  Descartadas: ${rejected.length} (accuracy=${rejected.filter((g) => g.rejectedReason === "accuracy").length}, dedupe=${rejected.filter((g) => g.rejectedReason === "dedupe").length})`);
  // Velocidad derivada de la trayectoria (m/s) entre fixes aceptados.
  let moving = 0;
  for (let i = 1; i < accepted.length; i++) {
    const d = hav(accepted[i - 1], accepted[i]);
    const dt = (accepted[i].t - accepted[i - 1].t) / 1000;
    if (dt > 0 && d / dt > 2) moving++;
  }
  console.log(`  Tramos con velocidad derivada > 2 m/s: ${moving}/${accepted.length - 1}`);
}

// ── 2 · Sección cámara (huella real ejecutada) ─────────────────────────────
if (cam.length >= 2) {
  console.log("\n── Cámara (huella real ejecutada, muestreo 5 Hz) ─────────────");
  let loopDeadWhileMoving = 0;
  let movingSamples = 0;
  let freezeGapMax = 0;
  let jumpsPx = [];
  let lastMoveT = cam[0].t;
  for (let i = 1; i < cam.length; i++) {
    const a = cam[i - 1], b = cam[i];
    const moveM = a.vehicleLat != null && b.vehicleLat != null
      ? hav({ lat: a.vehicleLat, lng: a.vehicleLng }, { lat: b.vehicleLat, lng: b.vehicleLng })
      : 0;
    const isMoving = moveM > 1; // >1 m por 200 ms ⇒ >5 m/s
    if (isMoving) {
      movingSamples++;
      if (!b.loopAlive) loopDeadWhileMoving++;
      const centerMoved =
        a.centerLat != null && b.centerLat != null
          ? hav({ lat: a.centerLat, lng: a.centerLng }, { lat: b.centerLat, lng: b.centerLng })
          : 0;
      if (centerMoved > 0.5) lastMoveT = b.t;
      else freezeGapMax = Math.max(freezeGapMax, b.t - lastMoveT);
      if (b.zoom != null && centerMoved > 0) {
        jumpsPx.push(centerMoved / mPerPx(b.centerLat ?? 0, b.zoom));
      }
    }
  }
  console.log(`  Muestras en movimiento: ${movingSamples}/${cam.length - 1}`);
  console.log(`  Loop rAF muerto en movimiento: ${loopDeadWhileMoving} muestras`);
  console.log(`  Hueco de congelamiento máx (centro inmóvil en movimiento): ${freezeGapMax} ms`);
  if (jumpsPx.length) {
    const big = jumpsPx.filter((j) => j > 15).length;
    console.log(`  Saltos de centro: máx=${Math.max(...jumpsPx).toFixed(1)} px · >15 px: ${big}`);
  }
  // Ancla del puck (% de la altura del contenedor).
  const fracs = cam
    .filter((c) => c.puckPxY != null && c.containerHeight)
    .map((c) => (c.puckPxY / c.containerHeight) * 100);
  if (fracs.length) {
    console.log(`  Puck (fracción de altura): p50=${pct(fracs, 0.5)?.toFixed(1)} % · min=${Math.min(...fracs).toFixed(1)} % · máx=${Math.max(...fracs).toFixed(1)} % (requisito 70–75 %)`);
  }
  // Relación brújula ↔ bearing: ¿mueve la brújula la cámara?
  let compassDrivenBearing = 0;
  let compassSamples = 0;
  for (let i = 1; i < cam.length; i++) {
    const a = cam[i - 1], b = cam[i];
    if (a.compassHeading == null || b.compassHeading == null) continue;
    const cDelta = angDiff(b.compassHeading, a.compassHeading);
    const bDelta = a.bearing != null && b.bearing != null ? angDiff(b.bearing, a.bearing) : 0;
    if (cDelta > 5) {
      compassSamples++;
      if (Math.abs(bDelta - cDelta) < 10 && bDelta > 5) compassDrivenBearing++;
    }
  }
  console.log(`  Bearing sigue a la brújula: ${compassDrivenBearing}/${compassSamples} muevas de brújula >5° (H6)`);
}

// ── 3 · Rumbo vs trayectoria + re-ejecución del resolvedor ────────────────
function truthBearings(list, halfWindow = 2) {
  const out = new Array(list.length).fill(null);
  for (let i = 0; i < list.length; i++) {
    const a = list[Math.max(0, i - halfWindow)];
    const b = list[Math.min(list.length - 1, i + halfWindow)];
    if (a && b && hav(a, b) > 1) out[i] = brg(a, b);
  }
  return out;
}
if (accepted.length >= 6) {
  const truths = truthBearings(accepted);
  // Resolver registrado en vivo (muestras de cámara) vs verdad.
  let errs = [], sharpJumps = [];
  let prevH = null, prevT = null;
  for (let i = 0; i < cam.length; i++) {
    const c = cam[i];
    if (c.resolvedHeading == null) continue;
    // verdad en el instante t: buscar fix aceptado más cercano anterior.
    let j = accepted.findIndex((g) => g.t > c.t);
    if (j === -1) j = accepted.length - 1;
    const truth = truths[Math.max(0, j - 1)];
    if (truth != null) errs.push(angDiff(c.resolvedHeading, truth));
    if (prevH != null && c.t - prevT < 1000) {
      const d = angDiff(c.resolvedHeading, prevH);
      if (d > 45) sharpJumps.push({ t: c.t, deg: d });
    }
    prevH = c.resolvedHeading; prevT = c.t;
  }
  console.log("\n── Rumbo (registrado en vivo vs trayectoria GPS suavizada) ──");
  if (errs.length) {
    console.log(`  Error de rumbo: media=${(errs.reduce((s, e) => s + e, 0) / errs.length).toFixed(1)}° · p95=${pct(errs, 0.95)?.toFixed(1)}° · máx=${Math.max(...errs).toFixed(1)}° (umbral: ≤10° tras 3 s)`);
  }
  console.log(`  Saltos >45° en <1 s: ${sharpJumps.length} ${sharpJumps.length ? JSON.stringify(sharpJumps.slice(0, 5)) : ""}`);
}
if (bundleIdx !== -1 && process.argv[bundleIdx + 1]) {
  const bundlePath = process.argv[bundleIdx + 1];
  const { createDriveHeadingResolver } = require(bundlePath);
  // Reconstruir la "ruta" como trayectoria suavizada.
  const smoothPath = accepted.filter((_, i) => i % 2 === 0).map((g) => ({ lat: g.lat, lng: g.lng }));
  let cur = { ...accepted[0] }; let curIdx = 0;
  let simGpsHeading = null, simSpeed = 0, simMovement = null;
  const resolver = createDriveHeadingResolver({
    getSimHeading: () => ({ active: false, simHeading: null }),
    getGpsHeading: () => simGpsHeading,
    getSpeedMps: () => simSpeed,
    getMovementHeading: () => simMovement,
    getDeviceHeading: () => ({ heading: 0, available: "unavailable", permission: "denied" }),
    getRouteGeometry: () => ({ path: smoothPath, vehiclePos: cur }),
    minMovementMeters: 2,
    minMovementMs: 250,
  });
  let errs = [], prev = null;
  const truths = truthBearings(accepted);
  for (let i = 0; i < accepted.length; i++) {
    const g = accepted[i];
    cur = { lat: g.lat, lng: g.lng };
    simGpsHeading = g.heading != null && g.heading >= 0 ? g.heading : null;
    if (prev) {
      const d = hav(prev, g), dt = (g.t - prev.t) / 1000;
      if (dt > 0 && d >= 2) {
        simMovement = brg(prev, g);
        simSpeed = d / dt;
      }
    }
    prev = g;
    const h = resolver.resolve();
    if (h != null && truths[i] != null && simSpeed > 2) errs.push(angDiff(h, truths[i]));
  }
  console.log("\n── Re-ejecución del resolvedor sobre la traza (sin brújula) ──");
  if (errs.length) {
    console.log(`  Error vs trayectoria: media=${(errs.reduce((s, e) => s + e, 0) / errs.length).toFixed(1)}° · p95=${pct(errs, 0.95)?.toFixed(1)}° · máx=${Math.max(...errs).toFixed(1)}°`);
  } else {
    console.log("  Sin tramos con velocidad > 2 m/s en la traza.");
  }
}

// ── 4 · Eventos (H1) y transiciones de follow ──────────────────────────────
{
  const byType = {};
  for (const e of events) {
    if (e.kind === "follow") continue;
    byType[e.type] = byType[e.type] || { gesture: 0, prog: 0 };
    if (e.hasOriginalEvent) byType[e.type].gesture++;
    else byType[e.type].prog++;
  }
  const follows = events.filter((e) => e.kind === "follow");
  console.log("\n── Eventos de cámara y follow ───────────────────────────────");
  for (const [type, c] of Object.entries(byType).sort()) {
    console.log(`  ${type}: gesto=${c.gesture} · programático=${c.prog}`);
  }
  const exits = follows.filter((f, i) => i > 0 && follows[i - 1].followDriver && !f.followDriver).length;
  console.log(`  Transiciones: follow ${follows.length} (salidas de seguimiento: ${exits})`);
  console.log(`  rotatestart/zoomstart programáticos ⇒ H1 confirmada en datos reales si > 0.`);
}
console.log("\n═ Fin. Comparar contra umbrales antes de Fase 1. ═");
