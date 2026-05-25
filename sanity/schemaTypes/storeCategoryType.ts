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
      type: 'object',
      fields: [
        defineField({
          name: 'type',
          title: 'Tipo',
          type: 'string',
          options: {
            list: [
              { title: 'Emoji/Texto', value: 'emoji' },
              { title: 'Imagen PNG', value: 'image' },
            ],
            layout: 'radio',
          },
          initialValue: 'emoji',
        }),
        defineField({
          name: 'emoji',
          title: 'Emoji o Icono',
          type: 'string',
          description: 'Ej: 🍕, 🍜, 🍔',
          hidden: ({ parent }) => parent?.type !== 'emoji',
        }),
        defineField({
          name: 'image',
          title: 'Imagen PNG',
          type: 'image',
          hidden: ({ parent }) => parent?.type !== 'image',
          options: {
            accept: 'image/png',
          },
        }),
      ],
      description: 'Emoji/icono representativo o imagen PNG',
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
      iconType: 'icon.type',
      emoji: 'icon.emoji',
      image: 'icon.image',
    },
    prepare(selection) {
      const { title, subtitle, iconType, emoji, image } = selection;
      let displayTitle = title;
      
      if (iconType === 'emoji' && emoji) {
        displayTitle = `${emoji} ${title}`;
      } else if (iconType === 'image' && image) {
        displayTitle = title;
      }
      
      return {
        title: displayTitle,
        subtitle: subtitle,
        media: iconType === 'image' && image ? image : undefined,
      };
    },
  },
})
