// Máquina de estados del repartidor en MANDADOS (lado WhatsApp), pura y
// testeable. Vive aquí (sin dependencias de runtime) para que el webhook y sus
// tests compartan EXACTAMENTE la misma derivación de estado y no se duplique.
//
// Estados (modelo con flags específicos de mandado; NO se toca dispatchStatus):
//
//   ASSIGNED            → dispatchStatus="accepted" + mandadoPickupAtDoor=false
//   PICKUP_ARRIVAL      → EN PUERTA en ASSIGNED → mandadoPickupAtDoor=true
//                         + mandadoEnRuta=false (explícito)
//   EN_ROUTE            → "Ya recogí" / PEDIDO EN DIRECCION AL DOMICILIO
//                         (solo si mandadoPickupAtDoor=true) → mandadoEnRuta=true
//   DESTINATION_ARRIVAL → EN PUERTA en EN_ROUTE → dispatchStatus="at_door"
//   DELIVERED           → ENTREGADO → dispatchStatus="completed"
//
// Reglas invariantes:
//  - mandadoEnRuta=true NUNCA puede derivarse si mandadoPickupAtDoor !== true
//    (y el webhook nunca lo escribe en ese caso).
//  - LEGACY (órdenes creadas antes de mandadoEnRuta, con
//    mandadoPickupAtDoor=true, dispatchStatus="accepted" y mandadoEnRuta
//    undefined): se derivan como EN_ROUTE para conservar el comportamiento
//    histórico (la 2ª pulsación de EN PUERTA llegaba al destino) sin bloquear
//    la orden. No pueden saltarse transiciones: la llegada al destino sigue
//    exigiendo el estado (derivado) EN_ROUTE.
//  - Duplicados: el webhook usa la derivación ANTES de parchear; una acción
//    repetida cae en el estado posterior y se trata como idempotente (no
//    reenvía WhatsApp ni repite efectos secundarios).
//
// Botones: los payloads reutilizan los COMANDOS CANÓNICOS del repartidor
// (lib/driver-commands.ts) para que botón y texto ejecuten la misma
// transición backend. NO renombrar sin tocar el webhook.
import {
  buildDriverConfirmationData,
  buildMandadoDriverInstructions,
  type DriverConfirmationData,
  type DriverConfirmationOrder,
} from "./order-maps.ts";

const CMD_EN_PUERTA = "EN PUERTA";
const CMD_PEDIDO_EN_CAMINO = "PEDIDO EN DIRECCION AL DOMICILIO";
const CMD_ENTREGADO = "ENTREGADO";

export function mandadoEnPuertaPayload(orderId: string) {
  return `${CMD_EN_PUERTA}|${orderId}`;
}

export function mandadoPickedUpPayload(orderId: string) {
  return `${CMD_PEDIDO_EN_CAMINO}|${orderId}`;
}

export function mandadoEntregadoPayload(orderId: string) {
  return `${CMD_ENTREGADO}|${orderId}`;
}

export type MandadoDriverState =
  | "assigned"
  | "pickup_arrival"
  | "en_route"
  | "destination_arrival"
  | "delivered";

export type MandadoDriverStateOrder = {
  serviceKind?: unknown;
  dispatchStatus?: unknown;
  mandadoPickupAtDoor?: unknown;
  mandadoEnRuta?: unknown;
};

export function mandadoDriverState(order: MandadoDriverStateOrder): MandadoDriverState | null {
  if (String(order.serviceKind ?? "") !== "mandado") return null;

  const dispatchStatus = String(order.dispatchStatus ?? "");
  const pickupAtDoor = order.mandadoPickupAtDoor === true;
  const enRuta = order.mandadoEnRuta === true;
  const enRutaUndefined = order.mandadoEnRuta === undefined || order.mandadoEnRuta === null;

  if (dispatchStatus === "completed") return "delivered";
  if (dispatchStatus === "at_door") return "destination_arrival";
  if (dispatchStatus !== "accepted") return null;

  if (enRuta) {
    // Invariante: mandadoEnRuta=true sin recolección registrada es un estado
    // inconsistente (el webhook nunca lo escribe); se devuelve null para que
    // la transición se rechace con un hint en lugar de avanzar mal.
    return pickupAtDoor ? "en_route" : null;
  }
  if (!pickupAtDoor) return "assigned";
  // LEGACY: pickupAtDoor=true + mandadoEnRuta sin definir (pre-existente a la
  // introducción del campo) = repartidor en tránsito → EN_ROUTE.
  if (enRutaUndefined) return "en_route";
  return "pickup_arrival";
}

// ────────────────────────────────────────────────────────────────────────
// Mensajes interactivos del repartidor (capa de UX sobre los comandos).
//
// Meta: body <= 1024, título de botón <= 20 caracteres, hasta 3 botones, y en
// interactive messages SOLO existen botones reply (los URL son de templates).
// Por eso el "Ver mapa" viaja como link en el cuerpo (WhatsApp lo vuelve
// tappable) y no como botón.
// ────────────────────────────────────────────────────────────────────────

export type MandadoDriverButton = {
  type: "reply";
  id: string;
  title: string;
};

export type MandadoDriverInteractiveMessage = {
  body: string;
  buttons: MandadoDriverButton[];
};

const BODY_LIMIT = 1000; // límite de Meta 1024, con margen de seguridad
const BUTTON_TITLE_LIMIT = 20; // límite de Meta

function fitBody(mainText: string, mapLine: string): string {
  const main = String(mainText || "").trim();
  const map = String(mapLine || "").trim();
  const full = map ? `${main}\n\n${map}` : main;
  if (full.length <= BODY_LIMIT) return full;
  const available = Math.max(40, BODY_LIMIT - map.length - 3);
  const truncated = main.slice(0, available).trimEnd();
  return map ? `${truncated}…\n\n${map}` : truncated;
}

function replyButton(id: string, title: string): MandadoDriverButton {
  return { type: "reply", id, title: String(title).slice(0, BUTTON_TITLE_LIMIT) };
}

export type MandadoDriverOrderInput = DriverConfirmationOrder & {
  _id?: unknown;
  orderNumber?: unknown;
};

/** ASSIGNED → mensaje único tras ACEPTO (reemplaza la plantilla para mandados). */
export function buildMandadoAssignmentInteractive(
  order: MandadoDriverOrderInput,
  confirmation: DriverConfirmationData
): MandadoDriverInteractiveMessage {
  const mapLine = `🗺️ Mapa del punto de recolección:\n${confirmation.restaurantMapsUrl}`;
  return {
    body: fitBody(buildMandadoDriverInstructions(order), mapLine),
    buttons: [replyButton(mandadoEnPuertaPayload(String(order._id ?? "")), "Llegué a recolección")],
  };
}

/** PICKUP_ARRIVAL → aviso mínimo + botón "Ya recogí el mandado". */
export function buildMandadoPickupArrivalInteractive(orderId: string): MandadoDriverInteractiveMessage {
  return {
    body: "✅ Recolección registrada.\nCuando tengas el mandado, avísame.",
    buttons: [replyButton(mandadoPickedUpPayload(orderId), "Ya recogí el mandado")],
  };
}

/** EN_ROUTE → aviso mínimo con destino + botón "Llegué al destino". */
export function buildMandadoEnRouteInteractive(
  order: MandadoDriverOrderInput,
  confirmation: DriverConfirmationData
): MandadoDriverInteractiveMessage {
  const main = `🚗 Mandado recogido.\nDestino: ${confirmation.deliveryAddress}\n\nCuando llegues:`;
  const mapLine = `🗺️ Mapa del destino:\n${confirmation.clientMapsUrl}`;
  return {
    body: fitBody(main, mapLine),
    buttons: [replyButton(mandadoEnPuertaPayload(String(order._id ?? "")), "Llegué al destino")],
  };
}

/** DESTINATION_ARRIVAL (Entrega Segura OFF) → aviso mínimo + botón "Entregado". */
export function buildMandadoDestinationArrivalInteractive(orderId: string): MandadoDriverInteractiveMessage {
  return {
    body: "📍 Llegaste al destino.\nPuedes realizar la entrega.",
    buttons: [replyButton(mandadoEntregadoPayload(orderId), "Entregado")],
  };
}

// Re-export para que el webhook construya la confirmación de maps con la misma
// función pura que usa en ACEPTO (buildDriverConfirmationData).
export { buildDriverConfirmationData };
