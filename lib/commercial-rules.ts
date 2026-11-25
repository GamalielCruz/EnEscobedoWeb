export type CommercialPlanId = "community" | "premium";
export type ServiceFeeMode = "normal" | "reduced" | "free";
export type DeliveryBenefitAbsorber = "platform" | "restaurant";

export type CommercialPlan = {
  id: CommercialPlanId;
  name: string;
  description: string;
  commissionPercent: number;
  monthlyCommissionCap: number;
  serviceFeeMode: ServiceFeeMode;
  onlinePaymentsEnabled: boolean;
  premiumBadgeEnabled: boolean;
  bannerEligible: boolean;
  promotionalMessagesEnabled: boolean;
  deliveryBenefitEnabled: boolean;
  deliveryDiscountAmount: number;
  deliveryBenefitAbsorbedBy: DeliveryBenefitAbsorber;
};

export type CommercialSettings = {
  serviceFeeNormal: number;
  serviceFeeNormalEnabled: boolean;
  serviceFeeReduced: number;
  serviceFeeReducedEnabled: boolean;
  plans: Record<CommercialPlanId, CommercialPlan>;
  updatedAt?: string;
  updatedBy?: string;
};

export type StoreCommercialFields = {
  commercialPlanId?: CommercialPlanId | null;
  commercialOverrides?: Partial<Omit<CommercialPlan, "id" | "name" | "description">> | null;
  commercialReviewRequired?: boolean | null;
  commercialNotes?: string | null;
  commercialPlanStartedAt?: string | null;
  platformCommissionPercent?: number | null;
};

export type EffectiveCommercialConditions = CommercialPlan & {
  serviceFee: number;
  reviewRequired: boolean;
  notes: string;
  planStartedAt?: string;
  legacyFallback: boolean;
};

export const DEFAULT_COMMERCIAL_SETTINGS: CommercialSettings = {
  serviceFeeNormal: 5,
  serviceFeeNormalEnabled: true,
  serviceFeeReduced: 5,
  serviceFeeReducedEnabled: true,
  plans: {
    community: {
      id: "community",
      name: "Plan Comunidad",
      description: "Sin mensualidad ni comisión. Conserva las funciones actuales del restaurante.",
      commissionPercent: 0,
      monthlyCommissionCap: 0,
      serviceFeeMode: "normal",
      onlinePaymentsEnabled: false,
      premiumBadgeEnabled: false,
      bannerEligible: false,
      promotionalMessagesEnabled: false,
      deliveryBenefitEnabled: false,
      deliveryDiscountAmount: 0,
      deliveryBenefitAbsorbedBy: "platform",
    },
    premium: {
      id: "premium",
      name: "Plan Premium del 10%",
      description: "Sin mensualidad fija, con pagos en línea y beneficios configurables.",
      commissionPercent: 10,
      monthlyCommissionCap: 0,
      serviceFeeMode: "reduced",
      onlinePaymentsEnabled: true,
      premiumBadgeEnabled: true,
      bannerEligible: true,
      promotionalMessagesEnabled: true,
      deliveryBenefitEnabled: false,
      deliveryDiscountAmount: 0,
      deliveryBenefitAbsorbedBy: "platform",
    },
  },
};

const money = (value: unknown, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : fallback;
};

const percent = (value: unknown, fallback: number) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 100 ? number : fallback;
};

export function normalizeCommercialSettings(value?: Partial<CommercialSettings> | null): CommercialSettings {
  const plans = value?.plans || DEFAULT_COMMERCIAL_SETTINGS.plans;
  const normalizePlan = (id: CommercialPlanId): CommercialPlan => {
    const fallback = DEFAULT_COMMERCIAL_SETTINGS.plans[id];
    const plan = plans[id] || fallback;
    return {
      ...fallback,
      ...plan,
      id,
      commissionPercent: percent(plan.commissionPercent, fallback.commissionPercent),
      monthlyCommissionCap: Math.max(0, money(plan.monthlyCommissionCap, fallback.monthlyCommissionCap)),
      deliveryDiscountAmount: Math.max(0, money(plan.deliveryDiscountAmount, 0)),
    };
  };

  return {
    serviceFeeNormal: Math.max(0, money(value?.serviceFeeNormal, DEFAULT_COMMERCIAL_SETTINGS.serviceFeeNormal)),
    serviceFeeNormalEnabled: value?.serviceFeeNormalEnabled !== false,
    serviceFeeReduced: Math.max(0, money(value?.serviceFeeReduced, DEFAULT_COMMERCIAL_SETTINGS.serviceFeeReduced)),
    serviceFeeReducedEnabled: value?.serviceFeeReducedEnabled !== false,
    plans: { community: normalizePlan("community"), premium: normalizePlan("premium") },
    updatedAt: value?.updatedAt,
    updatedBy: value?.updatedBy,
  };
}

export function resolveEffectiveCommercialConditions(
  store: StoreCommercialFields,
  rawSettings?: Partial<CommercialSettings> | null
): EffectiveCommercialConditions {
  const settings = normalizeCommercialSettings(rawSettings);
  const legacyFallback = !store.commercialPlanId;
  const planId = store.commercialPlanId || "community";
  const base = settings.plans[planId];
  const overrides = store.commercialOverrides || {};
  const plan = {
    ...base,
    ...overrides,
    id: planId,
    commissionPercent: percent(
      overrides.commissionPercent,
      legacyFallback && store.platformCommissionPercent != null
        ? percent(store.platformCommissionPercent, 0)
        : base.commissionPercent
    ),
    monthlyCommissionCap: Math.max(
      0,
      money(overrides.monthlyCommissionCap, base.monthlyCommissionCap)
    ),
    deliveryDiscountAmount: Math.max(
      0,
      money(overrides.deliveryDiscountAmount, base.deliveryDiscountAmount)
    ),
  };
  if (planId === "community") {
    Object.assign(plan, {
      commissionPercent: 0,
      monthlyCommissionCap: 0,
      serviceFeeMode: "normal",
      onlinePaymentsEnabled: false,
      premiumBadgeEnabled: false,
      bannerEligible: false,
      promotionalMessagesEnabled: false,
      deliveryBenefitEnabled: false,
      deliveryDiscountAmount: 0,
    });
  }
  const serviceFee =
    plan.serviceFeeMode === "free"
      ? 0
      : plan.serviceFeeMode === "reduced"
        ? settings.serviceFeeReducedEnabled ? settings.serviceFeeReduced : 0
        : settings.serviceFeeNormalEnabled ? settings.serviceFeeNormal : 0;

  return {
    ...plan,
    // ponytail: unassigned legacy stores keep online checkout until an admin reviews them.
    onlinePaymentsEnabled: legacyFallback ? true : plan.onlinePaymentsEnabled,
    premiumBadgeEnabled: planId === "premium" && plan.premiumBadgeEnabled,
    bannerEligible: planId === "premium" && plan.bannerEligible,
    promotionalMessagesEnabled:
      legacyFallback || (planId === "premium" && plan.promotionalMessagesEnabled),
    deliveryBenefitEnabled:
      plan.deliveryBenefitEnabled && plan.deliveryDiscountAmount > 0,
    serviceFee,
    reviewRequired: legacyFallback || store.commercialReviewRequired === true,
    notes: String(store.commercialNotes || ""),
    planStartedAt: store.commercialPlanStartedAt || undefined,
    legacyFallback,
  };
}

export function calculateCappedCommission(input: {
  productsSubtotal: number;
  commissionPercent: number;
  monthlyCommissionCap: number;
  accumulatedCommission: number;
}) {
  const base = Math.max(0, money(input.productsSubtotal));
  const rawCommission = money(base * (percent(input.commissionPercent, 0) / 100));
  const cap = Math.max(0, money(input.monthlyCommissionCap));
  const accumulated = Math.max(0, money(input.accumulatedCommission));
  const remainingBeforeOrder = cap > 0 ? Math.max(0, money(cap - accumulated)) : null;
  const chargedCommission =
    remainingBeforeOrder == null ? rawCommission : Math.min(rawCommission, remainingBeforeOrder);

  return {
    commissionBase: base,
    rawCommission,
    chargedCommission: money(chargedCommission),
    commissionWaivedByCap: money(rawCommission - chargedCommission),
    accumulatedBeforeOrder: accumulated,
    remainingAfterOrder:
      cap > 0 ? Math.max(0, money(cap - accumulated - chargedCommission)) : null,
    capReached: cap > 0 && accumulated + chargedCommission >= cap,
  };
}
