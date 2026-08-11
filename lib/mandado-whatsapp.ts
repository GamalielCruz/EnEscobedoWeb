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
  deliveryPin?: string | null;
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
 *
 * Se dispara con el comando PEDIDO EN DIRECCION AL DOMICILIO (para mandados
 * ese comando significa "paquete recogido + repartidor en traslado al destino";
 * NO existe un comando separado RECOGÍ).
 *
 * Variables según la plantilla aprobada:
 *   {{1}} = nombre del remitente
 *   {{2}} = DIRECCIÓN de destino (el texto de la plantilla la coloca tras 📍)
 *   {{3}} = folio de la orden
 *
 * El NIP (si la entrega es segura) llega después, SOLO al remitente, en
 * `orden_repartidor` (EN PUERTA). El destinatario nunca recibe NIP.
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
      order.deliveryAddress || "la dirección indicada",
      `#${order.orderNumber || ""}`,
    ],
    idempotencyKey: `${order._id}:mandado_cliente:recogido`,
    logicalEvent: "recogido_en_camino",
  });
}

/**
 * Destinatario (receptor): alguien le envió un mandado y está en camino.
 *
 * 0 variables de cuerpo: la plantilla aprobada es texto 100% estático en Meta
 * ("No necesitas proporcionar ningún código para recibirlo"). El NIP solo lo
 * recibe el remitente (vía `orden_repartidor` en EN PUERTA), quien lo comparte
 * con el destinatario si lo considera necesario.
 * Solo se envía si el cliente proporcionó el teléfono del destinatario
 * (`recipientPhone`); si no hay teléfono, no se envía y el pedido se completa igual.
 */
export function sendMandadoDestinatarioEnCamino(order: MandadoNotification) {
  return sendMandadoWhatsAppTemplate({
    order: { _id: order._id, phone: order.recipientPhone ?? null },
    templateName: WHATSAPP_TEMPLATES.mandadoDestinatario,
    bodyParameters: [],
    idempotencyKey: `${order._id}:mandado__destinatario:en_camino`,
    logicalEvent: "destinatario_en_camino",
  });
}

/**
 * Remitente: el repartidor llegó al destino del mandado.
 *
 * APROBADA en Meta. Dos variables de cuerpo: {{1}} dirección de destino y
 * {{2}} acción ("la entrega de tu mandado"). NO lleva NIP: el NIP viaja solo en
 * `orden_repartidor` (aprobada, con botón Ayuda), que se envía en el mismo
 * evento EN PUERTA del webhook. No reutilizar `cliente_repartidor_en_puerta`
 * (semántica de restaurantes).
 */
export function sendMandadoDestinoEnPuerta(order: MandadoNotification) {
  return sendMandadoWhatsAppTemplate({
    order,
    templateName: WHATSAPP_TEMPLATES.mandadoDestinoEnPuerta,
    bodyParameters: [
      order.deliveryAddress || "la dirección indicada",
      "la entrega de tu mandado",
    ],
    idempotencyKey: `${order._id}:mandado_destino_en_puerta:en_destino`,
    logicalEvent: "repartidor_en_destino",
  });
}

/**
 * Cliente (remitente): la orden está por completarse. Botón de Ayuda
 * para solicitar un agente si necesita asistencia.
 *
 * SOLO se envía cuando la orden requiere NIP (mandados con Entrega segura
 * activa); la decisión vive en lib/mandado-arrival.ts (webhook EN PUERTA).
 * Un mandado SIN Entrega segura nunca recibe esta plantilla.
 *
 * IMPORTANTE: el nombre de la plantilla (`orden_repartidor`) es heredado de
 * Meta y es engañoso, pero NO se envía al repartidor: SIEMPRE se envía al
 * cliente. No renombrar la plantilla; solo se envía a `order.phone`.
 *
 * La variable de cuerpo es el NIP de la entrega: llega al cliente (remitente)
 * para que él lo comparta con el repartidor. El sistema NUNCA envía el NIP al
 * destinatario ni al repartidor automáticamente.
 */
export function sendMandadoOrdenPorCompletar(order: MandadoNotification) {
  // Solo se llama cuando la orden requiere NIP (ver lib/mandado-arrival.ts).
  // Si el NIP no puede revelarse (anomalía de datos: Entrega segura activa sin
  // ciphertext), se omite el envío en lugar de mandar el folio como si fuera un
  // código de entrega, lo que confundiría al remitente.
  if (!order.deliveryPin) {
    console.warn("[mandado-whatsapp] orden_repartidor omitida: NIP requerido pero no disponible", {
      orderId: order._id,
      orderNumber: order.orderNumber,
    });
    return Promise.resolve({ sent: false, reason: "missing_pin" as const });
  }
  return sendMandadoWhatsAppTemplate({
    order,
    templateName: WHATSAPP_TEMPLATES.ordenRepartidor,
    bodyParameters: [String(order.deliveryPin)],
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
