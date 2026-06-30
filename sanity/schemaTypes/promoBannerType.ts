import { ImagesIcon } from "@sanity/icons";
import { defineField, defineType } from "sanity";

const bannerTypeLabels: Record<string, string> = {
  promotion: "Promocion",
  announcement: "Anuncio",
  info: "Informacion",
  featured: "Destacado",
  warning: "Aviso",
  event: "Evento",
};

const mainColorLabels: Record<string, string> = {
  "#FFFFFF": "Blanco",
  "#000000": "Negro",
  "#09193B": "Azul marino",
  "#850C22": "Rojo vino",
  "#111827": "Grafito",
  "#166534": "Verde",
  "#0F766E": "Teal",
  "#6D28D9": "Violeta",
  "#C2410C": "Naranja",
};

function getBannerTypeLabel(value?: string | null) {
  return bannerTypeLabels[value || ""] || "Promocion";
}

function getMainColorLabel(value?: string | null) {
  if (!value) return "Color personalizado";
  return mainColorLabels[value.toUpperCase()] || value;
}

export const promoBannerType = defineType({
  name: "promoBanner",
  title: "Banners Promocionales",
  type: "document",
  icon: ImagesIcon,
  fields: [
    defineField({
      name: "title",
      title: "Titulo",
      type: "string",
      validation: (Rule) => Rule.required().min(2).max(80),
    }),
    defineField({
      name: "description",
      title: "Descripcion",
      type: "text",
      rows: 3,
      validation: (Rule) => Rule.max(180),
    }),
    defineField({
      name: "bannerType",
      title: "Tipo de banner",
      type: "string",
      initialValue: "promotion",
      options: {
        layout: "dropdown",
        list: [
          { title: "Promocion (Blanco sugerido)", value: "promotion" },
          { title: "Anuncio (Negro sugerido)", value: "announcement" },
          { title: "Informacion (Azul marino sugerido)", value: "info" },
          { title: "Destacado (Rojo vino sugerido)", value: "featured" },
          { title: "Aviso (Naranja sugerido)", value: "warning" },
          { title: "Evento (Verde sugerido)", value: "event" },
        ],
      },
      description: "El color principal se elige abajo; las sugerencias de la lista son solo de referencia.",
    }),
    defineField({
      name: "mainColor",
      title: "Color principal",
      type: "string",
      initialValue: "#09193B",
      options: {
        layout: "dropdown",
        list: [
          { title: "Blanco", value: "#FFFFFF" },
          { title: "Negro", value: "#000000" },
          { title: "Azul marino", value: "#09193B" },
          { title: "Rojo vino", value: "#850C22" },
          { title: "Grafito", value: "#111827" },
          { title: "Verde", value: "#166534" },
          { title: "Teal", value: "#0F766E" },
          { title: "Violeta", value: "#6D28D9" },
          { title: "Naranja", value: "#C2410C" },
        ],
      },
      description: "Color principal para titulo, descripcion, boton, codigo y tienda. Usa blanco o negro si el fondo lo pide.",
    }),
    defineField({
      name: "desktopImage",
      title: "Imagen principal",
      type: "image",
      options: {
        hotspot: true,
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "mobileImage",
      title: "Imagen movil",
      type: "image",
      options: {
        hotspot: true,
      },
      description: "Opcional. Si no se carga, se usa la imagen principal.",
    }),
    defineField({
      name: "affiliateStore",
      title: "Tienda asociada",
      type: "reference",
      to: [{ type: "affiliateStore" }],
      description: "Opcional. Si se asigna, el banner mostrara la tienda relacionada.",
    }),
    defineField({
      name: "product",
      title: "Producto destacado",
      type: "reference",
      to: [{ type: "product" }],
      description: "Opcional. Producto o articulo mencionado en el banner.",
    }),
    defineField({
      name: "sortOrder",
      title: "Orden",
      type: "number",
      initialValue: 1,
      validation: (Rule) => Rule.required().integer().min(1),
    }),
    defineField({
      name: "displayDurationSeconds",
      title: "Duracion visible (segundos)",
      type: "number",
      initialValue: 6,
      description: "Tiempo que este banner permanece visible antes de cambiar.",
      validation: (Rule) => Rule.required().integer().min(2).max(30),
    }),
    defineField({
      name: "validFrom",
      title: "Visible desde",
      type: "datetime",
    }),
    defineField({
      name: "validUntil",
      title: "Visible hasta",
      type: "datetime",
      validation: (Rule) =>
        Rule.custom((value, context) => {
          const validFrom = context.document?.validFrom as string | undefined;

          if (!value || !validFrom) {
            return true;
          }

          return new Date(value) >= new Date(validFrom)
            ? true
            : "La fecha final debe ser posterior a la fecha inicial.";
        }),
    }),
    defineField({
      name: "isActive",
      title: "Activo",
      type: "boolean",
      initialValue: true,
    }),
    defineField({
      name: "ctaText",
      title: "Texto del boton",
      type: "string",
      validation: (Rule) => Rule.max(30),
    }),
    defineField({
      name: "ctaLink",
      title: "Enlace del boton",
      type: "url",
    }),
    defineField({
      name: "sale",
      title: "Promocion asociada",
      type: "reference",
      to: [{ type: "sale" }],
      description:
        "Opcional. Si se selecciona una promocion activa, el banner mostrara descuento y cupon.",
    }),
  ],
  orderings: [
    {
      title: "Orden manual",
      name: "sortOrderAsc",
      by: [
        { field: "sortOrder", direction: "asc" },
        { field: "_updatedAt", direction: "desc" },
      ],
    },
  ],
  preview: {
    select: {
      title: "title",
      subtitle: "description",
      media: "desktopImage",
      sortOrder: "sortOrder",
      isActive: "isActive",
      bannerType: "bannerType",
      mainColor: "mainColor",
    },
    prepare(selection) {
      const { title, subtitle, media, sortOrder, isActive, bannerType, mainColor } = selection;

      const status = isActive ? "Activo" : "Inactivo";
      const typeLabel = getBannerTypeLabel(bannerType as string | undefined);
      const colorLabel = getMainColorLabel(mainColor as string | undefined);

      return {
        title: title || "Banner sin titulo",
        subtitle: `#${sortOrder || 0} - ${typeLabel} - Color: ${colorLabel} - ${status}${subtitle ? ` - ${subtitle}` : ""}`,
        media: media as any,
      };
    },
  },
});
