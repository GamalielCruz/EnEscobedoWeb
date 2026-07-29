import { defineField, defineType } from "sanity";

export const whatsappTemplateDeliveryType = defineType({
  name: "whatsappTemplateDelivery",
  title: "Envio de plantilla WhatsApp",
  type: "document",
  fields: [
    defineField({ name: "order", title: "Orden", type: "reference", to: [{ type: "order" }] }),
    defineField({ name: "idempotencyKey", title: "Llave de idempotencia", type: "string" }),
    defineField({ name: "templateName", title: "Plantilla", type: "string" }),
    defineField({ name: "status", title: "Estado", type: "string", options: { list: ["pending", "sent", "failed"] } }),
    defineField({ name: "claimToken", title: "Claim", type: "string", hidden: true }),
    defineField({ name: "attemptedAt", title: "Intentado", type: "datetime" }),
    defineField({ name: "sentAt", title: "Enviado", type: "datetime" }),
    defineField({ name: "failedAt", title: "Fallido", type: "datetime" }),
    defineField({ name: "metaMessageId", title: "Meta Message ID", type: "string" }),
    defineField({ name: "errorMessage", title: "Error", type: "string" }),
    defineField({ name: "simulated", title: "Simulado", type: "boolean" }),
  ],
});
