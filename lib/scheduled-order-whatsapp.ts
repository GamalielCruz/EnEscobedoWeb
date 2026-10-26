import "server-only";

import { isProductionDeployment } from "@/lib/deployment-environment";
import { appendOrderEvent } from "@/lib/order-events";
import {
  buildScheduledOrderTemplateComponents,
  getScheduledOrderTemplate,
  type ScheduledOrderTemplateName,
} from "@/lib/scheduled-order-whatsapp-config";
import { normalizeWhatsAppPhone, sendWhatsAppTemplate } from "@/lib/whatsapp";
import { WHATSAPP_TEMPLATES } from "@/lib/whatsapp/templates";
import { backendClient } from "@/sanity/lib/backendClient";
import { createHash } from "node:crypto";

type ScheduledWhatsAppOrder = {
  _id: string;
  phone?: string | null;
};

type ScheduledOrderNotification = ScheduledWhatsAppOrder & {
  orderNumber?: string;
  customerName?: string;
  orderType?: "delivery" | "pickup";
  scheduledSlot?: { startAt?: string; endAt?: string };
  grossTotal?: number;
  totalPrice?: number;
  storeName?: string;
};

function scheduleLabels(order: ScheduledOrderNotification) {
  const start = new Date(String(order.scheduledSlot?.startAt || ""));
  const end = new Date(String(order.scheduledSlot?.endAt || ""));
  const date = new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Mexico_City",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(start);
  const time = new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Mexico_City",
    hour: "2-digit",
    minute: "2-digit",
  });
  return { date, time: `${time.format(start)} - ${time.format(end)}`, startTime: time.format(start) };
}

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

export async function sendScheduledOrderWhatsAppTemplate(input: {
  order: ScheduledWhatsAppOrder;
  templateName: ScheduledOrderTemplateName;
  bodyParameters: string[];
  buttonParameters?: string[];
  idempotencyKey: string;
  logicalEvent: string;
}) {
  const recipient = normalizeWhatsAppPhone(input.order.phone);
  if (!recipient) return { sent: false, reason: "invalid_phone" as const };
  const template = getScheduledOrderTemplate(input.templateName);
  const components = buildScheduledOrderTemplateComponents(input);
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
    if (!isProductionDeployment()) {
      console.info("[scheduled-order-whatsapp] envio simulado", {
        templateName: template.name,
        language: template.language,
        bodyParameters: components.bodyParameters,
        buttonComponents: components.buttonComponents,
      });
      await appendOrderEvent(input.order._id, {
        type: "whatsapp_template_sent",
        source: "scheduled-order-whatsapp",
        payload: { ...eventBase, simulated: true },
      });
      await backendClient.patch(claim.id).set({ status: "sent", sentAt: eventBase.sentAt, simulated: true }).commit();
      return { sent: true, simulated: true };
    }

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
      source: "scheduled-order-whatsapp",
      payload: { ...eventBase, metaMessageId },
    });
    await backendClient.patch(claim.id).set({ status: "sent", sentAt: eventBase.sentAt, metaMessageId }).commit();
    return { sent: true, metaMessageId };
  } catch (error) {
    await appendOrderEvent(input.order._id, {
      type: "whatsapp_template_failed",
      source: "scheduled-order-whatsapp",
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
    console.error("[scheduled-order-whatsapp] envio fallido", {
      orderId: input.order._id,
      templateName: template.name,
      error,
    });
    return { sent: false, reason: "failed" as const };
  }
}

export function sendScheduledOrderConfirmation(order: ScheduledOrderNotification) {
  const labels = scheduleLabels(order);
  return sendScheduledOrderWhatsAppTemplate({
    order,
    templateName: WHATSAPP_TEMPLATES.clientePedidoProgramado,
    bodyParameters: [
      order.customerName || "Cliente",
      `#${order.orderNumber || ""}`,
      order.storeName || "Restaurante",
      labels.date,
      labels.time,
      order.orderType === "pickup" ? "Recolección" : "Entrega a domicilio",
      Number(order.grossTotal ?? order.totalPrice ?? 0).toFixed(2),
    ],
    idempotencyKey: `${order._id}:cliente_pedido_programado:confirmed`,
    logicalEvent: "confirmed",
  });
}

export function sendScheduledOrderPreparationStarted(order: ScheduledOrderNotification) {
  const labels = scheduleLabels(order);
  return sendScheduledOrderWhatsAppTemplate({
    order,
    templateName: WHATSAPP_TEMPLATES.clientePedidoProgramadoEnPreparacion,
    bodyParameters: [
      order.customerName || "Cliente",
      `#${order.orderNumber || ""}`,
      order.storeName || "Restaurante",
      labels.startTime,
    ],
    idempotencyKey: `${order._id}:cliente_pedido_programado_en_preparacion:preparation_started`,
    logicalEvent: "preparation_started",
  });
}

export function sendScheduledOrderNoDriver(order: ScheduledOrderNotification) {
  const labels = scheduleLabels(order);
  return sendScheduledOrderWhatsAppTemplate({
    order,
    templateName: WHATSAPP_TEMPLATES.clienteEntregaProgramadaSinRepartidor,
    bodyParameters: [
      order.customerName || "Cliente",
      `#${order.orderNumber || ""}`,
      labels.startTime,
    ],
    buttonParameters: [
      `SCHEDULE WAIT|${order._id}`,
      `SCHEDULE PICKUP|${order._id}`,
      `SCHEDULE HELP|${order._id}`,
    ],
    idempotencyKey: `${order._id}:cliente_entrega_programada_sin_repartidor:contingency`,
    logicalEvent: "contingency",
  });
}
