export const SCHEDULED_ORDER_WHATSAPP_TEMPLATES = {
  orderConfirmed: {
    name: "cliente_pedido_programado",
    language: "es_MX",
    hasButtons: false,
    bodyVariables: [
      "customerName",
      "orderNumber",
      "storeName",
      "date",
      "time",
      "fulfillmentType",
      "total",
    ],
    buttons: [],
  },
  preparationStarted: {
    name: "cliente_pedido_programado_en_preparacion",
    language: "es_MX",
    hasButtons: true,
    bodyVariables: ["customerName", "orderNumber", "storeName", "time"],
    buttons: [{ index: 0, type: "url", text: "Ver mi pedido", dynamicParameters: 0 }],
  },
  noDriverAvailable: {
    name: "cliente_entrega_programada_sin_repartidor",
    language: "es_MX",
    hasButtons: true,
    bodyVariables: ["customerName", "orderNumber", "time"],
    buttons: [
      { index: 0, type: "quick_reply", text: "Esperar repartidor", dynamicParameters: 1 },
      { index: 1, type: "quick_reply", text: "Cambiar a recolección", dynamicParameters: 1 },
      { index: 2, type: "quick_reply", text: "Necesito ayuda", dynamicParameters: 1 },
    ],
  },
} as const;

export type ScheduledOrderTemplateKey = keyof typeof SCHEDULED_ORDER_WHATSAPP_TEMPLATES;
export type ScheduledOrderTemplateName =
  (typeof SCHEDULED_ORDER_WHATSAPP_TEMPLATES)[ScheduledOrderTemplateKey]["name"];

export function getScheduledOrderTemplate(templateName: ScheduledOrderTemplateName) {
  const template = Object.values(SCHEDULED_ORDER_WHATSAPP_TEMPLATES).find(
    (candidate) => candidate.name === templateName
  );
  if (!template) throw new Error(`Plantilla programada no permitida: ${templateName}`);
  return template;
}

export function buildScheduledOrderTemplateComponents(input: {
  templateName: ScheduledOrderTemplateName;
  bodyParameters: string[];
  buttonParameters?: string[];
}) {
  const template = getScheduledOrderTemplate(input.templateName);
  if (input.bodyParameters.length !== template.bodyVariables.length) {
    throw new Error(
      `${template.name} requiere ${template.bodyVariables.length} variables de cuerpo en orden.`
    );
  }

  const dynamicButtons = template.buttons.filter(
    (button) => button.dynamicParameters > 0
  );
  const buttonParameters = input.buttonParameters ?? [];
  if (!template.hasButtons && buttonParameters.length > 0) {
    throw new Error(`${template.name} no admite botones.`);
  }
  if (buttonParameters.length !== dynamicButtons.length) {
    throw new Error(
      `${template.name} requiere ${dynamicButtons.length} parametros de botones.`
    );
  }

  return {
    bodyParameters: input.bodyParameters,
    buttonComponents: dynamicButtons.map((button, index) => ({
      type: "button",
      sub_type: button.type,
      index: String(button.index),
      parameters: [{ type: "payload", payload: buttonParameters[index] }],
    })),
  };
}
