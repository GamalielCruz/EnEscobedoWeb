import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_COMMERCIAL_SETTINGS,
  calculateCappedCommission,
  resolveEffectiveCommercialConditions,
} from "./commercial-rules.ts";

test("Plan Comunidad no cobra comisión ni permite Stripe", () => {
  const result = resolveEffectiveCommercialConditions(
    { commercialPlanId: "community", commercialOverrides: { commissionPercent: 9, onlinePaymentsEnabled: true } },
    DEFAULT_COMMERCIAL_SETTINGS
  );
  assert.equal(result.commissionPercent, 0);
  assert.equal(result.onlinePaymentsEnabled, false);
  assert.equal(result.premiumBadgeEnabled, false);
  assert.equal(result.promotionalMessagesEnabled, false);
});

test("las condiciones individuales sobrescriben Premium", () => {
  const result = resolveEffectiveCommercialConditions(
    {
      commercialPlanId: "premium",
      commercialOverrides: {
        commissionPercent: 8,
        monthlyCommissionCap: 500,
        serviceFeeMode: "free",
      },
    },
    DEFAULT_COMMERCIAL_SETTINGS
  );
  assert.equal(result.commissionPercent, 8);
  assert.equal(result.monthlyCommissionCap, 500);
  assert.equal(result.serviceFee, 0);
  assert.equal(result.promotionalMessagesEnabled, true);
});

test("restaurantes sin migrar conservan temporalmente sus frases", () => {
  const result = resolveEffectiveCommercialConditions({}, DEFAULT_COMMERCIAL_SETTINGS);
  assert.equal(result.promotionalMessagesEnabled, true);
});

test("la comisión nunca rebasa el tope mensual", () => {
  const result = calculateCappedCommission({
    productsSubtotal: 1000,
    commissionPercent: 10,
    monthlyCommissionCap: 250,
    accumulatedCommission: 225,
  });
  assert.equal(result.rawCommission, 100);
  assert.equal(result.chargedCommission, 25);
  assert.equal(result.commissionWaivedByCap, 75);
  assert.equal(result.remainingAfterOrder, 0);
  assert.equal(result.capReached, true);
});
