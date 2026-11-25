import "server-only";

import { appendOrderEvent } from "@/lib/order-events";
import {
  buildMandadoTemplateComponents,
  getMandadoTemplate,
  type MandadoTemplateName,
} from "@/lib/mandado-whatsapp-config";
import { normalizeWhatsAppPhone, sendWhatsAppTemplate } from "@/lib/whatsapp";
import { isNipCarrierTemplate } from "@/lib/nip-delivery";
import { updateOrderNipDeliveryStatus } from "@/lib/nip-delivery-store";
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
  if ((template as { pendingApproval?: boolean }).pendingApproval) {
    console.warn("[mandado-whatsapp] plantilla PENDIENTE de aprobación en Meta; el envío puede fallar", {
      orderId: input.order._id,
      templateName: template.name,
    });
  }
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
    // PASO 1/2: un 200 de Meta NO es entrega. La plantilla que transporta el NIP
    // pasa a `sent` aquí; solo la recepción real de `statuses` lo lleva a delivered.
    if (isNipCarrierTemplate(template.name)) {
      await updateOrderNipDeliveryStatus(input.order._id, "sent").catch(() => null);
    }
    console.log("[mandado-whatsapp] plantilla enviada", {
      orderId: input.order._id,
      templateName: template.name,
      logicalEvent: input.logicalEvent,
      idempotencyKey: input.idempotencyKey,
      recipient: eventBase.recipient,
      metaMessageId,
    });
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
    // PASO 1/2: si la plantilla transporta el NIP y el envío falló, el código NO
    // llegó al canal: el gate se cierra y la entrega queda como incidencia.
    if (isNipCarrierTemplate(template.name)) {
      await updateOrderNipDeliveryStatus(input.order._id, "failed").catch(() => null);
    }
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
 * Destinatario (receptor): el repartidor llegó con su mandado.
 *
 * La variable {{1}} confirma la llegada y, cuando el canal de Entrega segura
 * es el destinatario, incluye el NIP para confirmar la entrega.
 * Solo se envía si el cliente proporcionó el teléfono del destinatario.
 */
export function sendMandadoDestinatarioEnPuerta(
  order: MandadoNotification & { recipientMessage: string },
  opts: { idempotencySuffix?: string } = {}
) {
  return sendMandadoWhatsAppTemplate({
    order: { _id: order._id, phone: order.recipientPhone ?? null },
    templateName: WHATSAPP_TEMPLATES.mandadoDestinatario,
    bodyParameters: [order.recipientMessage],
    idempotencyKey: `${order._id}:mandado__destinatario:${opts.idempotencySuffix ?? "en_puerta"}`,
    logicalEvent: "destinatario_en_puerta",
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
 *
 * Un mandado tiene DOS llegadas en EN PUERTA y cada una es un evento
 * idempotente DISTINTO (clave propia): la 1ª llegada (punto de recolección,
 * `orderStatus: "pickup"` → "recoger tu paquete") usa el suffix `recogido`; la
 * 2ª llegada (destino, → "la entrega de tu mandado") usa el suffix por defecto
 * `en_destino`. Si compartieran clave, la segunda llegada se descartaría como
 * duplicado por claimDelivery.
 */
export function sendMandadoDestinoEnPuerta(
  order: MandadoNotification,
  opts: { idempotencySuffix?: string } = {}
) {
  return sendMandadoWhatsAppTemplate({
    order,
    templateName: WHATSAPP_TEMPLATES.mandadoDestinoEnPuerta,
    bodyParameters: [
      order.deliveryAddress || "la dirección indicada",
      order.orderStatus === "pickup" ? "recoger tu paquete" : "la entrega de tu mandado",
    ],
    idempotencyKey: `${order._id}:mandado_destino_en_puerta:${opts.idempotencySuffix ?? "en_destino"}`,
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
export function sendMandadoOrdenPorCompletar(
  order: MandadoNotification,
  opts: { idempotencySuffix?: string } = {}
) {
  // Solo se llama cuando la orden requiere NIP Y el canal es el remitente
  // (ver lib/mandado-arrival.ts). Si el NIP no puede revelarse (anomalía de
  // datos: Entrega segura activa sin ciphertext), se omite el envío en lugar de
  // mandar el folio como si fuera un código de entrega.
  if (!order.deliveryPin) {
    console.warn("[mandado-whatsapp] orden_repartidor omitida: NIP requerido pero no disponible", {
      orderId: order._id,
      orderNumber: order.orderNumber,
    });
    // Anomalía de datos (Entrega segura activa sin ciphertext): el código no
    // puede comunicarse; el gate queda cerrado y la entrega se escala a soporte.
    void updateOrderNipDeliveryStatus(order._id, "failed").catch(() => null);
    return Promise.resolve({ sent: false, reason: "missing_pin" as const });
  }
  return sendMandadoWhatsAppTemplate({
    order,
    templateName: WHATSAPP_TEMPLATES.ordenRepartidor,
    bodyParameters: [String(order.deliveryPin)],
    // Nota: el action se normaliza en el webhook (los _ se convierten en espacios),
    // por eso el payload usa "MANDADO AYUDA" igual que los botones "SCHEDULE *".
    buttonParameters: [`MANDADO AYUDA|${order._id}`],
    idempotencyKey: `${order._id}:orden_repartidor:${opts.idempotencySuffix ?? "en_puerta"}`,
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
