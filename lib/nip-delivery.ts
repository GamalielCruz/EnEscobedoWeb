/**
 * Lifecycle de entrega del NIP (PASO 1 y 2 del plan de NIP).
 *
 * Separa dos cosas que antes se confundían:
 *  - `deliveryVerificationMethod/Status` (existente): si la orden "requiere" NIP
 *    y si el NIP fue validado correctamente (pending/verified/locked).
 *  - `nipDeliveryStatus` (nuevo): si el NIP REALMENTE llegó al canal configurado
 *    (mensaje de WhatsApp entregado), decidido por los `statuses` de Meta.
 *
 * Regla de oro del producto: nunca se exige al destinatario una credencial que el
 * sistema no tuvo una ruta válida para entregarle. El gate (`canRequestDeliveryPin`)
 * solo se abre cuando `nipDeliveryStatus === "delivered"` (mandados).
 *
 * Criterio seguro para órdenes legadas (sin el campo): si la orden requiere NIP y
 * no existe `nipDeliveryStatus`, se trata como `pending` (sin evidencia de entrega
 * → gate cerrado). El webhook de statuses lo promueve a `sent`/`delivered`/`failed`
 * cuando llega la recepción real de Meta. NUNCA se inventa una entrega.
 *
 * Este módulo es puro (sin imports de Sanity) para poder testearlo con node.
 */
import { orderRequiresDeliveryPin } from "./delivery-pin.ts";
import { WHATSAPP_TEMPLATES } from "./whatsapp/templates.ts";

export type NipDeliveryStatus =
  | "not_required"
  | "pending"
  | "sent"
  | "delivered"
  | "failed"
  | "expired";

/**
 * Estados del claim idempotente (`whatsappTemplateDelivery`):
 *  - `pending`: envío aceptado por nuestro código (antes/después del 200 de Meta).
 *  - `sent`: Meta aceptó el mensaje (HTTP 200 con `messages[0].id`). NO es entrega.
 *  - `delivered` / `read`: el teléfono destino lo recibió / lo leyó.
 *  - `failed`: Meta reportó fallo (error 131030, teléfono sin WhatsApp, etc.).
 */
export type ClaimStatus = "pending" | "sent" | "delivered" | "read" | "failed";

/**
 * Plantillas cuyo mensaje transporta el NIP de la entrega. Es la ÚNICA lista que
 * decide qué mensaje prueba la entrega del código (`nipDeliveryStatus`).
 *  - `orden_repartidor`: canal remitente (nombre heredado de Meta; va al cliente).
 *  - `mandado_nip_destinatario`: canal destinatario (PASO 4; PENDIENTE de aprobación
 *    en Meta — el código queda preparado y falla sin romper otros flujos si no existe).
 */
export const NIP_CARRIER_TEMPLATES = new Set<string>([
  WHATSAPP_TEMPLATES.ordenRepartidor,
  WHATSAPP_TEMPLATES.mandadoDestinatario,
]);

export function isNipCarrierTemplate(templateName: string | null | undefined) {
  return NIP_CARRIER_TEMPLATES.has(String(templateName ?? ""));
}

/**
 * Estado de entrega del NIP de una orden, con criterio seguro para legado.
 * - Sin `nipDeliveryStatus` y sin requerir NIP → `not_required`.
 * - Sin `nipDeliveryStatus` pero requiriendo NIP → `pending` (sin evidencia de
 *   entrega: NO se puede afirmar que el código llegó).
 */
export function resolveNipDeliveryStatus(order: {
  serviceKind?: string;
  mandadoEntregaSegura?: boolean;
  deliveryVerificationMethod?: string;
  deliveryVerificationStatus?: string;
  nipDeliveryStatus?: string;
}): NipDeliveryStatus {
  if (!orderRequiresDeliveryPin(order)) return "not_required";
  const value = String(order.nipDeliveryStatus ?? "");
  if (
    value === "pending" ||
    value === "sent" ||
    value === "delivered" ||
    value === "failed" ||
    value === "expired"
  ) {
    return value as NipDeliveryStatus;
  }
  // Legado sin campo: gate cerrado hasta que el webhook de statuses confirme.
  return "pending";
}

/**
 * ¿El NIP ya expiró? La expiración (TTL 24 h desde la creación/regeneración) es
 * INDEPENDIENTE del estado del mensaje de WhatsApp: un mensaje `delivered` no
 * mantiene válido un NIP expirado (AJUSTE 3).
 */
export function resolveDeliveryPinExpired(
  order: { deliveryPinExpiresAt?: string },
  now: Date = new Date()
): boolean {
  if (!order.deliveryPinExpiresAt) return false;
  return new Date(order.deliveryPinExpiresAt).getTime() <= now.getTime();
}

/**
 * Estado EFECTIVO del NIP de una orden, visto desde fuera (remitente, operación,
 * gate de entrega). Es la ÚNICA evaluación canónica del ciclo de vida: /orders
 * (lib/nip-sender-view.ts), el Dispatch Center (nip-incidents) y el gate del
 * webhook la comparten para que NUNCA diverjan.
 *
 * Precedencia (de mayor a menor):
 *  1. `no_pin`      — la orden no requiere NIP.
 *  2. `verified`    — el NIP ya fue validado correctamente (terminal).
 *  3. `expired`     — el TTL (24 h) venció. INDEPENDIENTE del mensaje (AJUSTE 3):
 *                     un `delivered` persistido + TTL expirado NUNCA se valida.
 *  4. Estado del mensaje — `delivered`/`sent`/`pending`/`failed` según el claim
 *                     de WhatsApp (un 200 de Meta no basta para `delivered`).
 */
export type EffectiveNipStatus =
  | "no_pin"
  | "pending"
  | "sent"
  | "delivered"
  | "failed"
  | "expired"
  | "verified";

export function effectiveNipStatus(
  order: {
    serviceKind?: string;
    mandadoEntregaSegura?: boolean;
    deliveryVerificationMethod?: string;
    deliveryVerificationStatus?: string;
    nipDeliveryStatus?: string;
    deliveryPinExpiresAt?: string;
  },
  now: Date = new Date()
): EffectiveNipStatus {
  if (!orderRequiresDeliveryPin(order)) return "no_pin";
  if (String(order.deliveryVerificationStatus ?? "") === "verified") return "verified";
  if (resolveDeliveryPinExpired(order, now)) return "expired";
  const status = resolveNipDeliveryStatus(order);
  // `not_required` es inalcanzable aquí (requiresPin), pero el tipo lo incluye:
  // sin evidencia de entrega el estado efectivo es `pending` (gate cerrado).
  return status === "not_required" ? "pending" : status;
}

/**
 * Tipos de incidencia operativa de NIP (Dispatch Center). Separa tres
 * situaciones distintas que exigen acciones distintas:
 *  - `not_delivered`: el mensaje no llegó al canal configurado (pending/failed).
 *  - `expired`: el TTL venció (aunque el mensaje hubiera llegado).
 *  - `no_whatsapp`: el canal es el remitente porque el destinatario declaró no
 *    usar WhatsApp — el código NO va al teléfono del destinatario, así que la
 *    "entrega del código" depende del remitente proporcionándolo.
 */
export type NipIncidentType = "not_delivered" | "expired" | "no_whatsapp";

export function deriveNipIncidentType(
  order: {
    mandadoNipRecipient?: string;
    mandadoRecipientWhatsAppDeclared?: boolean;
  },
  blockReason: "expired" | "not_delivered"
): NipIncidentType {
  if (blockReason === "expired") return "expired";
  const channel = String(order.mandadoNipRecipient ?? "") === "recipient" ? "recipient" : "sender";
  if (channel === "sender" && order.mandadoRecipientWhatsAppDeclared === false) {
    return "no_whatsapp";
  }
  return "not_delivered";
}

/**
 * Razón por la que el gate de mandados bloquea el NIP en la puerta, o `null` si
 * se puede solicitar. Restaurantes → siempre `null` (conservan su flujo actual).
 * Deriva de `effectiveNipStatus` (única fuente de verdad del ciclo de vida).
 */
export function getDeliveryPinBlockReason(
  order: {
    serviceKind?: string;
    mandadoEntregaSegura?: boolean;
    deliveryVerificationMethod?: string;
    deliveryVerificationStatus?: string;
    nipDeliveryStatus?: string;
    deliveryPinExpiresAt?: string;
  },
  now: Date = new Date()
): "expired" | "not_delivered" | null {
  if (!orderRequiresDeliveryPin(order)) return null;
  if (String(order.serviceKind ?? "") !== "mandado") return null;
  const status = effectiveNipStatus(order, now);
  // `verified` es terminal: la entrega ya fue autenticada; NUNCA bloquea (el
  // webhook la reconoce y completa sin re-validar — endurecimiento A).
  if (status === "verified") return null;
  if (status === "expired") return "expired";
  // Solo un `delivered` efectivo abre el gate: pending/sent/failed mantienen
  // la entrega bloqueada.
  if (status !== "delivered") return "not_delivered";
  return null;
}

/**
 * Gate de entrega (PASO 1): ¿se puede solicitar/validar el NIP en la puerta?
 * - Sin NIP requerido → false (la entrega se completa sin código).
 * - Restaurantes → conservan su flujo actual (método pin pendiente ⇒ pedir NIP).
 * - Mandados → SOLO si el código fue entregado al canal configurado Y sigue
 *   vigente (un 200 de Meta NO basta; un NIP expirado tampoco se valida).
 */
export function canRequestDeliveryPin(
  order: {
    serviceKind?: string;
    mandadoEntregaSegura?: boolean;
    deliveryVerificationMethod?: string;
    deliveryVerificationStatus?: string;
    nipDeliveryStatus?: string;
    deliveryPinExpiresAt?: string;
  },
  now: Date = new Date()
): boolean {
  if (!orderRequiresDeliveryPin(order)) return false;
  if (String(order.serviceKind ?? "") !== "mandado") return true;
  return getDeliveryPinBlockReason(order, now) === null;
}

/**
 * Mapea el estado crudo de Meta (`statuses[].status`) a un `ClaimStatus`.
 * Estados desconocidos → `null` (nunca rompen el webhook).
 * `queued` y `sent` significan "Meta lo aceptó", NO que llegó al teléfono.
 */
export function mapMetaMessageStatus(
  metaStatus: string | null | undefined
): ClaimStatus | null {
  const s = String(metaStatus || "").toLowerCase();
  if (s === "queued" || s === "sent") return "sent";
  if (s === "delivered") return "delivered";
  if (s === "read") return "read";
  if (s === "failed") return "failed";
  return null;
}

/**
 * Transición forward-only del claim. Idempotente: si el estado ya es el destino
 * (p. ej. `delivered` repetido de Meta), devuelve el mismo estado y el llamador
 * no aplica nada. `failed` es terminal; nunca se degrada (`delivered → sent`).
 */
export function resolveNextClaimStatus(
  current: ClaimStatus | null | undefined,
  incoming: ClaimStatus | null
): ClaimStatus | null {
  if (!incoming) return null;
  const cur = current ?? "pending";
  if (cur === incoming) return incoming;
  if (cur === "failed") return null; // terminal: no se revierte
  if (incoming === "failed") return "failed"; // cualquier estado → failed
  const forward: ClaimStatus[] = ["pending", "sent", "delivered", "read"];
  const curIdx = forward.indexOf(cur);
  const incIdx = forward.indexOf(incoming);
  if (curIdx === -1) return incoming;
  if (incIdx > curIdx) return incoming;
  return null; // degradación → ignorar
}

/**
 * Estado de NIP de la orden derivado de un estado del claim.
 * `read` también abre el gate (implica `delivered`).
 */
export function resolveNipStatusFromClaimStatus(
  claimStatus: ClaimStatus
): NipDeliveryStatus | null {
  if (claimStatus === "delivered" || claimStatus === "read") return "delivered";
  if (claimStatus === "sent") return "sent";
  if (claimStatus === "failed") return "failed";
  return null; // pending → sin cambio
}

/**
 * Transición forward-only de `nipDeliveryStatus`. Idempotente; `delivered`,
 * `failed` y `expired` son absorbentes (no se degradan con eventos tardíos).
 */
export function resolveNextNipStatus(
  current: NipDeliveryStatus | null | undefined,
  incoming: NipDeliveryStatus | null
): NipDeliveryStatus | null {
  if (!incoming) return null;
  const cur = current ?? "pending";
  if (cur === incoming) return incoming;
  if (cur === "delivered" || cur === "failed" || cur === "expired") return null;
  const forward: NipDeliveryStatus[] = ["pending", "sent", "delivered"];
  const curIdx = forward.indexOf(cur);
  const incIdx = forward.indexOf(incoming);
  if (curIdx === -1) return incoming;
  if (incIdx > curIdx) return incoming;
  return null; // degradación → ignorar
}

// ── PASO 5: política de regeneración y reenvío del NIP ────────────────
// Política propuesta (no existía una previa):
//  - Límite de regeneraciones por pedido: 3 (evita que un atacante genere NIPs infinitos).
//  - Cooldown entre regeneraciones: 10 minutos.
//  - Cooldown entre reenvíos: 60 segundos (idempotencia extra sobre el claim).
//  - TTL del NIP: 24 h desde creación/regeneración (ya definido en delivery-pin.ts).
export const NIP_REGENERATION_LIMIT = 3;
export const NIP_REGENERATION_COOLDOWN_MS = 10 * 60 * 1000;
export const NIP_RESEND_COOLDOWN_MS = 60 * 1000;

export function resolveRegeneration(
  order: { deliveryPinRegenCount?: number; deliveryPinRegenCooldownUntil?: string },
  now: Date = new Date()
): { ok: true } | { ok: false; reason: "limit" | "cooldown" } {
  const count = Number(order.deliveryPinRegenCount ?? 0);
  if (count >= NIP_REGENERATION_LIMIT) return { ok: false, reason: "limit" };
  if (
    order.deliveryPinRegenCooldownUntil &&
    new Date(order.deliveryPinRegenCooldownUntil).getTime() > now.getTime()
  ) {
    return { ok: false, reason: "cooldown" };
  }
  return { ok: true };
}

/**
 * Decide qué hace un reenvío: reutilizar el NIP vigente o regenerarlo.
 * - Reenvío: reutiliza el NIP vigente si no expiró.
 * - Regeneración: SOLO si el NIP expiró (o el llamador lo pidió explícitamente),
 *   y siempre sujeto a límite y cooldown de regeneración.
 * - El cooldown de reenvío aplica a ambos caminos.
 */
export function planNipResend(
  order: {
    deliveryPinExpiresAt?: string;
    deliveryPinRegenCount?: number;
    deliveryPinRegenCooldownUntil?: string;
    nipResendCooldownUntil?: string;
  },
  now: Date = new Date()
):
  | { ok: true; action: "resend" | "regenerate" }
  | { ok: false; reason: "resend_cooldown" | "regen_limit" | "regen_cooldown" } {
  if (
    order.nipResendCooldownUntil &&
    new Date(order.nipResendCooldownUntil).getTime() > now.getTime()
  ) {
    return { ok: false, reason: "resend_cooldown" };
  }
  const expired = !order.deliveryPinExpiresAt || new Date(order.deliveryPinExpiresAt).getTime() <= now.getTime();
  if (!expired) return { ok: true, action: "resend" };

  const regen = resolveRegeneration(order, now);
  if (!regen.ok) {
    return { ok: false, reason: regen.reason === "limit" ? "regen_limit" : "regen_cooldown" };
  }
  return { ok: true, action: "regenerate" };
}

/**
 * Llave de idempotencia del reenvío: estable por (orden, versión del NIP). Un
 * reenvío duplicado del mismo NIP reutiliza la misma llave (el claim deduplica);
 * una regeneración cambia `deliveryPinCreatedAt` → llave nueva.
 */
export function buildNipResendIdempotencyKey(orderId: string, deliveryPinCreatedAt?: string) {
  return `${orderId}:nip:reenvio:${String(deliveryPinCreatedAt || "v0")}`;
}
