/**
 * Acciones de operación/soporte sobre el NIP (PASO 5).
 *
 * - `regenerateDeliveryPin`: crea un NIP nuevo (invalida el anterior: nuevo hash,
 *   ciphertext, expiración 24 h, intentos en 0, sin bloqueo), con auditoría y con
 *   política anti-abuso: límite de 3 regeneraciones por pedido y cooldown de 10 min.
 * - `resendDeliveryPin`: reenvía el NIP VIGENTE al canal configurado (no regenera);
 *   solo regenera si el NIP expiró o el llamador lo pide explícitamente. Cooldown
 *   de 60 s entre reenvíos. Idempotente vía claim (`whatsappTemplateDelivery`) con
 *   llave estable por (orden, versión del NIP).
 *
 * Los valores de la política viven en `lib/nip-delivery.ts` (constantes puras,
 * testeadas) y se pueden ajustar sin tocar este archivo.
 */
import "server-only";

import { appendOrderEvent } from "@/lib/order-events";
import { createDeliveryPin, orderRequiresDeliveryPin, revealDeliveryPin } from "@/lib/delivery-pin";
import {
  NIP_REGENERATION_COOLDOWN_MS,
  NIP_RESEND_COOLDOWN_MS,
  planNipResend,
  resolveRegeneration,
} from "@/lib/nip-delivery";
import { sendMandadoNipToRecipient, sendMandadoOrdenPorCompletar } from "@/lib/mandado-whatsapp";
import { normalizeWhatsAppPhone } from "@/lib/whatsapp";
import { backendClient } from "@/sanity/lib/backendClient";

const NIP_ACTION_ORDER_QUERY = `*[_type == "order" && _id == $orderId][0]{
  _id,
  _rev,
  orderNumber,
  serviceKind,
  mandadoEntregaSegura,
  status,
  orderStatus,
  clerkUserId,
  mandadoNipRecipient,
  mandadoRecipientPhone,
  phone,
  customerName,
  deliveryPinCiphertext,
  deliveryPinCreatedAt,
  deliveryPinExpiresAt,
  deliveryPinRegenCount,
  deliveryPinRegenCooldownUntil,
  nipResendCooldownUntil,
  nipDeliveryStatus
}`;

type NipActionOrder = {
  _id: string;
  _rev: string;
  orderNumber: string;
  serviceKind?: string;
  mandadoEntregaSegura?: boolean;
  status?: string;
  orderStatus?: string;
  clerkUserId?: string;
  mandadoNipRecipient?: string;
  mandadoRecipientPhone?: string;
  phone?: string;
  customerName?: string;
  deliveryPinCiphertext?: string;
  deliveryPinCreatedAt?: string;
  deliveryPinExpiresAt?: string;
  deliveryPinRegenCount?: number;
  deliveryPinRegenCooldownUntil?: string;
  nipResendCooldownUntil?: string;
  nipDeliveryStatus?: string;
};

function isActiveOrder(order: NipActionOrder) {
  const terminal = ["cancelled", "delivered", "completed", "refunded", "picked_up"];
  return !terminal.includes(String(order.orderStatus || order.status));
}

async function loadOrder(orderId: string): Promise<NipActionOrder | null> {
  return (await backendClient.fetch(NIP_ACTION_ORDER_QUERY, { orderId })) as NipActionOrder | null;
}

/**
 * ¿Puede un usuario (Clerk) actuar sobre el NIP de esta orden?
 * - Admin/operación: siempre.
 * - Remitente (dueño de la orden): sí, para reenviar/regenerar su propio envío.
 *   El NIP jamás se devuelve al cliente en estas rutas (solo el estado del envío),
 *   así que el dueño puede reenviar incluso cuando el canal es el destinatario.
 */
export async function canUserActOnNipOrder(userId: string | null | undefined, orderId: string) {
  if (!userId) return false;
  const order = await loadOrder(orderId);
  if (!order) return false;
  return order.clerkUserId === userId;
}

function validateNipOrder(
  order: NipActionOrder | null
): { ok: true } | { ok: false; error: string } {
  if (!order) return { ok: false, error: "La orden no existe." };
  if (String(order.serviceKind ?? "") !== "mandado" || order.mandadoEntregaSegura !== true) {
    return { ok: false, error: "La orden no usa NIP (Entrega segura)." };
  }
  if (!orderRequiresDeliveryPin(order)) {
    return { ok: false, error: "La orden no requiere NIP en este momento." };
  }
  if (!isActiveOrder(order)) {
    return { ok: false, error: "La orden ya fue entregada o cancelada." };
  }
  return { ok: true };
}

async function sendNipToChannel(
  order: NipActionOrder,
  deliveryPin: string,
  idempotencySuffix: string
): Promise<{ ok: true; sent: boolean } | { ok: false; error: string }> {
  const channel = String(order.mandadoNipRecipient ?? "") === "recipient" ? "recipient" : "sender";
  if (channel === "recipient") {
    const recipientPhone = normalizeWhatsAppPhone(String(order.mandadoRecipientPhone ?? ""));
    if (!recipientPhone) {
      return { ok: false, error: "No hay teléfono del destinatario para enviar el código." };
    }
    const result = await sendMandadoNipToRecipient(
      {
        _id: order._id,
        phone: recipientPhone,
        recipientPhone,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        deliveryPin,
      },
      { idempotencySuffix }
    );
    return { ok: true, sent: result.sent };
  }
  const senderPhone = normalizeWhatsAppPhone(order.phone);
  if (!senderPhone) {
    return { ok: false, error: "No hay un WhatsApp válido del remitente para enviar el código." };
  }
  const result = await sendMandadoOrdenPorCompletar(
    {
      _id: order._id,
      phone: senderPhone,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      deliveryPin,
    },
    { idempotencySuffix }
  );
  return { ok: true, sent: result.sent };
}

export async function regenerateDeliveryPin(
  orderId: string,
  reason = "soporte"
): Promise<
  | { ok: true; orderNumber: string; sent: boolean; deliveryPinRegenCount: number }
  | { ok: false; error: string }
> {
  const order = await loadOrder(orderId);
  const valid = validateNipOrder(order);
  if (!valid.ok) return valid;

  const now = new Date();
  const regen = resolveRegeneration(order!, now);
  if (!regen.ok) {
    return {
      ok: false,
      error:
        regen.reason === "limit"
          ? "Límite de regeneraciones del código alcanzado (3 por pedido)."
          : "Espera antes de regenerar el código (cooldown de 10 minutos).",
    };
  }

  const previousPinCreatedAt = order!.deliveryPinCreatedAt;
  // Nuevo NIP: invalida el anterior (nuevo hash/ciphertext), reinicia intentos,
  // quita bloqueos y expira en 24 h desde ahora.
  const newPin = createDeliveryPin(order!.orderNumber, now);
  const nextCount = Number(order!.deliveryPinRegenCount ?? 0) + 1;
  const nowIso = now.toISOString();
  const regenCooldownUntil = new Date(now.getTime() + NIP_REGENERATION_COOLDOWN_MS).toISOString();
  const resendCooldownUntil = new Date(now.getTime() + NIP_RESEND_COOLDOWN_MS).toISOString();

  await backendClient
    .patch(orderId)
    .ifRevisionId(order!._rev)
    .set({
      deliveryPinHash: newPin.deliveryPinHash,
      deliveryPinCiphertext: newPin.deliveryPinCiphertext,
      deliveryPinCreatedAt: newPin.deliveryPinCreatedAt,
      deliveryPinExpiresAt: newPin.deliveryPinExpiresAt,
      deliveryPinAttemptCount: 0,
      deliveryVerificationStatus: "pending",
      nipDeliveryStatus: "pending",
      deliveryPinRegenCount: nextCount,
      deliveryPinRegenCooldownUntil: regenCooldownUntil,
      nipResendCooldownUntil: resendCooldownUntil,
      updatedAt: nowIso,
    })
    .unset(["deliveryPinLockedUntil", "deliveryPinVerifiedAt", "deliveryPinVerifiedBy"])
    .commit();

  await appendOrderEvent(orderId, {
    type: "delivery_pin_regen",
    source: "nip-actions",
    reason,
    payload: { previousPinCreatedAt, deliveryPinRegenCount: nextCount },
  }).catch(() => null);

  const pin = revealDeliveryPin(newPin.deliveryPinCiphertext);
  const sent = await sendNipToChannel(order!, pin, `reenvio:${newPin.deliveryPinCreatedAt}`);
  return {
    ok: true,
    orderNumber: order!.orderNumber,
    sent: sent.ok ? sent.sent : false,
    deliveryPinRegenCount: nextCount,
  };
}

export async function resendDeliveryPin(
  orderId: string,
  opts: { regenerate?: boolean; reason?: string } = {}
): Promise<
  | { ok: true; orderNumber: string; action: "resend" | "regenerate"; sent: boolean }
  | { ok: false; error: string }
> {
  const order = await loadOrder(orderId);
  const valid = validateNipOrder(order);
  if (!valid.ok) return valid;

  // Razón explícita: forzar regeneración (respetando límite/cooldown).
  if (opts.regenerate === true) {
    const result = await regenerateDeliveryPin(orderId, opts.reason ?? "reenvio_forzado");
    if (!result.ok) return result;
    return { ok: true, orderNumber: result.orderNumber, action: "regenerate", sent: result.sent };
  }

  const now = new Date();
  const plan = planNipResend(order!, now);
  if (!plan.ok) {
    if (plan.reason === "resend_cooldown") {
      return { ok: false, error: "Espera un momento antes de reenviar el código." };
    }
    if (plan.reason === "regen_limit") {
      return { ok: false, error: "El código expiró y ya se alcanzó el límite de regeneraciones (3 por pedido)." };
    }
    return { ok: false, error: "El código expiró. Espera antes de poder regenerarlo." };
  }

  // El NIP expiró: regenerar (razón explícita documentada).
  if (plan.action === "regenerate") {
    const result = await regenerateDeliveryPin(orderId, opts.reason ?? "nip_expirado");
    if (!result.ok) return result;
    return { ok: true, orderNumber: result.orderNumber, action: "regenerate", sent: result.sent };
  }

  // Reenvío del NIP vigente: reutiliza el MISMO código (no regenera).
  if (!order!.deliveryPinCiphertext) {
    return { ok: false, error: "La orden no tiene un NIP disponible." };
  }
  const pin = revealDeliveryPin(order!.deliveryPinCiphertext);
  const resendCooldownUntil = new Date(now.getTime() + NIP_RESEND_COOLDOWN_MS).toISOString();
  await backendClient
    .patch(orderId)
    .ifRevisionId(order!._rev)
    .set({ nipResendCooldownUntil: resendCooldownUntil, updatedAt: now.toISOString() })
    .commit();

  await appendOrderEvent(orderId, {
    type: "delivery_pin_resent",
    source: "nip-actions",
    reason: opts.reason ?? "soporte",
    payload: { deliveryPinCreatedAt: order!.deliveryPinCreatedAt },
  }).catch(() => null);

  const sent = await sendNipToChannel(order!, pin, `reenvio:${order!.deliveryPinCreatedAt}`);
  return { ok: true, orderNumber: order!.orderNumber, action: "resend", sent: sent.ok ? sent.sent : false };
}
