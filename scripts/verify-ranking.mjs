#!/usr/bin/env node

/**
 * verify-ranking.mjs — Prueba controlada del ranking (Fase 2)
 *
 * 1. Predice quién debería ganar usando la MISMA fórmula de
 *    lib/dispatch/matching.ts (carga 30 + prioridad 30 + rating 20 + sesión 20).
 * 2. Crea un mandado de prueba vía el servidor LOCAL (código nuevo)
 *    POST http://localhost:3000/api/test/mandado
 * 3. Verifica en Sanity a quién llegó offeredTo y lo compara con la predicción.
 *
 * Uso:
 *   node scripts/verify-ranking.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ─── Cargar .env.local (sin imprimir secretos) ──────────────────────
function loadEnvLocal() {
  const file = path.join(ROOT, ".env.local");
  if (!fs.existsSync(file)) return {};
  const env = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    env[match[1]] = value;
  }
  return env;
}

const env = loadEnvLocal();
const PROJECT_ID = env.NEXT_PUBLIC_SANITY_PROJECT_ID || process.env.SANITY_PROJECT_ID;
const DATASET = env.NEXT_PUBLIC_SANITY_DATASET || process.env.SANITY_DATASET || "test";
const API_TOKEN = env.SANITY_API_TOKEN || process.env.SANITY_API_TOKEN;
const TEST_SECRET = env.ELMENU_TEST_API_SECRET || process.env.ELMENU_TEST_API_SECRET;
const LOCAL_URL = process.env.LOCAL_URL || "http://localhost:3000";

if (!PROJECT_ID || !API_TOKEN) {
  console.error("Faltan SANITY credenciales (.env.local).");
  process.exit(1);
}

function log(tag, data) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] [${tag}]`, typeof data === "string" ? data : JSON.stringify(data, null, 2));
}

async function sanityFetch(query, variables = {}) {
  const url = `https://${PROJECT_ID}.api.sanity.io/v2024-01-01/data/query/${DATASET}`;
  const params = new URLSearchParams({ query });
  for (const [key, value] of Object.entries(variables)) params.append(`$${key}`, String(value));
  const res = await fetch(`${url}?${params}`, { headers: { Authorization: `Bearer ${API_TOKEN}` } });
  const json = await res.json();
  if (json.error) throw new Error(`Sanity error: ${json.error.description || json.error}`);
  return json.result;
}

// ─── Fórmula de score (copia exacta de matching.ts) ─────────────────
function scoreDriver(order, driver, config, now) {
  const activeCount = Array.isArray(driver.activeOrders) ? driver.activeOrders.length : 0;
  const rating = Number.isFinite(Number(driver.calificacion)) ? Number(driver.calificacion) : 5;
  const prioridad = Number(driver.prioridad ?? 0);
  const connectedMinutes = driver.disponibleDesde
    ? Math.max(0, Math.round((now - new Date(driver.disponibleDesde).getTime()) / 60000))
    : 0;
  const loadScore = 30 * (1 - Math.min(1, activeCount / Math.max(1, config.maxOrdersPerDriver)));
  const priorityScore = 30 * Math.min(1, prioridad / 10);
  const ratingScore = 20 * (rating / 5);
  const sessionScore = 20 * Math.min(1, connectedMinutes / 240);
  const typeBonus =
    (order.serviceKind === "mandado" && config.prioritizeMandados) ||
    (order.serviceKind !== "mandado" && config.prioritizeRestaurants)
      ? 10
      : 0;
  return {
    raw: loadScore + priorityScore + ratingScore + sessionScore + typeBonus,
    loadScore,
    priorityScore,
    ratingScore,
    sessionScore,
    typeBonus,
    activeCount,
    rating,
    prioridad,
    connectedMinutes,
  };
}

function isAvailable(driver, now) {
  if (!driver.disponible) return false;
  if (driver.estadoDisponibilidad !== "available") return false;
  if (driver.disponibleHasta && new Date(driver.disponibleHasta).getTime() <= now) return false;
  return true;
}

// ─── Paso 1: estado actual ──────────────────────────────────────────
async function fetchState() {
  const now = Date.now();
  const [configDoc, drivers] = await Promise.all([
    sanityFetch(`*[_type == "dispatchConfig" && _id == "dispatchConfig"][0]`),
    sanityFetch(
      `*[_type == "repartidor"]{
        _id,
        nombre,
        telefono,
        activo,
        disponible,
        bloqueado,
        prioridad,
        calificacion,
        disponibleDesde,
        disponibleHasta,
        estadoDisponibilidad,
        ultimaActividad,
        ultimaUbicacion,
        "storeId": tiendaAsignada._ref,
        _updatedAt,
        "activeOrders": *[
          _type == "order" &&
          repartidorAsignado._ref == ^._id &&
          status == "shipped" &&
          orderStatus != "delivered" &&
          orderStatus != "cancelled" &&
          orderStatus != "completed"
        ]{ _id }
      }`
    ),
  ]);

  const config = {
    mode: configDoc?.mode ?? "auto",
    maxOrdersPerDriver: Number.isFinite(Number(configDoc?.maxOrdersPerDriver)) ? Number(configDoc.maxOrdersPerDriver) : 3,
    allowMultipleOrders: Boolean(configDoc?.allowMultipleOrders),
    prioritizeMandados: Boolean(configDoc?.prioritizeMandados),
    prioritizeRestaurants: Boolean(configDoc?.prioritizeRestaurants),
    allowMixRestaurantMandado: Boolean(configDoc?.allowMixRestaurantMandado),
  };

  // Orden de prueba: mandado comunitario (sin tienda propia)
  const order = { serviceKind: "mandado", orderType: "delivery", storeHasOwnDelivery: false, storeId: undefined };

  const eligible = (drivers ?? [])
    .filter((d) => d.activo && !d.bloqueado)
    .filter((d) => isAvailable(d, now))
    .filter((d) => {
      const activeCount = Array.isArray(d.activeOrders) ? d.activeOrders.length : 0;
      if (!config.allowMultipleOrders && activeCount >= 1) return false;
      if (activeCount >= config.maxOrdersPerDriver) return false;
      return true;
    });

  const scored = eligible.map((d) => ({ driver: d, ...scoreDriver(order, d, config, now) }));
  scored.sort((a, b) => b.raw - a.raw);
  const maxRaw = scored.length > 0 ? Math.max(...scored.map((s) => s.raw)) : 0;

  return {
    now,
    config,
    table: scored.map((s, index) => ({
      rank: index + 1,
      driverId: s.driver._id,
      nombre: s.driver.nombre,
      telefono: s.driver.telefono,
      estado: s.driver.estadoDisponibilidad,
      activeCount: s.activeCount,
      prioridad: s.prioridad,
      rating: s.rating,
      connectedMinutes: s.connectedMinutes,
      score: maxRaw > 0 ? Math.round((s.raw / maxRaw) * 100) : 100,
      raw: Math.round(s.raw * 100) / 100,
    })),
    excluded: (drivers ?? []).filter((d) => !eligible.includes(d)).map((d) => ({
      nombre: d.nombre,
      telefono: d.telefono,
      activo: d.activo,
      bloqueado: d.bloqueado,
      disponible: d.disponible,
      estado: d.estadoDisponibilidad,
      reason: !d.activo || d.bloqueado ? "activo/bloqueado" : !isAvailable(d, now) ? "no disponible" : "filtro de config (carga)",
    })),
  };
}

// ─── Paso 2: crear mandado vía servidor local (código NUEVO) ────────
async function createMandado() {
  // Coordenadas DENTRO de la zona activa (Pedro Escobedo Zona Centro).
  const body = {
    mode: "pickup",
    origin: { label: "Rank Test Origen - Pedro Escobedo Centro", lat: 20.4959, lng: -100.1600 },
    destination: { label: "Rank Test Destino - Pedro Escobedo", lat: 20.4800, lng: -100.1400 },
    details: "Prueba controlada de ranking - no entregar",
    phone: "4427958919",
    recipientPhone: "4429999999",
    customerName: "Rank Test",
    customerEmail: "rank-test@elmenu.site",
    pinEnabled: false,
  };
  const res = await fetch(`${LOCAL_URL}/api/test/mandado`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-test-secret": TEST_SECRET },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(`Error creando mandado: ${JSON.stringify(data)}`);
  return data;
}

// ─── Paso 3: verificar quién recibió la oferta ──────────────────────
async function verifyOffer(orderId) {
  const query = `*[_type == "order" && _id == $orderId][0]{
    _id,
    orderNumber,
    serviceKind,
    dispatchStatus,
    deliveryOfertaExpiresAt,
    "offeredToRef": offeredTo._ref,
    "offeredToNombre": offeredTo->nombre,
    "offeredToTelefono": offeredTo->telefono
  }`;
  for (let attempt = 0; attempt < 30; attempt++) {
    const order = await sanityFetch(query, { orderId });
    if (order && order.offeredToRef) return order;
    await new Promise((r) => setTimeout(r, 1500));
  }
  const order = await sanityFetch(query, { orderId });
  return order;
}

// ─── Main ───────────────────────────────────────────────────────────
async function main() {
  console.log("════════════════════════════════════════════════════════");
  console.log("  PRUEBA CONTROLADA DE RANKING — Fase 2");
  console.log("════════════════════════════════════════════════════════");
  log("CONFIG", `proyecto=${PROJECT_ID} dataset=${DATASET}`);

  const state = await fetchState();
  log("DISPATCH CONFIG", state.config);
  log("CANDIDATOS ORDENADOS POR SCORE", state.table);

  if (state.table.length < 2) {
    console.warn("\n⚠️  Hay menos de 2 candidatos elegibles — la prueba de ranking es INCONCLUSO.");
    console.warn("    (Se necesita al menos 2 repartidores disponibles para probar que gana el de mayor score).");
  }

  if (state.table.length === 0) {
    console.warn("    Candidatos excluidos:");
    console.warn(JSON.stringify(state.excluded, null, 2));
  }

  const predicted = state.table[0] ?? null;
  log("PREDICCIÓN", predicted ? `Gana: ${predicted.nombre} (${predicted.telefono}) score=${predicted.score}` : "Sin candidatos");

  // Guard: la prueba solo tiene sentido con modo auto y al menos 2 candidatos.
  if (state.config.mode !== "auto") {
    console.log("\n⏸️  NO SE CREA ORDEN: dispatchConfig.mode no es 'auto' (es " + state.config.mode + ").");
    console.log("    Pon el Dispatch Center en AUTO y vuelve a ejecutar.");
    process.exit(3);
  }
  if (state.table.length < 2) {
    console.log("\n⏸️  NO SE CREA ORDEN: hay " + state.table.length + " candidato(s) elegible(s), se necesitan al menos 2.");
    console.log("    Deja 2 repartidores comunitarios disponibles y vuelve a ejecutar.");
    process.exit(3);
  }

  log("CREANDO MANDADO", `vía ${LOCAL_URL} (código NUEVO)`);
  const mandado = await createMandado();
  log("MANDADO CREADO", { orderId: mandado.orderId, orderNumber: mandado.orderNumber });

  const order = await verifyOffer(mandado.orderId);
  log("OFERTA EN SANITY", order);

  console.log("\n════════════════════════════════════════════════════════");
  console.log("  RESULTADO");
  console.log("════════════════════════════════════════════════════════");

  if (!order?.offeredToRef) {
    console.log("❌ La oferta no llegó a ningún repartidor (revisa logs del servidor local).");
    process.exit(1);
  }

  const received = { nombre: order.offeredToNombre, telefono: order.offeredToTelefono, driverId: order.offeredToRef };
  console.log(`Recibió la oferta:  ${received.nombre} (${received.telefono})`);
  if (predicted) {
    console.log(`Predicción (score): ${predicted.nombre} (${predicted.telefono}) score=${predicted.score}`);
    const match = predicted.driverId === received.driverId;
    console.log(match
      ? "✅ El repartidor de mayor score recibió la oferta — EL RANKING CONTROLA LA SELECCIÓN."
      : "❌ DISCREPANCIA: la oferta no llegó al de mayor score. Revisa el flujo.");
    process.exit(match ? 0 : 2);
  } else {
    console.log("⚠️ No había candidatos predecibles; revisa el resultado manualmente.");
    process.exit(0);
  }
}

main().catch((error) => {
  console.error("\n❌ ERROR:", error.message);
  if (process.env.DEBUG) console.error(error.stack);
  process.exit(1);
});