import { HomeIcon } from "@sanity/icons";
import { defineField, defineType } from "sanity";

export const affiliateStoreType = defineType({
  name: "affiliateStore",
  title: "Tienda Afiliada",
  type: "document",
  icon: HomeIcon,
  fields: [
    defineField({
      name: "ownerClerkUserId",
      title: "Usuario Dueño (ID de Clerk)",
      type: "string",
      description:
        "ID del usuario en Clerk que es dueño o administrador de esta tienda (ej: user_xxx). Vincular al acceso autenticado del usuario.",
    }),
    defineField({
      name: "name",
      title: "Nombre de la Tienda",
      type: "string",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "storeCategories",
      title: "Categorías de Tienda",
      type: "array",
      of: [{ type: "reference", to: [{ type: "storeCategory" }] }],
      description: "Tipo de comida/cocina (Pizza, Sushi, Hamburguesas, etc.)",
    }),
    defineField({
      name: "image",
      title: "Imagen Principal",
      type: "image",
      options: {
        hotspot: true,
      },
      description: "Logo o imagen principal de la tienda",
    }),
    defineField({
      name: "coverImage",
      title: "Imagen de Portada",
      type: "image",
      options: {
        hotspot: true,
      },
      description: "Imagen de fondo para el header de la tienda",
    }),
    defineField({
      name: "storeId",
      title: "ID de la Tienda",
      type: "string",
      validation: (Rule) => Rule.required(),
      description: "Identificador único de la tienda",
    }),
    defineField({
      name: "categories",
      title: "Categorías de Menú",
      type: "array",
      of: [
        {
          type: "object",
          fields: [
            {
              name: "name",
              title: "Nombre de Categoría",
              type: "string",
              validation: (Rule) => Rule.required(),
            },
            {
              name: "slug",
              title: "Slug",
              type: "slug",
              options: {
                source: "name",
              },
            },
            {
              name: "order",
              title: "Orden",
              type: "number",
              initialValue: 0,
            },
          ],
        },
      ],
      description: "Categorías para organizar los productos (ej: Populares, Clásicos, Bebidas)",
    }),
    defineField({
      name: "address",
      title: "Dirección",
      type: "object",
      fields: [
        defineField({
          name: "street",
          title: "Calle y Número",
          type: "string",
          validation: (Rule) => Rule.required(),
        }),
        defineField({
          name: "city",
          title: "Ciudad",
          type: "string",
          validation: (Rule) => Rule.required(),
        }),
        defineField({
          name: "state",
          title: "Estado",
          type: "string",
          validation: (Rule) => Rule.required(),
        }),
        defineField({
          name: "postalCode",
          title: "Código Postal",
          type: "string",
          validation: (Rule) => Rule.required(),
        }),
        defineField({
          name: "country",
          title: "País",
          type: "string",
          initialValue: "México",
          validation: (Rule) => Rule.required(),
        }),
      ],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "coordinates",
      title: "Coordenadas",
      type: "object",
      fields: [
        defineField({
          name: "latitude",
          title: "Latitud",
          type: "number",
          validation: (Rule) => Rule.required().min(-90).max(90),
        }),
        defineField({
          name: "longitude",
          title: "Longitud",
          type: "number",
          validation: (Rule) => Rule.required().min(-180).max(180),
        }),
      ],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "contact",
      title: "Información de Contacto",
      type: "object",
      fields: [
        defineField({
          name: "phone",
          title: "Teléfono",
          type: "string",
          validation: (Rule) => Rule.required(),
        }),
        defineField({
          name: "email",
          title: "Email",
          type: "string",
          validation: (Rule) => Rule.email(),
        }),
        defineField({
          name: "manager",
          title: "Encargado",
          type: "string",
        }),
      ],
    }),
    defineField({
      name: "operatingHours",
      title: "Horarios de Operación",
      type: "object",
      fields: [
        defineField({
          name: "monday",
          title: "Lunes",
          type: "string",
          initialValue: "9:00 - 18:00",
        }),
        defineField({
          name: "tuesday",
          title: "Martes",
          type: "string",
          initialValue: "9:00 - 18:00",
        }),
        defineField({
          name: "wednesday",
          title: "Miércoles",
          type: "string",
          initialValue: "9:00 - 18:00",
        }),
        defineField({
          name: "thursday",
          title: "Jueves",
          type: "string",
          initialValue: "9:00 - 18:00",
        }),
        defineField({
          name: "friday",
          title: "Viernes",
          type: "string",
          initialValue: "9:00 - 18:00",
        }),
        defineField({
          name: "saturday",
          title: "Sábado",
          type: "string",
          initialValue: "9:00 - 15:00",
        }),
        defineField({
          name: "sunday",
          title: "Domingo",
          type: "string",
          initialValue: "Cerrado",
        }),
      ],
    }),
    defineField({
      name: "isActive",
      title: "Activa",
      type: "boolean",
      initialValue: true,
      description: "Si la tienda está activa para recibir pedidos",
    }),
    defineField({
      name: "isOpen",
      title: "Tienda Abierta",
      type: "boolean",
      initialValue: true,
      description: "Si esta desactivado, la tienda no acepta nuevos pedidos.",
    }),
    defineField({
      name: "highDemandMode",
      title: "Modo Alta Demanda",
      type: "boolean",
      initialValue: false,
      description: "Activalo cuando haya muchos pedidos y puedan presentarse demoras.",
    }),
    defineField({
      name: "hasOwnDelivery",
      title: "Tiene repartidores propios",
      type: "boolean",
      initialValue: false,
      description: "Indica si la tienda tiene repartidores propios",
    }),
    defineField({
      name: "capacity",
      title: "Capacidad de Almacenamiento",
      type: "number",
      initialValue: 50,
      description: "Número máximo de pedidos que puede manejar simultáneamente",
    }),
    defineField({
      name: "averageDeliveryTime",
      title: "Tiempo Promedio de Entrega (días)",
      type: "number",
      initialValue: 3,
      description: "Días promedio para que llegue el producto a esta tienda",
    }),
    defineField({
      name: "deliveryFee",
      title: "Costo de entrega (MXN)",
      type: "number",
      description:
        "Costo estándar de entrega para pedidos desde esta tienda o restaurante.",
    }),
    defineField({
      name: "deliveryTimeMin",
      title: "Tiempo mínimo de entrega (minutos)",
      type: "number",
    }),
    defineField({
      name: "deliveryTimeMax",
      title: "Tiempo máximo de entrega (minutos)",
      type: "number",
    }),
    defineField({
      name: "serviceTypes",
      title: "Tipos de Servicio Disponibles",
      type: "object",
      fields: [
        defineField({
          name: "delivery",
          title: "Entrega a Domicilio",
          type: "boolean",
          initialValue: true,
          description: "¿Esta tienda ofrece servicio de entrega a domicilio?",
        }),
        defineField({
          name: "pickup",
          title: "Recoger en Tienda",
          type: "boolean",
          initialValue: true,
          description: "¿Esta tienda permite recoger pedidos en el local?",
        }),
        defineField({
          name: "deliveryRadius",
          title: "Radio de Entrega (km)",
          type: "number",
          initialValue: 10,
          description: "Radio máximo de entrega en kilómetros (solo si delivery está habilitado)",
          hidden: ({ parent }) => !parent?.delivery,
        }),
        defineField({
          name: "minimumOrderDelivery",
          title: "Pedido Mínimo para Entrega (MXN)",
          type: "number",
          initialValue: 100,
          description: "Monto mínimo requerido para entrega a domicilio",
          hidden: ({ parent }) => !parent?.delivery,
        }),
        defineField({
          name: "onDemand",
          title: "Alta Demanda",
          type: "boolean",
          initialValue: false,
          description: "Activa este modo cuando el restaurante tenga alta demanda y los pedidos puedan tardar mas.",
        }),
        defineField({
          name: "onDemandExtraMinutes",
          title: "Minutos extra por alta demanda",
          type: "number",
          initialValue: 15,
          description: "Tiempo adicional que se sumara al estimado base cuando Alta Demanda este activo.",
          hidden: ({ parent }) => !parent?.onDemand,
        }),
      ],
      description: "Configura qué tipos de servicio ofrece esta tienda",
      validation: (Rule) => Rule.custom((serviceTypes) => {
        if (!serviceTypes?.delivery && !serviceTypes?.pickup) {
          return 'Debe habilitar al menos un tipo de servicio (entrega o recoger)';
        }
        return true;
      }),
    }),
  ],
  preview: {
    select: {
      title: "name",
      subtitle: "address.city",
      isActive: "isActive",
    },
    prepare(select) {
      return {
        title: select.title,
        subtitle: `${select.subtitle} ${select.isActive ? "✅" : "❌"}`,
        media: HomeIcon,
      };
    },
  },
});
