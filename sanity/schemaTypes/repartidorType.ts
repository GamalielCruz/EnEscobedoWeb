import { defineField, defineType } from "sanity";

export const repartidorType = defineType({
  name: "repartidor",
  title: "Repartidor",
  type: "document",
  fields: [
    defineField({
      name: "nombre",
      title: "Nombre",
      type: "string",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "telefono",
      title: "Telefono",
      type: "string",
      description: "Numero con codigo de pais",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "tiendaAsignada",
      title: "Tienda Asignada",
      type: "reference",
      to: [{ type: "affiliateStore" }],
      description: "Tienda especifica a la que pertenece el repartidor",
    }),
    defineField({
      name: "activo",
      title: "Activo",
      type: "boolean",
      initialValue: true,
      description: "Permite activar o desactivar el repartidor sin eliminarlo",
    }),
    defineField({
      name: "disponible",
      title: "Disponible",
      type: "boolean",
      initialValue: false,
      description: "Si el repartidor está en servicio ahora mismo",
    }),
    defineField({
      name: "disponibleDesde",
      title: "Disponible Desde",
      type: "datetime",
      description: "Cuándo se conectó al servicio",
    }),
    defineField({
      name: "ultimaActividad",
      title: "Última Actividad",
      type: "datetime",
      description: "Última vez que interactuó con el bot",
    }),
    defineField({
      name: "pendienteConfirmacion",
      title: "Pendiente de Confirmación",
      type: "boolean",
      initialValue: false,
      description: "Se le mandó recordatorio y no ha respondido aún",
    }),
    defineField({
      name: "confirmacionEnviadaAt",
      title: "Confirmación Enviada At",
      type: "datetime",
      description: "Cuándo se mandó el recordatorio de confirmación",
    }),
    defineField({
      name: "ultimoPedidoOfertado",
      title: "Último Pedido Ofertado",
      type: "reference",
      to: [{ type: "order" }],
      description: "El último pedido que se le envió al repartidor como oferta",
    }),
    defineField({
      name: "notas",
      title: "Notas",
      type: "text",
      description: "Notas internas sobre el repartidor",
    }),
  ],
});
