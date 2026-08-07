import "server-only";

import { appendOrderEvent } from "@/lib/order-events";
import {
  buildMandadoTemplateComponents,
  getMandadoTemplate,
  type MandadoTemplateName,
} from "@/lib/mandado-whatsapp-config";
import { normalizeWhatsAppPhone, sendWhatsAppTemplate } from "@/lib/whatsapp";
import { WHATSAPP_TEMPLATES } from "@/lib/whatsapp/templates";
import { backendClient } from "@/sanity/lib/backendClient";
import { createHash } from "node:crypto";

type MandadoWhatsAppOrder = {
  _id: string;
  phone?: string | null;
  orderNumber?: string;
  customerName?: string;
};

type MandadoNotification = MandadoWhatsAppOrder & {
  recipientPhone?: string | null;
  deliveryAddress?: string;
  orderStatus?: string;
};

async function claimDelivery(input: {
  orderId: string;
  idempotencyKey: string;
  templateName: string;
}) {
  const id = `whatsapp-delivery-${createHash("sha256")
    .update(input.idempotencyKey)
    .digest("hex")}`;
  const claimToken = crypto.randomUUID();
  let claim = await backendClient.createIfNotExists({
    _id: id,
    _type: "whatsappTemplateDelivery",
    order: { _type: "reference", _ref: input.orderId },
    idempotencyKey: input.idempotencyKey,
    templateName: input.templateName,
    status: "pending",
    claimToken,
    attemptedAt: new Date().toISOString(),
  });
  if (claim.status === "sent") return { id, claimed: false, reason: "duplicate" as const };
  if (claim.claimToken === claimToken) return { id, claimed: true };
  if (claim.status !== "failed") return { id, claimed: false, reason: "in_progress" as const };

  try {
    claim = await backendClient
      .patch(id)
      .ifRevisionId(claim._rev)
      .set({ status: "pending", claimToken, attemptedAt: new Date().toISOString() })
      .commit();
    return { id, claimed: claim.claimToken === claimToken };
  } catch {
    return { id, claimed: false, reason: "in_progress" as const };
  }
}

export async function sendMandadoWhatsAppTemplate(input: {
  order: MandadoWhatsAppOrder;
  templateName: MandadoTemplateName;
  bodyParameters: string[];
  buttonParameters?: string[];
  idempotencyKey: string;
  logicalEvent: string;
}) {
  const recipient = normalizeWhatsAppPhone(input.order.phone);
  if (!recipient) return { sent: false, reason: "invalid_phone" as const };
  const template = getMandadoTemplate(input.templateName);
  const components = buildMandadoTemplateComponents(input);
  const claim = await claimDelivery({
    orderId: input.order._id,
    idempotencyKey: input.idempotencyKey,
    templateName: template.name,
  });
  if (!claim.claimed) return { sent: false, reason: claim.reason };
  const eventBase = {
    templateName: template.name,
    recipient: `***${recipient.slice(-4)}`,
    logicalEvent: input.logicalEvent,
    idempotencyKey: input.idempotencyKey,
    sentAt: new Date().toISOString(),
  };

  try {
    const response = (await sendWhatsAppTemplate(
      recipient,
      template.name,
      components.bodyParameters,
      template.language,
      components.buttonComponents,
      120
    )) as { messages?: Array<{ id?: string }> };
    const metaMessageId = response.messages?.[0]?.id;
    await appendOrderEvent(input.order._id, {
      type: "whatsapp_template_sent",
      source: "mandado-whatsapp",
      payload: { ...eventBase, metaMessageId },
    });
    await backendClient.patch(claim.id).set({ status: "sent", sentAt: eventBase.sentAt, metaMessageId }).commit();
    return { sent: true, metaMessageId };
  } catch (error) {
    await appendOrderEvent(input.order._id, {
      type: "whatsapp_template_failed",
      source: "mandado-whatsapp",
      payload: {
        ...eventBase,
        errorCode:
          typeof error === "object" && error && "code" in error
            ? String(error.code)
            : undefined,
        errorMessage: error instanceof Error ? error.message.slice(0, 300) : "Error desconocido",
      },
    }).catch(() => null);
    await backendClient.patch(claim.id).set({
      status: "failed",
      failedAt: new Date().toISOString(),
      errorMessage: error instanceof Error ? error.message.slice(0, 300) : "Error desconocido",
    }).commit().catch(() => null);
    console.error("[mandado-whatsapp] envio fallido", {
      orderId: input.order._id,
      templateName: template.name,
      error,
    });
    return { sent: false, reason: "failed" as const };
  }
}

/**
 * Cliente (remitente): el mandado fue recogido y va en camino.
 * El mensaje explica que el destinatario deberá proporcionar el NIP para
 * recibir el paquete y que llegará otra notificación antes de la entrega
 * (cliente_repartidor_en_puerta con el NIP).
 */
// NOTA: los `idempotencyKey` embeben el nombre de la plantilla como identificador
// estable de evento. NO reemplazarlos por constantes de WHATSAPP_TEMPLATES:
// cambiarlos rompería la idempotencia de envíos ya registrados.
export function sendMandadoClienteRecogido(order: MandadoNotification) {
  return sendMandadoWhatsAppTemplate({
    order,
    templateName: WHATSAPP_TEMPLATES.mandadoCliente,
    bodyParameters: [
      order.customerName || "Cliente",
      `#${order.orderNumber || ""}`,
      order.deliveryAddress || "la dirección indicada",
    ],
    idempotencyKey: `${order._id}:mandado_cliente:recogido`,
    logicalEvent: "recogido_en_camino",
  });
}

/**
 * Destinatario (receptor): alguien le envió un mandado y está en camino.
 * NO requiere NIP para recibirlo.
 */
export function sendMandadoDestinatarioEnCamino(order: MandadoNotification) {
  return sendMandadoWhatsAppTemplate({
    order: { _id: order._id, phone: order.recipientPhone ?? null },
    templateName: WHATSAPP_TEMPLATES.mandadoDestinatario,
    bodyParameters: [
      order.customerName || "Un remitente",
      `#${order.orderNumber || ""}`,
    ],
    idempotencyKey: `${order._id}:mandado__destinatario:en_camino`,
    logicalEvent: "destinatario_en_camino",
  });
}

/**
 * Cliente (remitente): la orden está por completarse. Botón de Ayuda
 * para solicitar un agente si necesita asistencia.
 *
 * IMPORTANTE: el nombre de la plantilla (`orden_repartidor`) es heredado de
 * Meta y es engañoso, pero NO se envía al repartidor: SIEMPRE se envía al
 * cliente. No renombrar la plantilla; solo se envía a `order.phone`.
 */
export function sendMandadoOrdenPorCompletar(order: MandadoNotification) {
  return sendMandadoWhatsAppTemplate({
    order,
    templateName: WHATSAPP_TEMPLATES.ordenRepartidor,
    bodyParameters: [
      `#${order.orderNumber || ""}`,
      order.orderStatus || "por completarse",
    ],
    // Nota: el action se normaliza en el webhook (los _ se convierten en espacios),
    // por eso el payload usa "MANDADO AYUDA" igual que los botones "SCHEDULE *".
    buttonParameters: [`MANDADO AYUDA|${order._id}`],
    idempotencyKey: `${order._id}:orden_repartidor:en_puerta`,
    logicalEvent: "orden_por_completarse",
  });
}

/**
 * Cliente (remitente): no hay repartidor disponible para el mandado.
 * Ofrece esperar, cambiar a recolección o pedir ayuda.
 */
export function sendMandadoNoDriverAvailable(order: MandadoNotification) {
  return sendMandadoWhatsAppTemplate({
    order,
    templateName: WHATSAPP_TEMPLATES.clienteEntregaProgramadaSinRepartidor,
    bodyParameters: [
      order.customerName || "Cliente",
      `#${order.orderNumber || ""}`,
      "lo antes posible",
    ],
    buttonParameters: [
      `SCHEDULE WAIT|${order._id}`,
      `SCHEDULE PICKUP|${order._id}`,
      `SCHEDULE HELP|${order._id}`,
    ],
    idempotencyKey: `${order._id}:cliente_entrega_programada_sin_repartidor:mandado_contingencia`,
    logicalEvent: "contingencia_sin_repartidor",
  });
}
