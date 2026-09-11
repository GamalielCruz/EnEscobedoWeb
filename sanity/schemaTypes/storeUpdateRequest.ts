
import { defineField, defineType } from "sanity";

export const storeUpdateRequest = defineType({
  name: "storeUpdateRequest",
  title: "Solicitud de Actualización de Tienda",
  type: "document",
  fields: [
    defineField({
      name: "store",
      title: "Tienda",
      type: "reference",
      to: [{ type: "affiliateStore" }],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "changes",
      title: "Cambios Propuestos",
      type: "object",
      description: "Campos que se proponen cambiar",
      fields: [
        defineField({ name: "name", title: "Nombre", type: "string" }),
        defineField({ name: "image", title: "Imagen Principal", type: "image", options: { hotspot: true } }),
        defineField({ name: "coverImage", title: "Imagen de Portada", type: "image", options: { hotspot: true } }),
        defineField({ name: "isOpen", title: "Tienda Abierta", type: "boolean" }),
        defineField({ name: "highDemandMode", title: "Modo Alta Demanda", type: "boolean" }),
        defineField({ name: "hasOwnDelivery", title: "Repartidores propios", type: "boolean" }),
        defineField({ name: "scheduledOrdersEnabled", title: "Pedidos programados", type: "boolean" }),
        defineField({ name: "minimumPreparationMinutes", title: "Preparacion minima", type: "number" }),
        defineField({ name: "scheduledOrderIntervalMinutes", title: "Intervalos", type: "number" }),
        defineField({ name: "maximumScheduledDays", title: "Dias maximos", type: "number" }),
        defineField({ name: "lastDeliveryOrderMinutesBeforeClose", title: "Limite delivery", type: "number" }),
        defineField({ name: "lastPickupOrderMinutesBeforeClose", title: "Limite pickup", type: "number" }),
        
        defineField({
          name: "contact",
          title: "Información de Contacto",
          type: "object",
          fields: [
            defineField({ name: "phone", title: "Teléfono", type: "string" }),
            defineField({ name: "email", title: "Email", type: "string" }),
            defineField({ name: "manager", title: "Encargado", type: "string" }),
          ],
        }),

        defineField({
            name: "operatingHours",
            title: "Horarios de Operación",
            type: "object",
            fields: [
              defineField({ name: "monday", title: "Lunes", type: "string" }),
              defineField({ name: "tuesday", title: "Martes", type: "string" }),
              defineField({ name: "wednesday", title: "Miércoles", type: "string" }),
              defineField({ name: "thursday", title: "Jueves", type: "string" }),
              defineField({ name: "friday", title: "Viernes", type: "string" }),
              defineField({ name: "saturday", title: "Sábado", type: "string" }),
              defineField({ name: "sunday", title: "Domingo", type: "string" }),
            ],
          }),

          defineField({
            name: "serviceTypes",
            title: "Tipos de Servicio Disponibles",
            type: "object",
            fields: [
              defineField({ name: "delivery", title: "Entrega a Domicilio", type: "boolean" }),
              defineField({ name: "pickup", title: "Recoger en Tienda", type: "boolean" }),
              defineField({ name: "deliveryRadius", title: "Radio de Entrega (km)", type: "number" }),
              defineField({ name: "onDemand", title: "Alta Demanda", type: "boolean" }),
              defineField({ name: "onDemandExtraMinutes", title: "Minutos extra por alta demanda", type: "number" }),
              defineField({ name: "minimumOrderDelivery", title: "Pedido Mínimo para Entrega (MXN)", type: "number" }),
            ],
          }),
        
        // Simplified address for now, or full object if needed. 
        // Since address usually changes as a block, passing the full object is okay.
        defineField({
            name: "address",
            title: "Dirección",
            type: "object",
            fields: [
              defineField({ name: "street", title: "Calle y Número", type: "string" }),
              defineField({ name: "city", title: "Ciudad", type: "string" }),
              defineField({ name: "state", title: "Estado", type: "string" }),
              defineField({ name: "postalCode", title: "Código Postal", type: "string" }),
              defineField({ name: "country", title: "País", type: "string" }),
            ],
          }),
      ],
    }),
    defineField({
      name: "status",
      title: "Estado",
      type: "string",
      options: {
        list: [
          { title: "Pendiente", value: "pending" },
          { title: "Aprobado", value: "approved" },
          { title: "Rechazado", value: "rejected" },
        ],
        layout: "radio",
      },
      initialValue: "pending",
    }),
    defineField({ name: "submittedBy", title: "Enviado Por", type: "string" }),
    defineField({ name: "submittedAt", title: "Fecha de Envío", type: "datetime" }),
    defineField({ name: "approvedBy", title: "Aprobado Por", type: "string" }),
    defineField({ name: "approvedAt", title: "Fecha de Aprobación", type: "datetime" }),
    defineField({ name: "rejectedBy", title: "Rechazado Por", type: "string" }),
    defineField({ name: "rejectedAt", title: "Fecha de Rechazo", type: "datetime" }),
    defineField({ name: "rejectionReason", title: "Razón de Rechazo", type: "string" }),
  ],
});
