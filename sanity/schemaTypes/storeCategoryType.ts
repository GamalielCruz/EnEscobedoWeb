import { TagIcon } from '@sanity/icons'
import { defineField, defineType } from 'sanity'

export const storeCategoryType = defineType({
  name: 'storeCategory',
  title: 'Categoría de Tienda',
  type: 'document',
  icon: TagIcon,
  fields: [
    defineField({
      name: 'title',
      title: 'Nombre',
      type: 'string',
      validation: (Rule) => Rule.required(),
      description: 'Ej: Pizza, Comida China, Sushi, Hamburguesas, etc.',
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {
        source: 'title',
        maxLength: 96,
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'description',
      title: 'Descripción',
      type: 'text',
      rows: 3,
    }),
    defineField({
      name: 'icon',
      title: 'Icono/Emoji',
      type: 'string',
      description: 'Emoji o icono representativo (ej: 🍕, 🍜, 🍔)',
    }),
    defineField({
      name: 'order',
      title: 'Orden',
      type: 'number',
      initialValue: 0,
      description: 'Orden de aparición en el filtro',
    }),
  ],
  preview: {
    select: {
      title: 'title',
      subtitle: 'description',
      icon: 'icon',
    },
    prepare(selection) {
      const { title, subtitle, icon } = selection;
      return {
        title: icon ? `${icon} ${title}` : title,
        subtitle: subtitle,
      };
    },
  },
})
