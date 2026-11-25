import { CogIcon } from "@sanity/icons";
import { defineField, defineType } from "sanity";

const planFields = [
  defineField({ name: "commissionPercent", title: "Comisión (%)", type: "number", validation: (Rule) => Rule.required().min(0).max(100) }),
  defineField({ name: "monthlyCommissionCap", title: "Tope mensual (MXN)", type: "number", description: "0 significa sin tope.", validation: (Rule) => Rule.required().min(0) }),
  defineField({ name: "serviceFeeMode", title: "Tarifa de servicio", type: "string", options: { list: [{ title: "Normal", value: "normal" }, { title: "Reducida", value: "reduced" }, { title: "Gratuita", value: "free" }] }, validation: (Rule) => Rule.required() }),
  defineField({ name: "onlinePaymentsEnabled", title: "Pagos en línea", type: "boolean" }),
  defineField({ name: "premiumBadgeEnabled", title: "Badge ElMenu Verificado", type: "boolean" }),
  defineField({ name: "bannerEligible", title: "Elegible para banner", type: "boolean" }),
  defineField({ name: "promotionalMessagesEnabled", title: "Frases para clientes", type: "boolean", description: "Muestra en la tarjeta las frases configuradas en Sanity, rotando cada 5 segundos." }),
  defineField({ name: "deliveryBenefitEnabled", title: "Beneficio de envío", type: "boolean" }),
  defineField({ name: "deliveryDiscountAmount", title: "Descuento de envío (MXN)", type: "number", validation: (Rule) => Rule.required().min(0) }),
  defineField({ name: "deliveryBenefitAbsorbedBy", title: "Quién absorbe el beneficio", type: "string", options: { list: [{ title: "ElMenu", value: "platform" }, { title: "Restaurante", value: "restaurant" }] }, validation: (Rule) => Rule.required() }),
];

export const commercialSettingsType = defineType({
  name: "commercialSettings",
  title: "Configuración comercial",
  type: "document",
  icon: CogIcon,
  fields: [
    defineField({ name: "serviceFeeNormal", title: "Tarifa de servicio normal (MXN)", type: "number", validation: (Rule) => Rule.required().min(0) }),
    defineField({ name: "serviceFeeNormalEnabled", title: "Tarifa normal activa", type: "boolean", initialValue: true }),
    defineField({ name: "serviceFeeReduced", title: "Tarifa de servicio reducida (MXN)", type: "number", validation: (Rule) => Rule.required().min(0) }),
    defineField({ name: "serviceFeeReducedEnabled", title: "Tarifa reducida activa", type: "boolean", initialValue: true }),
    defineField({
      name: "plans",
      title: "Planes",
      type: "object",
      fields: [
        defineField({ name: "community", title: "Plan Comunidad", type: "object", fields: planFields }),
        defineField({ name: "premium", title: "Plan Premium del 10%", type: "object", fields: planFields }),
      ],
    }),
    defineField({ name: "updatedAt", title: "Actualizado", type: "datetime", readOnly: true }),
    defineField({ name: "updatedBy", title: "Administrador", type: "string", readOnly: true }),
  ],
});
