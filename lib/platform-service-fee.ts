export const PLATFORM_SERVICE_FEE_MXN = 5;

export function calculateOrderTotal({
  productsSubtotal,
  shippingFee = 0,
  discount = 0,
  tax = 0,
  platformServiceFee = PLATFORM_SERVICE_FEE_MXN,
}: {
  productsSubtotal: number;
  shippingFee?: number;
  discount?: number;
  tax?: number;
  platformServiceFee?: number;
}) {
  return Math.round(
    (productsSubtotal + shippingFee + platformServiceFee - discount + tax) * 100
  ) / 100;
}
