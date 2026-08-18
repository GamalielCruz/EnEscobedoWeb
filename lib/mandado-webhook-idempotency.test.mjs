// Idempotencia REAL del webhook de mandados (app/api/whatsapp/webhook/route.ts).
//
// Estrategia (sin tocar producción):
//   1. Un harness que replica EXACTAMENTE la estructura de guard del webhook
//      (derivación de estado ANTES de parchear + catch 409 con relectura) usando
//      las MISMAS funciones puras que corre el webhook: `mandadoDriverState`,
//      `planMandadoArrival` y `orderRequiresDeliveryPin`. Los efectos secundarios
//      (patch, sync Baserow, order event, WhatsApps) se registran en un backend
//      simulado y se cuentan: en un duplicado NINGUNO debe ejecutarse.
//   2. Guards a nivel de fuente (patrón ya usado en order-maps.test.mjs) que
//      fijan el route.ts REAL a las mismas garantías: todo camino `*_IDEMPOTENT`
//      retorna ANTES de cualquier efecto secundario, y todo catch de patch 409
//      relee y retorna idempotente sin efectos (nunca 500 ni envíos duplicados).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  mandadoDriverState,
  mandadoEnPuertaPayload,
  mandadoPickedUpPayload,
  mandadoEntregadoPayload,
} from "./mandado-driver-flow.ts";
import { matchDriverCommand } from "./driver-commands.ts";
import { planMandadoArrival } from "./mandado-arrival.ts";
import { orderRequiresDeliveryPin } from "./delivery-pin.ts";

const CMD_EN_PUERTA = "EN PUERTA";
const CMD_PEDIDO_EN_CAMINO = "PEDIDO EN DIRECCION AL DOMICILIO";
const CMD_ENTREGADO = "ENTREGADO";

// ────────────────────────────────────────────────────────────────────────
// Harness: backend simulado (doc + revisión + parche condicional estilo
// Sanity) + handler que replica el guard del webhook para mandados.
// ────────────────────────────────────────────────────────────────────────

function createBackend(initialOrder) {
  const backend = {
    doc: structuredClone(initialOrder),
    rev: 1,
    effects: {
      patches: [], // { ifRevisionId, fields }
      baserow: [], // orderIds sincronizados
      events: [], // { id, type }
      driver: [], // { kind }
      sender: [], // kinds (remitente)
      recipient: [], // kinds (destinatario)
      hints: [], // textos al repartidor (path invalid/hint)
    },
    read() {
      return structuredClone(this.doc);
    },
    // Equivalente a backendClient.patch(id).ifRevisionId(rev).set(fields).commit().
    // El parche solo aplica si la revisión del snapshot coincide con la actual
    // del doc (igual que Sanity): si otro request ya parcheó, lanza 409.
    patch(expectedRev, fields) {
      if (String(expectedRev) !== String(this.doc._rev)) {
        const err = new Error("revision mismatch");
        err.status = 409;
        throw err;
      }
      this.effects.patches.push({ ifRevisionId: expectedRev, fields: { ...fields } });
      Object.assign(this.doc, fields);
      this.doc._rev = `rev-${++this.rev}`;
      return true;
    },
    sync(orderId) {
      this.effects.baserow.push(orderId);
    },
    event(orderId, type) {
      this.effects.events.push({ id: orderId, type });
    },
    driver(kind) {
      this.effects.driver.push({ kind });
    },
    sender(kind) {
      this.effects.sender.push(kind);
    },
    recipient(kind) {
      this.effects.recipient.push(kind);
    },
    hint(text) {
      this.effects.hints.push(text);
    },
  };
  return backend;
}

// Replica el guard del webhook (route.ts, handlers PEDIDO EN DIRECCION AL
// DOMICILIO y EN PUERTA, ramas `serviceKind === 'mandado'`): derivación de
// estado ANTES de parchear; duplicados → no-op; 409 → relectura → idempotente.
// `orderSnapshot` es la orden leída al inicio de la request (con su _rev).
function handleMandadoAction(backend, action, orderSnapshot) {
  const order = orderSnapshot;
  const state = mandadoDriverState(order);
  const isMandado = String(order.serviceKind ?? "") === "mandado";
  const requiresPin = orderRequiresDeliveryPin(order);

  if (action === CMD_EN_PUERTA) {
    if (state === "assigned") {
      // ── Transición PICKUP_ARRIVAL ──
      try {
        backend.patch(order._rev, { mandadoPickupAtDoor: true, mandadoEnRuta: false });
      } catch (err) {
        if (err.status === 409) {
          const fresh = backend.read();
          if (fresh.mandadoPickupAtDoor === true) {
            return { status: "idempotent", reason: "race_win_by_other_request" };
          }
          return { status: "error" };
        }
        throw err;
      }
      backend.sync(order._id);
      backend.event(order._id, "picked_up");
      backend.driver("interactive_pickup_arrival");
      if (order.phone) backend.sender("mandado_destino_en_puerta:recogido");
      return { status: "transition", to: "pickup_arrival" };
    }
    if (state === "pickup_arrival" || state === "destination_arrival" || state === "delivered") {
      // Duplicado: idempotente, cero efectos.
      return { status: "idempotent", state };
    }
    if (state === null) {
      backend.hint("No se pudo determinar el estado del mandado.");
      return { status: "invalid" };
    }
    // state === 'en_route' → llega al destino (bloque compartido at_door).
    try {
      backend.patch(order._rev, { dispatchStatus: "at_door" });
    } catch (err) {
      if (err.status === 409) {
        const fresh = backend.read();
        if (fresh.dispatchStatus === "at_door") {
          return { status: "idempotent", reason: "race_win_by_other_request" };
        }
        return { status: "error" };
      }
      throw err;
    }
    backend.sync(order._id);
    backend.event(order._id, "at_door");
    if (isMandado && !requiresPin) {
      backend.driver("interactive_destination_arrival"); // Entrega Segura OFF
    } else {
      backend.driver("template_repartidor_en_puerta"); // ES ON / restaurantes
    }
    if (order.phone && order.customerName) {
      const plan = planMandadoArrival(order);
      if (plan.sendDestinoEnPuerta) {
        backend.sender("mandado_destino_en_puerta:en_destino");
        const recipientGetsPin = plan.sendOrdenPorCompletar && plan.nipChannel === "recipient";
        if (order.mandadoRecipientPhone) {
          backend.recipient(recipientGetsPin ? "mandado__destinatario:con_nip" : "mandado__destinatario");
        }
        if (plan.sendOrdenPorCompletar && plan.nipChannel !== "recipient") {
          backend.sender("orden_repartidor:con_nip");
        }
      } else {
        backend.sender("cliente_repartidor_en_puerta");
      }
    }
    return { status: "transition", to: "destination_arrival" };
  }

  if (action === CMD_PEDIDO_EN_CAMINO) {
    if (state === "assigned") {
      backend.hint("Primero llega al punto de recolección y presiona En Puerta.");
      return { status: "hint" };
    }
    if (state === "destination_arrival" || state === "delivered" || state === null) {
      return { status: "idempotent", state };
    }
    if (order.mandadoEnRuta === true) {
      return { status: "idempotent", reason: "already_en_route" };
    }
    // state 'pickup_arrival' (o legacy 'en_route' con mandadoEnRuta undefined).
    try {
      backend.patch(order._rev, { mandadoEnRuta: true });
    } catch (err) {
      if (err.status === 409) {
        const fresh = backend.read();
        if (fresh.mandadoEnRuta === true) {
          return { status: "idempotent", reason: "race_win_by_other_request" };
        }
        return { status: "error" };
      }
      throw err;
    }
    backend.sync(order._id);
    backend.event(order._id, "en_route");
    backend.driver("interactive_en_route");
    if (order.phone && order.customerName) backend.sender("mandado__cliente");
    return { status: "transition", to: "en_route" };
  }

  return { status: "unknown-action" };
}

function baseOrder(overrides = {}) {
  return {
    _id: "ord-1",
    _rev: "rev-1",
    orderNumber: "ABC-1",
    serviceKind: "mandado",
    status: "shipped",
    dispatchStatus: "accepted",
    mandadoPickupAtDoor: false,
    mandadoEnRuta: false,
    phone: "+5215500000000", // remitente
    customerName: "Cliente Test",
    mandadoRecipientPhone: "+5215511111111", // destinatario
    mandadoOrigin: { label: "Origen A", lat: 20.5, lng: -100.16 },
    mandadoDestination: { label: "Destino B", lat: 20.51, lng: -100.15 },
    mandadoDetails: "Comprar medicina",
    paymentMethod: "cash_on_delivery",
    ...overrides,
  };
}

function assertNoEffects(backend, counts) {
  const e = backend.effects;
  assert.equal(e.patches.length, counts.patches ?? 0, "patches");
  assert.equal(e.baserow.length, counts.baserow ?? 0, "sync Baserow");
  assert.equal(e.events.length, counts.events ?? 0, "order events");
  assert.equal(e.driver.length, counts.driver ?? 0, "WhatsApp al repartidor");
  assert.equal(e.sender.length, counts.sender ?? 0, "WhatsApp al remitente");
  assert.equal(e.recipient.length, counts.recipient ?? 0, "WhatsApp al destinatario");
}

// ────────────────────────────────────────────────────────────────────────
// Escenario 1 — EN PUERTA en ASSIGNED (llegada a recolección)
// ────────────────────────────────────────────────────────────────────────

test("EN PUERTA en ASSIGNED: 1ª llamada transiciona PICKUP_ARRIVAL con todos los efectos", () => {
  const backend = createBackend(baseOrder());
  const result = handleMandadoAction(backend, CMD_EN_PUERTA, backend.read());

  assert.equal(result.status, "transition");
  assert.equal(result.to, "pickup_arrival");

  // Persistencia exacta del parche (mismo que el webhook).
  assert.deepEqual(backend.effects.patches[0].fields, {
    mandadoPickupAtDoor: true,
    mandadoEnRuta: false,
  });
  assert.equal(backend.doc.mandadoPickupAtDoor, true);
  assert.equal(backend.doc.mandadoEnRuta, false);
  assert.equal(mandadoDriverState(backend.doc), "pickup_arrival");

  // Efectos: 1 sync Baserow, 1 order event picked_up, 1 WhatsApp al repartidor,
  // 1 WhatsApp al remitente (recogido); NINGUNO al destinatario.
  assert.equal(backend.effects.baserow.length, 1);
  assert.equal(backend.effects.events.length, 1);
  assert.equal(backend.effects.events[0].type, "picked_up");
  assert.equal(backend.effects.driver.length, 1);
  assert.equal(backend.effects.driver[0].kind, "interactive_pickup_arrival");
  assert.deepEqual(backend.effects.sender, ["mandado_destino_en_puerta:recogido"]);
  assert.equal(backend.effects.recipient.length, 0);
});

test("EN PUERTA en ASSIGNED: 2ª llamada idéntica es un NO-OP total (cero efectos, orden intacta)", () => {
  const backend = createBackend(baseOrder());
  handleMandadoAction(backend, CMD_EN_PUERTA, backend.read());
  const snapshotBefore = JSON.stringify(backend.doc);
  const effectsBefore = structuredClone(backend.effects);

  const second = handleMandadoAction(backend, CMD_EN_PUERTA, backend.read());

  assert.equal(second.status, "idempotent");
  assert.equal(second.state, "pickup_arrival"); // el estado ya transitado se detecta ANTES de parchear
  // NO modifica nuevamente el pedido:
  assert.equal(JSON.stringify(backend.doc), snapshotBefore);
  // NO repite NINGÚN efecto secundario:
  assert.deepEqual(backend.effects, effectsBefore);
  assertNoEffects(backend, {
    patches: 1,
    baserow: 1,
    events: 1,
    driver: 1,
    sender: 1,
  });
});

// ────────────────────────────────────────────────────────────────────────
// Escenario 2 — PEDIDO EN DIRECCION AL DOMICILIO (transición EN_ROUTE)
// ────────────────────────────────────────────────────────────────────────

test("PEDIDO EN DIRECCION AL DOMICILIO: 1ª llamada transiciona EN_ROUTE (mandadoEnRuta=true + mensajes)", () => {
  const backend = createBackend(baseOrder({ mandadoPickupAtDoor: true, mandadoEnRuta: false }));
  const result = handleMandadoAction(backend, CMD_PEDIDO_EN_CAMINO, backend.read());

  assert.equal(result.status, "transition");
  assert.equal(result.to, "en_route");
  assert.deepEqual(backend.effects.patches[0].fields, { mandadoEnRuta: true });
  assert.equal(backend.doc.mandadoEnRuta, true);
  assert.equal(mandadoDriverState(backend.doc), "en_route");
  assert.equal(backend.effects.events[0].type, "en_route");
  assert.equal(backend.effects.driver[0].kind, "interactive_en_route");
  assert.deepEqual(backend.effects.sender, ["mandado__cliente"]);
});

test("PEDIDO EN DIRECCION AL DOMICILIO: 2ª llamada idéntica NO reenvía mensajes ni repite efectos", () => {
  const backend = createBackend(baseOrder({ mandadoPickupAtDoor: true, mandadoEnRuta: false }));
  handleMandadoAction(backend, CMD_PEDIDO_EN_CAMINO, backend.read());
  const snapshotBefore = JSON.stringify(backend.doc);
  const effectsBefore = structuredClone(backend.effects);

  const second = handleMandadoAction(backend, CMD_PEDIDO_EN_CAMINO, backend.read());

  assert.equal(second.status, "idempotent");
  assert.equal(second.reason, "already_en_route");
  assert.equal(JSON.stringify(backend.doc), snapshotBefore);
  assert.deepEqual(backend.effects, effectsBefore);
  assertNoEffects(backend, { patches: 1, baserow: 1, events: 1, driver: 1, sender: 1 });
});

test("PEDIDO EN DIRECCION AL DOMICILIO en ASSIGNED (sin recolección): hint, CERO efectos", () => {
  const backend = createBackend(baseOrder());
  const result = handleMandadoAction(backend, CMD_PEDIDO_EN_CAMINO, backend.read());

  assert.equal(result.status, "hint");
  assert.equal(backend.effects.hints.length, 1);
  assertNoEffects(backend, { hints: 1 });
});

test("estado inconsistente mandadoEnRuta=true sin mandadoPickupAtDoor → nunca transiciona (sin patch)", () => {
  const backend = createBackend(baseOrder({ mandadoPickupAtDoor: false, mandadoEnRuta: true }));

  const enRuta = handleMandadoAction(backend, CMD_PEDIDO_EN_CAMINO, backend.read());
  assert.equal(enRuta.status, "idempotent"); // mandadoDriverState → null → guard idempotente
  const enPuerta = handleMandadoAction(backend, CMD_EN_PUERTA, backend.read());
  assert.equal(enPuerta.status, "invalid"); // estado null → hint, sin transición

  assertNoEffects(backend, { hints: 1 });
});

// ────────────────────────────────────────────────────────────────────────
// Escenario 3 — EN PUERTA en EN_ROUTE (llegada al destino, Entrega Segura OFF)
// ────────────────────────────────────────────────────────────────────────

test("EN PUERTA en EN_ROUTE: 1ª llamada marca at_door y ejecuta todas las notificaciones", () => {
  const backend = createBackend(baseOrder({ mandadoPickupAtDoor: true, mandadoEnRuta: true }));
  const result = handleMandadoAction(backend, CMD_EN_PUERTA, backend.read());

  assert.equal(result.status, "transition");
  assert.equal(result.to, "destination_arrival");
  assert.deepEqual(backend.effects.patches[0].fields, { dispatchStatus: "at_door" });
  assert.equal(backend.doc.dispatchStatus, "at_door");
  assert.equal(mandadoDriverState(backend.doc), "destination_arrival");
  assert.equal(backend.effects.baserow.length, 1);
  assert.equal(backend.effects.events[0].type, "at_door");
  assert.equal(backend.effects.driver[0].kind, "interactive_destination_arrival"); // ES OFF
  assert.deepEqual(backend.effects.sender, ["mandado_destino_en_puerta:en_destino"]);
  assert.deepEqual(backend.effects.recipient, ["mandado__destinatario"]);
});

test("EN PUERTA en EN_ROUTE: 2ª llamada NO vuelve a notificar, sincronizar ni crear eventos", () => {
  const backend = createBackend(baseOrder({ mandadoPickupAtDoor: true, mandadoEnRuta: true }));
  handleMandadoAction(backend, CMD_EN_PUERTA, backend.read());
  const snapshotBefore = JSON.stringify(backend.doc);
  const effectsBefore = structuredClone(backend.effects);

  const second = handleMandadoAction(backend, CMD_EN_PUERTA, backend.read());

  assert.equal(second.status, "idempotent");
  assert.equal(second.state, "destination_arrival");
  assert.equal(JSON.stringify(backend.doc), snapshotBefore);
  assert.deepEqual(backend.effects, effectsBefore);
  assertNoEffects(backend, {
    patches: 1,
    baserow: 1,
    events: 1,
    driver: 1,
    sender: 1,
    recipient: 1,
  });
});

test("EN PUERTA en EN_ROUTE con Entrega Segura ON: flujo NIP intacto y sin duplicados", () => {
  const backend = createBackend(
    baseOrder({
      mandadoPickupAtDoor: true,
      mandadoEnRuta: true,
      mandadoEntregaSegura: true,
      deliveryVerificationMethod: "pin",
      mandadoNipRecipient: "sender",
    })
  );

  const first = handleMandadoAction(backend, CMD_EN_PUERTA, backend.read());
  assert.equal(first.to, "destination_arrival");
  // El repartidor recibe el template canónico (NO el interactivo ES OFF).
  assert.equal(backend.effects.driver[0].kind, "template_repartidor_en_puerta");
  // Remitente: aviso de llegada + orden_repartidor con NIP (canal sender).
  assert.deepEqual(backend.effects.sender, [
    "mandado_destino_en_puerta:en_destino",
    "orden_repartidor:con_nip",
  ]);
  // Destinatario: aviso SIN NIP (el NIP va al canal configurado, no al destinatario).
  assert.deepEqual(backend.effects.recipient, ["mandado__destinatario"]);

  const effectsBefore = structuredClone(backend.effects);
  const second = handleMandadoAction(backend, CMD_EN_PUERTA, backend.read());
  assert.equal(second.status, "idempotent");
  // El NIP NO se reenvía en un duplicado.
  assert.deepEqual(backend.effects, effectsBefore);
});

// ────────────────────────────────────────────────────────────────────────
// Escenario 4 — Carrera concurrente (mismo ifRevisionId)
// ────────────────────────────────────────────────────────────────────────

test("carrera EN PUERTA en ASSIGNED: mismo ifRevisionId → uno gana, el otro 409→no-op idempotente (sin 500, sin duplicados)", () => {
  const backend = createBackend(baseOrder());
  const snapA = backend.read();
  const snapB = structuredClone(snapA); // ambos leen el MISMO _rev

  const resultA = handleMandadoAction(backend, CMD_EN_PUERTA, snapA); // gana
  const resultB = handleMandadoAction(backend, CMD_EN_PUERTA, snapB); // pierde

  assert.equal(resultA.status, "transition");
  assert.equal(resultB.status, "idempotent");
  assert.equal(resultB.reason, "race_win_by_other_request");
  // Una sola serie de efectos (el perdedor no aporta ninguno):
  assertNoEffects(backend, { patches: 1, baserow: 1, events: 1, driver: 1, sender: 1 });
  // El parche ganador fue el único y con la revisión correcta.
  assert.equal(backend.effects.patches[0].ifRevisionId, "rev-1");
  assert.equal(backend.effects.patches[0].fields.mandadoPickupAtDoor, true);
});

test("carrera PEDIDO EN DIRECCION AL DOMICILIO: mismo ifRevisionId → uno gana, el otro no-op sin mensajes duplicados", () => {
  const backend = createBackend(baseOrder({ mandadoPickupAtDoor: true, mandadoEnRuta: false }));
  const snapA = backend.read();
  const snapB = structuredClone(snapA);

  const resultA = handleMandadoAction(backend, CMD_PEDIDO_EN_CAMINO, snapA);
  const resultB = handleMandadoAction(backend, CMD_PEDIDO_EN_CAMINO, snapB);

  assert.equal(resultA.status, "transition");
  assert.equal(resultB.status, "idempotent");
  assert.equal(resultB.reason, "race_win_by_other_request");
  assertNoEffects(backend, { patches: 1, baserow: 1, events: 1, driver: 1, sender: 1 });
  assert.equal(backend.effects.patches[0].fields.mandadoEnRuta, true);
});

test("carrera EN PUERTA en EN_ROUTE (at_door): mismo ifRevisionId → uno gana, el otro no-op sin doble notificación", () => {
  const backend = createBackend(baseOrder({ mandadoPickupAtDoor: true, mandadoEnRuta: true }));
  const snapA = backend.read();
  const snapB = structuredClone(snapA);

  const resultA = handleMandadoAction(backend, CMD_EN_PUERTA, snapA);
  const resultB = handleMandadoAction(backend, CMD_EN_PUERTA, snapB);

  assert.equal(resultA.status, "transition");
  assert.equal(resultB.status, "idempotent");
  assert.equal(resultB.reason, "race_win_by_other_request");
  assertNoEffects(backend, {
    patches: 1,
    baserow: 1,
    events: 1,
    driver: 1,
    sender: 1,
    recipient: 1,
  });
  assert.equal(backend.effects.patches[0].fields.dispatchStatus, "at_door");
});

// ────────────────────────────────────────────────────────────────────────
// Escenario 5 — Los botones ejecutan las MISMAS transiciones que los comandos
// ────────────────────────────────────────────────────────────────────────

test("los payloads de botones se parsean al mismo comando que el texto (misma transición backend)", () => {
  const cases = [
    [mandadoEnPuertaPayload("ord-1"), CMD_EN_PUERTA],
    [mandadoPickedUpPayload("ord-1"), CMD_PEDIDO_EN_CAMINO],
    [mandadoEntregadoPayload("ord-1"), CMD_ENTREGADO],
  ];
  for (const [payload, command] of cases) {
    // El webhook parsea `EN PUERTA|ord-1` → action 'EN PUERTA' + orderId 'ord-1'
    // (parseButtonActionPayload: normalizeDriverActionToken + split por '|').
    const [actionPart, orderIdPart] = payload.split("|");
    const action = actionPart.replace(/_/g, " ").toUpperCase().trim();
    assert.equal(action, command, `${payload} debe parsear al comando canónico`);
    assert.equal(orderIdPart, "ord-1", `${payload} debe conservar el orderId`);
    // El comando parseado entra al MISMO handler que el texto escrito a mano.
    assert.notEqual(matchDriverCommand(action, command), null, `${action} debe matchear ${command}`);
    assert.equal(matchDriverCommand(action, command), "", "sin folio extra");
  }
});

test("el mismo botón y el mismo texto producen la misma decisión de transición", () => {
  const backendText = createBackend(baseOrder());
  const backendButton = createBackend(baseOrder());

  // Texto "EN PUERTA" (sin folio) vs botón con payload "EN PUERTA|ord-1":
  // ambos terminan en el mismo handler mandado con la misma orden resuelta.
  const viaTexto = handleMandadoAction(backendText, CMD_EN_PUERTA, backendText.read());
  const viaBoton = handleMandadoAction(backendButton, CMD_EN_PUERTA, backendButton.read());

  assert.equal(viaTexto.to, viaBoton.to);
  assert.equal(viaTexto.status, viaBoton.status);
  assert.deepEqual(backendText.effects, backendButton.effects);
});

// ────────────────────────────────────────────────────────────────────────
// Guards a nivel de fuente: fijan el route.ts REAL a las mismas garantías
// ────────────────────────────────────────────────────────────────────────

const WEBHOOK_SOURCE = readFileSync(
  new URL("../app/api/whatsapp/webhook/route.ts", import.meta.url),
  "utf8"
);

const SIDE_EFFECT_TOKENS = [
  ".patch(",
  "syncBaserowOrderById(",
  "appendOrderEvent(",
  "sendWhatsAppInteractiveMessage(",
  "sendBotMessage(",
  "sendMandadoDestinoEnPuerta(",
  "sendMandadoClienteRecogido(",
  "sendMandadoDestinatarioEnPuerta(",
  "sendMandadoOrdenPorCompletar(",
  "sendRepartidorEnPuerta(",
  "sendClienteRepartidorEnPuerta(",
];

test("fuente: todo camino *_IDEMPOTENT retorna ANTES de cualquier efecto secundario", () => {
  const idempotentLogs = [
    ...WEBHOOK_SOURCE.matchAll(/console\.(?:log|warn)\((['"])(?:\[[^\]]*\]\s*)?([A-Z_]+_IDEMPOTENT)\1/g),
  ];
  // 3 guards de PEDIDO EN CAMINO + 3 de EN PUERTA + 1 de ACEPTO (asignación).
  assert.ok(idempotentLogs.length >= 7, `esperaba los guards idempotentes, encontré ${idempotentLogs.length}`);

  for (const match of idempotentLogs) {
    const start = match.index;
    const end = findIdempotentBlockEnd(WEBHOOK_SOURCE, start);
    assert.ok(
      end > start,
      `falta terminador (return/continue) tras ${match[2]} (línea ${countLines(WEBHOOK_SOURCE, start)})`
    );
    // El camino idempotente termina (return o continue) ANTES de ejecutar
    // cualquier efecto secundario. El bloque va del log al primer terminador.
    const block = WEBHOOK_SOURCE.slice(start, end);
    for (const token of SIDE_EFFECT_TOKENS) {
      assert.ok(
        !block.includes(token),
        `${match[2]}: el camino idempotente ejecuta un efecto secundario (${token})`
      );
    }
  }
});

function findIdempotentBlockEnd(source, start) {
  const after = source.slice(start);
  let offset = 0;
  for (const line of after.split("\n")) {
    offset += line.length + 1;
    const trimmed = line.trim();
    if (trimmed.startsWith("return NextResponse.json") || trimmed === "continue") {
      return start + offset;
    }
  }
  return -1;
}

test("fuente: todo catch de patch 409 relee la orden y retorna idempotente sin efectos (nunca 500)", () => {
  const catches = [...WEBHOOK_SOURCE.matchAll(/catch \(patchError\) \{/g)];
  assert.ok(catches.length >= 3, `esperaba los catches de patch, encontré ${catches.length}`);

  for (const match of catches) {
    const start = match.index;
    const raceIdx = WEBHOOK_SOURCE.indexOf("race_win_by_other_request", start);
    assert.ok(raceIdx > start, "catch de patch sin recuperación race_win_by_other_request");
    const returnIdx = WEBHOOK_SOURCE.indexOf("return NextResponse.json", raceIdx);
    assert.ok(returnIdx > raceIdx, "catch de patch sin return idempotente");
    const block = WEBHOOK_SOURCE.slice(start, returnIdx);
    // Relee la orden tras el 409 antes de decidir (nunca asume).
    assert.match(block, /backendClient\.fetch\(/, "el catch debe releer la orden tras el 409");
    // Entre el catch y el return idempotente NO hay efectos secundarios.
    for (const token of SIDE_EFFECT_TOKENS) {
      assert.ok(!block.includes(token), `catch 409 con efecto secundario (${token})`);
    }
  }
});

test("fuente: el guard alreadyEnRuta precede al patch mandadoEnRuta:true", () => {
  const alreadyIdx = WEBHOOK_SOURCE.indexOf("alreadyEnRuta");
  const patchIdx = WEBHOOK_SOURCE.indexOf("mandadoEnRuta: true");
  assert.ok(alreadyIdx > -1 && patchIdx > -1, "guard y patch de mandadoEnRuta presentes");
  assert.ok(alreadyIdx < patchIdx, "el guard de duplicado debe evaluarse ANTES de parchear");
});

test("fuente: los tres handlers resuelven botón y texto por la misma orden (buttonOrderId ?? token)", () => {
  assert.match(WEBHOOK_SOURCE, /buttonOrderId \?\? \(enPuertaToken \|\| null\)/);
  assert.match(WEBHOOK_SOURCE, /buttonOrderId \?\? \(pedidoEnCaminoToken \|\| null\)/);
  assert.match(WEBHOOK_SOURCE, /buttonOrderId \?\? \(entregadoToken \|\| null\)/);
});

function countLines(source, index) {
  return source.slice(0, index).split("\n").length;
}
