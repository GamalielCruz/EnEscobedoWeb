import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_DELIVERY_SCHEDULE,
  calculateScheduledDispatchAt,
  getScheduledOrderRisk,
  getStoreAvailability,
  shouldSendScheduledNoDriverContingency,
  validateFulfillmentSelection,
} from "./fulfillment-schedule.ts";
import { buildScheduledOrderTemplateComponents } from "./scheduled-order-whatsapp-config.ts";
import { calculatePickupConversionFinancials } from "./scheduled-order-contingency.ts";

test("flujo integrado: reservar, activar dispatch, contingencia y convertir a pickup", () => {
  const availability = getStoreAvailability({
    store: {
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
    },
    config: DEFAULT_DELIVERY_SCHEDULE,
    fulfillmentType: "delivery",
    now: new Date("2026-07-27T18:00:00.000Z"),
  });
  const slot = availability.slots[0];
  const selection = validateFulfillmentSelection(availability, {
    timing: "scheduled",
    scheduledSlot: { startAt: slot.start, endAt: slot.end },
  });
  const dispatchAt = calculateScheduledDispatchAt({
    startAt: selection.slot.start,
    estimatedTravelMinutes: 15,
    driverAssignmentMarginMinutes: 20,
  });
  const risk = getScheduledOrderRisk({
    startAt: selection.slot.start,
    hasDriver: false,
    now: new Date(new Date(selection.slot.start).getTime() - 4 * 60_000),
  });
  assert.equal(new Date(dispatchAt) < new Date(selection.slot.start), true);
  assert.equal(shouldSendScheduledNoDriverContingency({
    orderType: "delivery",
    risk,
    hasDriver: false,
    scheduledDispatchStartedAt: dispatchAt,
  }), true);
  assert.equal(buildScheduledOrderTemplateComponents({
    templateName: "cliente_entrega_programada_sin_repartidor",
    bodyParameters: ["Ana", "#1", "13:00"],
    buttonParameters: ["SCHEDULE WAIT|o1", "SCHEDULE PICKUP|o1", "SCHEDULE HELP|o1"],
  }).buttonComponents.length, 3);
  assert.equal(calculatePickupConversionFinancials({
    productsSubtotal: 200,
    discount: 0,
    tax: 0,
    platformCommission: 30,
    platformServiceFee: 5,
    stripeFee: 8,
    shippingFee: 33,
    paidWithStripe: true,
  }).grossTotal, 205);
});
