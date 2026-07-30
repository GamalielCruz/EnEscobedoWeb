import { HomeIcon } from "@sanity/icons";
import { defineField, defineType } from "sanity";

const RESERVED_STORE_SLUGS = new Set([
  "about", "admin", "api", "basket", "categories", "checkout", "dashboard",
  "demo", "faq", "legal", "orders", "product", "search", "sign-in", "store",
  "studio", "success", "terminos",
]);

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
      name: "slug",
      title: "Enlace público",
      type: "slug",
      description: "Dirección corta del restaurante. Ejemplo: elmenu.site/hornea",
      options: {
        source: "name",
        maxLength: 96,
        slugify: (value) =>
          value
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]/g, ""),
      },
      validation: (Rule) =>
        Rule.required().custom((value) =>
          value?.current && RESERVED_STORE_SLUGS.has(value.current)
            ? "Este enlace está reservado por ElMenu.site."
            : true
        ),
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
      name: "productOrder",
      title: "Orden de productos",
      type: "array",
      hidden: true,
      of: [{ type: "reference", to: [{ type: "product" }] }],
    }),
    defineField({
      name: "categoryOrder",
      title: "Orden de categorías",
      type: "array",
      hidden: true,
      of: [{ type: "reference", to: [{ type: "category" }] }],
    }),
    defineField({
      name: "categoryProductOrders",
      title: "Orden de productos por categor?a",
      type: "array",
      hidden: true,
      of: [
        defineField({
          name: "categoryProductOrder",
          type: "object",
          fields: [
            defineField({
              name: "category",
              type: "reference",
              to: [{ type: "category" }],
            }),
            defineField({
              name: "products",
              type: "array",
              of: [{ type: "reference", to: [{ type: "product" }] }],
            }),
          ],
        }),
      ],
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
      name: "homepageOrder",
      title: "Orden en portada",
      type: "number",
      hidden: true,
      validation: (Rule) => Rule.integer().min(0),
    }),
    defineField({
      name: "isOpen",
      title: "Tienda Abierta",
      type: "boolean",
      initialValue: true,
      description: "Si esta desactivado, la tienda no acepta nuevos pedidos.",
    }),
    defineField({
      name: "manualOperationalStatus",
      title: "Estado Operativo Manual",
      type: "string",
      options: {
        list: [
          { title: "Autom?tico", value: "auto" },
          { title: "Abierta", value: "open" },
          { title: "Cerrada", value: "closed" },
        ],
        layout: "radio",
      },
      initialValue: "auto",
      description: "Override manual que tiene prioridad sobre el horario cuando no est? en autom?tico.",
    }),
    defineField({
      name: "highDemandMode",
      title: "Modo Alta Demanda",
      type: "boolean",
      initialValue: false,
      description: "Activalo cuando haya muchos pedidos y puedan presentarse demoras.",
    }),
    defineField({
      name: "promotionalMessages",
      title: "Frases para clientes",
      type: "array",
      of: [{ type: "string" }],
      description: "Beneficio Premium: mensajes breves que rotan cada 5 segundos en la tarjeta del restaurante.",
      validation: (Rule) => Rule.max(5).unique(),
    }),
    defineField({
      name: "hasOwnDelivery",
      title: "Tiene repartidores propios",
      type: "boolean",
      initialValue: false,
      description: "Indica si la tienda tiene repartidores propios",
    }),
    defineField({
      name: "platformCommissionPercent",
      title: "Comision de El Menu (%)",
      type: "number",
      description: "Porcentaje aplicado al subtotal de productos. Solo lo administra El Menu.",
      validation: (Rule) => Rule.min(0).max(100),
    }),
    defineField({
      name: "commercialPlanId",
      title: "Plan comercial",
      type: "string",
      options: { list: [
        { title: "Plan Comunidad", value: "community" },
        { title: "Plan Premium del 10%", value: "premium" },
      ] },
    }),
    defineField({
      name: "commercialOverrides",
      title: "Condiciones comerciales personalizadas",
      type: "object",
      fields: [
        defineField({ name: "commissionPercent", title: "Comisión (%)", type: "number", validation: (Rule) => Rule.min(0).max(100) }),
        defineField({ name: "monthlyCommissionCap", title: "Tope mensual (MXN)", type: "number", validation: (Rule) => Rule.min(0) }),
        defineField({ name: "serviceFeeMode", title: "Tarifa de servicio", type: "string", options: { list: ["normal", "reduced", "free"] } }),
        defineField({ name: "onlinePaymentsEnabled", title: "Pagos en línea", type: "boolean" }),
        defineField({ name: "premiumBadgeEnabled", title: "Badge ElMenu Verificado", type: "boolean" }),
        defineField({ name: "bannerEligible", title: "Elegible para banner", type: "boolean" }),
        defineField({ name: "promotionalMessagesEnabled", title: "Frases para clientes", type: "boolean" }),
        defineField({ name: "deliveryBenefitEnabled", title: "Beneficio de envío", type: "boolean" }),
        defineField({ name: "deliveryDiscountAmount", title: "Descuento de envío", type: "number", validation: (Rule) => Rule.min(0) }),
        defineField({ name: "deliveryBenefitAbsorbedBy", title: "Quién absorbe", type: "string", options: { list: ["platform", "restaurant"] } }),
      ],
    }),
    defineField({ name: "commercialPlanStartedAt", title: "Inicio del plan", type: "datetime" }),
    defineField({ name: "commercialNotes", title: "Observaciones comerciales", type: "text", rows: 3 }),
    defineField({ name: "commercialReviewRequired", title: "Requiere revisión administrativa", type: "boolean" }),
    defineField({ name: "commercialUpdatedAt", title: "Condiciones actualizadas", type: "datetime", readOnly: true }),
    defineField({ name: "commercialUpdatedBy", title: "Administrador del cambio", type: "string", readOnly: true }),
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
      name: "scheduledOrdersEnabled",
      title: "Pedidos programados",
      type: "boolean",
      initialValue: true,
    }),
    defineField({
      name: "minimumPreparationMinutes",
      title: "Preparacion minima (minutos)",
      type: "number",
      validation: (Rule) => Rule.min(0),
    }),
    defineField({
      name: "scheduledOrderIntervalMinutes",
      title: "Duracion de intervalos (minutos)",
      type: "number",
      description: "Vacio para heredar la configuracion global.",
      validation: (Rule) => Rule.min(30),
    }),
    defineField({
      name: "maximumScheduledDays",
      title: "Dias maximos para programar",
      type: "number",
      description: "No puede superar el limite global.",
      validation: (Rule) => Rule.min(1),
    }),
    defineField({
      name: "lastDeliveryOrderMinutesBeforeClose",
      title: "Ultima entrega antes del cierre (minutos)",
      type: "number",
      initialValue: 30,
      validation: (Rule) => Rule.min(0),
    }),
    defineField({
      name: "lastPickupOrderMinutesBeforeClose",
      title: "Ultima recoleccion antes del cierre (minutos)",
      type: "number",
      initialValue: 15,
      validation: (Rule) => Rule.min(0),
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
