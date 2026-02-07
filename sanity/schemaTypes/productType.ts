import { TrolleyIcon } from "@sanity/icons";
import { defineField, defineType } from "sanity";

export const productType = defineType ({
  name: "product",
  title: "Productos",
  type: "document",
  icon: TrolleyIcon,
  fields: [
    defineField({
      name: "name",
      title: "Nombre del producto",
      type: "string",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "affiliateStore",
      title: "Tienda / Restaurante",
      type: "reference",
      to: [{ type: "affiliateStore" }],
      description:
        "Tienda o restaurante al que pertenece este producto. Se usa para mostrar información como tiempo y costo de entrega.",
    }),
    defineField({
      name: "optionGroups",
      title: "Opciones de personalización",
      description:
        "Grupos de opciones configurables (por ejemplo: tamaño, tipo de salsa, término de cocción). Se pueden adaptar según la tienda o restaurante.",
      type: "array",
      of: [
        defineField({
          name: "optionGroup",
          title: "Grupo de opciones",
          type: "object",
          fields: [
            defineField({
              name: "title",
              title: "Título del grupo",
              type: "string",
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: "description",
              title: "Descripción (opcional)",
              type: "string",
            }),
            defineField({
              name: "required",
              title: "Obligatorio",
              type: "boolean",
              initialValue: false,
            }),
            defineField({
              name: "selectionType",
              title: "Tipo de selección",
              type: "string",
              options: {
                list: [
                  { title: "Una opción (radio)", value: "single" },
                  { title: "Múltiples opciones (checkbox)", value: "multiple" },
                ],
                layout: "radio",
              },
              initialValue: "single",
            }),
            defineField({
              name: "options",
              title: "Opciones",
              type: "array",
              of: [
                defineField({
                  name: "option",
                  title: "Opción",
                  type: "object",
                  fields: [
                    defineField({
                      name: "label",
                      title: "Etiqueta",
                      type: "string",
                      validation: (Rule) => Rule.required(),
                    }),
                    defineField({
                      name: "description",
                      title: "Descripción (opcional)",
                      type: "string",
                    }),
                    defineField({
                      name: "priceDelta",
                      title: "Costo adicional",
                      type: "number",
                      description:
                        "Costo adicional para esta opción (puede ser 0).",
                    }),
                    defineField({
                      name: "isDefault",
                      title: "Seleccionada por defecto",
                      type: "boolean",
                      initialValue: false,
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    }),
    defineField({
      name: "slug",
      title: "Identificador",
      type: "slug",
      options: {
        source: "name",
        maxLength: 96,
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "image",
      title: "Imagen del producto",
      type: "image",
      options: {
        hotspot: true,
      },
    }),
    defineField({
      name: "description",
      title: "Descripción",
      type: "blockContent",
    }),
    defineField({
      name: "price",
      title: "Precio",
      type: "number",
      validation: (Rule) => Rule.required().min(0),
    }),
    defineField({
      name: "categories",
      title: "Categoria",
      type: "array",
      of: [{ type: "reference", to: { type: "category" } }],
    }),
    defineField({
      name: "stock",
      title: "Inventario",
      type: "number",
      validation: (Rule) => Rule.min(0),
    }),
    // Campos de aprobación
    defineField({
      name: "approvalStatus",
      title: "Estado de aprobación",
      type: "string",
      options: {
        list: [
          { title: "Pendiente", value: "pending" },
          { title: "Aprobado", value: "approved" },
          { title: "Rechazado", value: "rejected" },
        ],
        layout: "radio",
      },
      initialValue: "approved",
      description: "Estado del producto en el flujo de aprobación",
    }),
    defineField({
      name: "isVisible",
      title: "Visible en tienda",
      type: "boolean",
      initialValue: true,
      description: "Si es falso, el producto no aparecerá en la tienda",
    }),
    defineField({
      name: "pendingChanges",
      title: "Cambios pendientes",
      type: "object",
      description: "Cambios enviados para revisión pero no aprobados aún",
      fields: [
        defineField({
          name: "name",
          title: "Nombre propuesto",
          type: "string",
        }),
        defineField({
          name: "price",
          title: "Precio propuesto",
          type: "number",
        }),
        defineField({
          name: "stock",
          title: "Stock propuesto",
          type: "number",
        }),
        defineField({
          name: "description",
          title: "Descripción propuesta",
          type: "blockContent",
        }),
        defineField({
          name: "image",
          title: "Imagen propuesta",
          type: "image",
        }),
        defineField({
          name: "categories",
          title: "Categorías propuestas",
          type: "array",
          of: [{ type: "reference", to: { type: "category" } }],
        }),
        defineField({
          name: "optionGroups",
          title: "Grupos de opciones propuestos",
          type: "array",
          of: [
            defineField({
              name: "optionGroup",
              title: "Grupo de opciones",
              type: "object",
              fields: [
                defineField({
                  name: "title",
                  title: "Título del grupo",
                  type: "string",
                }),
                defineField({
                  name: "description",
                  title: "Descripción",
                  type: "string",
                }),
                defineField({
                  name: "required",
                  title: "Obligatorio",
                  type: "boolean",
                }),
                defineField({
                  name: "selectionType",
                  title: "Tipo de selección",
                  type: "string",
                }),
                defineField({
                  name: "options",
                  title: "Opciones",
                  type: "array",
                  of: [
                    defineField({
                      name: "option",
                      title: "Opción",
                      type: "object",
                      fields: [
                        defineField({
                          name: "label",
                          title: "Etiqueta",
                          type: "string",
                        }),
                        defineField({
                          name: "description",
                          title: "Descripción",
                          type: "string",
                        }),
                        defineField({
                          name: "priceDelta",
                          title: "Costo adicional",
                          type: "number",
                        }),
                        defineField({
                          name: "isDefault",
                          title: "Por defecto",
                          type: "boolean",
                        }),
                      ],
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    }),
    defineField({
      name: "submittedBy",
      title: "Enviado por",
      type: "string",
      description: "ID del usuario que envió los cambios",
    }),
    defineField({
      name: "submittedAt",
      title: "Fecha de envío",
      type: "datetime",
      description: "Cuándo se enviaron los cambios para revisión",
    }),
    defineField({
      name: "approvedBy",
      title: "Aprobado por",
      type: "string",
      description: "ID del admin que aprobó",
    }),
    defineField({
      name: "approvedAt",
      title: "Fecha de aprobación",
      type: "datetime",
      description: "Cuándo se aprobaron los cambios",
    }),
    defineField({
      name: "rejectedBy",
      title: "Rechazado por",
      type: "string",
      description: "ID del admin que rechazó",
    }),
    defineField({
      name: "rejectedAt",
      title: "Fecha de rechazo",
      type: "datetime",
      description: "Cuándo se rechazaron los cambios",
    }),
    defineField({
      name: "rejectionReason",
      title: "Motivo del rechazo",
      type: "string",
      description: "Razón por la que se rechazó el producto",
    }),
  ],
  preview: {
    select: {
      title: "name",
      media: "image",
      price: "price",
    },
    prepare(select) {
      return {
        title: select.title,
        subtitle: `$${select.price}`,
        media: select.media,
      }
    }
  }
});
