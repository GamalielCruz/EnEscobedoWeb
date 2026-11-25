import { defineField, defineType } from "sanity";

export const commercialAuditType = defineType({
  name: "commercialAudit",
  title: "Auditoría comercial",
  type: "document",
  fields: [
    defineField({ name: "action", title: "Cambio", type: "string", readOnly: true }),
    defineField({ name: "store", title: "Restaurante", type: "reference", to: [{ type: "affiliateStore" }], readOnly: true }),
    defineField({ name: "previousValue", title: "Valor anterior", type: "text", readOnly: true }),
    defineField({ name: "newValue", title: "Valor nuevo", type: "text", readOnly: true }),
    defineField({ name: "adminUserId", title: "Administrador", type: "string", readOnly: true }),
    defineField({ name: "changedAt", title: "Fecha", type: "datetime", readOnly: true }),
  ],
  preview: { select: { title: "action", subtitle: "changedAt" } },
});
