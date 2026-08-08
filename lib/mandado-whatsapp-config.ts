/**
 * Plantillas WhatsApp del flujo de Mandados.
 *
 * Los NOMBRES se importan desde `lib/whatsapp/templates.ts` (única fuente de
 * verdad); aquí solo se define el detalle de cada plantilla (idioma, variables
 * de cuerpo y botones) según lo aprobado en Meta.
 *
 * ── Flujo aprobado ──
 *  1. Cliente crea el mandado.
 *  2. Se asigna repartidor (si no hay: `cliente_entrega_programada_sin_repartidor`).
 *  3. El repartidor recoge el paquete.
 *  4. Se envía `mandado_cliente`  → remitente: recogido y en camino; explica que el
 *     destinatario deberá proporcionar el NIP para recibir el paquete.
 *  5. Se envía `mandado__destinatario` → destinatario: le enviaron un mandado.
 *     NO incluye NIP (el destinatario simplemente espera la llegada del repartidor).
 *  6. El repartidor llega al destino → se envía al CLIENTE (remitente):
 *     `cliente_repartidor_en_puerta` (definida en lib/whatsapp.ts) con el NIP para
 *     validar la entrega, y `orden_repartidor` (nombre heredado de Meta; va al CLIENTE,
 *     no al repartidor) que también lleva el NIP en su variable de cuerpo y ofrece el
 *     botón Ayuda.
 *  7. El remitente comparte el NIP con el destinatario por el medio que prefiera.
 *  8. El repartidor valida el NIP y se completa la orden.
 *
 * El NIP solo lo recibe el cliente (remitente). El sistema NUNCA envía el NIP al
 * destinatario ni al repartidor automáticamente.
 */
import { WHATSAPP_TEMPLATES } from "./whatsapp/templates.ts";

export const MANDADO_WHATSAPP_TEMPLATES = {
  /** Cliente (remitente): el mandado fue recogido y va en camino. */
  clientPickedUp: {
    name: WHATSAPP_TEMPLATES.mandadoCliente,
    language: "es_MX",
    hasButtons: false,
    bodyVariables: ["customerName", "orderNumber", "deliveryAddress"],
    buttons: [],
  },
  /** Receptor (destinatario): le enviaron un mandado; NO requiere código. */
  recipientOnTheWay: {
    name: WHATSAPP_TEMPLATES.mandadoDestinatario,
    language: "es_MX",
    hasButtons: false,
    bodyVariables: ["senderName", "orderNumber"],
    buttons: [],
  },
  /**
   * Cliente (remitente): la orden está por completarse, botón Ayuda.
   * El nombre `orden_repartidor` es heredado de Meta y es engañoso: esta
   * plantilla NO se envía al repartidor, SIEMPRE se envía al cliente.
   * La única variable de cuerpo es el NIP de la entrega: llega al cliente
   * (remitente) para que él lo comparta con el repartidor. El sistema nunca
   * envía el NIP al destinatario ni al repartidor automáticamente.
   */
  orderAboutToComplete: {
    name: WHATSAPP_TEMPLATES.ordenRepartidor,
    language: "es_MX",
    hasButtons: true,
    bodyVariables: ["deliveryPin"],
    buttons: [{ index: 0, type: "quick_reply", text: "Ayuda", dynamicParameters: 1 }],
  },
  /** Cliente: no hay repartidor disponible; 3 botones de contingencia. */
  noDriverAvailable: {
    name: WHATSAPP_TEMPLATES.clienteEntregaProgramadaSinRepartidor,
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
