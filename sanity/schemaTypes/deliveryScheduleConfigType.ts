import { ClockIcon } from "@sanity/icons";
import { defineField, defineType } from "sanity";

const day = (name: string, title: string) =>
  defineField({
    name,
    title,
    type: "object",
    fields: [
      defineField({ name: "enabled", title: "Reparto activo", type: "boolean", initialValue: true }),
      defineField({ name: "startTime", title: "Inicio", type: "string", initialValue: "10:00" }),
      defineField({ name: "endTime", title: "Fin", type: "string", initialValue: "18:00" }),
      defineField({
        name: "scheduledOrdersEnabled",
        title: "Permitir pedidos programados",
        type: "boolean",
        initialValue: true,
      }),
    ],
  });

export const deliveryScheduleConfigType = defineType({
  name: "deliveryScheduleConfig",
  title: "Horario global de reparto",
  type: "document",
  icon: ClockIcon,
  fields: [
    defineField({
      name: "timezone",
      title: "Zona horaria",
      type: "string",
      initialValue: "America/Mexico_City",
      readOnly: true,
    }),
    defineField({
      name: "weeklySchedule",
      title: "Horario habitual",
      type: "object",
      fields: [
        day("monday", "Lunes"),
        day("tuesday", "Martes"),
        day("wednesday", "Miercoles"),
        day("thursday", "Jueves"),
        day("friday", "Viernes"),
        day("saturday", "Sabado"),
        day("sunday", "Domingo"),
      ],
    }),
    defineField({ name: "scheduledOrdersEnabled", title: "Permitir programados", type: "boolean", initialValue: true }),
    defineField({ name: "minimumAdvanceMinutes", title: "Anticipacion minima (min)", type: "number", initialValue: 60 }),
    defineField({ name: "maximumScheduledDays", title: "Dias maximos", type: "number", initialValue: 7 }),
    defineField({ name: "slotMinutes", title: "Duracion del intervalo (min)", type: "number", initialValue: 30, validation: (Rule) => Rule.min(30) }),
    defineField({ name: "operationalMarginMinutes", title: "Margen antes del cierre (min)", type: "number", initialValue: 30 }),
    defineField({ name: "driverAssignmentMarginMinutes", title: "Margen para asignar repartidor (min)", type: "number", initialValue: 20 }),
    defineField({ name: "estimatedTravelMinutes", title: "Traslado estimado (min)", type: "number", initialValue: 15 }),
    defineField({ name: "riskBeforeMinutes", title: "Marcar riesgo antes (min)", type: "number", initialValue: 20 }),
    defineField({ name: "adminAlertBeforeMinutes", title: "Alertar admin antes (min)", type: "number", initialValue: 10 }),
    defineField({ name: "contingencyBeforeMinutes", title: "Contingencia cliente antes (min)", type: "number", initialValue: 5 }),
    defineField({
      name: "exceptions",
      title: "Excepciones",
      type: "array",
      of: [
        {
          type: "object",
          fields: [
            defineField({ name: "date", title: "Fecha", type: "date", validation: (Rule) => Rule.required() }),
            defineField({ name: "deliveryEnabled", title: "Reparto activo", type: "boolean", initialValue: false }),
            defineField({ name: "startTime", title: "Inicio especial", type: "string" }),
            defineField({ name: "endTime", title: "Fin especial", type: "string" }),
            defineField({ name: "reason", title: "Motivo", type: "string" }),
          ],
        },
      ],
    }),
    defineField({
      name: "pause",
      title: "Pausa operativa",
      type: "object",
      fields: [
        defineField({ name: "active", title: "Pausar entregas", type: "boolean", initialValue: false }),
        defineField({ name: "startAt", title: "Inicio", type: "datetime" }),
        defineField({ name: "estimatedResumeAt", title: "Reactivacion estimada", type: "datetime" }),
        defineField({ name: "reason", title: "Motivo visible", type: "string" }),
        defineField({
          name: "allowFutureScheduling",
          title: "Permitir programar despues de reactivar",
          type: "boolean",
          initialValue: true,
        }),
      ],
    }),
    defineField({ name: "maximumOrdersPerSlot", title: "Capacidad total futura", type: "number" }),
    defineField({ name: "maximumDeliveryOrdersPerSlot", title: "Capacidad delivery futura", type: "number" }),
    defineField({ name: "maximumPickupOrdersPerSlot", title: "Capacidad pickup futura", type: "number" }),
  ],
  preview: {
    prepare: () => ({ title: "Horario global de reparto" }),
  },
});
