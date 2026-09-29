import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_DELIVERY_SCHEDULE,
  calculateScheduledPreparationAt,
  calculateScheduledDispatchAt,
  getScheduledOrderRisk,
  getStoreAvailability,
  normalizeDeliveryScheduleConfig,
  shouldSendScheduledNoDriverContingency,
  shouldStartScheduledPreparation,
  validateFulfillmentSelection,
  zonedDateTimeToDate,
} from "./fulfillment-schedule.ts";

const baseStore = {
  isActive: true,
  isOpen: true,
  manualOperationalStatus: "auto",
  serviceTypes: { delivery: true, pickup: true },
  scheduledOrdersEnabled: true,
  minimumPreparationMinutes: 30,
  operatingHours: {
    monday: "09:00 - 22:00",
    tuesday: "09:00 - 22:00",
    wednesday: "09:00 - 22:00",
    thursday: "09:00 - 22:00",
    friday: "09:00 - 22:00",
    saturday: "09:00 - 22:00",
    sunday: "09:00 - 22:00",
  },
};

const mondayNoon = new Date("2026-07-27T18:00:00.000Z");

test("permite ASAP solo dentro de tienda, reparto y cobertura", () => {
  assert.equal(
    getStoreAvailability({
      store: baseStore,
      config: DEFAULT_DELIVERY_SCHEDULE,
      fulfillmentType: "delivery",
      now: mondayNoon,
    }).asapAvailable,
    true
  );
  assert.equal(
    getStoreAvailability({
      store: baseStore,
      config: DEFAULT_DELIVERY_SCHEDULE,
      fulfillmentType: "delivery",
      coverageAllowed: false,
      now: mondayNoon,
    }).asapAvailable,
    false
  );
});

test("intersecta cierre global, excepciones y pickup independiente", () => {
  const delivery = getStoreAvailability({
    store: baseStore,
    config: DEFAULT_DELIVERY_SCHEDULE,
    fulfillmentType: "delivery",
    now: mondayNoon,
  });
  assert.ok(delivery.slots.every((slot) => new Date(slot.end).getUTCHours() <= 23));

  const holiday = getStoreAvailability({
    store: baseStore,
    config: {
      ...DEFAULT_DELIVERY_SCHEDULE,
      exceptions: [{ date: "2026-07-27", deliveryEnabled: false }],
    },
    fulfillmentType: "delivery",
    now: mondayNoon,
  });
  assert.equal(holiday.asapAvailable, false);

  const pickup = getStoreAvailability({
    store: baseStore,
    config: {
      ...DEFAULT_DELIVERY_SCHEDULE,
      weeklySchedule: Object.fromEntries(
        Object.entries(DEFAULT_DELIVERY_SCHEDULE.weeklySchedule).map(([day, value]) => [
          day,
          { ...value, enabled: false },
        ])
      ),
    },
    fulfillmentType: "pickup",
    now: mondayNoon,
  });
  assert.equal(pickup.asapAvailable, true);
  assert.ok(pickup.slots.length > 0);
});

test("pausa bloquea ahora y permite slots posteriores a reactivacion", () => {
  const availability = getStoreAvailability({
    store: baseStore,
    config: {
      ...DEFAULT_DELIVERY_SCHEDULE,
      pause: {
        active: true,
        startAt: "2026-07-27T17:00:00.000Z",
        estimatedResumeAt: "2026-07-27T20:00:00.000Z",
        allowFutureScheduling: true,
      },
    },
    fulfillmentType: "delivery",
    now: mondayNoon,
  });
  assert.equal(availability.status, "delivery_temporarily_unavailable");
  assert.ok(availability.slots.every((slot) => slot.start >= "2026-07-27T20:00:00.000Z"));
});

test("rechaza un slot vencido con alternativas y calcula dispatch", () => {
  const availability = getStoreAvailability({
    store: baseStore,
    config: DEFAULT_DELIVERY_SCHEDULE,
    fulfillmentType: "delivery",
    now: mondayNoon,
  });
  assert.throws(
    () =>
      validateFulfillmentSelection(availability, {
        timing: "scheduled",
        scheduledSlot: {
          startAt: "2026-07-27T10:00:00.000Z",
          endAt: "2026-07-27T10:30:00.000Z",
        },
      }),
    /ya no esta disponible/
  );
  assert.equal(
    calculateScheduledDispatchAt({
      startAt: "2026-07-27T21:00:00.000Z",
      estimatedTravelMinutes: 15,
      driverAssignmentMarginMinutes: 20,
    }),
    "2026-07-27T20:25:00.000Z"
  );
});

test("tienda cerrada hoy permite programar cuando abre mañana", () => {
  const availability = getStoreAvailability({
    store: {
      ...baseStore,
      operatingHours: {
        ...baseStore.operatingHours,
        monday: "Cerrado",
        tuesday: "13:00 - 22:00",
      },
    },
    config: DEFAULT_DELIVERY_SCHEDULE,
    fulfillmentType: "delivery",
    now: mondayNoon,
  });
  assert.equal(availability.status, "closed_scheduling_available");
  assert.equal(availability.slots[0].date, "2026-07-28");
});

test("reparto hasta 18:00 nunca ofrece un slot posterior al margen global", () => {
  const availability = getStoreAvailability({
    store: baseStore,
    config: DEFAULT_DELIVERY_SCHEDULE,
    fulfillmentType: "delivery",
    now: mondayNoon,
  });
  const last = availability.slots.filter((slot) => slot.date === "2026-07-27").at(-1);
  assert.equal(last.end, "2026-07-27T23:30:00.000Z");
});

test("sin horarios de tienda futuros no permite programar", () => {
  const availability = getStoreAvailability({
    store: {
      ...baseStore,
      operatingHours: Object.fromEntries(
        Object.keys(baseStore.operatingHours).map((day) => [day, "Cerrado"])
      ),
    },
    config: DEFAULT_DELIVERY_SCHEDULE,
    fulfillmentType: "delivery",
    now: mondayNoon,
  });
  assert.equal(availability.schedulingAvailable, false);
  assert.equal(availability.status, "closed_no_future_schedule");
});

test("fuera de cobertura bloquea delivery pero no pickup", () => {
  const delivery = getStoreAvailability({
    store: baseStore,
    config: DEFAULT_DELIVERY_SCHEDULE,
    fulfillmentType: "delivery",
    coverageAllowed: false,
    now: mondayNoon,
  });
  const pickup = getStoreAvailability({
    store: baseStore,
    config: DEFAULT_DELIVERY_SCHEDULE,
    fulfillmentType: "pickup",
    coverageAllowed: false,
    now: mondayNoon,
  });
  assert.equal(delivery.status, "outside_coverage");
  assert.equal(delivery.slots.length, 0);
  assert.equal(pickup.asapAvailable, true);
});

test("pausa sin programación futura elimina los slots de delivery", () => {
  const availability = getStoreAvailability({
    store: baseStore,
    config: {
      ...DEFAULT_DELIVERY_SCHEDULE,
      pause: {
        active: true,
        startAt: "2026-07-27T17:00:00.000Z",
        estimatedResumeAt: "2026-07-27T20:00:00.000Z",
        allowFutureScheduling: false,
      },
    },
    fulfillmentType: "delivery",
    now: mondayNoon,
  });
  assert.equal(availability.asapAvailable, false);
  assert.equal(availability.slots.length, 0);
});

test("una excepción especial reemplaza el horario semanal", () => {
  const availability = getStoreAvailability({
    store: baseStore,
    config: {
      ...DEFAULT_DELIVERY_SCHEDULE,
      exceptions: [{
        date: "2026-07-27",
        deliveryEnabled: true,
        startTime: "12:00",
        endTime: "16:00",
      }],
    },
    fulfillmentType: "delivery",
    now: mondayNoon,
  });
  const today = availability.slots.filter((slot) => slot.date === "2026-07-27");
  assert.equal(today.at(-1).end, "2026-07-27T21:30:00.000Z");
  assert.equal(today[0].deliveryScheduleSnapshot.openingTime, "12:00");
});

test("pickup ignora pausa y horario global de repartidores", () => {
  const availability = getStoreAvailability({
    store: baseStore,
    config: {
      ...DEFAULT_DELIVERY_SCHEDULE,
      pause: { active: true, allowFutureScheduling: false },
      weeklySchedule: Object.fromEntries(
        Object.entries(DEFAULT_DELIVERY_SCHEDULE.weeklySchedule).map(([day, value]) => [
          day,
          { ...value, enabled: false },
        ])
      ),
    },
    fulfillmentType: "pickup",
    now: mondayNoon,
  });
  assert.equal(availability.asapAvailable, true);
  assert.ok(availability.slots.length > 0);
});

test("la validación controlada conserva alternativas", () => {
  const availability = getStoreAvailability({
    store: baseStore,
    config: DEFAULT_DELIVERY_SCHEDULE,
    fulfillmentType: "delivery",
    now: mondayNoon,
  });
  assert.throws(
    () => validateFulfillmentSelection(availability, {
      timing: "scheduled",
      scheduledSlot: {
        startAt: "2026-07-28T12:00:00.000Z",
        endAt: "2026-07-28T12:30:00.000Z",
      },
    }),
    (error) => error.code === "DELIVERY_SLOT_UNAVAILABLE" && error.alternatives.length > 0
  );
});

test("preparación y dispatch se calculan desde el inicio del intervalo", () => {
  assert.equal(
    calculateScheduledPreparationAt({
      startAt: "2026-07-27T21:00:00.000Z",
      estimatedPreparationMinutes: 30,
    }),
    "2026-07-27T20:30:00.000Z"
  );
  assert.equal(
    calculateScheduledDispatchAt({
      startAt: "2026-07-27T21:00:00.000Z",
      estimatedTravelMinutes: 15,
      driverAssignmentMarginMinutes: 20,
    }),
    "2026-07-27T20:25:00.000Z"
  );
});

test("riesgo usa umbrales editables y desaparece con repartidor", () => {
  const startAt = "2026-07-27T21:00:00.000Z";
  assert.equal(getScheduledOrderRisk({
    startAt,
    hasDriver: false,
    now: new Date("2026-07-27T20:41:00.000Z"),
    riskBeforeMinutes: 20,
    adminAlertBeforeMinutes: 10,
    contingencyBeforeMinutes: 5,
  }), "risk");
  assert.equal(getScheduledOrderRisk({
    startAt,
    hasDriver: false,
    now: new Date("2026-07-27T20:56:00.000Z"),
    riskBeforeMinutes: 20,
    adminAlertBeforeMinutes: 10,
    contingencyBeforeMinutes: 5,
  }), "contingency");
  assert.equal(getScheduledOrderRisk({ startAt, hasDriver: true }), "none");
});

test("la conversión de zona usa America/Mexico_City", () => {
  assert.equal(
    zonedDateTimeToDate("2026-07-27", "15:00").toISOString(),
    "2026-07-27T21:00:00.000Z"
  );
});

test("normalización conserva capacidad futura y corrige configuración inválida", () => {
  const config = normalizeDeliveryScheduleConfig({
    minimumAdvanceMinutes: -1,
    slotMinutes: 0,
    maximumOrdersPerSlot: 8,
  });
  assert.equal(config.minimumAdvanceMinutes, 0);
  assert.equal(config.slotMinutes, 30);
  assert.equal(config.maximumOrdersPerSlot, 8);
});

test("valores nulos heredan intervalos globales de 30 minutos", () => {
  const availability = getStoreAvailability({
    store: {
      ...baseStore,
      scheduledOrderIntervalMinutes: null,
      maximumScheduledDays: null,
    },
    config: normalizeDeliveryScheduleConfig({
      slotMinutes: null,
      maximumScheduledDays: null,
    }),
    fulfillmentType: "delivery",
    now: mondayNoon,
  });

  assert.ok(availability.slots.length > 0);
  assert.ok(
    availability.slots.every(
      (slot) => new Date(slot.end).getTime() - new Date(slot.start).getTime() === 30 * 60_000
    )
  );
  assert.ok(new Set(availability.slots.map((slot) => slot.date)).size > 1);
});

test("apertura manual permite ASAP sin inventar horarios programados", () => {
  const pickup = getStoreAvailability({
    store: {
      ...baseStore,
      manualOperationalStatus: "open",
      operatingHours: null,
    },
    config: DEFAULT_DELIVERY_SCHEDULE,
    fulfillmentType: "pickup",
    now: mondayNoon,
  });
  assert.equal(pickup.isStoreOpen, true);
  assert.equal(pickup.asapAvailable, true);
  assert.equal(pickup.schedulingAvailable, false);

  const unsupportedDelivery = getStoreAvailability({
    store: {
      ...baseStore,
      manualOperationalStatus: "open",
      operatingHours: null,
      serviceTypes: { delivery: false, pickup: true },
    },
    config: DEFAULT_DELIVERY_SCHEDULE,
    fulfillmentType: "delivery",
    now: mondayNoon,
  });
  assert.equal(unsupportedDelivery.isStoreOpen, true);
  assert.equal(unsupportedDelivery.asapAvailable, false);
  assert.equal(unsupportedDelivery.reason, "La tienda no acepta esta modalidad.");
});

test("preparación solo inicia por transición real del restaurante", () => {
  assert.equal(shouldStartScheduledPreparation({
    fulfillmentTiming: "scheduled",
    nextOrderStatus: "processing",
    preparationStatus: "not_started",
  }), true);
  assert.equal(shouldStartScheduledPreparation({
    fulfillmentTiming: "scheduled",
    nextOrderStatus: "pending",
    preparationStatus: "not_started",
  }), false);
  assert.equal(shouldStartScheduledPreparation({
    fulfillmentTiming: "scheduled",
    nextOrderStatus: "processing",
    preparationStatus: "in_preparation",
  }), false);
});

test("contingencia WhatsApp exige delivery y dispatch ya intentado", () => {
  assert.equal(shouldSendScheduledNoDriverContingency({
    orderType: "delivery",
    risk: "contingency",
    hasDriver: false,
    scheduledDispatchStartedAt: "2026-07-27T20:25:00.000Z",
  }), true);
  assert.equal(shouldSendScheduledNoDriverContingency({
    orderType: "pickup",
    risk: "contingency",
    hasDriver: false,
    scheduledDispatchStartedAt: "2026-07-27T20:25:00.000Z",
  }), false);
  assert.equal(shouldSendScheduledNoDriverContingency({
    orderType: "delivery",
    risk: "contingency",
    hasDriver: false,
  }), false);
});
