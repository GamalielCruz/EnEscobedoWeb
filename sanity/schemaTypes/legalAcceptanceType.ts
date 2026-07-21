import { defineField, defineType } from "sanity";

export const legalAcceptanceType = defineType({
  name: "legalAcceptance",
  title: "Aceptación legal",
  type: "document",
  fields: [
    defineField({ name: "documentType", title: "Documento", type: "string", readOnly: true, validation: (Rule) => Rule.required() }),
    defineField({ name: "documentVersion", title: "Versión", type: "string", readOnly: true, validation: (Rule) => Rule.required() }),
    defineField({ name: "acceptedAt", title: "Aceptado", type: "datetime", readOnly: true, validation: (Rule) => Rule.required() }),
    defineField({ name: "userId", title: "Usuario", type: "string", readOnly: true, validation: (Rule) => Rule.required() }),
    defineField({ name: "role", title: "Rol", type: "string", readOnly: true }),
    defineField({ name: "acceptanceSource", title: "Origen", type: "string", readOnly: true }),
    defineField({ name: "ipHashOrLimitedIp", title: "Hash limitado de IP", type: "string", readOnly: true }),
    defineField({ name: "userAgentSummary", title: "Resumen de agente", type: "string", readOnly: true }),
  ],
});
