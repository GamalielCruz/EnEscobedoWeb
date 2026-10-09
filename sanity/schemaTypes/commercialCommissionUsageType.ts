import { defineField, defineType } from "sanity";

export const commercialCommissionUsageType = defineType({
  name: "commercialCommissionUsage",
  title: "Consumo mensual de comisión",
  type: "document",
  fields: [
    defineField({ name: "store", title: "Restaurante", type: "reference", to: [{ type: "affiliateStore" }], readOnly: true }),
    defineField({ name: "period", title: "Periodo", type: "string", readOnly: true }),
    defineField({ name: "charged", title: "Comisión acumulada", type: "number", readOnly: true }),
    defineField({ name: "updatedAt", title: "Actualizado", type: "datetime", readOnly: true }),
  ],
});
