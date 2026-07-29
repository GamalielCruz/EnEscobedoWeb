const money = (value: number) => Math.round(value * 100) / 100;

export function calculatePickupConversionFinancials(input: {
  productsSubtotal: number;
  discount: number;
  tax: number;
  platformCommission: number;
  stripeFee: number;
  shippingFee: number;
  paidWithStripe: boolean;
}) {
  const grossTotal = money(input.productsSubtotal - input.discount + input.tax);
  return {
    shippingFee: 0,
    driverPayout: 0,
    grossTotal,
    stripeNetAmount: input.paidWithStripe ? money(grossTotal - input.stripeFee) : 0,
    storeNetTotal: money(grossTotal - input.platformCommission - input.stripeFee),
    platformNetTotal: money(input.platformCommission - input.stripeFee),
    refundAmount: input.paidWithStripe ? money(input.shippingFee) : 0,
  };
}
