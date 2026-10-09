import { defineField, defineType } from "sanity";

export const DISPATCH_CONFIG_DOCUMENT_ID = "dispatchConfig";

export const dispatchConfigType = defineType({
  name: "dispatchConfig",
  title: "Dispatch Center",
  type: "document",
  fields: [
    defineField({
      name: "mode",
      title: "Modo de despacho",
      type: "string",
      initialValue: "auto",
      options: {
        list: [
          { title: "Automático", value: "auto" },
          { title: "Manual", value: "manual" },
          { title: "Asistido", value: "assisted" },
        ],
      },
      description:
        "auto: el algoritmo ofrece pedidos por WhatsApp automáticamente. manual: el operador asigna desde el Dispatch Center. asistido: el sistema recomienda, el operador decide.",
    }),
    defineField({ name: "maxDistanceKm", title: "Distancia máxima de reparto (km)", type: "number", initialValue: 8 }),
    defineField({ name: "searchRadiusKm", title: "Radio de búsqueda de repartidores (km)", type: "number", initialValue: 6 }),
    defineField({ name: "maxOrdersPerDriver", title: "Máximo de pedidos por repartidor", type: "number", initialValue: 3 }),
    defineField({ name: "maxWaitMinutesBeforeEscalate", title: "Tiempo máximo antes de escalar (min)", type: "number", initialValue: 20 }),
    defineField({ name: "prioritizeMandados", title: "Prioridad: Mandados", type: "boolean", initialValue: false }),
    defineField({ name: "prioritizeRestaurants", title: "Prioridad: Restaurantes", type: "boolean", initialValue: false }),
    defineField({ name: "allowMultipleOrders", title: "Permitir múltiples pedidos por repartidor", type: "boolean", initialValue: true }),
    defineField({ name: "allowMixStores", title: "Permitir mezclar restaurantes distintos", type: "boolean", initialValue: false }),
    defineField({ name: "allowMixMandados", title: "Permitir mezclar varios Mandados", type: "boolean", initialValue: true }),
    defineField({ name: "allowMixRestaurantMandado", title: "Permitir mezclar Restaurante + Mandado", type: "boolean", initialValue: false }),
    defineField({ name: "updatedAt", title: "Actualizado", type: "datetime", readOnly: true }),
    defineField({ name: "updatedBy", title: "Actualizado por", type: "string", readOnly: true }),
  ],
});
