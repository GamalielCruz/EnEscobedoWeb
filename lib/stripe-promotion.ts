import type Stripe from "stripe";

export type AutoPromotion = {
  stripePromotionCodeId?: string;
  couponCode?: string;
  allowedOrderTypes?: string[];
  allowedPaymentMethods?: string[];
  allowedStores?: string[];
};

export async function resolvePromotionCode(
  stripe: Pick<Stripe, "promotionCodes">,
  promotion: AutoPromotion
) {
  if (promotion.stripePromotionCodeId) {
    try {
      const code = await stripe.promotionCodes.retrieve(promotion.stripePromotionCodeId);
      if (code.active) return code.id;
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "resource_missing")) {
        throw error;
      }
    }
  }

  if (!promotion.couponCode) return null;
  const codes = await stripe.promotionCodes.list({ code: promotion.couponCode, active: true, limit: 1 });
  return codes.data[0]?.id ?? null;
}
