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
 *  3. El repartidor recoge el paquete (comando PEDIDO EN DIRECCION AL DOMICILIO:
 *     para mandados significa "recogido + en camino al destino"; no hay comando RECOGÍ).
 *  4. Se envía `mandado_cliente`  → remitente: recogido y en camino.
 *     Variables: {{1}} nombre, {{2}} DIRECCIÓN de destino (tras el 📍), {{3}} folio.
 *  5. Se envía `mandado__destinatario` → destinatario: le enviaron un mandado.
 *     0 variables (texto estático en Meta: no necesita proporcionar código).
 *     El NIP solo lo recibe el remitente. Solo se envía si el cliente
 *     proporcionó el teléfono del destinatario.
 *  6. El repartidor llega al destino → se envía al CLIENTE (remitente):
 *     `mandado_destino_en_puerta` (APROBADA en Meta: dirección de destino +
 *     acción, sin NIP), SIEMPRE para mandados. Si la entrega es SEGURA
 *     (requiere NIP), además se envía `orden_repartidor` (nombre heredado de
 *     Meta; va al CLIENTE, no al repartidor) que lleva el NIP y ofrece el botón
 *     Ayuda. Un mandado SIN Entrega segura nunca recibe instrucciones de NIP.
 *     NO se reutiliza `cliente_repartidor_en_puerta` (semántica de restaurantes).
 *  7. El remitente comparte el NIP con el destinatario por el medio que prefiera.
 *  8. El repartidor valida el NIP y se completa la orden.
 *  9. Al completarse, el remitente recibe `pedido_entregado` (plantilla compartida
 *     con restaurantes): {{1}} nombre del remitente, {{2}} folio, sin NIP.
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
    // Orden según la plantilla aprobada: el texto coloca la dirección tras 📍
    // ({{2}}) y el folio en {{3}}.
    bodyVariables: ["customerName", "deliveryAddress", "orderNumber"],
    buttons: [],
  },
  /**
   * Receptor (destinatario): le enviaron un mandado.
   * 0 variables de cuerpo: la plantilla aprobada es texto 100% estático en Meta
   * ("No necesitas proporcionar ningún código para recibirlo"). El NIP solo lo
   * recibe el remitente (vía `orden_repartidor` en EN PUERTA). Solo se envía si
   * el cliente proporcionó el teléfono del destinatario; si no, el pedido se
   * completa igual.
   */
  recipientOnTheWay: {
    name: WHATSAPP_TEMPLATES.mandadoDestinatario,
    language: "es_MX",
    hasButtons: false,
    bodyVariables: [],
    buttons: [],
  },
  /**
   * Cliente (remitente): la orden está por completarse, botón Ayuda.
   * SOLO se envía cuando la orden requiere NIP (mandados con Entrega segura
   * activa); si no, el remitente recibe únicamente `mandado_destino_en_puerta`.
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
  /**
   * Cliente (remitente): repartidor llegó al destino del mandado.
   * APROBADA en Meta. Dos variables de cuerpo: {{1}} dirección de destino y
   * {{2}} acción ("la entrega de tu mandado"). NO lleva NIP: el NIP viaja solo
   * en `orden_repartidor` (que se envía en el mismo evento EN PUERTA). No
   * reutilizar `cliente_repartidor_en_puerta` (semántica de restaurantes).
   */
  destinoEnPuerta: {
    name: WHATSAPP_TEMPLATES.mandadoDestinoEnPuerta,
    language: "es_MX",
    hasButtons: false,
    bodyVariables: ["deliveryAddress", "deliveryAction"],
    buttons: [],
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
