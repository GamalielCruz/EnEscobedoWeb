/**
 * Plantillas WhatsApp del flujo de Mandados.
 *
 * NIP (validación de entrega):
 *  - El NIP se genera al crear la orden (lib/delivery-pin.ts) y se envía al
 *    cliente mediante la plantilla `cliente_repartidor_en_puerta` cuando el
 *    repartidor llega a la puerta (ver lib/whatsapp.ts y el webhook).
 *  - `mandado_cliente` avisa que el destinatario deberá proporcionar el NIP.
 *  - `mandado__destinatario` NO incluye NIP: solo notifica al receptor.
 *  - `orden_repartidor` confirma el estado de la orden y ofrece el botón Ayuda.
 *
 * Los nombres deben coincidir EXACTAMENTE con las plantillas aprobadas en Meta.
 */
export const MANDADO_WHATSAPP_TEMPLATES = {
  /** Cliente (remitente): el mandado fue recogido y va en camino. */
  clientPickedUp: {
    name: "mandado_cliente",
    language: "es_MX",
    hasButtons: false,
    bodyVariables: ["customerName", "orderNumber", "deliveryAddress"],
    buttons: [],
  },
  /** Receptor (destinatario): le enviaron un mandado; NO requiere código. */
  recipientOnTheWay: {
    name: "mandado__destinatario",
    language: "es_MX",
    hasButtons: false,
    bodyVariables: ["senderName", "orderNumber"],
    buttons: [],
  },
  /** Cliente (remitente): la orden está por completarse, botón Ayuda. */
  orderAboutToComplete: {
    name: "orden_repartidor",
    language: "es_MX",
    hasButtons: true,
    bodyVariables: ["orderNumber", "orderStatus"],
    buttons: [{ index: 0, type: "quick_reply", text: "Ayuda", dynamicParameters: 1 }],
  },
  /** Cliente: no hay repartidor disponible; 3 botones de contingencia. */
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

export type MandadoTemplateKey = keyof typeof MANDADO_WHATSAPP_TEMPLATES;
export type MandadoTemplateName =
  (typeof MANDADO_WHATSAPP_TEMPLATES)[MandadoTemplateKey]["name"];

export function getMandadoTemplate(templateName: MandadoTemplateName) {
  const template = Object.values(MANDADO_WHATSAPP_TEMPLATES).find(
    (candidate) => candidate.name === templateName
  );
  if (!template) throw new Error(`Plantilla de mandado no permitida: ${templateName}`);
  return template;
}

export function buildMandadoTemplateComponents(input: {
  templateName: MandadoTemplateName;
  bodyParameters: string[];
  buttonParameters?: string[];
}) {
  const template = getMandadoTemplate(input.templateName);
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
