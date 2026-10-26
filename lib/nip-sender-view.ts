/**
 * View model de la experiencia del REMITENTE en /orders (ciclo de vida del NIP).
 *
 * Módulo PURO (sin Sanity ni server-only) para testear con node. Traduce el
 * estado crudo de la orden (nipDeliveryStatus, deliveryVerificationStatus,
 * expiración, cooldowns, canal) a una vista humana que la UI muestra tal cual.
 *
 * Reglas de seguridad de producto (CASOS 1-8):
 *  - NUNCA se muestra el NIP al remitente cuando el canal es "recipient":
 *    el código pertenece al acto de entrega y a la persona autorizada (destinatario).
 *  - En canal "sender" el código SÍ puede revelarse (respetando la lógica segura
 *    de lectura del ciphertext, que vive en el servidor /orders): el remitente es
 *    el receptor del código y responsable de proporcionárselo al destinatario.
 *  - "pending" nunca se presenta como enviado/entregado.
 *  - La expiración del NIP es independiente del mensaje (AJUSTE 3): un mensaje
 *    delivered no mantiene válido un NIP expirado.
 *
 * Los botones [Reenviar código] y [Generar nuevo código] se derivan de la misma
 * política que el backend (lib/nip-delivery.ts): reenvío reutiliza el NIP vigente,
 * regeneración SOLO si expiró, con límite (3) y cooldown (10 min).
 */
import { orderRequiresDeliveryPin } from "./delivery-pin.ts";
import { effectiveNipStatus, planNipResend } from "./nip-delivery.ts";

export type NipSenderViewStatus =
  | "no_pin"
  | "pending"
  | "sent"
  | "delivered"
  | "failed"
  | "expired"
  | "verified";

export type NipSenderView = {
  /** Estado visible (humano, sin términos de Meta). */
  status: NipSenderViewStatus;
  /** Etiqueta corta para la tarjeta: Pendiente/Enviado/Entregado/Error/Expirado/Verificado. */
  statusLabel: string;
  /** Título principal de la tarjeta. */
  title: string;
  /** Explicación humana de qué está pasando / qué debe hacer el remitente. */
  message: string;
  /** Canal configurado del NIP (null si no requiere NIP). */
  channel: "sender" | "recipient" | null;
  recipientName?: string;
  /** Teléfono del destinatario enmascarado (******1234), solo canal recipient. */
  recipientPhoneMasked?: string;
  /**
   * ¿Puede la UI revelar el NIP al remitente?
   * Solo canal "sender" con el mensaje al menos enviado (sent/delivered/failed):
   * en "recipient" NUNCA, y en "pending" el código no fue entregado a nadie.
   */
  showPinToSender: boolean;
  /** ¿El remitente puede reenviar AHORA (cooldown de reenvío libre, NIP vigente)? */
  canResend: boolean;
  /** ¿El remitente puede generar un NIP nuevo AHORA (expiró + política libre)? */
  canRegenerate: boolean;
  /** Segundos restantes de cooldown de reenvío (0 = libre). */
  resendCooldownSeconds: number;
  /** Segundos restantes de cooldown de regeneración (0 = libre). */
  regenCooldownSeconds: number;
  /** Se alcanzó el límite de regeneraciones (3 por pedido). */
  regenLimitReached: boolean;
  /** Canal "sender" porque el destinatario no utiliza WhatsApp (declarado). */
  fallbackToSender: boolean;
  /** Recordatorio de responsabilidad cuando el canal es el remitente. */
  senderResponsibilityNote?: string;
};

export const NIP_STATUS_LABELS: Record<NipSenderViewStatus, string> = {
  no_pin: "Sin código",
  pending: "Pendiente",
  sent: "Enviado",
  delivered: "Entregado",
  failed: "Error",
  expired: "Expirado",
  verified: "Verificado",
};

/** Enmascara un teléfono mostrando solo los últimos 4 dígitos: ******1234. */
export function maskPhone(phone?: string | null): string | undefined {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return undefined;
  if (digits.length <= 4) return "******" + digits;
  return "******" + digits.slice(-4);
}

function remainingSeconds(until: string | undefined, now: Date): number {
  if (!until) return 0;
  const ms = new Date(until).getTime() - now.getTime();
  return ms > 0 ? Math.ceil(ms / 1000) : 0;
}

/**
 * Construye la vista del remitente para /orders.
 * Recibe la orden cruda (campos de Sanity) y devuelve todo lo que la UI necesita,
 * sin exponer estados técnicos (metaMessageId, HTTP 131030, pending claim, etc.).
 */
export function buildNipSenderView(
  order: {
    serviceKind?: string;
    mandadoEntregaSegura?: boolean;
    deliveryVerificationMethod?: string;
    deliveryVerificationStatus?: string;
    nipDeliveryStatus?: string;
    deliveryPinExpiresAt?: string;
    deliveryPinRegenCount?: number;
    deliveryPinRegenCooldownUntil?: string;
    nipResendCooldownUntil?: string;
    mandadoNipRecipient?: string;
    nipDeliveryChannel?: string;
    mandadoRecipientWhatsAppDeclared?: boolean;
    mandadoRecipientName?: string;
    mandadoRecipientPhone?: string;
  },
  now: Date = new Date()
): NipSenderView {
  const requiresPin = orderRequiresDeliveryPin(order);
  if (!requiresPin) {
    return {
      status: "no_pin",
      statusLabel: NIP_STATUS_LABELS.no_pin,
      title: "Entrega sin código",
      message: "Esta entrega no utiliza código de verificación.",
      channel: null,
      showPinToSender: false,
      canResend: false,
      canRegenerate: false,
      resendCooldownSeconds: 0,
      regenCooldownSeconds: 0,
      regenLimitReached: false,
      fallbackToSender: false,
    };
  }

  // Canal EFECTIVO (endurecimiento B): `nipDeliveryChannel` persistido decide;
  // órdenes legadas sin el campo → el responsable (`mandadoNipRecipient`); sin
  // ambos → sender (comportamiento actual). `none` cae al responsable/legado:
  // la situación real la transmite el estado del mensaje (pending/failed).
  const channel: "sender" | "recipient" =
    String(order.nipDeliveryChannel ?? "") === "whatsapp_recipient"
      ? "recipient"
      : String(order.nipDeliveryChannel ?? "") === "whatsapp_sender"
        ? "sender"
        : String(order.mandadoNipRecipient ?? "") === "recipient"
          ? "recipient"
          : "sender";
  const fallbackToSender =
    channel === "sender" && order.mandadoRecipientWhatsAppDeclared === false;
  const recipientPhoneMasked =
    channel === "recipient" ? maskPhone(order.mandadoRecipientPhone) : undefined;

  // Estado EFECTIVO canónico (verificado > expirado > estado del mensaje):
  // la misma evaluación que usan el gate de entrega y el Dispatch Center, para
  // que /orders, la operación y el repartidor NUNCA diverjan.
  const status = effectiveNipStatus(order, now);

  const plan = planNipResend(order, now);
  const canResend = plan.ok && plan.action === "resend";
  const canRegenerate = plan.ok && plan.action === "regenerate";
  const regenLimitReached = plan.ok === false && plan.reason === "regen_limit";

  const base: NipSenderView = {
    status,
    statusLabel: NIP_STATUS_LABELS[status],
    title: "",
    message: "",
    channel,
    recipientName: order.mandadoRecipientName,
    recipientPhoneMasked,
    showPinToSender: false,
    canResend,
    canRegenerate,
    resendCooldownSeconds: remainingSeconds(order.nipResendCooldownUntil, now),
    regenCooldownSeconds: remainingSeconds(order.deliveryPinRegenCooldownUntil, now),
    regenLimitReached,
    fallbackToSender,
    senderResponsibilityNote: channel === "sender"
      ? "Debes comunicar el código al destinatario antes de la entrega."
      : undefined,
  };

  switch (status) {
    case "pending":
      base.title = "Código pendiente de entrega";
      base.message = "Estamos preparando el código de entrega.";
      break;
    case "sent":
      base.title = "Código de entrega enviado";
      base.message =
        channel === "recipient"
          ? "El código fue enviado al WhatsApp del destinatario."
          : "El código fue enviado a tu WhatsApp.";
      base.showPinToSender = channel === "sender";
      break;
    case "delivered":
      base.title = "Código de entrega enviado";
      base.message =
        channel === "recipient"
          ? "El código fue entregado al WhatsApp del destinatario."
          : "El código fue entregado a tu WhatsApp.";
      base.showPinToSender = channel === "sender";
      break;
    case "failed":
      base.title = "No pudimos entregar el código";
      base.message = "El código no llegó al canal de comunicación configurado.";
      // Canal remitente: el código existe y el remitente es el receptor autorizado;
      // mostrarlo le permite completar la entrega manualmente (seguridad de lectura
      // del ciphertext resuelta en el servidor de /orders).
      base.showPinToSender = channel === "sender";
      break;
    case "expired":
      base.title = "El código expiró";
      base.message = "Genera un nuevo código antes de continuar con la entrega.";
      break;
    case "verified":
      base.title = "Entrega verificada";
      base.message = "El código de entrega fue validado correctamente.";
      break;
  }

  if (fallbackToSender && (status === "sent" || status === "delivered")) {
    base.message =
      "El destinatario no utiliza WhatsApp. Por eso recibirás tú el código y deberás proporcionárselo al destinatario.";
  }

  return base;
}
