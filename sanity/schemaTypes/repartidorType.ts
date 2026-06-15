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
      name: "notas",
      title: "Notas",
      type: "text",
      description: "Notas internas sobre el repartidor",
    }),
  ],
});
