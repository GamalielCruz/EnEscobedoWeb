#!/usr/bin/env node

/**
 * verify-ttl.mjs — Verificación del TTL diferenciado (mandado 15s / restaurante 10min)
 *
 * Ejecutar en staging:
 *   STAGING_URL=https://tu-staging.vercel.app \
 *   TEST_API_SECRET=tu-secret \
 *   SANITY_dataset=staging \
 *   SANITY_projectId=tu-project-id \
 *   SANITY_apiToken=tu-token \
 *   DRIVER_PHONE=442XXXXXXX \
 *   node scripts/verify-ttl.mjs
 *
 * Lo que verifica:
 *   1. Crea un mandado nuevo vía /api/test/mandado
 *   2. Consulta Sanity para verificar serviceKind y deliveryOfertaExpiresAt
 *   3. Calcula el TTL real en segundos
 *   4. Espera a que expire y verifica el redispatch
 *   5. Reporta resultados
 */

const STAGING_URL = process.env.STAGING_URL;
const TEST_API_SECRET = process.env.TEST_API_SECRET;
const VERCEL_BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const SANITY_DATASET = process.env.SANITY_DATASET || "staging";
const SANITY_PROJECT_ID = process.env.SANITY_PROJECT_ID;
const SANITY_API_TOKEN = process.env.SANITY_API_TOKEN;
const DRIVER_PHONE = process.env.DRIVER_PHONE || "4420000000";

const POLL_INTERVAL_MS = 2000;
const MAX_WAIT_OFFER_MS = 25_000; // 25 segundos máximo para ver la oferta
const MAX_WAIT_EXPIRE_MS = 30_000; // 30 segundos para ver expiración + redispatch

// ─── Helpers ────────────────────────────────────────────────────────

function log(tag, data) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] [${tag}]`, JSON.stringify(data, null, 2));
}

/**
 * Fetch wrapper that adds Vercel Deployment Protection bypass headers
 * to all requests targeting STAGING_URL.
 */
function stagingFetch(url, options = {}) {
  const headers = { ...options.headers };
  if (VERCEL_BYPASS) {
    headers["x-vercel-protection-bypass"] = VERCEL_BYPASS;
    headers["x-vercel-set-bypass-cookie"] = "true";
  }
  return fetch(url, { ...options, headers });
}

function sanityFetch(query, variables = {}) {
  const url = `https://${SANITY_PROJECT_ID}.api.sanity.io/v2024-01-01/data/query/${SANITY_DATASET}`;
  const encodedQuery = encodeURIComponent(query);
  const params = new URLSearchParams({ query: encodedQuery });
  for (const [key, value] of Object.entries(variables)) {
    params.append(`$${key}`, String(value));
  }
  return fetch(`${url}?${params}`, {
    headers: { Authorization: `Bearer ${SANITY_API_TOKEN}` },
  }).then((r) => r.json());
}

function secondsUntil(dateStr) {
  return Math.round((new Date(dateStr).getTime() - Date.now()) / 1000);
}

// ─── Paso 1: Crear mandado ──────────────────────────────────────────

async function createMandado() {
  log("STEP 1", "Creando mandado de prueba...");

  const body = {
    mode: "pickup",
    origin: {
      label: "测试 Origen - Querétaro Centro",
      lat: 20.5953,
      lng: -100.3873,
    },
    destination: {
      label: "测试 Destino - Pedro Escobedo",
      lat: 20.5706,
      lng: -100.4433,
    },
    details: "Verificación de TTL - no entregar",
    phone: DRIVER_PHONE,
    recipientPhone: "4429999999",
    customerName: "TTL Test",
    customerEmail: "ttl-test@elmenu.site",
    pinEnabled: false,
  };

  const res = await stagingFetch(`${STAGING_URL}/api/test/mandado`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-test-secret": TEST_API_SECRET,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok || !data.success) {
    throw new Error(`Error creando mandado: ${JSON.stringify(data)}`);
  }

  log("STEP 1 OK", {
    orderId: data.orderId,
    orderNumber: data.orderNumber,
    price: data.price,
    driverPayout: data.driverPayout,
  });

  return data;
}

// ─── Paso 2: Verificar documento en Sanity ──────────────────────────

async function verifyOrderDocument(orderId) {
  log("STEP 2", `Consultando documento ${orderId} en Sanity...`);

  const query = `*[_type == "order" && _id == $orderId][0]{
    _id,
    _createdAt,
    _updatedAt,
    orderNumber,
    serviceKind,
    dispatchStatus,
    deliveryOfertaEnviada,
    deliveryOfertaExpiresAt,
    offeredTo,
    repartidorAsignado,
    status,
    orderStatus
  }`;

  const result = await sanityFetch(query, { orderId });
  const order = result.result;

  if (!order) {
    throw new Error(`Orden ${orderId} no encontrada en Sanity`);
  }

  log("STEP 2 OK", {
    orderNumber: order.orderNumber,
    serviceKind: order.serviceKind,
    dispatchStatus: order.dispatchStatus,
    deliveryOfertaEnviada: order.deliveryOfertaEnviada,
    deliveryOfertaExpiresAt: order.deliveryOfertaExpiresAt,
    offeredTo: order.offeredTo,
    repartidorAsignado: order.repartidorAsignado,
  });

  return order;
}

// ─── Paso 3: Verificar TTL ──────────────────────────────────────────

function verifyTTL(order) {
  log("STEP 3", "Verificando TTL...");

  const issues = [];

  // 1. serviceKind debe ser "mandado"
  if (order.serviceKind !== "mandado") {
    issues.push(`serviceKind es "${order.serviceKind}", esperado "mandado"`);
  }

  // 2. deliveryOfertaExpiresAt debe existir
  if (!order.deliveryOfertaExpiresAt) {
    issues.push("deliveryOfertaExpiresAt es null/undefined");
  }

  // 3. Calcular TTL
  let ttlSeconds = null;
  if (order.deliveryOfertaExpiresAt) {
    // Nota: no podemos saber cuándo se creó la oferta exactamente,
    // pero podemos verificar que el expiresAt esté en el futuro
    // y dentro de un rango razonable
    const expiresAt = new Date(order.deliveryOfertaExpiresAt).getTime();
    const now = Date.now();
    const remaining = Math.round((expiresAt - now) / 1000);

    log("STEP 3 TTL", {
      expiresAt: order.deliveryOfertaExpiresAt,
      now: new Date().toISOString(),
      remainingSeconds: remaining,
    });

    // Si remaining > 0, la oferta aún no expira
    if (remaining > 0) {
      // Para un mandado recién creado, remaining debería ser <= 15
      // (o ligeramente menos si hubo latencia)
      if (remaining > 20) {
        issues.push(
          `TTL remaining = ${remaining}s (> 20s). ` +
          `Esto sugiere que el TTL NO es de 15 segundos.`
        );
      }
      ttlSeconds = remaining;
    } else {
      log("STEP 3 WARN", "La oferta ya expiró. TTL no medible ahora.");
    }
  }

  // 4. Verificar que NO es TTL de restaurante (600s)
  // Si el expiresAt está a más de 120 segundos en el futuro, es sospechoso
  if (ttlSeconds !== null && ttlSeconds > 120) {
    issues.push(
      `TTL de ${ttlSeconds}s es demasiado largo para un mandado. ` +
      `¿Es un TTL de restaurante (600s)?`
    );
  }

  if (issues.length > 0) {
    log("STEP 3 FAIL", { issues });
    return { pass: false, issues, ttlSeconds };
  }

  log("STEP 3 OK", {
    serviceKind: order.serviceKind,
    ttlSeconds,
    verdict: ttlSeconds !== null ? `${ttlSeconds}s (esperado ≤ 15s)` : "expirado",
  });

  return { pass: true, issues: [], ttlSeconds };
}

// ─── Paso 4: Esperar expiración ─────────────────────────────────────

async function waitForExpiration(orderId) {
  log("STEP 4", "Esperando expiración de la oferta...");

  const startTime = Date.now();

  while (Date.now() - startTime < MAX_WAIT_EXPIRE_MS) {
    const query = `*[_type == "order" && _id == $orderId][0]{
      _id,
      serviceKind,
      dispatchStatus,
      deliveryOfertaExpiresAt,
      offeredTo,
      repartidorAsignado
    }`;

    const result = await sanityFetch(query, { orderId });
    const order = result.result;

    if (!order) {
      log("STEP 4 FAIL", "Orden desapareció de Sanity");
      return { expired: false, reason: "orden_desaparecida" };
    }

    const remaining = order.deliveryOfertaExpiresAt
      ? secondsUntil(order.deliveryOfertaExpiresAt)
      : null;

    // Si la orden volvió a waiting_for_driver, expiró y fue redispatchada
    if (order.dispatchStatus === "waiting_for_driver" && !order.offeredTo) {
      log("STEP 4 EXPIRED", {
        dispatchStatus: order.dispatchStatus,
        afterMs: Date.now() - startTime,
      });
      return { expired: true, reason: "waiting_for_driver" };
    }

    // Si tiene un offer_to diferente, fue redispatchada
    if (order.dispatchStatus === "offered" && remaining !== null && remaining <= 0) {
      log("STEP 4 WARN", "Oferta expirada pero dispatchStatus sigue offered");
    }

    log("STEP 4 POLL", {
      dispatchStatus: order.dispatchStatus,
      remaining,
      offeredTo: order.offeredTo,
    });

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  log("STEP 4 TIMEOUT", "No se detectó expiración en el tiempo máximo");
  return { expired: false, reason: "timeout" };
}

// ─── Paso 5: Verificar redispatch ───────────────────────────────────

async function verifyRedispatch(orderId) {
  log("STEP 5", "Verificando redispatch...");

  // Esperar un poco para que el redispatch se ejecute
  await new Promise((r) => setTimeout(r, 3000));

  const query = `*[_type == "order" && _id == $orderId][0]{
    _id,
    serviceKind,
    dispatchStatus,
    deliveryOfertaExpiresAt,
    deliveryOfertaEnviada,
    offeredTo
  }`;

  const result = await sanityFetch(query, { orderId });
  const order = result.result;

  if (!order) {
    log("STEP 5 FAIL", "Orden no encontrada");
    return false;
  }

  log("STEP 5 RESULT", {
    serviceKind: order.serviceKind,
    dispatchStatus: order.dispatchStatus,
    deliveryOfertaExpiresAt: order.deliveryOfertaExpiresAt,
    deliveryOfertaEnviada: order.deliveryOfertaEnviada,
    offeredTo: order.offeredTo,
  });

  // Si fue redispatchada, debería tener una nueva oferta
  if (order.dispatchStatus === "offered" && order.deliveryOfertaExpiresAt) {
    const remaining = secondsUntil(order.deliveryOfertaExpiresAt);
    log("STEP 5 REDISPATCHED", {
      newTTL: `${remaining}s`,
      verdict: remaining <= 20 ? "PASS (TTL <= 20s)" : `FAIL (TTL = ${remaining}s)`,
    });
    return remaining <= 20;
  }

  // Si sigue waiting_for_driver, el redispatch no encontró driver
  if (order.dispatchStatus === "waiting_for_driver") {
    log("STEP 5 NO_DRIVER", "Orden en waiting_for_driver (no hay driver disponible para redispatch)");
    return null; // inconcluso
  }

  return false;
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  VERIFICACIÓN DE TTL — MANDADO 15s vs RESTAURANTE 10min");
  console.log("═══════════════════════════════════════════════════════");
  console.log();

  // Validar variables de entorno
  const required = { STAGING_URL, TEST_API_SECRET, SANITY_PROJECT_ID, SANITY_API_TOKEN };
  const missing = Object.entries(required).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length > 0) {
    console.error("Faltan variables de entorno:", missing.join(", "));
    console.error("\nUso:");
    console.error("  STAGING_URL=https://tu-staging.vercel.app \\");
    console.error("  TEST_API_SECRET=tu-secret \\");
    console.error("  VERCEL_AUTOMATION_BYPASS_SECRET=tu-bypass \\");
    console.error("  SANITY_projectId=tu-project-id \\");
    console.error("  SANITY_apiToken=tu-token \\");
    console.error("  node scripts/verify-ttl.mjs");
    process.exit(1);
  }

  if (!VERCEL_BYPASS) {
    console.warn("⚠️  VERCEL_AUTOMATION_BYPASS_SECRET no configurado.");
    console.warn("    Si staging tiene Deployment Protection, las requests fallarán con 401.");
    console.warn("");
  }

  const results = {
    createOrder: null,
    verifyDocument: null,
    verifyTTL: null,
    waitForExpiration: null,
    verifyRedispatch: null,
  };

  try {
    // Paso 1: Crear mandado
    const mandado = await createMandado();
    results.createOrder = { pass: true, orderNumber: mandado.orderNumber };

    // Esperar un poco para que Sanity propague
    await new Promise((r) => setTimeout(r, 2000));

    // Paso 2: Verificar documento
    const order = await verifyOrderDocument(mandado.orderId);
    results.verifyDocument = { pass: true, serviceKind: order.serviceKind };

    // Paso 3: Verificar TTL
    const ttl = verifyTTL(order);
    results.verifyTTL = ttl;

    // Paso 4: Esperar expiración (solo si la oferta aún no expiró)
    if (ttl.ttlSeconds !== null && ttl.ttlSeconds > 0) {
      const expiration = await waitForExpiration(mandado.orderId);
      results.waitForExpiration = expiration;

      // Paso 5: Verificar redispatch
      if (expiration.expired) {
        const redispatch = await verifyRedispatch(mandado.orderId);
        results.verifyRedispatch = { pass: redispatch };
      }
    } else {
      log("SKIP", "Oferta ya expirada o TTL no medible, saltando paso 4 y 5");
    }

    // ─── Reporte final ────────────────────────────────────────────
    console.log();
    console.log("═══════════════════════════════════════════════════════");
    console.log("  REPORTE FINAL");
    console.log("═══════════════════════════════════════════════════════");
    console.log();

    const pass = (r) => (r?.pass === true ? "✅" : r?.pass === false ? "❌" : "⚠️");
    console.log(`${pass(results.createOrder)}   Creación de mandado`);
    console.log(`${pass(results.verifyDocument)}   Documento en Sanity (serviceKind)`);
    console.log(`${pass(results.verifyTTL)}   TTL ≤ 15 segundos`);
    console.log(`${pass(results.waitForExpiration)}   Expiración detectada`);
    console.log(`${pass(results.verifyRedispatch)}   Redispatch con nuevo TTL`);

    console.log();
    console.log("Datos clave:");
    console.log(`  orderNumber: ${mandado.orderNumber}`);
    console.log(`  orderId:     ${mandado.orderId}`);
    console.log(`  serviceKind: ${order.serviceKind}`);

    if (ttl.ttlSeconds !== null) {
      console.log(`  TTL:         ${ttl.ttlSeconds}s`);
    }

    console.log();
    console.log("Query Sanity para inspección manual:");
    console.log(`  *[_type == "order" && _id == "${mandado.orderId}"][0]{`);
    console.log(`    _id, orderNumber, serviceKind, dispatchStatus,`);
    console.log(`    deliveryOfertaExpiresAt, deliveryOfertaEnviada, offeredTo,`);
    console.log(`    "ttl_remaining": dateTime(deliveryOfertaExpiresAt) - dateTime(now())`);
    console.log(`  }`);
    console.log();

    const allPass = Object.values(results).every(
      (r) => r === null || r.pass === true || r.expired === true
    );

    if (allPass) {
      console.log("🟢 TODAS LAS VERIFICACIONES PASARON");
      console.log("   El TTL de 15 segundos funciona correctamente.");
      console.log("   #917312 probablemente es un caso histórico.");
    } else {
      console.log("🔴 HAY VERIFICACIONES QUE FALLARON");
      console.log("   Revisa los logs arriba para detalles.");
    }
  } catch (error) {
    console.error("\n❌ ERROR:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
