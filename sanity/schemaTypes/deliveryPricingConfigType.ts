import { DashboardIcon } from "@sanity/icons";
import { defineField, defineType } from "sanity";

export const deliveryPricingConfigType = defineType({
  name: "deliveryPricingConfig",
  title: "Configuracion de Envios",
  type: "document",
  icon: DashboardIcon,
  fields: [
    defineField({
      name: "title",
      title: "Titulo",
      type: "string",
      initialValue: "Configuracion principal de envios",
    }),
    defineField({
      name: "zones",
      title: "Zonas",
      type: "array",
      of: [
        {
          type: "object",
          fields: [
            defineField({ name: "id", title: "ID", type: "string" }),
            defineField({ name: "name", title: "Nombre", type: "string" }),
            defineField({ name: "basePrice", title: "Precio base", type: "number" }),
            defineField({ name: "color", title: "Color", type: "string" }),
            defineField({ name: "active", title: "Activa", type: "boolean", initialValue: true }),
            defineField({
              name: "coordinates",
              title: "Coordenadas",
              type: "array",
              of: [
                {
                  type: "object",
                  fields: [
                    defineField({ name: "lat", title: "Latitud", type: "number" }),
                    defineField({ name: "lng", title: "Longitud", type: "number" }),
                  ],
                },
              ],
            }),
          ],
        },
      ],
    }),
    defineField({
      name: "demand",
      title: "Demanda",
      type: "object",
      fields: [
        defineField({
          name: "level",
          title: "Nivel",
          type: "string",
          options: {
            list: [
              { title: "Baja", value: "low" },
              { title: "Media", value: "medium" },
              { title: "Alta", value: "high" },
              { title: "Personalizada", value: "custom" },
            ],
          },
        }),
        defineField({ name: "multiplier", title: "Multiplicador", type: "number" }),
      ],
    }),
    defineField({
      name: "scheduleRules",
      title: "Reglas por horario",
      type: "array",
      of: [
        {
          type: "object",
          fields: [
            defineField({ name: "id", title: "ID", type: "string" }),
            defineField({ name: "name", title: "Nombre", type: "string" }),
            defineField({ name: "startTime", title: "Inicio (HH:mm)", type: "string" }),
            defineField({ name: "endTime", title: "Fin (HH:mm)", type: "string" }),
            defineField({ name: "multiplier", title: "Multiplicador", type: "number" }),
            defineField({ name: "active", title: "Activa", type: "boolean", initialValue: true }),
          ],
        },
      ],
    }),
    defineField({
      name: "outsideZone",
      title: "Fuera de zona",
      type: "object",
      fields: [
        defineField({
          name: "mode",
          title: "Comportamiento",
          type: "string",
          options: {
            list: [
              { title: "Rechazar pedido", value: "reject" },
              { title: "Aplicar tarifa especial", value: "special_fee" },
            ],
          },
        }),
        defineField({ name: "specialFee", title: "Tarifa especial", type: "number" }),
      ],
    }),
    defineField({
      name: "debug",
      title: "Activar debug",
      type: "boolean",
      initialValue: true,
    }),
  ],
});
