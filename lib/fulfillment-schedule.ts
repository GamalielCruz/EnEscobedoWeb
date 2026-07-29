export const FULFILLMENT_TIMEZONE = "America/Mexico_City" as const;

export const WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export type Weekday = (typeof WEEKDAYS)[number];
export type FulfillmentType = "delivery" | "pickup";
export type FulfillmentTiming = "asap" | "scheduled";
export type StoreAvailabilityStatus =
  | "open_delivery_available"
  | "open_pickup_only"
  | "closed_scheduling_available"
  | "closed_no_future_schedule"
  | "delivery_temporarily_unavailable"
  | "outside_delivery_hours"
  | "outside_coverage";

export type DeliveryDaySchedule = {
  enabled: boolean;
  startTime: string;
  endTime: string;
  scheduledOrdersEnabled?: boolean;
};

export type DeliveryScheduleException = {
  _key?: string;
  date: string;
  deliveryEnabled: boolean;
  startTime?: string;
  endTime?: string;
  reason?: string;
};

export type DeliveryPause = {
  active: boolean;
  startAt?: string;
  estimatedResumeAt?: string;
  reason?: string;
  allowFutureScheduling?: boolean;
};

export type DeliveryScheduleConfig = {
  timezone: typeof FULFILLMENT_TIMEZONE;
  weeklySchedule: Record<Weekday, DeliveryDaySchedule>;
  scheduledOrdersEnabled: boolean;
  minimumAdvanceMinutes: number;
  maximumScheduledDays: number;
  slotMinutes: number;
  operationalMarginMinutes: number;
  driverAssignmentMarginMinutes: number;
  estimatedTravelMinutes: number;
  riskBeforeMinutes: number;
  adminAlertBeforeMinutes: number;
  contingencyBeforeMinutes: number;
  exceptions: DeliveryScheduleException[];
  pause: DeliveryPause;
  maximumOrdersPerSlot?: number;
  maximumDeliveryOrdersPerSlot?: number;
  maximumPickupOrdersPerSlot?: number;
};

export type StoreSchedule = {
  isActive?: boolean | null;
  isOpen?: boolean | null;
  manualOperationalStatus?: "open" | "closed" | "auto" | null;
  operatingHours?: Partial<Record<Weekday, string>> | null;
  serviceTypes?: { delivery?: boolean; pickup?: boolean } | null;
  scheduledOrdersEnabled?: boolean | null;
  minimumPreparationMinutes?: number | null;
  scheduledOrderIntervalMinutes?: number | null;
  maximumScheduledDays?: number | null;
  lastDeliveryOrderMinutesBeforeClose?: number | null;
  lastPickupOrderMinutesBeforeClose?: number | null;
  deliveryTimeMin?: number | null;
};

export type FulfillmentSlot = {
  start: string;
  end: string;
  timezone: typeof FULFILLMENT_TIMEZONE;
  date: string;
  storeScheduleSnapshot: {
    openingTime: string;
    closingTime: string;
  };
  deliveryScheduleSnapshot?: {
    openingTime: string;
    closingTime: string;
  };
};

export type StoreAvailability = {
  status: StoreAvailabilityStatus;
  isStoreOpen: boolean;
  deliveryAvailableNow: boolean;
  pickupAvailableNow: boolean;
  asapAvailable: boolean;
  schedulingAvailable: boolean;
  nextOpeningAt?: string;
  nextDeliverySlot?: { start: string; end: string };
  reason?: string;
  slots: FulfillmentSlot[];
};

export type FulfillmentSelection =
  | { timing: "asap" }
  | {
      timing: "scheduled";
      scheduledSlot: {
        startAt: string;
        endAt: string;
        timezone?: string;
      };
    };

export const DEFAULT_DELIVERY_SCHEDULE: DeliveryScheduleConfig = {
  timezone: FULFILLMENT_TIMEZONE,
  weeklySchedule: Object.fromEntries(
    WEEKDAYS.map((day) => [
      day,
      {
        enabled: true,
        startTime: "10:00",
        endTime: "18:00",
        scheduledOrdersEnabled: true,
      },
    ])
  ) as Record<Weekday, DeliveryDaySchedule>,
  scheduledOrdersEnabled: true,
  minimumAdvanceMinutes: 60,
  maximumScheduledDays: 7,
  slotMinutes: 30,
  operationalMarginMinutes: 30,
  driverAssignmentMarginMinutes: 20,
  estimatedTravelMinutes: 15,
  riskBeforeMinutes: 20,
  adminAlertBeforeMinutes: 10,
  contingencyBeforeMinutes: 5,
  exceptions: [],
  pause: { active: false, allowFutureScheduling: true },
};

const weekdayFromIntl: Record<string, Weekday> = {
  Mon: "monday",
  Tue: "tuesday",
  Wed: "wednesday",
  Thu: "thursday",
  Fri: "friday",
  Sat: "saturday",
  Sun: "sunday",
};

function finiteNumber(value: unknown, fallback: number, minimum = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, parsed) : fallback;
}

function isTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function normalizeDeliveryScheduleConfig(
  value?: Partial<DeliveryScheduleConfig> | null
): DeliveryScheduleConfig {
  const source = value ?? {};
  return {
    ...DEFAULT_DELIVERY_SCHEDULE,
    ...source,
    timezone: FULFILLMENT_TIMEZONE,
    weeklySchedule: Object.fromEntries(
      WEEKDAYS.map((day) => {
        const candidate = source.weeklySchedule?.[day];
        const fallback = DEFAULT_DELIVERY_SCHEDULE.weeklySchedule[day];
        return [
          day,
          {
            enabled: candidate?.enabled ?? fallback.enabled,
            startTime: isTime(candidate?.startTime) ? candidate.startTime : fallback.startTime,
            endTime: isTime(candidate?.endTime) ? candidate.endTime : fallback.endTime,
            scheduledOrdersEnabled:
              candidate?.scheduledOrdersEnabled ?? fallback.scheduledOrdersEnabled,
          },
        ];
      })
    ) as Record<Weekday, DeliveryDaySchedule>,
    scheduledOrdersEnabled: source.scheduledOrdersEnabled ?? true,
    minimumAdvanceMinutes: finiteNumber(source.minimumAdvanceMinutes, 60),
    maximumScheduledDays: finiteNumber(source.maximumScheduledDays, 7, 1),
    slotMinutes: finiteNumber(source.slotMinutes, 30, 30),
    operationalMarginMinutes: finiteNumber(source.operationalMarginMinutes, 30),
    driverAssignmentMarginMinutes: finiteNumber(source.driverAssignmentMarginMinutes, 20),
    estimatedTravelMinutes: finiteNumber(source.estimatedTravelMinutes, 15),
    riskBeforeMinutes: finiteNumber(source.riskBeforeMinutes, 20),
    adminAlertBeforeMinutes: finiteNumber(source.adminAlertBeforeMinutes, 10),
    contingencyBeforeMinutes: finiteNumber(source.contingencyBeforeMinutes, 5),
    exceptions: Array.isArray(source.exceptions) ? source.exceptions : [],
    pause: {
      active: source.pause?.active === true,
      startAt: source.pause?.startAt,
      estimatedResumeAt: source.pause?.estimatedResumeAt,
      reason: source.pause?.reason,
      allowFutureScheduling: source.pause?.allowFutureScheduling !== false,
    },
  };
}

function zonedParts(date: Date, timeZone = FULFILLMENT_TIMEZONE) {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      weekday: "short",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  return {
    dateKey: `${values.year}-${values.month}-${values.day}`,
    minutes: Number(values.hour) * 60 + Number(values.minute),
    weekday: weekdayFromIntl[values.weekday],
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
}

export function zonedDateTimeToDate(
  dateKey: string,
  time: string,
  timeZone = FULFILLMENT_TIMEZONE
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !isTime(time)) {
    throw new Error("Fecha u hora invalida.");
  }
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const desiredUtc = Date.UTC(year, month - 1, day, hour, minute);
  let instant = new Date(desiredUtc);

  // Intl supplies the real zone offset without hardcoding UTC-6 or DST rules.
  for (let index = 0; index < 2; index += 1) {
    const current = zonedParts(instant, timeZone);
    const representedUtc = Date.UTC(
      current.year,
      current.month - 1,
      current.day,
      current.hour,
      current.minute
    );
    instant = new Date(instant.getTime() + desiredUtc - representedUtc);
  }
  return instant;
}

export function addDays(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
    2,
    "0"
  )}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function weekdayForDate(dateKey: string) {
  return zonedParts(zonedDateTimeToDate(dateKey, "12:00")).weekday;
}

function parseTime(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function formatTime(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(
    minutes % 60
  ).padStart(2, "0")}`;
}

function parseStoreHours(value?: string | null) {
  if (!value || value.trim().toLowerCase() === "cerrado") return null;
  const match = value.match(
    /([01]?\d|2[0-3]):([0-5]\d)\s*-\s*([01]?\d|2[0-3]):([0-5]\d)/
  );
  if (!match) return null;
  const startTime = `${match[1].padStart(2, "0")}:${match[2]}`;
  const endTime = `${match[3].padStart(2, "0")}:${match[4]}`;
  const start = parseTime(startTime);
  const end = parseTime(endTime);
  return end > start ? { start, end, startTime, endTime } : null;
}

function deliveryHoursForDate(config: DeliveryScheduleConfig, dateKey: string) {
  const day = config.weeklySchedule[weekdayForDate(dateKey)];
  const exception = config.exceptions.find((item) => item.date === dateKey);
  if (exception) {
    if (!exception.deliveryEnabled) return null;
    const startTime = isTime(exception.startTime) ? exception.startTime : day.startTime;
    const endTime = isTime(exception.endTime) ? exception.endTime : day.endTime;
    return {
      enabled: true,
      startTime,
      endTime,
      scheduledOrdersEnabled: day.scheduledOrdersEnabled !== false,
      reason: exception.reason,
    };
  }
  return day.enabled ? day : null;
}

function pauseContains(config: DeliveryScheduleConfig, date: Date) {
  if (!config.pause.active) return false;
  const start = config.pause.startAt ? new Date(config.pause.startAt).getTime() : -Infinity;
  const end = config.pause.estimatedResumeAt
    ? new Date(config.pause.estimatedResumeAt).getTime()
    : Infinity;
  return date.getTime() >= start && date.getTime() < end;
}

function pauseAllowsSlot(config: DeliveryScheduleConfig, start: Date) {
  if (!config.pause.active) return true;
  if (!config.pause.allowFutureScheduling) return false;
  if (!config.pause.estimatedResumeAt) return false;
  return start.getTime() >= new Date(config.pause.estimatedResumeAt).getTime();
}

function getStoreRange(store: StoreSchedule, dateKey: string) {
  return parseStoreHours(store.operatingHours?.[weekdayForDate(dateKey)]);
}

function slotFor(
  dateKey: string,
  startMinutes: number,
  endMinutes: number,
  storeRange: NonNullable<ReturnType<typeof parseStoreHours>>,
  deliveryRange?: { startTime: string; endTime: string }
): FulfillmentSlot {
  const start = zonedDateTimeToDate(dateKey, formatTime(startMinutes));
  const end = zonedDateTimeToDate(dateKey, formatTime(endMinutes));
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    timezone: FULFILLMENT_TIMEZONE,
    date: dateKey,
    storeScheduleSnapshot: {
      openingTime: storeRange.startTime,
      closingTime: storeRange.endTime,
    },
    deliveryScheduleSnapshot: deliveryRange
      ? {
          openingTime: deliveryRange.startTime,
          closingTime: deliveryRange.endTime,
        }
      : undefined,
  };
}

export function getStoreAvailability(input: {
  store: StoreSchedule;
  config?: Partial<DeliveryScheduleConfig> | null;
  fulfillmentType: FulfillmentType;
  coverageAllowed?: boolean;
  now?: Date;
}) {
  const config = normalizeDeliveryScheduleConfig(input.config);
  const now = input.now ?? new Date();
  const localNow = zonedParts(now);
  const store = input.store;
  const fulfillmentType = input.fulfillmentType;
  const coverageAllowed = input.coverageAllowed !== false;
  const storeOperationallyEnabled =
    store.isActive !== false && store.isOpen !== false;
  const modalityEnabled = store.serviceTypes?.[fulfillmentType] === true;
  const storeEnabled = storeOperationallyEnabled && modalityEnabled;
  const prepMinutes = finiteNumber(
    store.minimumPreparationMinutes ?? store.deliveryTimeMin,
    30
  );
  const travelMinutes = fulfillmentType === "delivery" ? config.estimatedTravelMinutes : 0;
  const slotMinutes = finiteNumber(
    store.scheduledOrderIntervalMinutes,
    config.slotMinutes,
    30
  );
  const maximumDays = Math.min(
    config.maximumScheduledDays,
    finiteNumber(store.maximumScheduledDays, config.maximumScheduledDays, 1)
  );
  const minimumStart = now.getTime() + config.minimumAdvanceMinutes * 60_000;
  const slots: FulfillmentSlot[] = [];
  let nextOpeningAt: string | undefined;

  for (let offset = 0; offset <= maximumDays; offset += 1) {
    const dateKey = addDays(localNow.dateKey, offset);
    const storeRange = getStoreRange(store, dateKey);
    if (!storeRange) continue;
    nextOpeningAt ??= zonedDateTimeToDate(dateKey, storeRange.startTime).toISOString();
    if (
      !storeEnabled ||
      store.scheduledOrdersEnabled === false ||
      !config.scheduledOrdersEnabled
    ) {
      continue;
    }

    let earliest: number;
    let latest: number;
    let deliveryRange:
      | { startTime: string; endTime: string; scheduledOrdersEnabled?: boolean }
      | undefined;

    if (fulfillmentType === "delivery") {
      if (!coverageAllowed) continue;
      const deliveryDay = deliveryHoursForDate(config, dateKey);
      if (!deliveryDay || deliveryDay.scheduledOrdersEnabled === false) continue;
      deliveryRange = deliveryDay;
      earliest = Math.max(
        parseTime(deliveryDay.startTime),
        storeRange.start + prepMinutes + travelMinutes
      );
      latest = Math.min(
        storeRange.end -
          finiteNumber(store.lastDeliveryOrderMinutesBeforeClose, 30),
        parseTime(deliveryDay.endTime) - config.operationalMarginMinutes
      );
    } else {
      earliest = storeRange.start + prepMinutes;
      latest =
        storeRange.end -
        finiteNumber(store.lastPickupOrderMinutesBeforeClose, 15);
    }

    let cursor = Math.ceil(earliest / slotMinutes) * slotMinutes;
    while (cursor + slotMinutes <= latest) {
      const slot = slotFor(
        dateKey,
        cursor,
        cursor + slotMinutes,
        storeRange,
        deliveryRange
      );
      if (
        slot.start > now.toISOString() &&
        new Date(slot.start).getTime() >= minimumStart &&
        (fulfillmentType !== "delivery" ||
          (!pauseContains(config, new Date(slot.start)) &&
            pauseAllowsSlot(config, new Date(slot.start))))
      ) {
        slots.push(slot);
      }
      cursor += slotMinutes;
    }
  }

  const todayStoreRange = getStoreRange(store, localNow.dateKey);
  const manuallyOpened = store.manualOperationalStatus === "open";
  const manuallyClosed = store.manualOperationalStatus === "closed";
  const withinStoreHours = Boolean(
    todayStoreRange &&
      localNow.minutes >= todayStoreRange.start &&
      localNow.minutes < todayStoreRange.end
  );
  const isStoreOpen = Boolean(
    storeOperationallyEnabled &&
      !manuallyClosed &&
      (manuallyOpened || withinStoreHours)
  );
  const readyAtMinutes = localNow.minutes + prepMinutes + travelMinutes;
  const pickupFitsStoreHours =
    manuallyOpened ||
    Boolean(
      todayStoreRange &&
        readyAtMinutes <=
          todayStoreRange.end -
            finiteNumber(store.lastPickupOrderMinutesBeforeClose, 15)
    );
  const pickupAvailableNow = Boolean(
    store.serviceTypes?.pickup === true &&
      isStoreOpen &&
      pickupFitsStoreHours
  );

  const todayDelivery = deliveryHoursForDate(config, localNow.dateKey);
  const deliveryFitsStoreHours =
    manuallyOpened ||
    Boolean(
      todayStoreRange &&
        readyAtMinutes <=
          todayStoreRange.end -
            finiteNumber(store.lastDeliveryOrderMinutesBeforeClose, 30)
    );
  const deliveryAvailableNow = Boolean(
    store.serviceTypes?.delivery === true &&
      isStoreOpen &&
      coverageAllowed &&
      todayDelivery &&
      !pauseContains(config, now) &&
      localNow.minutes >= parseTime(todayDelivery.startTime) &&
      readyAtMinutes <=
        parseTime(todayDelivery.endTime) - config.operationalMarginMinutes &&
      deliveryFitsStoreHours
  );
  const asapAvailable =
    fulfillmentType === "delivery" ? deliveryAvailableNow : pickupAvailableNow;
  const schedulingAvailable = slots.length > 0;

  let status: StoreAvailabilityStatus;
  let reason: string | undefined;
  if (!modalityEnabled) {
    status = "closed_no_future_schedule";
    reason = "La tienda no acepta esta modalidad.";
  } else if (fulfillmentType === "delivery" && !coverageAllowed) {
    status = "outside_coverage";
    reason = "La direccion esta fuera de la cobertura de entrega.";
  } else if (fulfillmentType === "delivery" && pauseContains(config, now)) {
    status = "delivery_temporarily_unavailable";
    reason =
      config.pause.reason ||
      "El servicio de entrega esta pausado temporalmente.";
  } else if (fulfillmentType === "delivery" && deliveryAvailableNow) {
    status = "open_delivery_available";
  } else if (fulfillmentType === "pickup" && pickupAvailableNow) {
    status = "open_pickup_only";
  } else if (schedulingAvailable) {
    status = "closed_scheduling_available";
    reason = "No disponible ahora; elige un horario futuro.";
  } else if (isStoreOpen && fulfillmentType === "delivery") {
    status = "outside_delivery_hours";
    reason = "Fuera del horario de reparto de ElMenu.";
  } else {
    status = "closed_no_future_schedule";
    reason = "No hay horarios futuros disponibles.";
  }

  return {
    status,
    isStoreOpen,
    deliveryAvailableNow,
    pickupAvailableNow,
    asapAvailable,
    schedulingAvailable,
    nextOpeningAt,
    nextDeliverySlot: slots[0]
      ? { start: slots[0].start, end: slots[0].end }
      : undefined,
    reason,
    slots,
  } satisfies StoreAvailability;
}

export class DeliverySlotUnavailableError extends Error {
  code = "DELIVERY_SLOT_UNAVAILABLE" as const;
  alternatives: FulfillmentSlot[];

  constructor(message: string, alternatives: FulfillmentSlot[]) {
    super(message);
    this.alternatives = alternatives.slice(0, 10);
  }
}

export function validateFulfillmentSelection(
  availability: StoreAvailability,
  selection?: FulfillmentSelection | null
) {
  const requested = selection ?? { timing: "asap" as const };
  if (requested.timing === "asap") {
    if (!availability.asapAvailable) {
      throw new DeliverySlotUnavailableError(
        availability.reason || "La entrega inmediata no esta disponible.",
        availability.slots
      );
    }
    return { timing: "asap" as const };
  }

  const match = availability.slots.find(
    (slot) =>
      slot.start === requested.scheduledSlot.startAt &&
      slot.end === requested.scheduledSlot.endAt
  );
  if (!match) {
    throw new DeliverySlotUnavailableError(
      "El horario seleccionado ya no esta disponible.",
      availability.slots
    );
  }
  return { timing: "scheduled" as const, slot: match };
}

export function calculateScheduledDispatchAt(input: {
  startAt: string;
  estimatedTravelMinutes?: number;
  driverAssignmentMarginMinutes?: number;
}) {
  const leadMinutes =
    finiteNumber(input.estimatedTravelMinutes, 15) +
    finiteNumber(input.driverAssignmentMarginMinutes, 20);
  return new Date(new Date(input.startAt).getTime() - leadMinutes * 60_000).toISOString();
}

export function calculateScheduledPreparationAt(input: {
  startAt: string;
  estimatedPreparationMinutes?: number;
}) {
  return new Date(
    new Date(input.startAt).getTime() -
      finiteNumber(input.estimatedPreparationMinutes, 30) * 60_000
  ).toISOString();
}

export function getScheduledOrderRisk(input: {
  startAt: string;
  hasDriver: boolean;
  now?: Date;
  riskBeforeMinutes?: number;
  adminAlertBeforeMinutes?: number;
  contingencyBeforeMinutes?: number;
}) {
  if (input.hasDriver) return "none" as const;
  const minutes = (new Date(input.startAt).getTime() - (input.now ?? new Date()).getTime()) / 60_000;
  if (minutes <= finiteNumber(input.contingencyBeforeMinutes, 5)) return "contingency" as const;
  if (minutes <= finiteNumber(input.adminAlertBeforeMinutes, 10)) return "alert" as const;
  if (minutes <= finiteNumber(input.riskBeforeMinutes, 20)) return "risk" as const;
  if (minutes <= 30) return "watch" as const;
  return "none" as const;
}

export function shouldStartScheduledPreparation(input: {
  fulfillmentTiming?: string;
  nextOrderStatus?: string;
  preparationStatus?: string;
}) {
  return (
    input.fulfillmentTiming === "scheduled" &&
    input.nextOrderStatus === "processing" &&
    input.preparationStatus !== "in_preparation"
  );
}

export function shouldSendScheduledNoDriverContingency(input: {
  orderType?: string;
  risk?: string;
  hasDriver: boolean;
  scheduledDispatchStartedAt?: string;
}) {
  return (
    input.orderType === "delivery" &&
    input.risk === "contingency" &&
    !input.hasDriver &&
    Boolean(input.scheduledDispatchStartedAt)
  );
}
