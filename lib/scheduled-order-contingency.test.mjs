import assert from "node:assert/strict";
import test from "node:test";
import { calculatePickupConversionFinancials } from "./scheduled-order-contingency.ts";

test("cambiar delivery Stripe a pickup elimina envio y recalcula liquidacion", () => {
  assert.deepEqual(
    calculatePickupConversionFinancials({
      productsSubtotal: 200,
      discount: 20,
      tax: 0,
      platformCommission: 30,
      stripeFee: 8,
      shippingFee: 33,
      paidWithStripe: true,
    }),
    {
      shippingFee: 0,
      driverPayout: 0,
      grossTotal: 180,
      stripeNetAmount: 172,
      storeNetTotal: 142,
      platformNetTotal: 22,
      refundAmount: 33,
    }
  );
});

test("pickup en efectivo no solicita reembolso ni neto Stripe", () => {
  const result = calculatePickupConversionFinancials({
    productsSubtotal: 100,
    discount: 0,
    tax: 16,
    platformCommission: 15,
    stripeFee: 0,
    shippingFee: 25,
    paidWithStripe: false,
  });
  assert.equal(result.grossTotal, 116);
  assert.equal(result.refundAmount, 0);
  assert.equal(result.stripeNetAmount, 0);
});
