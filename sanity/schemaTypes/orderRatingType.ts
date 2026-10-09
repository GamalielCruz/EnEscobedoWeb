import { defineField, defineType } from "sanity";

/**
 * Evaluación bilateral (cliente ↔ repartidor). Documento DESACOPLADO de la
 * orden: nunca modifica estados, precios, pago ni despacho.
 *
 * El _id es DETERMINISTA (`orderRating-<orderId>-<evaluatorRole>`) para que una
 * misma orden no pueda tener dos evaluaciones en la misma dirección.
 */
export const orderRatingType = defineType({
  name: "orderRating",
  title: "Evaluaciones",
  type: "document",
  fields: [
    defineField({ name: "order", title: "Pedido", type: "reference", to: [{ type: "order" }] }),
    defineField({ name: "orderNumber", title: "Número de pedido", type: "string" }),
    defineField({
      name: "evaluatorRole",
      title: "Rol del evaluador",
      type: "string",
      options: {
        list: [
          { title: "Cliente", value: "customer" },
          { title: "Repartidor", value: "driver" },
        ],
      },
    }),
    defineField({ name: "evaluatorId", title: "ID del evaluador", type: "string" }),
    defineField({
      name: "evaluateeRole",
      title: "Rol del evaluado",
      type: "string",
      options: {
        list: [
          { title: "Cliente", value: "customer" },
          { title: "Repartidor", value: "driver" },
        ],
      },
    }),
    defineField({ name: "evaluateeId", title: "ID del evaluado", type: "string" }),
    defineField({
      name: "rating",
      title: "Calificación (estrellas)",
      type: "number",
      description: "1 = mala experiencia · 2 = hubo algún inconveniente · 3 = todo salió bien.",
      validation: (Rule) => Rule.required().min(1).max(3),
    }),
    defineField({
      name: "reasons",
      title: "Motivos",
      type: "array",
      of: [{ type: "string" }],
      description: "Códigos estables del catálogo (lib/order-ratings.ts). Solo del nivel elegido.",
    }),
    defineField({ name: "comment", title: "Comentario", type: "text", rows: 3 }),
    defineField({ name: "hasSeriousIncident", title: "Incidente grave", type: "boolean" }),
    defineField({
      name: "report",
      title: "Reporte privado",
      type: "object",
      description:
        "Un reporte NO es una sanción ni una acusación confirmada: es una solicitud de revisión humana.",
      fields: [
        defineField({ name: "requested", title: "Reporte solicitado", type: "boolean" }),
        defineField({
          name: "status",
          title: "Estado de revisión",
          type: "string",
          initialValue: "none",
          options: {
            list: [
              { title: "Sin reporte", value: "none" },
              { title: "Pendiente de revisión", value: "pending_review" },
              { title: "En revisión", value: "under_review" },
              { title: "Revisado", value: "reviewed" },
            ],
          },
        }),
        defineField({ name: "requestContact", title: "Pidió contacto", type: "boolean" }),
        defineField({ name: "description", title: "Descripción", type: "text", rows: 4 }),
        defineField({ name: "reviewedAt", title: "Revisado el", type: "datetime" }),
        defineField({ name: "reviewedBy", title: "Revisado por", type: "string" }),
      ],
    }),
    defineField({ name: "createdAt", title: "Fecha de evaluación", type: "datetime" }),
    defineField({ name: "updatedAt", title: "Actualizado", type: "datetime" }),
  ],
  orderings: [
    {
      title: "Más recientes",
      name: "createdAtDesc",
      by: [{ field: "createdAt", direction: "desc" }],
    },
  ],
  preview: {
    select: { role: "evaluatorRole", rating: "rating", order: "orderNumber", incident: "hasSeriousIncident" },
    prepare({ role, rating, order, incident }) {
      const who = role === "driver" ? "Repartidor" : "Cliente";
      return {
        title: `${who} evaluó ${rating ?? "?"}/3`,
        subtitle: `${incident ? "⚠ Incidente grave · " : ""}Pedido #${order ?? "?"}`,
      };
    },
  },
});
