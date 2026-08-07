import { defineField, defineType } from "sanity";

export const dispatchAuditType = defineType({
  name: "dispatchAudit",
  title: "Historial de Despacho",
  type: "document",
  fields: [
    defineField({
      name: "action",
      title: "Acción",
      type: "string",
      options: {
        list: [
          { title: "Asignación", value: "assign" },
          { title: "Reasignación", value: "reassign" },
          { title: "Liberar pedido", value: "unassign" },
          { title: "Bloquear repartidor", value: "block" },
          { title: "Desbloquear repartidor", value: "unblock" },
          { title: "Pausar repartidor", value: "pause" },
          { title: "Reanudar repartidor", value: "resume" },
          { title: "Cambiar prioridad", value: "priority" },
          { title: "Cambio de configuración", value: "config" },
          { title: "Re-ejecutar algoritmo", value: "redispatch" },
        ],
      },
    }),
    defineField({ name: "mode", title: "Modo", type: "string" }),
    defineField({ name: "actorUserId", title: "ID del operador", type: "string" }),
    defineField({ name: "actorName", title: "Operador", type: "string" }),
    defineField({ name: "order", title: "Pedido", type: "reference", to: [{ type: "order" }] }),
    defineField({ name: "orderNumber", title: "Número de pedido", type: "string" }),
    defineField({ name: "driver", title: "Repartidor", type: "reference", to: [{ type: "repartidor" }] }),
    defineField({ name: "previousDriver", title: "Repartidor anterior", type: "reference", to: [{ type: "repartidor" }] }),
    defineField({ name: "newDriver", title: "Nuevo repartidor", type: "reference", to: [{ type: "repartidor" }] }),
    defineField({ name: "reason", title: "Motivo / Razón", type: "string" }),
    defineField({ name: "responseTimeSeconds", title: "Tiempo de respuesta (seg)", type: "number" }),
    defineField({ name: "details", title: "Detalles", type: "text" }),
    defineField({ name: "createdAt", title: "Fecha y hora", type: "datetime" }),
  ],
  preview: {
    select: {
      title: "action",
      subtitle: "createdAt",
    },
  },
});
