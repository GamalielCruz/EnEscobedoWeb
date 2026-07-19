import assert from "node:assert/strict";
import test from "node:test";

import { resolvePromotionCode } from "./stripe-promotion.ts";

test("uses the active coupon code when the stored Stripe ID belongs to another account", async () => {
  const stripe = {
    promotionCodes: {
      retrieve: async () => {
        throw Object.assign(new Error("missing"), { code: "resource_missing" });
      },
      list: async ({ code }) => ({ data: code === "ESCOBEDO" ? [{ id: "promo_active" }] : [] }),
    },
  };

  assert.equal(
    await resolvePromotionCode(stripe, {
      stripePromotionCodeId: "promo_from_other_account",
      couponCode: "ESCOBEDO",
    }),
    "promo_active"
  );
});
