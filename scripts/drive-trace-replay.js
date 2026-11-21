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
  // Ancla del puck: % del ÁREA VISIBLE cuando la traza registra la banda
  // (barra superior / panel inferior); si no, % de la altura del contenedor.
  const hasBand = cam.some(
    (c) => c.visibleTopPx != null && c.visibleBottomPx != null
  );
  const fracs = cam
    .filter((c) =>
      hasBand
        ? c.puckPxY != null && c.visibleTopPx != null && c.visibleBottomPx != null
        : c.puckPxY != null && c.containerHeight
    )
    .map((c) =>
      hasBand
        ? ((c.puckPxY - c.visibleTopPx) / (c.visibleBottomPx - c.visibleTopPx)) * 100
        : (c.puckPxY / c.containerHeight) * 100
    );
  if (fracs.length) {
    const inBand = fracs.filter((f) => f >= 70 && f <= 75).length;
    console.log(
      `  Puck (${hasBand ? "% del área visible" : "% de la altura"}): p50=${pct(fracs, 0.5)?.toFixed(1)} % · min=${Math.min(...fracs).toFixed(1)} % · máx=${Math.max(...fracs).toFixed(1)} % · en 70–75 %: ${inBand}/${fracs.length} (${((inBand / fracs.length) * 100).toFixed(0)} %)`
    );
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

  // ── Fase 1: métricas de la tabla de aceptación ──
  // Cámara a <5 m del vehículo (¿el centro sigue al vehículo?).
  const centers = cam.filter(
    (c) => c.centerLat != null && c.centerLng != null && c.vehicleLat != null
  );
  const near = centers.filter(
    (c) =>
      hav(
        { lat: c.centerLat, lng: c.centerLng },
        { lat: c.vehicleLat, lng: c.vehicleLng }
      ) < 5
  ).length;
  if (centers.length) {
    const nearPctV = (near / centers.length) * 100;
    console.log(
      `  Cámara a <5 m del vehículo: ${near}/${centers.length} (${nearPctV.toFixed(1)} %)`
    );
  }
  // Velocidad resuelta (ya validada en la app: cap 70 m/s y caducidad).
  const speeds = cam
    .map((c) => c.speedMps)
    .filter((s) => typeof s === "number" && Number.isFinite(s));
  if (speeds.length) {
    console.log(
      `  Velocidad resuelta: máx=${Math.max(...speeds).toFixed(2)} m/s (${(Math.max(...speeds) * 3.6).toFixed(1)} km/h) · p50=${pct(speeds, 0.5)?.toFixed(2)} m/s`
    );
  }
  // Latido del loop (solo si la traza lo registra).
  const alive = cam.filter((c) => c.loopAlive).length;
  console.log(`  loopAlive=true en ${alive}/${cam.length} muestras`);
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
  // Criterio de aceptación: error en TRAMO RECTO, medido ≥3 s después de un
  // giro real (>30° de cambio de rumbo en la trayectoria) y solo en marcha
  // (≥0.7 m/s). Evita contar los transitorios de la maniobra como error.
  {
    const courses = [];
    for (let i = 1; i < accepted.length; i++) {
      const d = hav(accepted[i - 1], accepted[i]);
      const dt = (accepted[i].t - accepted[i - 1].t) / 1000;
      courses.push({
        t: accepted[i].t,
        course: d > 1 ? brg(accepted[i - 1], accepted[i]) : null,
        speed: dt > 0 ? d / dt : 0,
        // "Verdad" solo con fixes precisos: el bearing entre dos fixes de
        // 26 m de precisión es ruido, no rumbo de la trayectoria.
        accuracy: accepted[i].accuracy ?? null,
      });
    }
    const turnTimes = [];
    for (let i = 1; i < courses.length; i++) {
      if (courses[i].course == null || courses[i - 1].course == null) continue;
      if (angDiff(courses[i].course, courses[i - 1].course) > 30) {
        turnTimes.push(courses[i].t);
      }
    }
    const straightErrs = [];
    for (let i = 0; i < cam.length; i++) {
      const c = cam[i];
      if (c.resolvedHeading == null) continue;
      let j = courses.findIndex((s) => s.t > c.t);
      if (j === -1) j = courses.length - 1;
      const s = courses[Math.max(0, j - 1)];
      if (!s || s.course == null || s.speed < 0.7) continue;
      // Calentamiento del GPS: con accuracy > 20 m el curso entre fixes es
      // ruido y no sirve de referencia.
      if (s.accuracy != null && s.accuracy > 20) continue;
      const afterTurn = turnTimes.some((tt) => tt <= c.t && c.t - tt <= 3000);
      if (afterTurn) continue;
      straightErrs.push(angDiff(c.resolvedHeading, s.course));
    }
    if (straightErrs.length) {
      const inTol = straightErrs.filter((e) => e <= 15).length;
      console.log(
        `  Error en tramo recto ≥3 s tras giro: media=${(straightErrs.reduce((s, e) => s + e, 0) / straightErrs.length).toFixed(1)}° · p95=${pct(straightErrs, 0.95)?.toFixed(1)}° · máx=${Math.max(...straightErrs).toFixed(1)}° · ≤15°: ${inTol}/${straightErrs.length} (${((inTol / straightErrs.length) * 100).toFixed(0)} %)`
      );
    } else {
      console.log("  Error en tramo recto: sin muestras elegibles.");
    }
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
    if (e.kind === "follow" || e.kind === "phase" || e.kind === "anchor-mismatch") continue;
    byType[e.type] = byType[e.type] || { gesture: 0, prog: 0 };
    if (e.hasOriginalEvent) byType[e.type].gesture++;
    else byType[e.type].prog++;
  }
  // Fase 2-D: los programáticos vienen AGREGADOS por (tipo, segundo).
  const progAggregated = Array.isArray(trace.programmaticEvents) ? trace.programmaticEvents : [];
  for (const c of progAggregated) {
    byType[c.type] = byType[c.type] || { gesture: 0, prog: 0 };
    byType[c.type].prog += c.count;
  }
  const follows = events.filter((e) => e.kind === "follow");
  console.log("\n── Eventos de cámara y follow ───────────────────────────────");
  for (const [type, c] of Object.entries(byType).sort()) {
    console.log(`  ${type}: gesto=${c.gesture} · programático=${c.prog}`);
  }
  if (progAggregated.length) {
    console.log(
      `  Eventos programáticos: ${progAggregated.reduce((s2, c) => s2 + c.count, 0)} en ${progAggregated.length} filas (tipo·segundo)`
    );
  }
  const mismatches = events.filter((e) => e.kind === "anchor-mismatch");
  if (mismatches.length) {
    console.log(
      `  GUARDA DE ANCLAJE: ${mismatches.length} eventos anchor-mismatch ${JSON.stringify(
        mismatches.slice(0, 3).map((m) => ({
          desvio: +(m.deviationFraction * 100).toFixed(1) + "%",
          ms: m.lastsForMs,
          pad: [m.paddingTop, m.paddingBottom],
        }))
      )}`
    );
  }
  const exits = follows.filter((f, i) => i > 0 && follows[i - 1].followDriver && !f.followDriver).length;
  console.log(`  Transiciones: follow ${follows.length} (salidas de seguimiento: ${exits})`);
  // Salidas de FOLLOWING SIN gesto del usuario: para cada salida, ¿hubo algún
  // evento de mapa con originalEvent en los 300 ms previos?
  const gestureTimes = events
    .filter((e) => e.kind !== "follow" && e.kind !== "phase" && e.hasOriginalEvent)
    .map((e) => e.t);
  const exitsWithoutGesture = follows.filter((f, i) => {
    if (i === 0 || !follows[i - 1].followDriver || f.followDriver) return false;
    return !gestureTimes.some((t) => t <= f.t && f.t - t <= 300);
  }).length;
  console.log(
    `  Salidas de FOLLOWING SIN gesto: ${exitsWithoutGesture} (umbral: 0)`
  );
  const phases = events.filter((e) => e.kind === "phase");
  if (phases.length) {
    console.log(
      `  Transiciones de etapa: ${phases
        .map(
          (p) =>
            `${p.phase}${p.stepIndex != null ? `#${p.stepIndex}` : ""}${
              p.maneuverType ? `/${p.maneuverType}` : ""
            }${p.distanceToManeuverM != null ? `@${Math.round(p.distanceToManeuverM)}m` : ""}`
        )
        .join(" → ")}`
    );
  }
}
// ── 5 · Aceptación (Fase 2) y comparación entre trazas ─────────────────────

/**
 * Métricas de aceptación de una traza, en un objeto — para la tabla final y
 * para `--compare` (T1 vs T2 vs después). Todo sale de la traza: nada se
 * modela aquí.
 */
function acceptance(trace) {
  const gpsAll = trace.gps || [];
  const camAll = trace.camera || [];
  const evAll = trace.events || [];
  const progAll = Array.isArray(trace.programmaticEvents) ? trace.programmaticEvents : [];
  const accAll = gpsAll.filter((g) => g.accepted);
  const withBand = camAll.filter(
    (c) => c.puckPxY != null && c.visibleTopPx != null && c.visibleBottomPx != null
  );
  const fracs = withBand.map(
    (c) => ((c.puckPxY - c.visibleTopPx) / (c.visibleBottomPx - c.visibleTopPx)) * 100
  );
  const inBand = fracs.filter((f) => f >= 70 && f <= 75).length;
  const centers = camAll.filter(
    (c) => c.centerLat != null && c.centerLng != null && c.vehicleLat != null
  );
  const near = centers.filter(
    (c) => hav({ lat: c.centerLat, lng: c.centerLng }, { lat: c.vehicleLat, lng: c.vehicleLng }) < 5
  ).length;
  const speeds = camAll
    .map((c) => c.speedMps)
    .filter((v) => typeof v === "number" && Number.isFinite(v));
  // Giro de cámara >60° en <1 s sin vuelta en U confirmada. Se compara cada
  // muestra contra la ÚLTIMA que esté a ≤1 s (muestreo a 5 Hz): comparar solo
  // con la anterior de 200 ms nunca detecta un barrido de 90°/s.
  let bigRotations = 0;
  let maxRotation1s = 0;
  let worstRotation = null;
  for (let i = 1; i < camAll.length; i++) {
    if (camAll[i].bearing == null) continue;
    let j = i;
    while (j > 0 && camAll[i].t - camAll[j - 1].t <= 1000) j--;
    const a = camAll[j];
    if (!a || a.bearing == null) continue;
    const d = angDiff(camAll[i].bearing, a.bearing);
    if (d > maxRotation1s) {
      maxRotation1s = d;
      worstRotation = {
        t: Math.round(camAll[i].t - camAll[0].t),
        deg: +d.toFixed(1),
        src: camAll[i].resolverSource ?? null,
      };
    }
    if (d > 60) bigRotations++;
  }
  // Salidas de FOLLOWING sin gesto.
  const follows = evAll.filter((e) => e.kind === "follow");
  const gestureTimes = evAll
    .filter((e) => e.kind !== "follow" && e.kind !== "phase" && e.hasOriginalEvent)
    .map((e) => e.t);
  const exitsNoGesture = follows.filter((f, i) => {
    if (i === 0 || !follows[i - 1].followDriver || f.followDriver) return false;
    return !gestureTimes.some((t) => t <= f.t && f.t - t <= 300);
  }).length;
  // Rumbo vs trayectoria en tramo recto (≥3 s tras giro, fixes precisos).
  const courses = [];
  for (let i = 1; i < accAll.length; i++) {
    const d = hav(accAll[i - 1], accAll[i]);
    const dt = (accAll[i].t - accAll[i - 1].t) / 1000;
    courses.push({
      t: accAll[i].t,
      course: d > 1 ? brg(accAll[i - 1], accAll[i]) : null,
      speed: dt > 0 ? d / dt : 0,
      accuracy: accAll[i].accuracy ?? null,
    });
  }
  const turnTimes = [];
  for (let i = 1; i < courses.length; i++) {
    if (courses[i].course == null || courses[i - 1].course == null) continue;
    if (angDiff(courses[i].course, courses[i - 1].course) > 30) turnTimes.push(courses[i].t);
  }
  const straight = [];
  for (const c of camAll) {
    if (c.resolvedHeading == null) continue;
    let j = courses.findIndex((s) => s.t > c.t);
    if (j === -1) j = courses.length - 1;
    const s = courses[Math.max(0, j - 1)];
    if (!s || s.course == null || s.speed < 0.7) continue;
    if (s.accuracy != null && s.accuracy > 20) continue;
    if (turnTimes.some((tt) => tt <= c.t && c.t - tt <= 3000)) continue;
    straight.push(angDiff(c.resolvedHeading, s.course));
  }
  return {
    gps: gpsAll.length,
    accepted: accAll.length,
    camera: camAll.length,
    puckInBand: fracs.length ? (inBand / fracs.length) * 100 : null,
    puckMedian: pct(fracs, 0.5),
    centerNear: centers.length ? (near / centers.length) * 100 : null,
    speedMax: speeds.length ? Math.max(...speeds) : null,
    straightIn15: straight.length
      ? (straight.filter((e) => e <= 15).length / straight.length) * 100
      : null,
    straightMedian: pct(straight, 0.5),
    bigRotations,
    maxRotation1s,
    worstRotation,
    exitsNoGesture,
    followSamples: follows.filter((f) => f.followDriver).length,
    loopAlivePct: camAll.length
      ? (camAll.filter((c) => c.loopAlive).length / camAll.length) * 100
      : null,
    anchorMismatch: evAll.filter((e) => e.kind === "anchor-mismatch").length,
    programmatic: progAll.reduce((s2, c) => s2 + c.count, 0) +
      evAll.filter((e) => e.hasOriginalEvent === false).length,
  };
}

const cmpIdx = process.argv.indexOf("--compare");
const acc = acceptance(trace);
console.log("\n── Aceptación (Fase 2, sobre ESTA traza) ────────────────────");
console.log(`  Puck 70–75 % del área visible: ${acc.puckInBand == null ? "sin datos" : acc.puckInBand.toFixed(0) + " %"} (p50 ${acc.puckMedian == null ? "-" : acc.puckMedian.toFixed(1) + " %"}) · criterio ≥95 %`);
console.log(`  Cámara a <5 m: ${acc.centerNear == null ? "-" : acc.centerNear.toFixed(1) + " %"} · criterio: mantener 100 %`);
console.log(`  Follow: ${acc.followSamples} muestras · salidas sin gesto: ${acc.exitsNoGesture} · loopAlive: ${acc.loopAlivePct == null ? "-" : acc.loopAlivePct.toFixed(0) + " %"}`);
console.log(`  Velocidad máx: ${acc.speedMax == null ? "-" : acc.speedMax.toFixed(2) + " m/s"} · criterio ≤45 m/s`);
console.log(`  Rumbo en tramo recto ≤15°: ${acc.straightIn15 == null ? "-" : acc.straightIn15.toFixed(0) + " %"} (p50 ${acc.straightMedian == null ? "-" : acc.straightMedian.toFixed(1) + "°"})`);
console.log(
  `  Giros de cámara >60° en <1 s: ${acc.bigRotations} · máx ${acc.maxRotation1s.toFixed(1)}°/s${
    acc.worstRotation ? ` en t=${(acc.worstRotation.t / 1000).toFixed(1)} s (${acc.worstRotation.src})` : ""
  } · criterio: 0 salvo vuelta en U confirmada`
);
console.log(`  Guarda de anclaje: ${acc.anchorMismatch} eventos · eventos programáticos agregados: ${acc.programmatic}`);

if (cmpIdx !== -1) {
  const otherFile = process.argv[cmpIdx + 1];
  if (!otherFile || !fs.existsSync(otherFile)) {
    console.log("\n(--compare: falta el archivo de la otra traza)");
  } else {
    const other = JSON.parse(fs.readFileSync(otherFile, "utf8"));
    const b = acceptance(other);
    const row = (label, a2, b2, unit = "") =>
      console.log(
        `  ${label.padEnd(30)} ${String(a2 ?? "-").padStart(10)}${unit}  vs  ${String(b2 ?? "-").padStart(10)}${unit}`
      );
    console.log("\n── Comparación de trazas ───────────────────────────────────");
    console.log(`  ${"métrica".padEnd(30)} ${path.basename(file).padStart(10)}     vs  ${path.basename(otherFile).padStart(10)}`);
    row("muestras cámara", acc.camera, b.camera);
    row("puck en 70–75 % (%)", acc.puckInBand?.toFixed(0), b.puckInBand?.toFixed(0));
    row("cámara <5 m (%)", acc.centerNear?.toFixed(1), b.centerNear?.toFixed(1));
    row("velocidad máx (m/s)", acc.speedMax?.toFixed(2), b.speedMax?.toFixed(2));
    row("rumbo ≤15° recto (%)", acc.straightIn15?.toFixed(0), b.straightIn15?.toFixed(0));
    row("salidas sin gesto", acc.exitsNoGesture, b.exitsNoGesture);
    row("giros >60° en <1 s", acc.bigRotations, b.bigRotations);
    row("loopAlive (%)", acc.loopAlivePct?.toFixed(0), b.loopAlivePct?.toFixed(0));
    row("eventos programáticos", acc.programmatic, b.programmatic);
  }
}
console.log("\n═ Fin. Comparar contra umbrales antes de Fase 2. ═");
